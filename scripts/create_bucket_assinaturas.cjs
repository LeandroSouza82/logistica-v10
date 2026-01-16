// Script para criar bucket 'assinaturas' (requer SERVICE_ROLE_KEY)
// Uso (local/servidor):
// SUPABASE_URL=https://<project>.supabase.co SUPABASE_SERVICE_ROLE_KEY=<service_role> node scripts/create_bucket_assinaturas.cjs

const { createClient } = require('@supabase/supabase-js');

(async function () {
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) {
        console.error('Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY nas variáveis de ambiente.');
        process.exit(1);
    }

    const supabase = createClient(url, serviceKey);
    try {
        const { data, error } = await supabase.storage.createBucket('assinaturas', { public: true });
        if (error) throw error;
        console.log('Bucket criado/atualizado:', data);
    } catch (err) {
        console.error('Erro criando bucket:', err.message || err);
        process.exit(1);
    }
})();
