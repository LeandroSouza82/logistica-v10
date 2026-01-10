import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

(async function () {
    const idArg = process.argv[2];
    if (!idArg) {
        console.error('Usage: node scripts/get_motorista.js <id>');
        process.exit(1);
    }

    let supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    let supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
        try {
            const mobile = fs.readFileSync('mobile/src/components/DeliveryApp.js', 'utf8');
            const urlMatch = mobile.match(/const supabaseUrl = ['"]([^'"]+)['"]/);
            const keyMatch = mobile.match(/const supabaseAnonKey = ['"]([^'"]+)['"]/);
            if (urlMatch) supabaseUrl = supabaseUrl || urlMatch[1];
            if (keyMatch) supabaseAnonKey = supabaseAnonKey || keyMatch[1];
        } catch (e) { /* ignore */ }

        if (!supabaseUrl || !supabaseAnonKey) {
            try {
                const client = fs.readFileSync('mobile/src/supabaseClient.js', 'utf8');
                const urlMatch2 = client.match(/const supabaseUrl = ['"]([^'"]+)['"]/);
                const keyMatch2 = client.match(/const supabaseAnonKey = ['"]([^'"]+)['"]/);
                if (urlMatch2) supabaseUrl = supabaseUrl || urlMatch2[1];
                if (keyMatch2) supabaseAnonKey = supabaseAnonKey || keyMatch2[1];
            } catch (e) { /* ignore */ }
        }
    }

    if (!supabaseUrl || !supabaseAnonKey) {
        console.error('Supabase URL/ANON_KEY not found.');
        process.exit(2);
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const id = Number(idArg);

    const { data, error } = await supabase.from('motoristas').select('*').eq('id', id).maybeSingle();
    if (error) {
        console.error('Error fetching motorista:', error.message);
        process.exit(3);
    }
    console.log('Motorista:', data);
    process.exit(0);
})();