-- =========================================================
-- Migração: Imagem de capa do treinamento
-- =========================================================
-- Permite que o super admin, ao criar/editar um treinamento, suba uma
-- imagem (PNG/JPG em base64) para ilustrar o curso. Essa imagem aparece:
--   - na lista "Meus Treinamentos" do funcionário (card de cada curso);
--   - no topo da tela de detalhe do curso (a "capa"), antes de entrar
--     no player;
--   - na lista de treinamentos do painel do super admin.
--
-- É só visual — não interfere em nenhuma regra de negócio (vagas,
-- prova, certificado etc.). Se ficar em branco, continua aparecendo o
-- ícone padrão no lugar da imagem, então esta migração não quebra nada
-- que já existe.
--
-- Rode este script no Postgres (psql, Neon, Supabase, etc.):
--   psql $DATABASE_URL -f migrations/2026_imagem_capa_treinamento.sql
-- É idempotente — pode rodar quantas vezes precisar.

ALTER TABLE treinamentos ADD COLUMN IF NOT EXISTS imagem_capa_base64 TEXT;
