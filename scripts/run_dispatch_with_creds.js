import fs from 'fs';
import { spawn } from 'child_process';

(async () => {
  try {
    const txt = fs.readFileSync('mobile/src/supabaseClient.js', 'utf8');
    // Regex mais robusta: procura o URL final entre aspas e a chave que começa com 'sb_'
    const urlMatch = txt.match(/\|\|\s*['\"](https?:\/\/[^'\"]+)['\"]/);
    const keyMatch = txt.match(/\|\|\s*['\"](sb_[^'\"]+)['\"]/i);
    if (!urlMatch || !keyMatch) {
      console.error('Não encontrei supabaseUrl/supabaseKey em mobile/src/supabaseClient.js (regex falhou)');
      process.exit(1);
    }
    const url = urlMatch[1];
    const key = keyMatch[1];

    console.log('Executando dispatch com credenciais extraídas (não exibindo valores)...');
    const env = { ...process.env, VITE_SUPABASE_URL: url, VITE_SUPABASE_ANON_KEY: key };
    // Passe quaisquer argumentos adicionais recebidos para o script de dispatch (ex.: --cliente="Fulano da Silva")
    const extraArgs = process.argv.slice(2);
    const childArgs = ['scripts/dispatch_to_mobile.js', '--motoristaId=1', '--create', ...extraArgs];
    const child = spawn(process.execPath, childArgs, { stdio: 'inherit', env });
    child.on('exit', (code) => process.exit(code));
  } catch (e) {
    console.error('Erro ao executar dispatch com credenciais:', e?.message || e);
    process.exit(2);
  }
})();