(async () => {
    const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://xdsoctyzmsxbhtjehsqd.supabase.co';
    const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_h1241fMOb-5_FOoChqERQw_B0VLvAt2';
    const now = new Date().toISOString();
    const body = { cliente: 'Test Insert', endereco: 'Rua Test', status: 'concluido', assinatura: 'data:image/png;base64,TEST', criado_em: now };
    const r = await fetch(`${supabaseUrl}/rest/v1/entregas`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}`, Prefer: 'return=representation' }, body: JSON.stringify(body) });
    const j = await r.json();
    console.log('inserted:', JSON.stringify(j, null, 2));
    if (j && j[0] && j[0].id) {
        const id = j[0].id;
        const hoje = new Date(); hoje.setHours(0, 0, 0, 0); const filtro = hoje.toISOString();
        const res = await fetch(`${supabaseUrl}/rest/v1/entregas?select=id&criado_em=gte.${encodeURIComponent(filtro)}&assinatura=not.is.null`, { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } });
        console.log('count status', res.status);
        const arr = await res.json(); console.log('count list len', arr.length);
        const del = await fetch(`${supabaseUrl}/rest/v1/entregas?id=eq.${id}`, { method: 'DELETE', headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } });
        console.log('deleted status', del.status);
    }
})();