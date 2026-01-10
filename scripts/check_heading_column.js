import { createClient } from '@supabase/supabase-js';

(async function () {
    const fs = await import('fs');
    // Try to read supabase URL from env or from mobile file
    let supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    let supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) {
        const mobile = fs.readFileSync('mobile/src/components/DeliveryApp.js', 'utf8');
        const urlMatch = mobile.match(/const supabaseUrl = ['"]([^'"]+)['"]/);
        if (urlMatch) supabaseUrl = supabaseUrl || urlMatch[1];
        if (!supabaseKey) {
            console.log('No SUPABASE_SERVICE_ROLE_KEY in env. Cannot run check.');
            process.exit(2);
        }
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    try {
        const { data, error } = await supabase.from('motoristas').select('id,nome,heading').limit(1).maybeSingle();
        if (error) {
            console.log('Error querying motoristas (probably column missing):', error.message);
            process.exit(3);
        }
        console.log('Query succeeded. Sample row:', data);
        process.exit(0);
    } catch (err) {
        console.log('Exception:', err.message || err);
        process.exit(4);
    }
})();