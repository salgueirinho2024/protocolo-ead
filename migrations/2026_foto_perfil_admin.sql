-- =========================================================
-- Foto de perfil para usuários da plataforma (super_admin e
-- empresa_admin) — mesma ideia já usada em funcionarios
-- (ver migrations/2026_foto_perfil_funcionario.sql), agora
-- estendida para a tabela `usuarios`, que serve os dois papéis
-- de administrador.
--
-- Guardamos a imagem como base64 (data URL completa, ex.:
-- "data:image/png;base64,...") direto na coluna, sem storage
-- externo — mesmo padrão de logo_base64 (empresas) e
-- foto_perfil_base64 (funcionarios).
--
-- Como rodar:
--   psql $DATABASE_URL -f migrations/2026_foto_perfil_admin.sql
-- =========================================================

ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS foto_perfil_base64 TEXT;
