-- =========================================================
-- Migração: Foto de perfil do funcionário
-- =========================================================
-- Permite que o próprio funcionário, na tela "Editar Conta", suba uma
-- foto (PNG/JPG em base64) para o seu perfil. Ela aparece:
--   - no avatar da barra lateral, ao lado do nome;
--   - na própria tela "Editar Conta".
--
-- É só visual — não interfere em nenhuma regra de negócio (login,
-- matrícula, certificado etc.). Se ficar em branco, continua
-- aparecendo o ícone padrão no lugar da foto, então esta migração não
-- quebra nada que já existe.
--
-- Rode este script no Postgres (psql, Neon, Supabase, etc.):
--   psql $DATABASE_URL -f migrations/2026_foto_perfil_funcionario.sql
-- É idempotente — pode rodar quantas vezes precisar.

ALTER TABLE funcionarios ADD COLUMN IF NOT EXISTS foto_perfil_base64 TEXT;
