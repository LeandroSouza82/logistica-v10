import React, { useEffect, useState } from 'react';
import { GoogleMap, Marker } from '@react-google-maps/api';
import { supabase } from './supabase';

const containerStyle = {
    width: '100%',
    height: '100vh',
    display: 'flex',
    flexDirection: 'row',
    backgroundColor: '#0B1F3A',
    color: 'white',
};

const center = { lat: -27.612, lng: -48.675 };

// Cria um ícone SVG maior com círculo pulsante e um emoji de moto como fallback.
const pulsingMotoSvg = (color = '#3b82f6') => {
    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
  <circle cx="48" cy="48" r="10" fill="${color}" fill-opacity="0.95">
    <animate attributeName="r" from="10" to="40" dur="1.6s" repeatCount="indefinite" />
    <animate attributeName="opacity" from="0.9" to="0" dur="1.6s" repeatCount="indefinite" />
  </circle>
  <g transform="translate(48,48)">
    <text x="-18" y="18" font-size="36" font-family="Arial, Helvetica, sans-serif" fill="#fff">🏍️</text>
  </g>
</svg>`;
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
};

export default function PainelGestor({ isLoaded }) {
    const [motoristas, setMotoristas] = useState([]); // Lista de todas as motos
    const [entregas, setEntregas] = useState([]);

    const mapContainerStyle = { width: '100%', height: '100%' };

    useEffect(() => {
        // 1. Busca inicial de entregas e motoristas
        const buscarDados = async () => {
            const { data: mData } = await supabase.from('motoristas').select('*');
            if (mData) setMotoristas(mData);

            const { data: eData } = await supabase.from('entregas').select('*').order('id', { ascending: false }).limit(20);
            if (eData) setEntregas(eData);
        };
        buscarDados();

        // 2. Realtime para Motoristas (Moto 1 e Moto 2)
        const canalMotoristas = supabase
            .channel('rastreio-geral')
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'motoristas' }, payload => {
                setMotoristas(prev => prev.map(m => m.id === payload.new.id ? payload.new : m));
            })
            .subscribe();

        // 3. Realtime para Entregas
        const canalEntregas = supabase
            .channel('entregas')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'entregas' }, payload => {
                setEntregas(prev => [payload.new, ...prev]);
            })
            .subscribe();

        return () => {
            supabase.removeChannel(canalMotoristas);
            supabase.removeChannel(canalEntregas);
        };
    }, []);

    return (
        <div style={containerStyle}>
            <div style={{ flex: 2 }}>
                {isLoaded ? (
                    <GoogleMap
                        mapContainerStyle={mapContainerStyle}
                        center={motoristas.find(m => m.id === 1) || center}
                        zoom={14}
                    >
                        {motoristas.map(m => {
                            // Só mostra no mapa se enviou sinal nos últimos 5 minutos
                            const online = (new Date() - new Date(m.ultimo_sinal)) < (5 * 60 * 1000);
                            if (!online || !m.lat) return null;

                            const icon = (typeof window !== 'undefined' && window.google) ? {
                                url: pulsingMotoSvg('#3b82f6'),
                                scaledSize: new window.google.maps.Size(96, 96),
                                anchor: new window.google.maps.Point(48, 48)
                            } : undefined;

                            return (
                                <Marker
                                    key={m.id}
                                    position={{ lat: Number(m.lat), lng: Number(m.lng) }}
                                    icon={icon}
                                    title={m.nome ? m.nome : `MOTO ${m.id}`}
                                    label={{
                                        text: m.nome ? m.nome : (m.id === 1 ? "MOTO 1 (VOCÊ)" : `MOTO ${m.id}`),
                                        color: "white",
                                        fontWeight: "bold",
                                        fontSize: "14px",
                                        className: "marker-label"
                                    }}
                                />
                            );
                        })}
                    </GoogleMap>
                ) : (
                    <div style={{ color: '#ccc', padding: 20 }}>Carregando mapa...</div>
                )}
            </div>

            <div style={{ flex: 1, backgroundColor: '#0a1a33', padding: 20, overflowY: 'auto', borderLeft: '1px solid #1e293b' }}>
                <h2 style={{ marginTop: 0, color: '#3b82f6' }}>Entregas Realizadas</h2>
                {entregas.map(e => (
                    <div key={e.id} style={{ background: '#112240', padding: 15, borderRadius: 8, marginBottom: 10, border: '1px solid #233554' }}>
                        <p style={{ margin: 0 }}><strong>Cliente:</strong> {e.cliente}</p>
                        <p style={{ margin: 0, fontSize: 12, color: '#10b981' }}>✅ Concluído</p>
                    </div>
                ))}
            </div>
        </div>
    );
}