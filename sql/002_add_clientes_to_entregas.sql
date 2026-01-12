-- Migration: Add column `clientes` to `entregas`
-- Adds an optional text column to store a client name or identifier.

ALTER TABLE public.entregas
  ADD COLUMN IF NOT EXISTS clientes text;

-- Note: run this with your DATABASE_URL or execute manually in Supabase SQL editor.