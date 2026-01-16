-- Migration: 001_create_motoristas_entregas.sql
-- Cria tabelas motoristas e entregas com colunas compatíveis com o projeto

-- Extensão para geração de UUID
create extension if not exists "pgcrypto";

-- Função auxiliar para atualizar timestamps
create or replace function public.refresh_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  new.atualizado_em = now();
  return new;
end;
$$;

-- Tabela de motoristas
create table if not exists public.motoristas (
  id uuid default gen_random_uuid() primary key,
  nome text not null,
  email text,
  telefone text,
  status text,
  lat double precision,
  lng double precision,
  created_at timestamptz default now(),
  atualizado_em timestamptz default now(),
  updated_at timestamptz default now()
);

create trigger motoristas_refresh_updated_at
  before update on public.motoristas
  for each row execute function public.refresh_updated_at();

-- Tabela de entregas
create table if not exists public.entregas (
  id uuid default gen_random_uuid() primary key,
  motorista_id uuid references public.motoristas(id) on delete set null,
  endereco text,
  lat_entrega double precision,
  lng_entrega double precision,
  status text,
  assinatura text,
  assinatura_url text,
  criado_em timestamptz default now(),
  criado_at timestamptz default now(),
  atualizado_em timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_entregas_status on public.entregas(status);
create index if not exists idx_entregas_criado_em on public.entregas(criado_em);

create trigger entregas_refresh_updated_at
  before update on public.entregas
  for each row execute function public.refresh_updated_at();

-- Observação: execute este arquivo no SQL Editor do Supabase (ou via psql/supabase CLI).
-- Verifique se as colunas (assinatura, assinatura_url, criado_em) existem após a aplicação.
