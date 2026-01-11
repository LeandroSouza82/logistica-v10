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

export default function PainelGestor({ abaAtiva, setAbaAtiva }) {
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

    // Handler simples de logout (tentativa de signOut e reload)
    const handleLogout = async () => {
        try {
            if (supabase?.auth?.signOut) {
                await supabase.auth.signOut();
            }
        } catch (e) {
            console.warn('Erro ao deslogar:', e?.message || e);
        } finally {
            // Reload para limpar o estado local; quando tivermos fluxo de login, redirecionaremos corretamente
            try { window.location.reload(); } catch (e) { /* ignore */ }
        }
    };
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

                {/* Botão de logout no topo direito */}
                <button className="logout-button" onClick={handleLogout} aria-label="Sair da sessão">Sair</button>

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

                {abaAtiva === 'nova-carga' ? (
                    <div className="p-6 max-w-4xl mx-auto">
                        <div className="bg-white rounded-3xl p-8 shadow-2xl">
                            <h2 className="text-2xl font-black text-slate-800 mb-6 uppercase">Cadastrar Nova Entrega</h2>

                            <div className="grid grid-cols-2 gap-6">
                                <div className="flex flex-col gap-2">
                                    <label className="text-xs font-bold text-slate-500 uppercase">Cliente / Destinatário</label>
                                    <input type="text" className="border-2 border-slate-100 p-3 rounded-xl focus:border-blue-500 outline-none" placeholder="Ex: Padaria do João" />
                                </div>

                                <div className="flex flex-col gap-2">
                                    <label className="text-xs font-bold text-slate-500 uppercase">Valor do Frete (R$)</label>
                                    <input type="number" className="border-2 border-slate-100 p-3 rounded-xl focus:border-blue-500 outline-none" placeholder="0,00" />
                                </div>

                                <div className="col-span-2 flex flex-col gap-2">
                                    <label className="text-xs font-bold text-slate-500 uppercase">Endereço de Entrega</label>
                                    <input type="text" className="border-2 border-slate-100 p-3 rounded-xl focus:border-blue-500 outline-none" placeholder="Rua, Número, Bairro - Palhoça" />
                                </div>

                                <button className="col-span-2 bg-blue-600 text-white font-black py-4 rounded-2xl hover:bg-blue-700 transition shadow-lg shadow-blue-200 uppercase mt-4">
                                    Confirmar e Enviar para Motorista
                                </button>
                            </div>
                        </div>
                    </div>
                ) : (
                    isLoaded ? (
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
                    )
                )}
            </div>

            <aside className="status-panel">
                {abaAtiva === 'equipe' ? (
                    <div className="p-6">
                        <div className="bg-[#1a2b4d] rounded-3xl p-6 shadow-xl">
                            <div className="flex justify-between items-center mb-6">
                                <h2 className="text-2xl font-bold text-white">Equipe de Motoristas</h2>
                                <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-bold transition">
                                    + NOVO MOTORISTA
                                </button>
                            </div>

                            <table className="w-full text-left text-white">
                                <thead>
                                    <tr className="border-b border-slate-700 text-slate-400 uppercase text-xs">
                                        <th className="py-4">Motorista</th>
                                        <th>Status</th>
                                        <th>Última Posição</th>
                                        <th>Ações</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr className="border-b border-slate-800 hover:bg-slate-800/50">
                                        <td className="py-4 flex items-center gap-3">
                                            <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center">LM</div>
                                            Leandro Motoka
                                        </td>
                                        <td>
                                            <span className="bg-emerald-500/20 text-emerald-500 px-3 py-1 rounded-full text-xs font-bold">
                                                ● ONLINE
                                            </span>
                                        </td>
                                        <td className="text-slate-400 text-sm">Palhoça, SC - há 2 min</td>
                                        <td>
                                            <button className="text-blue-400 hover:underline">Ver no Mapa</button>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                ) : (
                    <>
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
                    </>
                )}
            </aside>
        </main>
    );
}