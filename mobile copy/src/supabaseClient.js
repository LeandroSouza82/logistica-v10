import { createClient } from '@supabase/supabase-js'
import Constants from 'expo-constants'

// Prefere valores em app.json -> expo.extra (seguros para builds) e depois usa env vars
const extras = Constants.expoConfig?.extra || Constants.manifest?.extra || {}
const supabaseUrl = extras.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "https://xdsoctyzmsxbhtjehsqd.supabase.co"
const supabaseKey = extras.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "sb_publishable_h1241fMOb-5_FOoChqERQw_B0VLvAt2"

if (!supabaseKey) {
    // Em desenvolvimento exibimos erro amigável
    throw new Error('[runtime not ready]: supabaseKey is required. Defina as chaves em expo.extra (app.json) ou via variáveis de ambiente')
}

export const supabase = createClient(supabaseUrl, supabaseKey)