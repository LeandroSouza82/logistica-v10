import { createClient } from '@supabase/supabase-js'

// Use variáveis de ambiente para evitar expor chaves no código-fonte
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error('[runtime not ready]: supabaseKey is required. Configure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY or SUPABASE_* env vars')
}

export const supabase = createClient(supabaseUrl, supabaseKey)