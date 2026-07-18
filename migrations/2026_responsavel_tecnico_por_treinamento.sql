-- =========================================================
-- Migração: Responsável Técnico + registro do Instrutor por treinamento
-- =========================================================
-- Antes, o nome do Responsável Técnico só existia na tabela global
-- configuracao_emissora (preenchida manualmente via SQL, sem tela de
-- admin). Agora esses dados passam a viver no próprio treinamento,
-- preenchidos junto com "Empresa emissora" e "Assinatura digital" na
-- tela de Treinamentos — junto com o número de registro do instrutor
-- (ex.: MTE/MG), que antes não existia em lugar nenhum.
--
-- A tabela configuracao_emissora continua existindo apenas como
-- fallback para treinamentos antigos que não tiverem esses campos
-- preenchidos.
--
-- Rode este script no Postgres (psql, Neon, Supabase, etc.):
--   psql $DATABASE_URL -f migrations/2026_responsavel_tecnico_por_treinamento.sql
-- É idempotente — pode rodar quantas vezes precisar.

ALTER TABLE treinamentos
  ADD COLUMN IF NOT EXISTS responsavel_tecnico_nome       VARCHAR(150),
  ADD COLUMN IF NOT EXISTS responsavel_tecnico_documento  VARCHAR(50),
  ADD COLUMN IF NOT EXISTS instrutor_documento             VARCHAR(50);
