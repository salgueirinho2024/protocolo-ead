-- =========================================================
-- PLATAFORMA DE TREINAMENTO EAD - SCHEMA POSTGRESQL
-- =========================================================
-- Convenções:
--   - UUID como PK em todas as tabelas (evita enumeração de IDs)
--   - Timestamps em UTC, com created_at/updated_at padrão
--   - Regras críticas de negócio reforçadas com CHECK/TRIGGER
--     no banco, não só na aplicação
--   - Script é IDEMPOTENTE: pode rodar quantas vezes precisar
--     sem dar erro (usa IF NOT EXISTS / DROP ... IF EXISTS)
-- =========================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- gen_random_uuid()

-- =========================================================
-- 1. USUÁRIOS DA PLATAFORMA (super admin e admins de empresa)
-- =========================================================

DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('super_admin', 'empresa_admin');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS usuarios (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome            VARCHAR(150) NOT NULL,
    email           VARCHAR(150) NOT NULL UNIQUE,
    senha_hash      VARCHAR(255) NOT NULL,
    role            user_role NOT NULL,
    ativo           BOOLEAN NOT NULL DEFAULT TRUE,
    criado_em       TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =========================================================
-- 2. EMPRESAS CLIENTES
-- =========================================================

CREATE TABLE IF NOT EXISTS empresas (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    razao_social    VARCHAR(200) NOT NULL,
    cnpj            VARCHAR(18) NOT NULL UNIQUE,
    email_contato   VARCHAR(150),
    telefone        VARCHAR(20),
    ativo           BOOLEAN NOT NULL DEFAULT TRUE,
    criado_em       TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Vínculo do usuário admin com a empresa que ele administra
CREATE TABLE IF NOT EXISTS empresa_usuarios (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    usuario_id      UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    criado_em       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (empresa_id, usuario_id)
);

-- =========================================================
-- 3. TREINAMENTOS (catálogo, criado pelo super admin)
-- =========================================================

CREATE TABLE IF NOT EXISTS treinamentos (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    titulo              VARCHAR(200) NOT NULL,
    descricao           TEXT,
    carga_horaria_min   INTEGER NOT NULL CHECK (carga_horaria_min > 0), -- em minutos
    nota_minima_prova   SMALLINT DEFAULT 70 CHECK (nota_minima_prova BETWEEN 0 AND 100),
    validade_certificado_meses SMALLINT, -- NULL = sem validade (não expira)
    ativo               BOOLEAN NOT NULL DEFAULT TRUE,
    criado_em           TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizado_em       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Módulos/vídeos que compõem o treinamento (ordem importa)
CREATE TABLE IF NOT EXISTS treinamento_modulos (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    treinamento_id      UUID NOT NULL REFERENCES treinamentos(id) ON DELETE CASCADE,
    titulo              VARCHAR(200) NOT NULL,
    descricao           TEXT,
    ordem               SMALLINT NOT NULL,
    video_provider_id   VARCHAR(255) NOT NULL, -- id do vídeo no Mux/Cloudflare Stream/Bunny
    duracao_segundos    INTEGER NOT NULL CHECK (duracao_segundos > 0),
    pdf_url             TEXT, -- link externo (Google Drive/Dropbox) do material de apoio em PDF
    criado_em           TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (treinamento_id, ordem)
);

-- Perguntas da prova final do treinamento (múltipla escolha).
-- opcoes é um array JSON de strings; resposta_correta é o índice
-- (0-based) da opção certa dentro de opcoes. O índice nunca é
-- devolvido ao funcionário pelo endpoint do player — só ao admin.
CREATE TABLE IF NOT EXISTS treinamento_perguntas (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    treinamento_id      UUID NOT NULL REFERENCES treinamentos(id) ON DELETE CASCADE,
    pergunta            TEXT NOT NULL,
    opcoes              JSONB NOT NULL,
    resposta_correta    SMALLINT NOT NULL CHECK (resposta_correta >= 0),
    ordem               SMALLINT NOT NULL,
    criado_em           TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (treinamento_id, ordem),
    CHECK (jsonb_array_length(opcoes) >= 2),
    CHECK (resposta_correta < jsonb_array_length(opcoes))
);

-- =========================================================
-- 4. CONTRATOS (a "compra de vagas" que uma empresa faz)
-- =========================================================
-- Esta é a tabela que materializa: "empresa X comprou 20 vagas
-- do treinamento de integração". O limite trava aqui.

DO $$ BEGIN
    CREATE TYPE contrato_status AS ENUM ('ativo', 'encerrado', 'cancelado');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS contratos (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id          UUID NOT NULL REFERENCES empresas(id) ON DELETE RESTRICT,
    treinamento_id      UUID NOT NULL REFERENCES treinamentos(id) ON DELETE RESTRICT,
    vagas_contratadas   INTEGER NOT NULL CHECK (vagas_contratadas > 0),
    status              contrato_status NOT NULL DEFAULT 'ativo',
    data_inicio         DATE NOT NULL DEFAULT CURRENT_DATE,
    data_limite         DATE, -- prazo opcional para concluir
    criado_por          UUID NOT NULL REFERENCES usuarios(id), -- super admin que liberou
    criado_em           TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizado_em       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contratos_empresa ON contratos(empresa_id);

-- =========================================================
-- 5. FUNCIONÁRIOS CADASTRADOS NO CONTRATO
-- =========================================================
-- Aqui mora a trava de "não pode passar de N". A empresa só
-- pode inserir até vagas_contratadas linhas para este contrato.

CREATE TABLE IF NOT EXISTS funcionarios_contrato (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contrato_id         UUID NOT NULL REFERENCES contratos(id) ON DELETE CASCADE,
    nome                VARCHAR(150) NOT NULL,
    cpf                 CHAR(11) NOT NULL, -- armazenar só dígitos, validar formato na aplicação
    email               VARCHAR(150),      -- opcional, útil p/ enviar acesso e certificado
    criado_em           TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (contrato_id, cpf) -- mesmo CPF não pode duplicar no mesmo contrato
);

CREATE INDEX IF NOT EXISTS idx_funcionarios_contrato ON funcionarios_contrato(contrato_id);
CREATE INDEX IF NOT EXISTS idx_funcionarios_cpf ON funcionarios_contrato(cpf);

-- --- TRIGGER: trava o limite de vagas no próprio banco -----
-- Mesmo que a aplicação tenha um bug, o banco não deixa passar.

CREATE OR REPLACE FUNCTION fn_valida_limite_vagas()
RETURNS TRIGGER AS $$
DECLARE
    v_vagas INTEGER;
    v_ocupadas INTEGER;
BEGIN
    SELECT vagas_contratadas INTO v_vagas
    FROM contratos WHERE id = NEW.contrato_id
    FOR UPDATE; -- lock evita race condition de inserts simultâneos

    SELECT COUNT(*) INTO v_ocupadas
    FROM funcionarios_contrato
    WHERE contrato_id = NEW.contrato_id;

    IF v_ocupadas >= v_vagas THEN
        RAISE EXCEPTION 'Limite de % vagas já atingido para este contrato', v_vagas
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_valida_limite_vagas ON funcionarios_contrato;
CREATE TRIGGER trg_valida_limite_vagas
    BEFORE INSERT ON funcionarios_contrato
    FOR EACH ROW EXECUTE FUNCTION fn_valida_limite_vagas();

-- =========================================================
-- 6. ACESSO/LOGIN DO FUNCIONÁRIO (CPF + senha simples ou link mágico)
-- =========================================================

CREATE TABLE IF NOT EXISTS funcionario_acessos (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    funcionario_id      UUID NOT NULL UNIQUE REFERENCES funcionarios_contrato(id) ON DELETE CASCADE,
    senha_hash          VARCHAR(255), -- pode ser NULL se usar só link mágico/token por email
    ultimo_login_em     TIMESTAMPTZ,
    criado_em           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =========================================================
-- 7. PROGRESSO DO TREINAMENTO (controle de horas e retomada)
-- =========================================================

DO $$ BEGIN
    CREATE TYPE progresso_status AS ENUM ('nao_iniciado', 'em_andamento', 'concluido', 'reprovado');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS matriculas (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    funcionario_id      UUID NOT NULL REFERENCES funcionarios_contrato(id) ON DELETE CASCADE,
    treinamento_id      UUID NOT NULL REFERENCES treinamentos(id) ON DELETE RESTRICT,
    status              progresso_status NOT NULL DEFAULT 'nao_iniciado',
    segundos_assistidos_total INTEGER NOT NULL DEFAULT 0, -- soma de todas as sessões
    nota_prova_final    SMALLINT,
    iniciado_em         TIMESTAMPTZ,
    concluido_em        TIMESTAMPTZ,
    criado_em           TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (funcionario_id, treinamento_id)
);

-- Progresso por módulo/vídeo individual (permite retomar exatamente
-- de onde parou, módulo a módulo)
CREATE TABLE IF NOT EXISTS matricula_modulo_progresso (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    matricula_id        UUID NOT NULL REFERENCES matriculas(id) ON DELETE CASCADE,
    modulo_id           UUID NOT NULL REFERENCES treinamento_modulos(id) ON DELETE CASCADE,
    segundos_assistidos INTEGER NOT NULL DEFAULT 0,
    concluido           BOOLEAN NOT NULL DEFAULT FALSE,
    ultima_posicao_seg  INTEGER NOT NULL DEFAULT 0, -- onde o player deve retomar
    atualizado_em       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (matricula_id, modulo_id)
);

-- =========================================================
-- 8. SESSÕES DE VISUALIZAÇÃO (cada "bloco" assistido, ex: hoje 8h)
-- =========================================================
-- Permite reconstruir a linha do tempo completa: quando a pessoa
-- assistiu, por quanto tempo, em qual dia. Essencial para auditoria
-- e para provar que o treinamento de 24h foi feito em vários dias.

CREATE TABLE IF NOT EXISTS sessoes_visualizacao (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    matricula_id        UUID NOT NULL REFERENCES matriculas(id) ON DELETE CASCADE,
    modulo_id           UUID NOT NULL REFERENCES treinamento_modulos(id) ON DELETE CASCADE,
    inicio_em           TIMESTAMPTZ NOT NULL DEFAULT now(),
    fim_em              TIMESTAMPTZ,
    segundos_efetivos   INTEGER, -- calculado no fim da sessão
    ip_address          INET,
    user_agent          TEXT
);

CREATE INDEX IF NOT EXISTS idx_sessoes_matricula ON sessoes_visualizacao(matricula_id);

-- =========================================================
-- 9. CHECKPOINTS ANTI-FRAUDE
-- =========================================================
-- A cada X minutos o player pausa e pede confirmação/pergunta.
-- Cada evento fica registrado: respondeu, não respondeu, demorou.

DO $$ BEGIN
    CREATE TYPE checkpoint_resultado AS ENUM ('respondido_ok', 'respondido_errado', 'nao_respondido', 'aba_oculta');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS checkpoints_antifraude (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sessao_id           UUID NOT NULL REFERENCES sessoes_visualizacao(id) ON DELETE CASCADE,
    disparado_em        TIMESTAMPTZ NOT NULL DEFAULT now(),
    posicao_video_seg   INTEGER NOT NULL, -- em que ponto do vídeo o checkpoint ocorreu
    tipo                VARCHAR(30) NOT NULL DEFAULT 'clique', -- 'clique' | 'pergunta'
    resultado           checkpoint_resultado NOT NULL,
    tempo_resposta_ms   INTEGER,
    criado_em           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_checkpoints_sessao ON checkpoints_antifraude(sessao_id);

-- View de apoio: sinaliza matrículas com excesso de checkpoints
-- falhos (possível fraude), para a equipe revisar manualmente.
DROP VIEW IF EXISTS vw_matriculas_suspeitas;
CREATE VIEW vw_matriculas_suspeitas AS
SELECT
    m.id AS matricula_id,
    m.funcionario_id,
    COUNT(c.id) FILTER (WHERE c.resultado IN ('nao_respondido','aba_oculta')) AS checkpoints_falhos,
    COUNT(c.id) AS checkpoints_totais
FROM matriculas m
JOIN sessoes_visualizacao s ON s.matricula_id = m.id
JOIN checkpoints_antifraude c ON c.sessao_id = s.id
GROUP BY m.id, m.funcionario_id
HAVING COUNT(c.id) FILTER (WHERE c.resultado IN ('nao_respondido','aba_oculta')) >= 3;

-- =========================================================
-- 10. CERTIFICADOS EMITIDOS
-- =========================================================

CREATE TABLE IF NOT EXISTS certificados (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    matricula_id        UUID NOT NULL UNIQUE REFERENCES matriculas(id) ON DELETE RESTRICT,
    codigo_validacao    VARCHAR(20) NOT NULL UNIQUE, -- código curto pro QR/validação pública
    arquivo_pdf_url     TEXT NOT NULL,
    arquivo_pdf_base64  TEXT, -- PDF do certificado, codificado em base64 (sem filesystem persistente no Vercel)
    emitido_em          TIMESTAMPTZ NOT NULL DEFAULT now(),
    valido_ate          DATE -- calculado a partir de validade_certificado_meses, se houver
);

-- Garante a coluna em bancos que já existiam antes da migração para Vercel
ALTER TABLE certificados ADD COLUMN IF NOT EXISTS arquivo_pdf_base64 TEXT;

CREATE INDEX IF NOT EXISTS idx_certificados_codigo ON certificados(codigo_validacao);

-- =========================================================
-- 11. CONFIGURAÇÃO DA EMPRESA EMISSORA (singleton)
-- =========================================================
-- Dados da empresa palestrante/aplicadora, responsável técnico e instrutor
-- — usados no rodapé dos certificados. Como o sistema é usado por uma única
-- empresa emissora, esta tabela tem uma única linha (id sempre = 1).

CREATE TABLE IF NOT EXISTS configuracao_emissora (
    id                              SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    empresa_razao_social            VARCHAR(200),
    empresa_cnpj                    VARCHAR(20),
    empresa_endereco                TEXT,
    empresa_email                   VARCHAR(150),
    empresa_telefone                VARCHAR(20),
    responsavel_tecnico_nome        VARCHAR(150),
    responsavel_tecnico_documento   VARCHAR(50),
    instrutor_nome                  VARCHAR(150),
    instrutor_documento             VARCHAR(50),
    atualizado_em                   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Garante a linha inicial (idempotente — não falha se já existir)
INSERT INTO configuracao_emissora (id) VALUES (1) ON CONFLICT DO NOTHING;

-- =========================================================
-- 12. CAMPOS NOVOS NO TREINAMENTO
-- =========================================================
-- Conteúdo programático e período de vigência do treinamento. Os dados da
-- empresa palestrante/responsável técnico/instrutor NÃO ficam aqui — vêm
-- da configuração global (seção 11), pois o sistema atende uma única
-- empresa aplicadora.

ALTER TABLE treinamentos ADD COLUMN IF NOT EXISTS conteudo_programatico TEXT;
ALTER TABLE treinamentos ADD COLUMN IF NOT EXISTS data_inicio DATE;
ALTER TABLE treinamentos ADD COLUMN IF NOT EXISTS data_fim DATE;

-- =========================================================
-- TRIGGER GENÉRICO: atualizado_em automático
-- =========================================================

CREATE OR REPLACE FUNCTION fn_atualiza_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.atualizado_em = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_upd_usuarios ON usuarios;
CREATE TRIGGER trg_upd_usuarios BEFORE UPDATE ON usuarios FOR EACH ROW EXECUTE FUNCTION fn_atualiza_timestamp();

DROP TRIGGER IF EXISTS trg_upd_empresas ON empresas;
CREATE TRIGGER trg_upd_empresas BEFORE UPDATE ON empresas FOR EACH ROW EXECUTE FUNCTION fn_atualiza_timestamp();

DROP TRIGGER IF EXISTS trg_upd_treinamentos ON treinamentos;
CREATE TRIGGER trg_upd_treinamentos BEFORE UPDATE ON treinamentos FOR EACH ROW EXECUTE FUNCTION fn_atualiza_timestamp();

DROP TRIGGER IF EXISTS trg_upd_contratos ON contratos;
CREATE TRIGGER trg_upd_contratos BEFORE UPDATE ON contratos FOR EACH ROW EXECUTE FUNCTION fn_atualiza_timestamp();
