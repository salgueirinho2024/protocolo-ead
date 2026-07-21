-- =========================================================
-- Migração: Perfil institucional da empresa (logo + missão)
-- =========================================================
-- Alimenta a nova tela "Sobre a Empresa" do portal do cliente:
--   - logo_base64  → logomarca da empresa (PNG/JPG em base64)
--   - missao       → texto livre com a missão/descrição da empresa
--
-- Os contatos (e-mail/telefone) já existem em `empresas` desde o
-- schema original (email_contato, telefone) — não precisam de
-- migração nova.
--
-- É só visual/institucional — não interfere em nenhuma regra de
-- negócio (login, contrato, vagas, certificado etc.). Se ficar em
-- branco, a tela mostra um estado vazio no lugar, então esta
-- migração não quebra nada que já existe.
--
-- Rode este script no Postgres (psql, Neon, Supabase, etc.):
--   psql $DATABASE_URL -f migrations/2026_perfil_institucional_empresa.sql
-- É idempotente — pode rodar quantas vezes precisar.

ALTER TABLE empresas ADD COLUMN IF NOT EXISTS logo_base64 TEXT;
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS missao TEXT;
