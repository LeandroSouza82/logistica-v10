import re

with open('src/App.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

old_pattern = r"const simularTrajeto = \(\) => \{\s+setSimulando\(true\);.*?\}, 3000\);\s*\};"

new_func = '''const simularTrajeto = async () => {
    if (!motoristaLogado) {
      alert("Nenhum motorista logado para testar!");
      return;
    }

    setSimulando(true);
    console.log("Iniciando simulação para:", motoristaLogado);

    const pontos = [
      { lat: -23.5505, lng: -46.6333 },
      { lat: -23.5515, lng: -46.6343 },
      { lat: -23.5525, lng: -46.6353 },
      { lat: -23.5535, lng: -46.6363 }
    ];

    let i = 0;
    const intervalo = setInterval(async () => {
      if (i >= pontos.length) {
        clearInterval(intervalo);
        setSimulando(false);
        console.log("Simulação finalizada.");
        return;
      }

      const { error } = await supabase
        .from('motoristas')
        .update({
          lat: pontos[i].lat,
          lng: pontos[i].lng,
          ultimo_sinal: new Date().toISOString()
        })
        .eq('nome', motoristaLogado);

      if (error) {
        console.error("Erro ao atualizar banco na simulação:", error.message);
      } else {
        console.log(`Posição ${i + 1} enviada com sucesso!`);
      }

      i++;
    }, 3000);
  };'''

new_content = re.sub(old_pattern, new_func, content, flags=re.DOTALL)

with open('src/App.jsx', 'w', encoding='utf-8') as f:
    f.write(new_content)

print("Função simularTrajeto substituída com sucesso!")
