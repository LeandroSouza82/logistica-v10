const { Client } = require('pg');

(async () => {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
        console.error('DATABASE_URL não definido.');
        process.exit(1);
    }

    const client = new Client({ connectionString: dbUrl });
    try {
        await client.connect();
        const res = await client.query("SELECT id, nome, lat, lng, ultimo_sinal, status FROM public.motoristas WHERE id = 1;");
        console.log('Resultado query motorista id=1:', res.rows);
    } catch (e) {
        console.error('Erro na query:', e.message || e);
        process.exit(2);
    } finally {
        await client.end();
    }
})();