const fs = require('fs');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
(async () => {
    try {
        const js = fs.readFileSync('src/supabase.js', 'utf8');
        const urlMatch = js.match(/const\s+supabaseUrl\s*=\s*['"]([^'"]+)['"]/);
        const keyMatch = js.match(/const\s+supabaseAnonKey\s*=\s*['"]([^'"]+)['"]/);
        const supabaseUrl = urlMatch ? urlMatch[1] : process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
        const supabaseKey = keyMatch ? keyMatch[1] : process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
        if (!supabaseUrl || !supabaseKey) {
            console.error('Não consegui obter supabaseUrl/supabaseKey. Verifique src/supabase.js ou variáveis de ambiente.');
            process.exit(1);
        }

        console.log('Usando Supabase URL:', supabaseUrl);
        console.log('Usando Supabase KEY (masked):', supabaseKey ? supabaseKey.slice(0, 6) + '...' + supabaseKey.slice(-6) : 'N/A');

        const endpoint = `${supabaseUrl.replace(/\/$/, '')}/rest/v1/entregas?select=*&limit=500`;
        console.log('GET', endpoint);

        const res = await fetch(endpoint, {
            headers: {
                apikey: supabaseKey,
                Authorization: `Bearer ${supabaseKey}`,
                Accept: 'application/json'
            }
        });

        const text = await res.text();
        let data;
        try { data = JSON.parse(text); } catch (e) { console.error('Resposta não é JSON:', text); process.exit(1); }

        console.log('Total de linhas na tabela entregas:', Array.isArray(data) ? data.length : 'não-array');
        console.log('Dados brutos (primeiros 10 registros):', Array.isArray(data) ? data.slice(0, 10) : data);

        // Also check schema existence if empty
        if (Array.isArray(data) && data.length === 0) {
            console.warn('Nenhuma linha retornada. Possíveis causas: tabela vazia, schema diferente, permissões ou projeto Supabase diferente.');
        }
    } catch (err) {
        console.error('Erro ao checar entregas via REST:', err);
        process.exit(1);
    }
})();