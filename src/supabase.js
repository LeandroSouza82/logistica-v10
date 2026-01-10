import { createClient } from '@supabase/supabase-js'

// Leia variáveis de ambiente (import.meta.env para Vite, fallback para process.env)
const supabaseUrl = import.meta?.env?.VITE_SUPABASE_URL || process.env?.VITE_SUPABASE_URL || process.env?.SUPABASE_URL
const supabaseAnonKey = import.meta?.env?.VITE_SUPABASE_ANON_KEY || process.env?.VITE_SUPABASE_ANON_KEY || process.env?.SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('[runtime warning]: VITE_SUPABASE_* ou SUPABASE_* não definidos — configure as variáveis de ambiente para habilitar o Supabase')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)