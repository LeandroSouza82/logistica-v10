import React, { useState } from 'react';
import PainelGestor from './Dashboard'; // ou o nome que você deu ao arquivo

function App() {
  // Estado das abas do gestor
  const [abaAtiva, setAbaAtiva] = useState('visao-geral');

  return (
    <div className="App">
      <PainelGestor abaAtiva={abaAtiva} setAbaAtiva={setAbaAtiva} />
    </div>
  );
}

export default App;