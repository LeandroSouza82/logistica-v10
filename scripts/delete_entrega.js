(async () => {
    const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://xdsoctyzmsxbhtjehsqd.supabase.co';
    const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_h1241fMOb-5_FOoChqERQw_B0VLvAt2';
    const id = process.argv[2] || '321';
    const res = await fetch(`${supabaseUrl}/rest/v1/entregas?id=eq.${id}`, { method: 'DELETE', headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } });
    console.log('status', res.status);
})();
