-- =========================================================
-- Migração: Assinatura digital do Responsável Técnico
-- =========================================================
-- O treinamento já guardava nome e número de registro do Responsável
-- Técnico (migration 2026_responsavel_tecnico_por_treinamento.sql), mas
-- não tinha campo pra imagem da assinatura dele — só o Instrutor tinha
-- (assinatura_base64). Isso fazia a coluna "Responsável Técnico" no
-- certificado sair sempre sem assinatura.
--
-- Rode este script no Postgres (psql, Neon, Supabase, etc.):
--   psql $DATABASE_URL -f migrations/2026_assinatura_responsavel_tecnico.sql
-- É idempotente — pode rodar quantas vezes precisar.

ALTER TABLE treinamentos
  ADD COLUMN IF NOT EXISTS responsavel_tecnico_assinatura_base64 TEXT;
