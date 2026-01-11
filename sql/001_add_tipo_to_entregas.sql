-- Migration: Add column `tipo` to `entregas`
-- Adds a new nullable text column with default 'Entrega'. Run from Supabase SQL editor or via psql.

ALTER TABLE public.entregas
  ADD COLUMN IF NOT EXISTS tipo text DEFAULT 'Entrega';

-- Set existing NULLs to default
UPDATE public.entregas SET tipo = 'Entrega' WHERE tipo IS NULL;
