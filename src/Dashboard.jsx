import React, { useEffect, useState, useRef } from 'react';
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

const centroPadrao = { lat: -27.6608, lng: -48.7087 };

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
    // Estado inicial da posição da moto para evitar iniciar o mapa no mar
    const [motoPosition, setMotoPosition] = useState({ lat: -27.6608, lng: -48.7087 });
    // Ref para o objeto do Google Map (usado para panTo quando a posição muda)
    const mapRef = useRef(null);

    // Normalizador: converte latitude/longitude ou lat/lng para lat/lng numéricos
    const normalizeMotorista = (m) => {
        if (!m) return m;
        const latSrc = m.latitude ?? m.lat;
        const lngSrc = m.longitude ?? m.lng;
        return {
            ...m,
            lat: latSrc != null ? Number(latSrc) : (m.lat != null ? Number(m.lat) : undefined),
            lng: lngSrc != null ? Number(lngSrc) : (m.lng != null ? Number(m.lng) : undefined),
        };
    };

    useEffect(() => {
        const buscarDados = async () => {
            const { data: mData } = await supabase.from('motoristas').select('*');
            if (mData) setMotoristas(mData.map(normalizeMotorista));

            const { data: eData } = await supabase.from('entregas').select('*').order('id', { ascending: false }).limit(20);
            if (eData) setEntregas(eData);
        };
        buscarDados();

        const canal = supabase
            .channel('schema-db-changes')
            .on('postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'motoristas' },
                (payload) => {
                    try {
                        const updated = normalizeMotorista(payload.new);
                        console.log('Mudança recebida!', payload.new, '=> normalizado =>', updated);

                        // Ignora coordenadas 0,0 (frequentemente indicam erro GPS) para evitar centrar mapa no mar
                        if (updated && typeof updated.lat === 'number' && typeof updated.lng === 'number') {
                            if (updated.lat === 0 && updated.lng === 0) {
                                console.warn('Coordenadas inválidas (0,0) recebidas — ignorando update:', payload.new);
                                return;
                            }
                        } else {
                            console.warn('Motorista sem coordenadas numéricas — ignorando update:', payload.new);
                            return;
                        }

                        // Atualiza lista local de motoristas
                        setMotoristas(prev => prev.map(m => m.id === updated.id ? { ...m, ...updated } : m));

                        // Atualiza estado de posição da moto para que o mapa possa centralizar
                        setMotoPosition({ lat: updated.lat, lng: updated.lng });

                        // Faz o mapa "perseguir" a motinha (se o mapRef estiver pronto)
                        try {
                            mapRef.current?.panTo({ lat: updated.lat, lng: updated.lng });
                        } catch (e) { /* ignore */ }
                    } catch (e) {
                        console.warn('Erro ao normalizar motorista recebido:', e?.message || e);
                    }
                }
            )
            .subscribe();

        return () => supabase.removeChannel(canal);
    }, []);

    // Escolhe primeiro motorista com coordenadas válidas (não 0,0) para centralizar o mapa
    const firstMotoristaComCoords = motoristas.find(m => m.lat != null && m.lng != null && !(m.lat === 0 && m.lng === 0));

    if (loadError) return <div style={{ color: '#f88', padding: 20 }}>Erro no Google Maps.</div>;

    return (
        <main className="content-grid">
            <div className="map-wrapper">
                {/* Menu superior - visual apenas (não altera lógicas existentes) */}
                <nav className="top-nav" role="navigation" aria-label="Menu principal">
                    <button
                        className={`nav-button ${abaAtiva === 'visao-geral' ? 'active' : 'inactive'}`}
                        onClick={() => setAbaAtiva('visao-geral')}
                    >
                        VISÃO GERAL
                    </button>

                    <button
                        className={`nav-button ${abaAtiva === 'nova-carga' ? 'active' : 'inactive'}`}
                        onClick={() => setAbaAtiva('nova-carga')}
                    >
                        NOVA CARGA
                    </button>

                    <button
                        className={`nav-button ${abaAtiva === 'central-despacho' ? 'active' : 'inactive'}`}
                        onClick={() => setAbaAtiva('central-despacho')}
                    >
                        CENTRAL DE DESPACHO
                    </button>

                    <button
                        className={`nav-button ${abaAtiva === 'equipe' ? 'active' : 'inactive'}`}
                        onClick={() => setAbaAtiva('equipe')}
                    >
                        EQUIPE
                    </button>
                </nav>

                {/* Cards de Resumo (Topo) */}
                <div className="summary-grid" aria-hidden={false}>
                    <div className="summary-card blue">
                        <h3>Pedidos Pendentes</h3>
                        <p className="value">0</p>
                    </div>

                    <div className="summary-card status">
                        <h3>Motoristas Online</h3>
                        <p className="value">1</p>
                    </div>

                    <div className="summary-card indigo">
                        <h3>Rota Ativa</h3>
                        <p className="value">Aguardando</p>
                    </div>
                </div>

                {isLoaded ? (
                    <GoogleMap
                        mapContainerStyle={{ width: '100%', height: '500px' }}
                        // Se existir posição da moto (estado), centraliza nela; senão, tenta o primeiro motorista com coords; se nada, usa centroPadrao.
                        center={motoPosition || (firstMotoristaComCoords ? { lat: Number(firstMotoristaComCoords.lat), lng: Number(firstMotoristaComCoords.lng) } : centroPadrao)}
                        zoom={15}
                        onLoad={(mapInstance) => (mapRef.current = mapInstance)}
                        onUnmount={() => (mapRef.current = null)}
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

            <aside className="status-panel">
                <h2 style={{ color: '#fff', marginTop: 0 }}>Status da Operação</h2>
                {entregas.length === 0 ? (
                    <p style={{ color: '#94a3b8' }}>Nenhuma rota despachada no momento.</p>
                ) : (
                    <>
                        <p style={{ color: '#94a3b8' }}>Rotas recentes:</p>
                        {entregas.map(e => (
                            <div key={e.id} style={{ background: '#112240', padding: 12, borderRadius: 8, marginBottom: 8 }}>
                                <p style={{ margin: 0, fontSize: 14 }}><strong>{e.cliente}</strong></p>
                                <span style={{ fontSize: 11, color: '#10b981' }}>● Entregue</span>
                            </div>
                        ))}
                    </>
                )}
            </aside>
        </main>
    );
}