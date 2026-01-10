import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const idArg = process.argv[2] || '1';
const delay = Number(process.argv[3] || '10000');

async function getSupabaseClient() {
    let supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    let supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
        try {
            // primeira tentativa: DeliveryApp.js (antigo)
            const mobileDA = fs.readFileSync('mobile/src/components/DeliveryApp.js', 'utf8');
            const urlMatch1 = mobileDA.match(/const supabaseUrl = ['"]([^'"]+)['"]/);
            const keyMatch1 = mobileDA.match(/const supabaseAnonKey = ['"]([^'"]+)['"]/);
            if (urlMatch1) supabaseUrl = supabaseUrl || urlMatch1[1];
            if (keyMatch1) supabaseAnonKey = supabaseAnonKey || keyMatch1[1];
        } catch (e) {
            // ignore
        }

        if (!supabaseUrl || !supabaseAnonKey) {
            try {
                // segunda tentativa: supabaseClient.js
                const client = fs.readFileSync('mobile/src/supabaseClient.js', 'utf8');
                const urlMatch2 = client.match(/const supabaseUrl = ['"]([^'"]+)['"]/);
                const keyMatch2 = client.match(/const supabaseAnonKey = ['"]([^'"]+)['"]/);
                if (urlMatch2) supabaseUrl = supabaseUrl || urlMatch2[1];
                if (keyMatch2) supabaseAnonKey = supabaseAnonKey || keyMatch2[1];
            } catch (e) {
                // ignore
            }
        }
    }

    if (!supabaseUrl || !supabaseAnonKey) {
        console.error('Supabase URL/ANON_KEY não encontrados. Defina as variáveis de ambiente ou verifique mobile file.');
        process.exit(1);
    }

    return createClient(supabaseUrl, supabaseAnonKey);
}

async function main() {
    const supabase = await getSupabaseClient();
    const id = Number(idArg);

    console.log(`Atualizando posição do motorista ${id} para um ponto de teste...`);
    const lat = -27.615 + Math.random() * 0.01;
    const lng = -48.67 + Math.random() * 0.01;
    await supabase.from('motoristas').update({ lat: lat.toString(), lng: lng.toString(), ultimo_sinal: new Date().toISOString() }).eq('id', id);

    const { data: before } = await supabase.from('motoristas').select('id,lat,lng,ultimo_sinal').eq('id', id).maybeSingle();
    console.log('ANTES (no DB):', before);

    console.log(`Aguardando ${delay} ms para simular limpeza após logout...`);
    await new Promise(r => setTimeout(r, delay));

    await supabase.from('motoristas').update({ lat: null, lng: null, ultimo_sinal: null }).eq('id', id);
    const { data: after } = await supabase.from('motoristas').select('id,lat,lng,ultimo_sinal').eq('id', id).maybeSingle();
    console.log('DEPOIS (no DB):', after);
}

main().catch(e => { console.error(e); process.exit(2); });
