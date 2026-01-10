const fs = require('fs');

const oldFunc = `  const criarEntregaTeste = async () => {
    const novaEntrega = {
      cliente: "CLIENTE TESTE RÁPIDO",
      endereco: "Rua de Teste, 123",
      motorista: "Motorista Teste", // Precisa ser igual ao nome na tabela
      status: "Pendente",
      lat: -27.612, // Coordenada inicial (Palhoça)
      lng: -48.675,
      criado_em: new Date().toISOString()
    };

    const { error } = await supabase.from('entregas').insert([novaEntrega]);

    if (error) {
      alert("Erro: Verifique se rodou o comando SQL no Supabase! " + error.message);
    } else {
      alert("Entrega de teste criada! O pino azul deve aparecer no mapa.");
      buscarDados(); // Atualiza a lista e o mapa
    }
  };`;

const newFunc = `  const criarEntregaTeste = async () => {
    const { error } = await supabase.from('entregas').insert([{
      cliente: "ENTREGA TESTE",
      endereco: "Rua de Teste, 100",
      motorista: "Motorista Teste",
      status: "Pendente",
      lat: -27.5954,
      lng: -48.5480
    }]);

    if (error) alert("Erro: Verifique se rodou o SQL no Supabase!");
    else alert("Sucesso! O pino azul deve aparecer no mapa agora.");
  };`;

let content = fs.readFileSync('src/App.jsx', 'utf-8');
content = content.replace(oldFunc, newFunc);
fs.writeFileSync('src/App.jsx', content);
console.log('OK');
