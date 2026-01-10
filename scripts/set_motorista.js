import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

// Usage: node scripts/set_motorista.js <id> "Name" <lat> <lng>
(async function () {
    const idArg = process.argv[2];
    const nameArg = process.argv[3];
    const latArg = process.argv[4];
    const lngArg = process.argv[5];

    if (!idArg || !nameArg || !latArg || !lngArg) {
        console.error('Usage: node scripts/set_motorista.js <id> "Name" <lat> <lng>');
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
    }

    if (!supabaseUrl || !supabaseAnonKey) {
        console.error('Supabase URL/ANON_KEY not found in env or mobile file.');
        process.exit(2);
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    const id = Number(idArg);
    const name = nameArg.replace(/^"|"$/g, '');
    const lat = Number(latArg);
    const lng = Number(lngArg);

    const { data, error } = await supabase.from('motoristas').upsert({ id, nome: name, tel: '999', senha: '123', lat: lat.toString(), lng: lng.toString(), ultimo_sinal: new Date().toISOString() }, { onConflict: 'id' }).select().maybeSingle();

    if (error) {
        console.error('Erro ao setar motorista:', error.message);
        process.exit(3);
    }

    console.log('Motorista set:', data);
    process.exit(0);
})();