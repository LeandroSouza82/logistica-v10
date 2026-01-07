const fs = require(`fs`);
const content = fs.readFileSync(`src/App.jsx`, `utf-8`);
const newFunc = `  const simularTrajeto = async () => {
    setSimulando(true);
    const nomeNoBanco = motoristaLogado;
    const pontos = [
      { lat: -27.5954, lng: -48.5480 },
      { lat: -27.5964, lng: -48.5490 },
      { lat: -27.5974, lng: -48.5500 }
    ];
    for (let i = 0; i < pontos.length; i++) {
      const { data, error } = await supabase.from(`motoristas`).update({lat: pontos[i].lat, lng: pontos[i].lng, ultimo_sinal: new Date().toISOString()}).eq(`nome`, nomeNoBanco);
      if (error) console.error(`Erro:`, error.message);
      else console.log(`Movimento enviado!`, pontos[i]);
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
    setSimulando(false);
  };`;
const start = content.indexOf(`const simularTrajeto = async`);
const end = content.indexOf(`};`, start) + 2;
const newContent = content.substring(0, start) + newFunc + content.substring(end);
fs.writeFileSync(`src/App.jsx`, newContent, `utf-8`);
console.log(`OK`);
