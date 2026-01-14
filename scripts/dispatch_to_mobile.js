import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

// Uso: node scripts/dispatch_to_mobile.js --motoristaId=1 [--pedidoId=123] [--create] [--status=Despachado]
// --create : cria um pedido de teste e depois o despacha

const argv = Object.fromEntries(process.argv.slice(2).map(a => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v === undefined ? true : v];
}));

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
        console.error('Supabase URL/ANON_KEY not found. Exporte VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY ou certifique-se de que mobile/src/supabaseClient.js contém as credenciais.');
        process.exit(1);
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    const motoristaId = Number(argv.motoristaId || argv.m || 1);
    const pedidoId = argv.pedidoId || argv.p;
    const create = argv.create || argv.c;
    const status = argv.status || 'Despachado';
    const clienteNome = argv.cliente || argv.client || argv.cname || null; // --cliente="Nome do cliente"

    try {
        let targetPedidoId = pedidoId;

        if (!targetPedidoId && !create) {
            console.error('Informe --pedidoId=<id> ou use --create para criar um pedido de teste.');
            process.exit(1);
        }

        if (create) {
            console.log('Criando pedido de teste...');
            const { data: all } = await supabase.from('entregas').select('ordem');
            const maxOrdem = all && all.length ? Math.max(...all.map(x => x.ordem || 0)) : 0;
            const ordemNova = maxOrdem + 1;
            const pedido = {
                cliente: clienteNome || 'Pedido Teste (dispatch_to_mobile)',
                endereco: 'Rua Script Teste, 123',
                recado: 'Disparo de rota via script',
                tipo: 'entrega',
                status: 'Pendente',
                ordem: ordemNova
            };
            const { data: newPedido, error: err } = await supabase.from('entregas').insert([pedido]).select().maybeSingle();
            if (err) throw err;
            targetPedidoId = newPedido.id;
            console.log('Pedido criado:', targetPedidoId);
        }

        console.log(`Atribuindo pedido ${targetPedidoId} ao motorista ${motoristaId} e atualizando status -> ${status}...`);

        // Atribui motorista (nome opcional) e atualiza status
        const motoristaRow = await supabase.from('motoristas').select('id,nome').eq('id', motoristaId).maybeSingle();
        const motoristaNome = motoristaRow?.data?.nome || null;

        const upd1 = {};
        if (motoristaNome) upd1.motorista = motoristaNome;
        upd1.motorista_id = motoristaId;

        const { data: atrib, error: err2 } = await supabase.from('entregas').update(upd1).eq('id', targetPedidoId).select().maybeSingle();
        if (err2) throw err2;
        console.log('Entrega atribuída:', atrib?.id, 'motorista ->', atrib?.motorista || motoristaId);

        const updateStatusObj = { status };
        if (clienteNome) updateStatusObj.cliente = clienteNome;
        const { data: desp, error: err3 } = await supabase.from('entregas').update(updateStatusObj).eq('id', targetPedidoId).select().maybeSingle();
        if (err3) throw err3;
        console.log('Entrega atualizada (status):', desp?.id, 'status ->', desp?.status);

        console.log('Busca final do pedido para confirmação...');
        const { data: finalRow, error: err4 } = await supabase.from('entregas').select('*').eq('id', targetPedidoId).maybeSingle();
        if (err4) throw err4;
        console.log('Registro final:', finalRow);
        process.exit(0);
    } catch (e) {
        console.error('Erro no script dispatch_to_mobile:', e?.message || e);
        process.exit(2);
    }
})();