import { supabase } from '../supabaseClient';

// Converte erros do Supabase em mensagens amigáveis para exibição ao usuário
export function humanizeSupabaseError(error) {
  if (!error) return 'Erro desconhecido no banco.';
  const msg = (error.message || String(error)).toLowerCase();

  if (msg.includes('null value in column') && msg.includes('telefone')) {
    return 'Telefone obrigatório. Por favor, informe um número com DDD (ex: 5511999999999).';
  }

  if (msg.includes('duplicate key') || msg.includes('already exists')) {
    return 'Já existe um registro com esses dados.';
  }

  // Fallback genérico
  return 'Erro no banco: ' + (error.message || String(error));
}

// Helper específico para inserir motoristas de forma segura (mapeia tel -> telefone)
export async function safeInsertMotorista(payload) {
  const p = { ...payload };
  if (!p.telefone && p.tel) p.telefone = p.tel;
  if (!p.telefone) {
    return { data: null, error: { message: 'Telefone obrigatório.' } };
  }
  return await supabase.from('motoristas').insert([p]);
}
