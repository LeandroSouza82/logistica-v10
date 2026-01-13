const { Client } = require('pg');
const table = process.argv[2] || 'localizacoes';
(async () => {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) { console.error('DATABASE_URL não definido.'); process.exit(1); }
    const client = new Client({ connectionString: dbUrl });
    try {
        await client.connect();
        const res = await client.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = $1", [table]);
        console.log('Columns for', table, ':', res.rows);
    } catch (e) {
        console.error('Erro na query:', e.message || e); process.exit(2);
    } finally {
        await client.end();
    }
})();