import { supabase } from '../src/supabaseClient.js';

async function main() {
    console.log('Iniciando script de teste (inserir motorista + pedido + simular falha)');

    // 1) Garantir motorista de teste
    const driverName = 'Motorista Teste UI'
    const { data: existingDriver } = await supabase.from('motoristas').select('*').eq('nome', driverName).maybeSingle();

    let driver = existingDriver;
    if (!driver) {
        const { data: newDriver, error: err1 } = await supabase.from('motoristas').insert([{ nome: driverName, tel: '999999999', senha: 'teste' }]).select().maybeSingle();
        if (err1) {
            console.error('Erro ao inserir motorista:', err1.message);
            return;
        }
        driver = newDriver;
        console.log('Motorista de teste criado:', driver.nome);
    } else {
        console.log('Motorista já existente:', driver.nome);
    }

    // 2) Inserir pedido de teste
    // Calcular a ordem como (max ordem) + 1
    const { data: all } = await supabase.from('entregas').select('ordem');
    const maxOrdem = all && all.length ? Math.max(...all.map(x => x.ordem || 0)) : 0;
    const ordemNova = maxOrdem + 1;

    const pedido = {
        cliente: 'Cliente Teste UI',
        endereco: 'Rua Exemplo 123',
        motorista: driver.nome,
        status: 'Pendente',
        ordem: ordemNova
    };

    const { data: newPedido, error: err2 } = await supabase.from('entregas').insert([pedido]).select().maybeSingle();
    if (err2) {
        console.error('Erro ao criar pedido:', err2.message);
        return;
    }

    console.log('Pedido criado com id:', newPedido.id);
    console.log('Aguarde alguns segundos para a UI sincronizar (realtime). Vou simular uma falha em 5s para validar o relatório.');

    // 3) Aguardar e simular falha
    await new Promise(r => setTimeout(r, 5000));
    const { error: err3 } = await supabase.from('entregas').update({ status: 'Não Realizado', recado: 'FALHA: Simulação de teste', horario_conclusao: new Date().toISOString() }).eq('id', newPedido.id);
    if (err3) console.error('Erro ao simular falha:', err3.message);
    else console.log('Falha simulada para pedido id', newPedido.id);
}

main().catch(err => console.error(err));
