import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

async function getSupabaseClient() {
    let supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    let supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
        try {
            const src = fs.readFileSync('src/supabase.js', 'utf8');
            const urlMatch = src.match(/const\s+supabaseUrl\s*=\s*['"]([^'"]+)['"]/);
            const keyMatch = src.match(/const\s+supabaseAnonKey\s*=\s*['"]([^'"]+)['"]/);
            if (urlMatch) supabaseUrl = supabaseUrl || urlMatch[1];
            if (keyMatch) supabaseAnonKey = supabaseAnonKey || keyMatch[1];
        } catch (e) { /* ignore */ }
    }

    if (!supabaseUrl || !supabaseAnonKey) {
        console.error('Supabase URL/ANON_KEY not found in env or src/supabase.js');
        process.exit(2);
    }
    return createClient(supabaseUrl, supabaseAnonKey);
}

(async function main() {
    const supabase = await getSupabaseClient();

    try {
        const hoje = new Date();
        hoje.setUTCHours(0, 0, 0, 0);
        const filtroData = hoje.toISOString();
        console.log('Usando filtroData:', filtroData);

        const { count: totalCount, error: totalErr } = await supabase.from('entregas').select('id', { count: 'exact', head: true }).gte('criado_em', filtroData);
        if (totalErr) {
            console.error('Erro total (obj):', JSON.stringify(totalErr));
            console.error('Erro total (details):', totalErr.message, totalErr.details, totalErr.hint, totalErr.code);
        } else {
            console.log('Total entregas hoje:', totalCount);
        }

        const { count: doneCount, error: doneErr } = await supabase.from('entregas').select('id', { count: 'exact', head: true }).gte('criado_em', filtroData).or('status.eq.concluido,assinatura.not.is.null');
        if (doneErr) {
            console.error('Erro assinaturas (obj):', JSON.stringify(doneErr));
            console.error('Erro assinaturas (details):', doneErr.message, doneErr.details, doneErr.hint, doneErr.code);
        } else {
            console.log('Assinaturas concluídas hoje:', doneCount);
        }
    } catch (e) {
        console.error('Erro geral:', e.message || e);
        process.exit(1);
    }
})();