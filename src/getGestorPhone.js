import { supabase } from './supabase';

export async function getGestorPhone() {
    try {
        // Try localStorage first
        if (typeof window !== 'undefined' && window.localStorage) {
            const ls = window.localStorage.getItem('gestor_phone');
            if (ls) {
                const digits = String(ls).replace(/\D/g, '');
                if (digits) return digits.startsWith('55') ? digits : `55${digits}`;
            }
        }
    } catch (e) {
        // ignore localStorage errors
        console.warn('getGestorPhone: localStorage access failed:', e);
    }

    // Query Supabase
    try {
        const { data, error } = await supabase.from('configuracoes').select('valor').eq('chave', 'gestor_phone').limit(1);
        if (error) {
            console.warn('getGestorPhone: supabase error:', error);
            return null;
        }
        if (data && data[0] && data[0].valor) {
            const digits = String(data[0].valor).replace(/\D/g, '');
            if (!digits) return null;
            return digits.startsWith('55') ? digits : `55${digits}`;
        }
        return null;
    } catch (e) {
        console.warn('getGestorPhone: exception querying supabase:', e);
        return null;
    }
}
