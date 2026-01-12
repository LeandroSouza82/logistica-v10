import React, { useEffect, useState, useRef } from 'react';
import { GoogleMap, Marker, useJsApiLoader } from '@react-google-maps/api';
import AdvancedMarker from './components/AdvancedMarker';
import CentralDespacho from './CentralDespacho';
import { supabase } from './supabase';
import NovaCarga from './components/NovaCarga';

// Mantém o array de libraries estático para evitar re-criações (evita warning de performance)
const GOOGLE_MAP_LIBRARIES = ['places', 'geometry'];

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
        libraries: GOOGLE_MAP_LIBRARIES
    });

    const [motoristas, setMotoristas] = useState([]);
    const [entregas, setEntregas] = useState([]);
    // Estado inicial da posição da moto para evitar iniciar o mapa no mar
    const [motoPosition, setMotoPosition] = useState({ lat: -27.6608, lng: -48.7087 });
    // Ref para o objeto do Google Map (usado para panTo quando a posição muda)
    const mapRef = useRef(null);

    // Container e estado para resizer (splitter)
    const containerRef = useRef(null);
    const [leftWidth, setLeftWidth] = useState(null); // em pixels
    const draggingRef = useRef(false);

    // Inicializa largura esquerda com base no container
    useEffect(() => {
        const init = () => {
            const c = containerRef.current;
            if (c) {
                const w = c.clientWidth;
                setLeftWidth(Math.round(w * 0.68));
            }
        };
        init();
        window.addEventListener('resize', init);
        return () => window.removeEventListener('resize', init);
    }, []);

    const startDrag = (e) => {
        e.preventDefault();
        draggingRef.current = true;
        document.body.classList.add('dragging-splitter');
        document.body.style.cursor = 'col-resize';

        const startX = e.clientX || (e.touches && e.touches[0] && e.touches[0].clientX);
        const startWidth = containerRef.current ? containerRef.current.querySelector('.map-wrapper').getBoundingClientRect().width : 0;

        const onMove = (moveEvent) => {
            const clientX = moveEvent.clientX || (moveEvent.touches && moveEvent.touches[0] && moveEvent.touches[0].clientX);
            const delta = clientX - startX;
            const container = containerRef.current;
            if (!container) return;
            const min = 280;
            const max = container.clientWidth - 280;
            let newWidth = startWidth + delta;
            newWidth = Math.max(min, Math.min(max, newWidth));
            setLeftWidth(newWidth);
        };

        const stop = () => {
            draggingRef.current = false;
            document.body.classList.remove('dragging-splitter');
            document.body.style.cursor = '';
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('touchmove', onMove);
            window.removeEventListener('mouseup', stop);
            window.removeEventListener('touchend', stop);
        };

        window.addEventListener('mousemove', onMove);
        window.addEventListener('touchmove', onMove, { passive: false });
        window.addEventListener('mouseup', stop);
        window.addEventListener('touchend', stop);
    };

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

    const getServiceClass = (type) => {
        if (!type) return 'svc-default';
        const t = String(type).toLowerCase();
        if (t.includes('recol')) return 'svc-recolha';
        if (t.includes('outro') || t.includes('ata') || t.includes('atas')) return 'svc-outros';
        return 'svc-entrega';
    };

    const getDotClass = (type) => {
        if (!type) return 'entrega';
        const t = String(type).toLowerCase();
        if (t.includes('recol')) return 'recolha';
        if (t.includes('outro') || t.includes('ata') || t.includes('atas')) return 'outros';
        return 'entrega';
    };

    if (loadError) return <div style={{ color: '#f88', padding: 20 }}>Erro no Google Maps.</div>;

    return (
        <main className="content-grid" ref={containerRef}>
            <div className="map-wrapper" style={{ flexBasis: leftWidth ? `${leftWidth}px` : undefined }}>
                {/* Menu superior - visual apenas (não altera lógicas existentes) */}
                <nav className="top-nav" role="navigation" aria-label="Menu principal">
                    <button
                        className={`nav-button ${abaAtiva === 'visao-geral' ? 'active' : 'inactive'}`}
                        onClick={() => setAbaAtiva('visao-geral')}
                        aria-pressed={abaAtiva === 'visao-geral'}
                    >
                        VISÃO GERAL
                    </button>

                    <button
                        className={`nav-button ${abaAtiva === 'nova-carga' ? 'active' : 'inactive'}`}
                        onClick={() => setAbaAtiva('nova-carga')}
                        aria-pressed={abaAtiva === 'nova-carga'}
                    >
                        NOVA CARGA
                    </button>

                    <button
                        className={`nav-button ${abaAtiva === 'central-despacho' ? 'active' : 'inactive'}`}
                        onClick={() => setAbaAtiva('central-despacho')}
                        aria-pressed={abaAtiva === 'central-despacho'}
                    >
                        CENTRAL DE DESPACHO
                    </button>

                    <button
                        className={`nav-button ${abaAtiva === 'equipe' ? 'active' : 'inactive'}`}
                        onClick={() => setAbaAtiva('equipe')}
                        aria-pressed={abaAtiva === 'equipe'}
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
                    <NovaCarga />
                ) : abaAtiva === 'central-despacho' ? (
                    <CentralDespacho />
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

                                const advancedAvailable = (typeof window !== 'undefined' && window.google && window.google.maps && window.google.maps.marker && window.google.maps.marker.AdvancedMarkerElement);

                                // Usa AdvancedMarkerElement quando disponível (recomendado pelo Google), caso contrário mantém Marker como fallback
                                if (advancedAvailable) {
                                    return (
                                        <AdvancedMarker
                                            key={m.id}
                                            position={{ lat: Number(m.lat), lng: Number(m.lng) }}
                                            icon={pulsingMotoSvg(m.id === 1 ? '#3b82f6' : '#10b981')}
                                            title={m.nome || `MOTO ${m.id}`}
                                        />
                                    );
                                }

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

            <div
                className="splitter"
                onMouseDown={startDrag}
                onTouchStart={startDrag}
                role="separator"
                aria-orientation="vertical"
                aria-label="Redimensionar painel"
                tabIndex={0}
                onKeyDown={(ev) => {
                    if (ev.key === 'ArrowLeft') setLeftWidth(w => Math.max(280, (w || 600) - 20));
                    if (ev.key === 'ArrowRight') setLeftWidth(w => Math.min((containerRef.current?.clientWidth || 1000) - 280, (w || 600) + 20));
                }}
            />

            <aside className="status-panel" style={{ flexBasis: leftWidth ? `calc(100% - ${leftWidth}px - 8px)` : undefined }}>
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
                        <div className="status-header">
                            <h2 className="text-slate-200" style={{ marginTop: 0 }}>Status da Operação</h2>
                            <p className="text-slate-400 text-sm mb-2">Rotas recentes</p>
                        </div>

                        {entregas.length === 0 ? (
                            <div className="rotas-list custom-scrollbar">
                                <p style={{ color: 'var(--muted)' }}>Nenhuma rota despachada no momento.</p>
                            </div>
                        ) : (
                            <div className="rotas-list custom-scrollbar">
                                {entregas.map(e => (
                                    <div key={e.id} className={`rota-card ${getServiceClass(e.tipo)}`}>
                                        <div className="rota-info">
                                            <p className="rota-cliente"><strong>{e.cliente}</strong></p>
                                            <p className="rota-endereco">{e.endereco || ''}</p>
                                        </div>
                                        <div className="rota-status">
                                            <span className={`status-dot delivered ${getDotClass(e.tipo)}`} aria-hidden="true"></span>
                                            <span className="status-label">Entregue</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </aside>
        </main>
    );
}