import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

function parseArgs() {
    const args = process.argv.slice(2);
    const opts = { id: '1', centerLat: -27.6610, centerLng: -48.7090, radius: 0.0006, steps: 12, interval: 500 };
    for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if (a === '--id') opts.id = args[++i];
        if (a === '--center') { opts.centerLat = Number(args[++i]); opts.centerLng = Number(args[++i]); }
        if (a === '--radius') opts.radius = Number(args[++i]);
        if (a === '--steps') opts.steps = Number(args[++i]);
        if (a === '--interval') opts.interval = Number(args[++i]);
    }
    return opts;
}

(async () => {
    try {
        const opts = parseArgs();
        console.log('Animate opts:', { ...opts, note: 'Service Role Key will be read from env SUPABASE_SERVICE_ROLE_KEY' });

        const src = fs.existsSync('src/supabase.js') ? fs.readFileSync('src/supabase.js', 'utf8') : null;
        const srcUrlMatch = src && src.match(/const supabaseUrl =\s*['"]([^'"]+)['"]/);

        const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || (srcUrlMatch && srcUrlMatch[1]);
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY;

        if (!supabaseUrl || !serviceRoleKey) {
            console.error('Supabase URL or Service Role Key not found. Set SUPABASE_SERVICE_ROLE_KEY and SUPABASE_URL (or VITE_SUPABASE_URL).');
            process.exit(1);
        }

        const supabase = createClient(supabaseUrl, serviceRoleKey);

        const id = opts.id;
        let step = 0;

        console.log(`Starting animation for motorista id=${id} around (${opts.centerLat}, ${opts.centerLng})`);

        const timer = setInterval(async () => {
            try {
                const angle = (2 * Math.PI * (step % opts.steps)) / opts.steps;
                const lat = opts.centerLat + Math.cos(angle) * opts.radius;
                const lng = opts.centerLng + Math.sin(angle) * opts.radius;
                step++;

                const payload = { lat, lng, ultimo_sinal: new Date().toISOString() };
                const { data, error } = await supabase.from('motoristas').update(payload).eq('id', id).select('*');
                if (error) {
                    console.error('Update error:', error.message || error);
                } else {
                    console.log('Updated:', { id, lat, lng });
                }
            } catch (e) {
                console.error('Exception during update:', e?.message || e);
            }
        }, opts.interval);

        process.on('SIGINT', () => {
            clearInterval(timer);
            console.log('Animation stopped by user (SIGINT).');
            process.exit(0);
        });

    } catch (e) {
        console.error('Fatal error in animate_motorista:', e);
        process.exit(2);
    }
})();