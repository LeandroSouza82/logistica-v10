import { supabase } from '../supabase';

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

// Helpers para interpretar o campo ultimo_sinal (pode conter timestamp, JSON com coords/timestamp, ou string com coords)
export function extractCoordsFromUltimoSinal(val) {
    if (!val) return null;
    if (typeof val === 'object') {
        const o = val;
        if (o.lat != null && o.lng != null) return { lat: Number(o.lat), lng: Number(o.lng) };
        if (o.latitude != null && o.longitude != null) return { lat: Number(o.latitude), lng: Number(o.longitude) };
        if (o.coords && o.coords.lat != null && o.coords.lng != null) return { lat: Number(o.coords.lat), lng: Number(o.coords.lng) };
    }
    if (typeof val === 'string') {
        try {
            const parsed = JSON.parse(val);
            return extractCoordsFromUltimoSinal(parsed);
        } catch (e) { /* ignore */ }
        const m = val.match(/(-?\d+\.\d+)[^\d-]+(-?\d+\.\d+)/);
        if (m) return { lat: Number(m[1]), lng: Number(m[2]) };
    }
    return null;
}

export function parseUltimoSinalDate(val) {
    if (!val) return null;
    if (typeof val === 'string') {
        const d = new Date(val);
        if (!isNaN(d)) return d;
        try {
            const parsed = JSON.parse(val);
            return parseUltimoSinalDate(parsed);
        } catch (e) { /* ignore */ }
    }
    if (typeof val === 'object') {
        const o = val;
        const t = o.created_at || o.timestamp || o.ts || o.time;
        if (t) {
            const d = new Date(t);
            if (!isNaN(d)) return d;
        }
    }
    return null;
}
