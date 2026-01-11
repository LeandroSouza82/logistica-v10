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

        console.log('Subscribing to motoristas updates...');

        const channel = supabase
            .channel('schema-db-changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'motoristas' }, (payload) => {
                console.log('Realtime payload:', payload.eventType || payload.event, payload);
            })
            .subscribe();

        // Keep process alive
        process.stdin.resume();
    } catch (e) {
        console.error('Erro no listener:', e);
        process.exit(2);
    }
})();