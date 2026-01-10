import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

(async function () {
    let supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    let supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
        try {
            const mobile = fs.readFileSync('mobile/src/supabaseClient.js', 'utf8');
            const urlMatch = mobile.match(/const supabaseUrl = ['"]([^'\"]+)['"]/);
            const keyMatch = mobile.match(/const supabaseAnonKey = ['"]([^'\"]+)['"]/);
            if (urlMatch) supabaseUrl = supabaseUrl || urlMatch[1];
            if (keyMatch) supabaseAnonKey = supabaseAnonKey || keyMatch[1];
        } catch (e) { /* ignore */ }
    }

    if (!supabaseUrl || !supabaseAnonKey) {
        console.error('Supabase URL/ANON_KEY not found.');
        process.exit(1);
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const { data, error } = await supabase.from('motoristas').select('*');
    if (error) {
        console.error('Error listing motoristas:', error.message);
        process.exit(2);
    }

    console.log('Motoristas:', data);
})();
