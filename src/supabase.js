import { createClient } from '@supabase/supabase-js';

// Cria o cliente Supabase uma vez, fora de qualquer componente
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default supabase;
