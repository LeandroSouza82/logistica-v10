import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

(async () => {
    let supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    let supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
        try {
            const mobile = fs.readFileSync('mobile/src/supabaseClient.js', 'utf8');
            const urlMatch = mobile.match(/const supabaseUrl = ['"]([^'"]+)['"]/);
            const keyMatch = mobile.match(/const supabaseAnonKey = ['"]([^'"]+)['"]/);
            if (urlMatch) supabaseUrl = supabaseUrl || urlMatch[1];
            if (keyMatch) supabaseAnonKey = supabaseAnonKey || keyMatch[1];
        } catch (e) { /* ignore */ }
    }

    if (!supabaseUrl || !supabaseAnonKey) {
        console.error('Supabase URL/ANON_KEY not found.');
        process.exit(1);
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    try {
        console.log('1) Criando pedido de teste...');
        const { data: all } = await supabase.from('entregas').select('ordem');
        const maxOrdem = all && all.length ? Math.max(...all.map(x => x.ordem || 0)) : 0;
        const ordemNova = maxOrdem + 1;

        const pedido = {
            cliente: 'Pedido Teste UI',
            endereco: 'Rua Teste 123',
            recado: 'Teste fluxo dispatch',
            tipo: 'entrega',
            status: 'Pendente',
            ordem: ordemNova
        };

        const { data: newPedido, error: err1 } = await supabase.from('entregas').insert([pedido]).select().maybeSingle();
        if (err1) {
            console.error('Erro ao criar entrega:', err1.message);
            process.exit(1);
        }

        console.log('Pedido criado:', newPedido.id, newPedido.cliente);

        console.log('2) Buscando motoristas disponíveis...');
        const { data: motoristas } = await supabase.from('motoristas').select('*').order('id', { ascending: true }).limit(50);
        if (!motoristas || motoristas.length === 0) {
            console.warn('Nenhum motorista encontrado. Teste interrompido.');
            process.exit(0);
        }

        // Escolhe o primeiro motorista com nome ou o primeiro da lista
        const motorista = motoristas.find(m => m.id) || motoristas[0];
        console.log('Motorista escolhido:', motorista.id, motorista.nome || `Motorista ${motorista.id}`);

        console.log('3) Atribuindo entrega ao motorista...');
        const upd = { motorista: motorista.nome || null, motorista_id: motorista.id, status: 'Atribuída' };
        const { data: atrib, error: err2 } = await supabase.from('entregas').update(upd).eq('id', newPedido.id).select().maybeSingle();
        if (err2) {
            console.error('Erro ao atribuir entrega:', err2.message);
            process.exit(1);
        }
        console.log('Entrega atribuída:', atrib.id, 'status ->', atrib.status, 'motorista ->', atrib.motorista);

        console.log('4) Enviando entrega para o app (status Despachado)...');
        const { data: desp, error: err3 } = await supabase.from('entregas').update({ status: 'Despachado' }).eq('id', newPedido.id).select().maybeSingle();
        if (err3) {
            console.error('Erro ao despachar entrega:', err3.message);
            process.exit(1);
        }
        console.log('Entrega despachada:', desp.id, 'status ->', desp.status);

        console.log('5) Busca final do pedido para confirmação...');
        const { data: finalRow, error: err4 } = await supabase.from('entregas').select('*').eq('id', newPedido.id).maybeSingle();
        if (err4) {
            console.error('Erro ao buscar entrega final:', err4.message);
            process.exit(1);
        }
        console.log('Registro final:', finalRow);
        process.exit(0);
    } catch (e) {
        console.error('Erro no fluxo de teste:', e?.message || e);
        process.exit(2);
    }
})();