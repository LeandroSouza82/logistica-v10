-- =============================================
-- 📍 REGISTRO RÁPIDO V10 - CONFIGURAÇÃO SUPABASE
-- =============================================
-- INSTRUÇÕES:
-- 1. Abra o Supabase (painel web)
-- 2. Vá em "SQL Editor"
-- 3. Cole este código e clique em RUN
-- =============================================

-- Adicionar coluna de recebedor (OBRIGATÓRIA)
ALTER TABLE entregas 
ADD COLUMN IF NOT EXISTS recebedor TEXT;

-- Adicionar colunas de GPS (OPCIONAL - para Registro Rápido V10)
ALTER TABLE entregas 
ADD COLUMN IF NOT EXISTS lat_conclusao DOUBLE PRECISION;

ALTER TABLE entregas 
ADD COLUMN IF NOT EXISTS lng_conclusao DOUBLE PRECISION;

-- Forçar reload do cache
NOTIFY pgrst, 'reload schema';

-- =============================================
-- ✅ PRONTO!
-- =============================================
-- O app agora pode salvar:
-- - recebedor: Nome de quem recebeu (SEMPRE)
-- - lat_conclusao: GPS (se disponível)
-- - lng_conclusao: GPS (se disponível)
-- =============================================
