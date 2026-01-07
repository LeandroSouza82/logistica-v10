import React, { useState } from 'react';
import { useJsApiLoader, GoogleMap } from '@react-google-maps/api';

const containerStyle = { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', backgroundColor: '#121212', color: 'white' };
const buttonStyle = { padding: '15px 40px', fontSize: '1.2rem', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', marginTop: '20px' };
const inputStyle = { padding: '12px', margin: '10px', width: '80%', maxWidth: '300px', borderRadius: '5px', border: '1px solid #444' };

// 1. TELA DE BOAS-VINDAS
const WelcomeScreen = ({ onNext }) => (
  <div style={containerStyle}>
    <h1 style={{ fontSize: '2.5rem' }}>🚚 Logística V2</h1>
    <p>Bem-vindo ao sistema. Clique em começar para acessar o app.</p>
    <button onClick={onNext} style={buttonStyle}>Começar</button>
  </div>
);

// 2. TELA DE CADASTRO
const RegisterScreen = ({ onRegister }) => (
  <div style={containerStyle}>
    <h2>Cadastro do Motorista</h2>
    <input type="text" placeholder="Nome do Motorista" style={inputStyle} />
    <input type="text" placeholder="Placa do Veículo" style={inputStyle} />
    <button onClick={onRegister} style={buttonStyle}>Entrar no App</button>
  </div>
);

// 3. TELA DO MAPA
const MapScreen = () => {
  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY
  });

  const center = { lat: -23.5505, lng: -46.6333 };

  if (loadError) return <div style={containerStyle}>Erro ao carregar o mapa. Verifique a chave.</div>;
  if (!isLoaded) return <div style={containerStyle}>Carregando Google Maps...</div>;

  return (
    <GoogleMap
      mapContainerStyle={{ width: '100vw', height: '100vh' }}
      center={center}
      zoom={14}
    />
  );
};

export default function App() {
  const [tela, setTela] = useState('welcome');

  return (
    <>
      {tela === 'welcome' && <WelcomeScreen onNext={() => setTela('register')} />}
      {tela === 'register' && <RegisterScreen onRegister={() => setTela('map')} />}
      {tela === 'map' && <MapScreen />}
    </>
  );
}
