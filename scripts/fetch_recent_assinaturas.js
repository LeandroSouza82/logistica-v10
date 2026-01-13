(async () => {
    const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://xdsoctyzmsxbhtjehsqd.supabase.co';
    const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_h1241fMOb-5_FOoChqERQw_B0VLvAt2';
    const res = await fetch(`${supabaseUrl}/rest/v1/entregas?select=id,assinatura,criado_em&order=criado_em.desc&limit=10`, { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } });
    const j = await res.json(); console.log(JSON.stringify(j, null, 2));
})();