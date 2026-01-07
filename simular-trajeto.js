const simularTrajeto = async () => {
    if (!motoristaLogado) {
        alert("Nenhum motorista logado para testar!");
        return;
    }

    setSimulando(true);
    console.log("Iniciando simulação para:", motoristaLogado);

    // Pontos de teste (ajuste para sua cidade se necessário)
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
            .eq('nome', motoristaLogado); // CERTIFIQUE-SE QUE A COLUNA É 'nome'

        if (error) {
            console.error("Erro ao atualizar banco na simulação:", error.message);
        } else {
            console.log(`Posição ${i + 1} enviada com sucesso!`);
        }

        i++;
    }, 3000); // Move a cada 3 segundos
};
