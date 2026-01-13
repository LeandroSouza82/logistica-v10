-- 003_add_observacoes_to_entregas.sql
-- Adiciona a coluna `observacoes` à tabela `entregas` (texto livre, pode ser nulo)

ALTER TABLE public.entregas
  ADD COLUMN IF NOT EXISTS observacoes TEXT;
