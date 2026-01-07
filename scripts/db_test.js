import { supabase } from '../src/supabaseClient.js';

async function run() {
    try {
        console.log('Iniciando teste DB...');

        // 1) Buscar algumas entregas
        const { data: entregas, error: err1 } = await supabase.from('entregas').select('*').limit(10);
        if (err1) throw err1;
        if (!entregas || entregas.length === 0) {
            console.log('Nenhuma entrega encontrada para testar. Saindo.');
            return;
        }

        console.log('Entregas encontradas:', entregas.length);
        // Escolhe a primeira entrega que tenha motorista_id definido
        let primeiro = entregas.find(e => e.motorista_id !== null && e.motorista_id !== undefined);
        if (!primeiro) {
            console.warn('Nenhuma entrega com motorista_id definido encontrada; usarei a primeira apenas para atualizar status e pularei o teste de deleção.');
            primeiro = entregas[0];
        }

        console.log('Usando entrega id=', primeiro.id, 'motorista_id=', primeiro.motorista_id, 'status=', primeiro.status);

        // 2) Marcar a entrega como concluido
        const { data: updData, error: err2 } = await supabase.from('entregas').update({ status: 'concluido' }).eq('id', primeiro.id).select();
        if (err2) throw err2;
        console.log('Atualização completa. Registros afetados:', updData.length, 'novo status:', updData[0].status);

        // 3) Verificar que a mudança foi persistida
        const { data: check, error: err3 } = await supabase.from('entregas').select('*').eq('id', primeiro.id).single();
        if (err3) throw err3;
        console.log('Verificação: entrega', check.id, 'status atual=', check.status);

        // 4) Se o motorista estiver definido, Deletar todas as entregas do motorista
        const motoristaId = primeiro.motorista_id;
        if (motoristaId === null || motoristaId === undefined) {
            console.warn('motorista_id é nulo; pulando teste de deleção.');
        } else {
            const { data: delData, error: err4 } = await supabase.from('entregas').delete().eq('motorista_id', motoristaId).select();
            if (err4) throw err4;
            console.log('Deleção completa. Registros removidos:', delData.length);

            // 5) Confirmar que não restam entregas para esse motorista
            const { data: remCheck, error: err5 } = await supabase.from('entregas').select('*').eq('motorista_id', motoristaId);
            if (err5) throw err5;
            console.log('Ainda existem entregas para esse motorista?', remCheck.length);
        }
        console.log('Teste DB finalizado com sucesso.');
    } catch (err) {
        console.error('Erro durante teste DB:', err.message || err);
        process.exit(1);
    }
}

run();
