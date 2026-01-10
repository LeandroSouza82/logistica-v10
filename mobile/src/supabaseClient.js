import { createClient } from '@supabase/supabase-js';
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = "https://xdsoctyzmsxbhtjehqsd.supabase.co"
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." // Cole a chave ANON completa aqui

export const supabase = createClient(supabaseUrl, supabaseKey)