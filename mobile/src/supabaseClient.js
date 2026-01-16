import { createClient } from '@supabase/supabase-js'
import Constants from 'expo-constants'

// Prefere valores em app.json -> expo.extra (seguros para builds) e depois usa env vars
const extras = Constants.expoConfig?.extra || Constants.manifest?.extra || {}
const supabaseUrlRaw = extras.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "https://uqxoadxqcwidxqsfayem.supabase.co"
const supabaseUrl = String(supabaseUrlRaw).trim();
const supabaseKey = extras.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVxeG9hZHhxY3dpZHhxc2ZheWVtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0NDUxODksImV4cCI6MjA4NDAyMTE4OX0.q9_RqSx4YfJxlblPS9fwrocx3HDH91ff1zJvPbVGI8w"

if (!supabaseUrl.endsWith('.co')) console.warn('Supabase URL parece incorreta (não termina com .co):', supabaseUrl);
if (!supabaseKey) {
    // Em desenvolvimento exibimos erro amigável
    throw new Error('[runtime not ready]: supabaseKey is required. Defina as chaves em expo.extra (app.json) ou via variáveis de ambiente')
}

export const supabase = createClient(supabaseUrl, supabaseKey)