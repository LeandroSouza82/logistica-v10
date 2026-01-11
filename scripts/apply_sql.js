const fs = require('fs');
const path = require('path');

(async function main(){
  const fileArg = process.argv[2] || 'sql/001_add_tipo_to_entregas.sql';
  const filePath = path.resolve(process.cwd(), fileArg);

  if (!fs.existsSync(filePath)){
    console.error('Arquivo SQL não encontrado:', filePath);
    process.exit(1);
  }

  const sql = fs.readFileSync(filePath, 'utf8');

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('DATABASE_URL não definido. Para aplicar automaticamente, exporte DATABASE_URL com a string de conexão do Postgres do seu projeto Supabase e rode:');
    console.error('  DATABASE_URL="postgres://..." node scripts/apply_sql.js', fileArg);
    console.error('Ou abra o arquivo SQL em sql/001_add_tipo_to_entregas.sql e execute manualmente no SQL editor do Supabase.
');
    process.exit(2);
  }

  let pg;
  try {
    pg = require('pg');
  } catch (e) {
    console.error('Dependência "pg" não encontrada. Instale com: npm i pg');
    process.exit(3);
  }

  const { Client } = pg;
  const client = new Client({ connectionString: dbUrl });
  try {
    await client.connect();
    console.log('Conectado ao banco, aplicando SQL:', fileArg);
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    console.log('Migration aplicada com sucesso.');
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch (er) { /* ignore */ }
    console.error('Erro ao aplicar migration:', e.message || e);
    process.exit(4);
  } finally {
    await client.end();
  }
})();
