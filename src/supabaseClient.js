import { createClient } from '@supabase/supabase-js'

// Substitua com os dados que aparecem em Project API keys no seu Supabase
const supabaseUrl = 'sb_secret_5s0cRIIAlUCiADhLkpwMlw_WXYFQcGO'
const supabaseKey = 'sb_secret_LelyAvQvQugDfKy2fNiClg_kaLa5kZQ'

export const supabase = createClient(supabaseUrl, supabaseKey)