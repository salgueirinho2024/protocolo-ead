-- =========================================================
-- Migração: Tamanho (escala) da assinatura no certificado
-- =========================================================
-- Permite o admin aumentar/diminuir a assinatura do Instrutor e do
-- Responsável Técnico independentemente, direto na tela de cadastro do
-- treinamento (com pré-visualização do certificado). Guardado como
-- percentual (100 = tamanho padrão atual, 26px de altura).
--
-- Rode este script no Postgres (psql, Neon, Supabase, etc.):
--   psql $DATABASE_URL -f migrations/2026_escala_assinatura_certificado.sql
-- É idempotente — pode rodar quantas vezes precisar.

ALTER TABLE treinamentos
  ADD COLUMN IF NOT EXISTS assinatura_escala INTEGER DEFAULT 100,
  ADD COLUMN IF NOT EXISTS responsavel_tecnico_assinatura_escala INTEGER DEFAULT 100;
