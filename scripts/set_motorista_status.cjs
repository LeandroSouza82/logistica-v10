const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

// Usage: node scripts/set_motorista_status.cjs [idOrName] [status]
(async function(){
    try {
        const arg = process.argv[2];
        const status = process.argv[3] || 'offline';
        let supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
        let supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

        if (!supabaseUrl || !supabaseAnonKey) {
            try {
                const mobile = fs.readFileSync('mobile/src/components/DeliveryApp.js', 'utf8');
                const urlMatch = mobile.match(/const supabaseUrl = ['"]([^'"]+)['"]/);
                const keyMatch = mobile.match(/const supabaseAnonKey = ['"]([^'"]+)['"]/);
                if (urlMatch) supabaseUrl = supabaseUrl || urlMatch[1];
                if (keyMatch) supabaseAnonKey = supabaseAnonKey || keyMatch[1];
            } catch (e) {}
        }
        if (!supabaseUrl || !supabaseAnonKey) {
            console.error('Supabase credentials not found in env or mobile file'); process.exit(1);
        }
        const supabase = createClient(supabaseUrl, supabaseAnonKey);

        let motorista = null;
        if (!arg) {
            const { data } = await supabase.from('motoristas').select('*').limit(1).maybeSingle();
            motorista = data;
        } else if (/^\d+$/.test(arg)) {
            const { data } = await supabase.from('motoristas').select('*').eq('id', Number(arg)).maybeSingle();
            motorista = data;
        } else {
            const { data } = await supabase.from('motoristas').select('*').eq('nome', arg).maybeSingle();
            motorista = data;
        }

        if (!motorista) {
            console.error('Motorista not found'); process.exit(2);
        }

        const { data, error } = await supabase.from('motoristas').update({ status }).eq('id', motorista.id).select().maybeSingle();
        if (error) { console.error('Update error', error); process.exit(3); }
        console.log('Updated motorista', data);
        process.exit(0);
    } catch (e) {
        console.error('Unexpected', e); process.exit(4);
    }
})();