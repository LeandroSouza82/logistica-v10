import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

// Atualiza posição do motorista para testar Realtime no Dashboard
// Uso: node scripts/update_motorista_pos.js [idOrName] [lat] [lng]

const arg = process.argv[2];
const latArg = process.argv[3];
const lngArg = process.argv[4];

async function main() {
    try {
        // Cria cliente Supabase para scripts (process.env ou fallback para mobile DeliveryApp.js)
        let supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
        let supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

        if (!supabaseUrl || !supabaseAnonKey) {
            try {
                const mobile = fs.readFileSync('mobile/src/components/DeliveryApp.js', 'utf8');
                const urlMatch = mobile.match(/const supabaseUrl = ['"]([^'\"]+)['"]/);
                const keyMatch = mobile.match(/const supabaseAnonKey = ['"]([^'\"]+)['"]/);
                if (urlMatch) supabaseUrl = supabaseUrl || urlMatch[1];
                if (keyMatch) supabaseAnonKey = supabaseAnonKey || keyMatch[1];
            } catch (e) {
                // ignore
            }
        }

        if (!supabaseUrl || !supabaseAnonKey) {
            console.error('Supabase URL/ANON_KEY não encontrados em env nem em mobile file. Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.');
            process.exit(5);
        }

        const supabase = createClient(supabaseUrl, supabaseAnonKey);

        let motorista = null;
        if (!arg) {
            // tenta achar o motorista de teste
            const { data } = await supabase.from('motoristas').select('*').like('nome', '%Teste%').limit(1).maybeSingle();
            motorista = data;
        } else if (/^\d+$/.test(arg)) {
            const { data } = await supabase.from('motoristas').select('*').eq('id', Number(arg)).maybeSingle();
            motorista = data;
        } else {
            const { data } = await supabase.from('motoristas').select('*').eq('nome', arg).maybeSingle();
            motorista = data;
        }

        if (!motorista) {
            console.log('Motorista não encontrado. Inserindo motorista de teste...');
            const { data: newM, error: err } = await supabase.from('motoristas').insert([{ nome: 'Motorista Teste UI', tel: '999999999' }]).select().maybeSingle();
            if (err) {
                console.error('Erro ao criar motorista:', err.message);
                process.exit(2);
            }
            motorista = newM;
            console.log('Motorista criado:', motorista);
        }

        const lat = latArg ? Number(latArg) : (motorista.lat ? Number(motorista.lat) + (Math.random() - 0.5) * 0.01 : -27.612 + (Math.random() - 0.5) * 0.01);
        const lng = lngArg ? Number(lngArg) : (motorista.lng ? Number(motorista.lng) + (Math.random() - 0.5) * 0.01 : -48.675 + (Math.random() - 0.5) * 0.01);

        const { data, error } = await supabase.from('motoristas').update({ lat: lat.toString(), lng: lng.toString(), ultimo_sinal: new Date().toISOString() }).eq('id', motorista.id).select().maybeSingle();

        if (error) {
            console.error('Erro ao atualizar posição:', error.message);
            process.exit(3);
        }

        console.log('Motorista atualizado:', data);
        process.exit(0);
    } catch (e) {
        console.error('Erro inesperado:', e.message || e);
        process.exit(4);
    }
}

main();
