import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

(async () => {
    try {
        const mobile = fs.readFileSync('mobile/src/supabaseClient.js', 'utf8');
        const urlMatch = mobile.match(/const supabaseUrl = [^\n]*\|\|\s*process\.env\.[^\n]*\|\|\s*['"]([^'"]+)['"]/);
        const urlMatch2 = mobile.match(/const supabaseUrl = [^\n]*\|\|\s*['"]([^'"]+)['"]/);
        const keyMatch = mobile.match(/const supabaseKey = [^\n]*\|\|\s*['"]([^'"]+)['"]/);

        const src = fs.existsSync('src/supabase.js') ? fs.readFileSync('src/supabase.js', 'utf8') : null;
        const srcUrlMatch = src && src.match(/const supabaseUrl =\s*['"]([^'"]+)['"]/);
        const srcKeyMatch = src && src.match(/const supabaseAnonKey =\s*['"]([^'"]+)['"]/);

        const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || (urlMatch && urlMatch[1]) || (urlMatch2 && urlMatch2[1]) || (srcUrlMatch && srcUrlMatch[1]);
        const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || (keyMatch && keyMatch[1]) || (srcKeyMatch && srcKeyMatch[1]);

        if (!supabaseUrl || !supabaseKey) {
            console.error('Supabase URL/ANON_KEY not found.');
            process.exit(1);
        }

        const supabase = createClient(supabaseUrl, supabaseKey);

        const id = process.argv[2] || '1';
        const lat = Number(process.argv[3] || '-27.6610');
        const lng = Number(process.argv[4] || '-48.7090');

        console.log(`Atualizando motorista id=${id} -> lat=${lat}, lng=${lng}`);

        const { data, error } = await supabase.from('motoristas').update({ lat, lng }).eq('id', id).select('*').limit(1);

        if (error) {
            console.error('Erro ao atualizar motorista:', error.message || error);
            process.exit(2);
        }

        console.log('Update com sucesso:', data);
        process.exit(0);
    } catch (e) {
        console.error('Erro ao executar update:', e);
        process.exit(3);
    }
})();