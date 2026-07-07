-- =========================================================
-- Migração: funcionário reutilizável entre contratos/treinamentos
-- =========================================================
-- ANTES: cada "cadastro de funcionário" ficava preso a 1 contrato só
-- (funcionarios_contrato). Pra vincular a mesma pessoa a outro
-- treinamento, ou pra refazer o MESMO treinamento num contrato novo
-- (reciclagem/retreinamento anual de NR), tinha que recadastrar do
-- zero, com login e senha novos — e o sistema ainda bloqueava pra
-- sempre o mesmo CPF no mesmo treinamento.
--
-- DEPOIS:
--   - `funcionarios` = cadastro único por empresa (nome/cpf/email +
--     login), SEM limite de vagas. A empresa cadastra quantos
--     funcionários quiser.
--   - `matriculas` ganha `contrato_id`: vincular um funcionário a um
--     treinamento = criar uma matrícula ligada a um contrato
--     específico. É SÓ NESSE PASSO que a trava de vagas entra.
--   - O mesmo funcionário pode ser vinculado de novo ao MESMO
--     treinamento em outro contrato (a trava antiga de "1x por
--     treinamento pra sempre" foi removida — agora é só "1x por
--     contrato").
--
-- ⚠️  LEIA ANTES DE RODAR:
--   1. Faça um backup/branch do banco antes. No Neon: crie um branch
--      a partir do estado atual (é de graça, leva segundos, e te dá
--      uma rede de segurança total pra restaurar se algo sair torto).
--   2. Essa migração MEXE EM DADOS (não é só ALTER TABLE). Rode 1x.
--   3. Senha: se o mesmo CPF+empresa tinha mais de um cadastro (em
--      contratos diferentes) com senhas DIFERENTES, esta migração
--      mantém a senha do cadastro MAIS RECENTE como a válida. Se
--      algum funcionário tinha mais de um cadastro, avise a empresa
--      que pode ser necessário resetar a senha dele.
--   4. Faça o deploy do código novo (API) JUNTO com esta migração —
--      o código novo espera esse schema novo.
--   5. Ao final, rode a query de conferência (no comentário lá
--      embaixo) antes de derrubar a tabela antiga `funcionarios_contrato`.
--
--   psql $DATABASE_URL -f migrations/2026_funcionarios_reutilizaveis.sql
-- =========================================================

BEGIN;

-- 1) Tabela nova: funcionário único por empresa -------------------------
CREATE TABLE IF NOT EXISTS funcionarios (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id          UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    nome                VARCHAR(150) NOT NULL,
    cpf                 CHAR(11) NOT NULL,
    email               VARCHAR(150),
    ativo               BOOLEAN NOT NULL DEFAULT TRUE,
    criado_em           TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (empresa_id, cpf)
);
CREATE INDEX IF NOT EXISTS idx_funcionarios_empresa ON funcionarios(empresa_id);
CREATE INDEX IF NOT EXISTS idx_funcionarios_cpf ON funcionarios(cpf);

-- 2) Popula `funcionarios` a partir do histórico em funcionarios_contrato,
--    1 linha por (empresa, cpf) — usa o cadastro MAIS RECENTE pra
--    nome/email (é o dado mais provável de estar atualizado).
INSERT INTO funcionarios (empresa_id, cpf, nome, email, criado_em)
SELECT DISTINCT ON (c.empresa_id, fc.cpf)
       c.empresa_id, fc.cpf, fc.nome, fc.email, fc.criado_em
  FROM funcionarios_contrato fc
  JOIN contratos c ON c.id = fc.contrato_id
 ORDER BY c.empresa_id, fc.cpf, fc.criado_em DESC
ON CONFLICT (empresa_id, cpf) DO NOTHING;

-- 3) De-para: liga cada linha antiga de funcionarios_contrato ao
--    funcionário unificado correspondente.
ALTER TABLE funcionarios_contrato ADD COLUMN IF NOT EXISTS funcionario_id_novo UUID;

UPDATE funcionarios_contrato fc
   SET funcionario_id_novo = f.id
  FROM contratos c, funcionarios f
 WHERE c.id = fc.contrato_id
   AND f.empresa_id = c.empresa_id
   AND f.cpf = fc.cpf
   AND fc.funcionario_id_novo IS NULL;

