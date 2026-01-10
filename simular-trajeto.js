const simularTrajeto = async () => {
    if (!motoristaLogado) {
        alert("Nenhum motorista logado para testar!");
        return;
    }

    setSimulando(true);
    console.log("Iniciando simulação para:", motoristaLogado);

    // Pontos de teste (ajuste para Palhoça)
    const pontos = [
        { lat: -27.612, lng: -48.675 },
        { lat: -27.613, lng: -48.676 },
        { lat: -27.614, lng: -48.677 },
        { lat: -27.615, lng: -48.678 }
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
