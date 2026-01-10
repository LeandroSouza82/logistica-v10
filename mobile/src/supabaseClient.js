import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://xdsoctyzmsxbhtjehsqd.supabase.co';
// Use environment variable for the anon key instead of hard-coding it here
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';
if (!supabaseAnonKey) {
    console.warn('VITE_SUPABASE_ANON_KEY is not set in the environment. Configure it in your CI or local env.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
export default supabase;
