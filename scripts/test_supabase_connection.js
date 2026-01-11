import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

(async () => {
  try {
    const mobile = fs.readFileSync('mobile/src/supabaseClient.js', 'utf8');
    const urlMatch = mobile.match(/const supabaseUrl = [^\n]*\|\|\s*process\.env\.[^\n]*\|\|\s*['"]([^'"]+)['"]/);
    const urlMatch2 = mobile.match(/const supabaseUrl = [^\n]*\|\|\s*['"]([^'"]+)['"]/);
    const keyMatch = mobile.match(/const supabaseKey = [^\n]*\|\|\s*['"]([^'"]+)['"]/);

    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || (urlMatch && urlMatch[1]) || (urlMatch2 && urlMatch2[1]);
    const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || (keyMatch && keyMatch[1]);

    if (!supabaseUrl || !supabaseKey) {
      console.error('Supabase URL/ANON_KEY not found.');
      process.exit(1);
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data, error } = await supabase.from('motoristas').select('id, nome').limit(5);
    if (error) {
      console.error('Error querying motoristas:', error.message);
      process.exit(2);
    }

    console.log('Motoristas sample:', data);
  } catch (e) {
    console.error('Erro durante teste de conexão:', e);
    process.exit(3);
  }
})();