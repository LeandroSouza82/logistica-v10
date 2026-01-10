import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Se as variáveis estiverem vazias, o código vai te avisar no console
if (!supabaseUrl || !supabaseAnonKey) {
    console.error("ERRO: Chaves do Supabase não encontradas no arquivo .env.local")
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)