-- ===============================================
-- RELOAD SCHEMA SUPABASE - RESOLVER PGRST204
-- ===============================================
-- 
-- PROBLEMA: Erro PGRST204 acontece quando o PostgREST (API do Supabase) 
-- mantém um cache desatualizado das colunas da tabela.
--
-- SOLUÇÃO: Após adicionar novas colunas (recebedor, lat_conclusao, lng_conclusao),
-- é necessário notificar o PostgREST para recarregar o schema.
--
-- ===============================================
-- COMANDO: Execute no SQL Editor do Supabase
-- ===============================================

NOTIFY pgrst, 'reload schema';

-- ===============================================
-- VERIFICAÇÃO: Após executar, teste a API
-- ===============================================
-- 
-- 1. Tente fazer um SELECT nas novas colunas:
--    SELECT id, recebedor, lat_conclusao, lng_conclusao FROM entregas LIMIT 5;
--
-- 2. Tente fazer um UPDATE:
--    UPDATE entregas 
--    SET recebedor = '[PORTEIRO]: João Silva', 
--        lat_conclusao = -23.550520, 
--        lng_conclusao = -46.633308
--    WHERE id = 1;
--
-- 3. Se ainda houver erro PGRST204, reinicie o projeto no Supabase Dashboard:
--    Settings > General > Pause Project > Resume Project
--
-- ===============================================

-- NOTAS ADICIONAIS:
-- - Este comando força o PostgREST a recarregar o cache do schema
-- - Não afeta os dados, apenas a camada de API
-- - Pode levar até 30 segundos para propagar
-- - Em caso de persistência do erro, verifique se as colunas existem:

SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'entregas' 
AND column_name IN ('recebedor', 'lat_conclusao', 'lng_conclusao');

-- ===============================================
