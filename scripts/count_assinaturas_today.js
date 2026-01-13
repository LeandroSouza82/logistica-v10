(async () => {
    const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://xdsoctyzmsxbhtjehsqd.supabase.co';
    const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_h1241fMOb-5_FOoChqERQw_B0VLvAt2';
    const hoje = new Date(); hoje.setUTCHours(0, 0, 0, 0); const filtro = hoje.toISOString();
    console.log('filtro:', filtro);
    const url = `${supabaseUrl}/rest/v1/entregas?select=id&criado_em=gte.${encodeURIComponent(filtro)}&or=(status.eq.concluido,assinatura.not.is.null)`;
    const res = await fetch(url, { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } });
    if (!res.ok) { console.error('Error', res.status, await res.text()); process.exit(1); }
    const j = await res.json(); console.log('count:', j.length);
})();