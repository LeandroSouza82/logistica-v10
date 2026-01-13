-- Adiciona coluna status à tabela motoristas se não existir
ALTER TABLE public.motoristas
ADD COLUMN IF NOT EXISTS status TEXT;

-- Opcional: atualiza status para 'online' para o motorista id 1 (teste)
UPDATE public.motoristas
SET status = 'online'
WHERE id = 1;

-- Retorna a estrutura para verificação
SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'motoristas' AND column_name = 'status';