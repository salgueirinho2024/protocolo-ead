-- =========================================================
-- Migração: emissora + assinatura digital por treinamento
-- =========================================================
-- Cada treinamento agora carrega seu próprio cabeçalho de
-- emissão do certificado (empresa emissora + assinatura digital
-- em imagem). A tabela global configuracao_emissora continua
-- existindo apenas como fallback para treinamentos antigos.
--
-- Rode este script no Postgres (psql, Neon, Supabase, etc.):
--   psql $DATABASE_URL -f migrations/2026_emissora_por_treinamento.sql
-- É idempotente — pode rodar quantas vezes precisar.

ALTER TABLE treinamentos
  ADD COLUMN IF NOT EXISTS emissora_nome        VARCHAR(200),
  ADD COLUMN IF NOT EXISTS emissora_cnpj        VARCHAR(20),
  ADD COLUMN IF NOT EXISTS assinatura_base64    TEXT,   -- PNG/JPG em data:URL
  ADD COLUMN IF NOT EXISTS assinatura_nome      VARCHAR(150),
  ADD COLUMN IF NOT EXISTS assinatura_cargo     VARCHAR(150);

-- Algumas colunas referenciadas em código que podem não existir
-- em bancos antigos (defensive: ALTER ... IF NOT EXISTS):
ALTER TABLE treinamentos
  ADD COLUMN IF NOT EXISTS conteudo_programatico TEXT,
  ADD COLUMN IF NOT EXISTS data_inicio           DATE,
  ADD COLUMN IF NOT EXISTS data_fim              DATE;

ALTER TABLE treinamento_modulos
  ADD COLUMN IF NOT EXISTS pdf_url               TEXT;
