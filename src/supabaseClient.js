import supabaseDefault, { supabase as supabaseNamed } from './supabase';

// Reexporta o cliente Supabase centralizado para compatibilidade com imports legados
export const supabase = supabaseNamed || supabaseDefault;
export default supabase;