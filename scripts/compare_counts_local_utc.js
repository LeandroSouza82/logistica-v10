(async () => {
    const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://uqxoadxqcwidxqsfayem.supabase.co';
    const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVxeG9hZHhxY3dpZHhxc2ZheWVtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0NDUxODksImV4cCI6MjA4NDAyMTE4OX0.q9_RqSx4YfJxlblPS9fwrocx3HDH91ff1zJvPbVGI8w';

    const hojeLocal = new Date(); hojeLocal.setHours(0, 0, 0, 0); const localISO = hojeLocal.toISOString();
    const hojeUTC = new Date(); hojeUTC.setUTCHours(0, 0, 0, 0); const utcISO = hojeUTC.toISOString();

    console.log('Local ISO start:', localISO);
    console.log('UTC ISO start  :', utcISO);

    const fetchCount = async (filter) => {
        // PostgREST: use assinatura=not.is.null to filter not null
        const url = `${supabaseUrl}/rest/v1/entregas?select=id&criado_em=gte.${encodeURIComponent(filter)}&assinatura=not.is.null`;
        const res = await fetch(url, { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } });
        if (!res.ok) { console.error('Request failed', url, res.status, await res.text()); return undefined; }
        const j = await res.json();
        return j.length;
    };

    const localCount = await fetchCount(localISO);
    const utcCount = await fetchCount(utcISO);
    console.log('assinaturas since local midnight:', localCount);
    console.log('assinaturas since utc midnight  :', utcCount);
})();