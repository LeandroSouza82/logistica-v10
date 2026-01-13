import fs from 'fs';

(async function () {
    try {
        const supabaseUrl = 'https://xdsoctyzmsxbhtjehsqd.supabase.co';
        const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhkc29jdHl6bXN4Ymh0amVoc3FkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYzMjcxMDMsImV4cCI6MjA4MTkwMzEwM30.WjvJ9E52JXJzjnWAocxQsS9vSAZmrndUuAjUKW_pyCk';
        const hoje = new Date();
        hoje.setUTCHours(0,0,0,0);
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