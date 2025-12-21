import { createClient } from '@supabase/supabase-js'

// Use variáveis de ambiente (Vite) para evitar expor chaves em código-fonte
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('VITE_SUPABASE_URL ou VITE_SUPABASE_ANON_KEY não definidos. Configure .env.local com as credenciais do Supabase.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)