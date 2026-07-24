-- A tabela treinamento_modulos só tinha video_provider_id (o ID/URL do vídeo),
-- mas nunca teve uma coluna pra guardar o PROVEDOR (youtube/vimeo/mux/cloudflare).
-- Por isso o player sempre caía no default 'youtube' no front-end, ignorando
-- o que era selecionado no formulário de admin.
ALTER TABLE treinamento_modulos
  ADD COLUMN IF NOT EXISTS video_provider VARCHAR(50) NOT NULL DEFAULT 'youtube';
