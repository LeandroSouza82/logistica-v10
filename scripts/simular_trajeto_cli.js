import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

// Uso: node scripts/simular_trajeto_cli.js <id> [intervalMs]
(async function () {
    const idArg = process.argv[2];
    const intervalArg = process.argv[3];
    if (!idArg) {
        console.error('Usage: node scripts/simular_trajeto_cli.js <id> [intervalMs]');
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
                const urlMatch2 = client.match(/const supabaseUrl = ['"]([^'\"]+)['"]/);
                const keyMatch2 = client.match(/const supabaseAnonKey = ['"]([^'\"]+)['"]/);
                if (urlMatch2) supabaseUrl = supabaseUrl || urlMatch2[1];
                if (keyMatch2) supabaseAnonKey = supabaseAnonKey || keyMatch2[1];
            } catch (e) { /* ignore */ }
        }
    }

    if (!supabaseUrl || !supabaseAnonKey) {
        console.error('Supabase URL/ANON_KEY not found. Set env vars or ensure mobile file contains them.');
        process.exit(2);
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const id = Number(idArg);
    const intervalMs = Number(intervalArg) || 3000;

    // Pontos do trajeto em Palhoça (ajuste fino)
    const pontos = [
        { lat: -27.6185, lng: -48.6650 },
        { lat: -27.6187, lng: -48.6640 },
        { lat: -27.6190, lng: -48.6630 },
        { lat: -27.6193, lng: -48.6620 },
        { lat: -27.6196, lng: -48.6610 },
        { lat: -27.6199, lng: -48.6600 },
        { lat: -27.6202, lng: -48.6590 }
    ];

    let i = 0;
    console.log(`Starting route simulation for id=${id} (${pontos.length} points) every ${intervalMs}ms`);

    const handle = setInterval(async () => {
        if (i >= pontos.length) {
            console.log('Trajectory finished.');
            clearInterval(handle);
            process.exit(0);
            return;
        }

        const p = pontos[i];
        try {
            // retry simples para garantir entrega
            let attempts = 0;
            let lastErr = null;
            while (attempts < 3) {
                const { data, error } = await supabase.from('motoristas').update({ lat: p.lat.toString(), lng: p.lng.toString(), ultimo_sinal: new Date().toISOString() }).eq('id', id).select().maybeSingle();
                if (!error) {
                    console.log(`Point ${i + 1}/${pontos.length} sent: ${p.lat}, ${p.lng}`);
                    lastErr = null;
                    break;
                }
                lastErr = error;
                attempts++;
                await new Promise(r => setTimeout(r, 500 * Math.pow(2, attempts)));
            }
            if (lastErr) console.error('Error updating position after retries:', lastErr.message);
        } catch (e) {
            console.error('Exception while updating:', e.message || e);
        }

        i++;
    }, intervalMs);
})();