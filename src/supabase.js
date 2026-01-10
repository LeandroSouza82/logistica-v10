import { createClient } from '@supabase/supabase-js'

// No Vite, usamos import.meta.env e o prefixo VITE_
const supabaseUrl = 'https://xdsoctyzmsxbhtjehsqd.supabase.co'
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseKey)

