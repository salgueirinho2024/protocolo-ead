-- =========================================================
-- Migração: Imagem de fundo do certificado (frente e verso)
-- =========================================================
-- Permite subir, por treinamento, duas imagens de fundo (PNG/JPG em
-- base64) para o certificado em PDF:
--   - certificado_fundo_frente_base64 → fundo da página 1 (o
--     certificado em si: nome, CPF, QR code, assinaturas etc. são
--     desenhados por cima dessa imagem)
--   - certificado_fundo_verso_base64  → fundo da página 2 (verso —
--     usado para o conteúdo programático, se houver; se não houver
--     conteúdo programático e essa imagem estiver preenchida, a
--     página 2 é gerada mesmo assim, só com o fundo)
--
-- Se nenhuma das duas estiver preenchida, o certificado continua
-- sendo desenhado do jeito antigo (moldura/folhas em CSS/SVG),
-- então esta migração não quebra nada que já existe.
--
-- Rode este script no Postgres (psql, Neon, Supabase, etc.):
--   psql $DATABASE_URL -f migrations/2026_fundo_certificado.sql
-- É idempotente — pode rodar quantas vezes precisar.

ALTER TABLE treinamentos
  ADD COLUMN IF NOT EXISTS certificado_fundo_frente_base64  TEXT,
  ADD COLUMN IF NOT EXISTS certificado_fundo_verso_base64   TEXT;
