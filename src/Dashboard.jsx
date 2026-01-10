import React, { useEffect, useState } from 'react';
import { GoogleMap, Marker, useJsApiLoader } from '@react-google-maps/api';
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

// Ícone SVG Pulsante
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

export default function PainelGestor() {
    const { isLoaded, loadError } = useJsApiLoader({
        id: 'google-map-script',
        // CHAVE INJETADA DIRETAMENTE PARA FUNCIONAR AGORA
        googleMapsApiKey: "AIzaSyBeec8r4DWBdNIEFSEZg1CgRxIHjYMV9dM",
        libraries: ['places', 'geometry']
    });

    const [motoristas, setMotoristas] = useState([]);
    const [entregas, setEntregas] = useState([]);

    useEffect(() => {
        const buscarDados = async () => {
            const { data: mData } = await supabase.from('motoristas').select('*');
            if (mData) setMotoristas(mData);

            const { data: eData } = await supabase.from('entregas').select('*').order('id', { ascending: false }).limit(20);
            if (eData) setEntregas(eData);
        };
        buscarDados();

        const canalMotoristas = supabase
            .channel('rastreio-geral')
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'motoristas' }, payload => {
                setMotoristas(prev => prev.map(m => m.id === payload.new.id ? payload.new : m));
            })
            .subscribe();

        return () => {
            supabase.removeChannel(canalMotoristas);
        };
    }, []);

    if (loadError) return <div style={{ color: '#f88', padding: 20 }}>Erro no Google Maps.</div>;

    return (
        <div style={containerStyle}>
            <div style={{ flex: 2 }}>
                {isLoaded ? (
                    <GoogleMap
                        mapContainerStyle={{ width: '100%', height: '100%' }}
                        center={motoristas.find(m => m.id === 1) || center}
                        zoom={14}
                    >
                        {motoristas.map(m => {
                            const online = true; // Força a moto a aparecer sempre para teste
                            if (!m.lat) return null;

                            return (
                                <Marker
                                    key={m.id}
                                    position={{ lat: Number(m.lat), lng: Number(m.lng) }}
                                    icon={{
                                        url: pulsingMotoSvg(m.id === 1 ? '#3b82f6' : '#10b981'),
                                        scaledSize: new window.google.maps.Size(80, 80),
                                        anchor: new window.google.maps.Point(40, 40)
                                    }}
                                    label={{
                                        text: m.nome || `MOTO ${m.id}`,
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
                    <div style={{ color: '#ccc', padding: 20 }}>Iniciando Radar...</div>
                )}
            </div>

            <div style={{ flex: 1, backgroundColor: '#0a1a33', padding: 20, overflowY: 'auto', borderLeft: '1px solid #1e293b' }}>
                <h2 style={{ color: '#3b82f6' }}>Monitoramento Realtime</h2>
                {entregas.map(e => (
                    <div key={e.id} style={{ background: '#112240', padding: 12, borderRadius: 8, marginBottom: 8 }}>
                        <p style={{ margin: 0, fontSize: 14 }}><strong>{e.cliente}</strong></p>
                        <span style={{ fontSize: 11, color: '#10b981' }}>● Entregue</span>
                    </div>
                ))}
            </div>
        </div>
    );
}