-- 4) Login/senha: 1 funcionario_acessos por FUNCIONÁRIO (não mais por
--    cadastro-em-contrato). Fica com a senha do cadastro mais recente.
CREATE TABLE IF NOT EXISTS funcionario_acessos_novo (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    funcionario_id      UUID NOT NULL UNIQUE REFERENCES funcionarios(id) ON DELETE CASCADE,
    senha_hash          VARCHAR(255),
    ultimo_login_em     TIMESTAMPTZ,
    criado_em           TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO funcionario_acessos_novo (funcionario_id, senha_hash, ultimo_login_em, criado_em)
SELECT DISTINCT ON (fc.funcionario_id_novo)
       fc.funcionario_id_novo, fa.senha_hash, fa.ultimo_login_em, fa.criado_em
  FROM funcionarios_contrato fc
  JOIN funcionario_acessos fa ON fa.funcionario_id = fc.id
 WHERE fc.funcionario_id_novo IS NOT NULL
 ORDER BY fc.funcionario_id_novo, fc.criado_em DESC
ON CONFLICT (funcionario_id) DO NOTHING;

DROP TABLE funcionario_acessos;
ALTER TABLE funcionario_acessos_novo RENAME TO funcionario_acessos;

-- 5) matriculas: adiciona contrato_id e troca funcionario_id pra apontar
--    pra `funcionarios` em vez de `funcionarios_contrato`.
ALTER TABLE matriculas ADD COLUMN IF NOT EXISTS contrato_id UUID;
ALTER TABLE matriculas ADD COLUMN IF NOT EXISTS funcionario_id_novo UUID;

UPDATE matriculas m
   SET contrato_id = fc.contrato_id,
       funcionario_id_novo = fc.funcionario_id_novo
  FROM funcionarios_contrato fc
 WHERE fc.id = m.funcionario_id
   AND m.contrato_id IS NULL;

ALTER TABLE matriculas DROP CONSTRAINT IF EXISTS matriculas_funcionario_id_fkey;
ALTER TABLE matriculas DROP CONSTRAINT IF EXISTS matriculas_funcionario_id_treinamento_id_key;
ALTER TABLE matriculas DROP COLUMN funcionario_id;
ALTER TABLE matriculas RENAME COLUMN funcionario_id_novo TO funcionario_id;

ALTER TABLE matriculas ALTER COLUMN funcionario_id SET NOT NULL;
ALTER TABLE matriculas ALTER COLUMN contrato_id SET NOT NULL;
ALTER TABLE matriculas ADD CONSTRAINT matriculas_funcionario_id_fkey
    FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id) ON DELETE CASCADE;
ALTER TABLE matriculas ADD CONSTRAINT matriculas_contrato_id_fkey
    FOREIGN KEY (contrato_id) REFERENCES contratos(id) ON DELETE CASCADE;
ALTER TABLE matriculas ADD CONSTRAINT matriculas_funcionario_contrato_key
    UNIQUE (funcionario_id, contrato_id);

CREATE INDEX IF NOT EXISTS idx_matriculas_funcionario ON matriculas(funcionario_id);
CREATE INDEX IF NOT EXISTS idx_matriculas_contrato ON matriculas(contrato_id);

-- 6) Trava de vagas passa a rodar em cima de matriculas/contrato_id,
--    não mais em funcionarios_contrato. Cadastrar funcionário agora é
--    livre — a trava só existe no vínculo (matrícula) com o contrato.
CREATE OR REPLACE FUNCTION fn_valida_limite_vagas()
RETURNS TRIGGER AS $$
DECLARE
    v_vagas INTEGER;
    v_ocupadas INTEGER;
BEGIN
    SELECT vagas_contratadas INTO v_vagas
    FROM contratos WHERE id = NEW.contrato_id
    FOR UPDATE;

    SELECT COUNT(*) INTO v_ocupadas
    FROM matriculas
    WHERE contrato_id = NEW.contrato_id;

    IF v_ocupadas >= v_vagas THEN
        RAISE EXCEPTION 'Limite de % vagas já atingido para este contrato', v_vagas
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_valida_limite_vagas ON funcionarios_contrato;
DROP TRIGGER IF EXISTS trg_valida_limite_vagas ON matriculas;
CREATE TRIGGER trg_valida_limite_vagas
    BEFORE INSERT ON matriculas
    FOR EACH ROW EXECUTE FUNCTION fn_valida_limite_vagas();

COMMIT;

-- =========================================================
-- DEPOIS DE RODAR — checklist antes de derrubar a tabela antiga:
-- =========================================================
-- 1) Confira se sobrou algum registro sem de-para (não deveria haver):
--      SELECT COUNT(*) FROM funcionarios_contrato WHERE funcionario_id_novo IS NULL;
--    Se der 0, migrou tudo certo.
--
-- 2) Confira se o total de matrículas bate:
--      SELECT
--        (SELECT COUNT(*) FROM matriculas) AS matriculas_atuais;
--      (compare mentalmente com o número de linhas que você tinha antes
--       da migração — se você não anotou, tudo bem, o importante é o
--       item 1 dar 0)
--
-- 3) Só então, manualmente, derrube a tabela antiga:
--      DROP TABLE funcionarios_contrato;
--
-- Enquanto não rodar o DROP TABLE acima, a tabela antiga fica só
-- ocupando espaço — não atrapalha nada, o código novo não usa mais
-- ela pra nada.
-- =========================================================
