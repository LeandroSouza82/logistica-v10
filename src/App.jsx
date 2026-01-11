import React, { useState } from 'react';
import PainelGestor from './Dashboard'; // ou o nome que você deu ao arquivo

function App() {
  // Estado das abas do gestor (permite abrir uma aba por query param ?tab=central-despacho para testes)
  const [abaAtiva, setAbaAtiva] = useState(() => {
    try {
      const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
      return params?.get('tab') || 'visao-geral';
    } catch (e) {
      return 'visao-geral';
    }
  });

  return (
    <div className="App">
      <PainelGestor abaAtiva={abaAtiva} setAbaAtiva={setAbaAtiva} />
    </div>
  );
}

export default App;