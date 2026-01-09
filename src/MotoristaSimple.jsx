import React, { useState, useEffect } from 'react';
import { GoogleMap, Marker } from '@react-google-maps/api';
import DeliveryApp from './components/DeliveryApp.jsx';

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
    // Dependemos do loader único do Dashboard — aqui verificamos se a API já foi carregada
    const loadError = false;
    const isLoaded = typeof window !== 'undefined' && window.google && window.google.maps;

    const defaultCenter = { lat: -23.5505, lng: -46.6333 };
    const [position, setPosition] = useState(null);
    const [geoError, setGeoError] = useState(null);

    useEffect(() => {
        if (!('geolocation' in navigator)) {
            setGeoError('Geolocalização não suportada pelo navegador.');
            return;
        }

        // Pega posição inicial e atualiza continuamente
        const watchId = navigator.geolocation.watchPosition((pos) => {
            setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        }, (err) => {
            console.warn('Geolocation error:', err);
            setGeoError(err.message || 'Erro ao acessar GPS');
        }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 });

        return () => { if (watchId) navigator.geolocation.clearWatch(watchId); };
    }, []);

    if (loadError) return <div style={containerStyle}>Erro ao carregar o mapa. Verifique a chave.</div>;
    if (!isLoaded) return <div style={containerStyle}>Carregando Google Maps...</div>;

    return (
        <div style={{ position: 'relative' }}>
            {geoError && <div style={{ position: 'absolute', top: 8, left: 8, zIndex: 2000, background: '#f87171', color: '#000', padding: '6px 10px', borderRadius: 6 }}>{geoError}</div>}
            <GoogleMap
                mapContainerStyle={{ width: '100vw', height: '100vh' }}
                center={position || defaultCenter}
                zoom={position ? 15 : 13}
            >
                {/* Marcador do motorista (posição atual) com ícone de moto */}
                {position && (
                    <Marker
                        position={position}
                        title="Você"
                        icon={window.google && window.google.maps ? {
                            url: 'https://maps.google.com/mapfiles/kml/shapes/motorcycling.png',
                            scaledSize: new window.google.maps.Size(36, 36)
                        } : 'https://maps.google.com/mapfiles/kml/shapes/motorcycling.png'}
                    />
                )}

                {/* Marcador de destino/entrega (exemplo estático) com ícone de pino */}
                <Marker
                    position={{ lat: -23.56, lng: -46.65 }}
                    title="Entrega #01"
                    icon={{ url: 'https://maps.google.com/mapfiles/ms/icons/red-dot.png' }}
                />
            </GoogleMap>

            {/* Painel deslizante de pedidos */}
            <DeliveryApp />
        </div>
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
