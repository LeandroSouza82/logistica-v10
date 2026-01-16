import fs from 'fs';

(async function () {
    try {
        const supabaseUrl = 'https://uqxoadxqcwidxqsfayem.supabase.co';
        const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVxeG9hZHhxY3dpZHhxc2ZheWVtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0NDUxODksImV4cCI6MjA4NDAyMTE4OX0.q9_RqSx4YfJxlblPS9fwrocx3HDH91ff1zJvPbVGI8w';
        const hoje = new Date();
        hoje.setUTCHours(0, 0, 0, 0);
        const filtroData = hoje.toISOString();
        const url = `${supabaseUrl}/rest/v1/entregas?select=id&criado_em=gte.${encodeURIComponent(filtroData)}`;
        console.log('GET', url);
        const res = await fetch(url, { method: 'GET', headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, Prefer: 'count=exact' } });
        console.log('status', res.status, res.statusText);
        const text = await res.text();
        console.log('body:', text);
    } catch (e) {
        console.error('Error fetching REST endpoint:', e);
    }
})();