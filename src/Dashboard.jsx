import React, { useEffect, useState, useRef } from 'react';
import { GoogleMap, Marker, useJsApiLoader } from '@react-google-maps/api';
// AdvancedMarker is used elsewhere; we use Marker here for Visão Geral map markers
import CentralDespacho from './CentralDespacho';
import { supabase } from './supabase';
import NovaCarga from './components/NovaCarga';
import ClientesHistorico from './components/ClientesHistorico';

// Mantém o array de libraries estático para evitar re-criações (evita warning de performance)
const GOOGLE_MAP_LIBRARIES = ['places', 'geometry'];

const containerStyle = {
    width: '100%',
    height: '100vh',
    display: 'flex',
    flexDirection: 'row',
    backgroundColor: '#052146',
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
    // Estado para marcador ativo do motorista (garante render imediato do Marker)
    const [activeMarker, setActiveMarker] = useState(null);
    // Histórico de clientes modal + prefill
    const [historicoOpen, setHistoricoOpen] = useState(false);
    const [prefill, setPrefill] = useState(null);

    // Estado para modal de mapa ao clicar em motorista
    const [selectedDriver, setSelectedDriver] = useState(null);
    const openDriverOnMap = (m) => {
        if (!m) return;
        setSelectedDriver(m);
        // foco no mapa e troca de aba
        setAbaAtiva('visao-geral');

        // Se já temos coordenadas, posiciona imediatamente e garante que o Marker seja renderizado
        if (m.lat != null && m.lng != null) {
            const lat = Number(m.lat);
            const lng = Number(m.lng);
            setMotoPosition({ lat, lng });
            const newMarker = { id: m.id, lat, lng, nome: m.nome };
            setActiveMarker(newMarker);
            console.log('SET_ACTIVE_MARKER immediate', newMarker);
            try {
                mapRef.current?.panTo({ lat, lng });
                mapRef.current?.setZoom(15);
            } catch (e) { /* ignore */ }
            return;
        }

        // Caso não tenhamos coordenadas no objeto, buscar a localização mais recente do motorista
        (async () => {
            try {
                const { data } = await supabase.from('localizacoes').select('lat,lng,created_at').eq('motorista_id', m.id).order('created_at', { ascending: false }).limit(1);
                if (data && data.length > 0) {
                    const l = data[0];
                    if (l.lat != null && l.lng != null) {
                        const lat = Number(l.lat);
                        const lng = Number(l.lng);
                        setActiveMarker({ id: m.id, lat, lng, nome: m.nome });
                        setMotoPosition({ lat, lng });
                        try {
                            mapRef.current?.panTo({ lat, lng });
                            mapRef.current?.setZoom(15);
                        } catch (e) { /* ignore */ }
                    }
                }
            } catch (err) {
                console.warn('Erro ao buscar posição do motorista selecionado:', err);
            }
        })();
    };
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
        // agora usa .motoristas-wrapper em vez de .map-wrapper
        const startWidth = containerRef.current ? containerRef.current.querySelector('.motoristas-wrapper').getBoundingClientRect().width : 0;

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

    // Seleção do cliente a partir do histórico -> preenche o formulário e abre Nova Carga
    const handleSelectCliente = (it) => {
        if (!it) return;
        setPrefill({ cliente: it.cliente, endereco: it.endereco });
        setHistoricoOpen(false);
        // garante que a aba será alterada (Nova Carga) e que o componente receba o prefill
        setTimeout(() => setAbaAtiva('nova-carga'), 80);
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
            // Buscar motoristas e entregas
            const { data: mData, error: mErr } = await supabase.from('motoristas').select('*');
            if (mErr) {
                console.warn('Erro ao buscar motoristas inicial:', mErr);
            }
            let enriched = [];
            if (mData) {
                // Define isOnline com base em ultimo_sinal (nos últimos 5 minutos)
                const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
                enriched = mData.map(m => ({ ...normalizeMotorista(m), isOnline: m.ultimo_sinal ? (new Date(m.ultimo_sinal) > fiveMinAgo) : false }));
                console.log('Motoristas iniciais:', enriched);
                setMotoristas(enriched);
            }

            // Buscar localizacoes recentes e mesclar posições mais recentes por motorista (garante estado inicial atualizado)
            try {
                const { data: locData } = await supabase.from('localizacoes').select('*').order('created_at', { ascending: false }).limit(1000);
                if (locData && locData.length > 0) {
                    const latestByMotorista = {};
                    for (const l of locData) {
                        const id = String(l.motorista_id);
                        if (!latestByMotorista[id]) latestByMotorista[id] = l;
                    }
                    // aplica lat/lng mais recentes aos motoristas conhecidos
                    setMotoristas(prev => prev.map(m => {
                        const l = latestByMotorista[String(m.id)];
                        if (l && l.lat != null && l.lng != null) return { ...m, lat: Number(l.lat), lng: Number(l.lng), ultimo_sinal: l.created_at || m.ultimo_sinal };
                        return m;
                    }));
                }
            } catch (err) {
                console.warn('Erro ao buscar localizacoes iniciais:', err);
            }

            const { data: eData } = await supabase.from('entregas').select('*').order('id', { ascending: false }).limit(20);
            if (eData) setEntregas(eData);
        };
        buscarDados();

        // Helper to handle specific schema cache error and try a recovery (reload client)
        const handleSchemaCacheError = (err) => {
            const msg = String(err?.message || err || '').toLowerCase();
            if (msg.includes("could not find the 'status' column") || msg.includes("could not find the status column") || msg.includes('status column')) {
                console.warn('Schema cache error detected. Forçando reload para recarregar definições de tabela. Erro:', err);
                // tentamos refetch curto antes de reload — se falhar, recarregamos a página
                setTimeout(() => {
                    try { window.location.reload(); } catch (e) { /* fallback silencioso */ }
                }, 800);
                return true;
            }
            return false;
        };

        // Inscreve-se em mudanças de motoristas e localizacoes para atualizar a UI em tempo real
        const canal = supabase
            .channel('realtime-motoristas')
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'motoristas' }, (payload) => {
                try {
                    const updated = normalizeMotorista(payload.new);
                    console.log('Realtime UPDATE motorista:', updated);

                    setMotoristas(prev => {
                        const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
                        const updatedWithOnline = { ...updated, isOnline: updated.ultimo_sinal ? (new Date(updated.ultimo_sinal) > fiveMinAgo) : false };
                        const found = prev.find(m => String(m.id) === String(updatedWithOnline.id));
                        if (found) return prev.map(m => String(m.id) === String(updatedWithOnline.id) ? { ...m, ...updatedWithOnline } : m);
                        // se não existe no array, adiciona no topo
                        return [updatedWithOnline, ...prev];
                    });

                    // Se o motorista atualizado é o selecionado ou estamos na Visão Geral, atualiza posição do mapa
                    try {
                        if ((selectedDriver && String(selectedDriver.id) === String(updated.id)) || abaAtiva === 'visao-geral') {
                            if (updated.lat != null && updated.lng != null && !(updated.lat === 0 && updated.lng === 0)) {
                                setMotoPosition({ lat: Number(updated.lat), lng: Number(updated.lng) });
                                try { mapRef.current?.panTo({ lat: Number(updated.lat), lng: Number(updated.lng) }); } catch (e) { /* ignore */ }
                            }
                        }
                    } catch (e) { /* ignore */ }

                } catch (err) {
                    if (!handleSchemaCacheError(err)) console.warn('Erro ao processar UPDATE em motoristas:', err);
                }
            })
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'localizacoes' }, (payload) => {
                try {
                    const loc = payload.new;
                    console.log('Realtime INSERT localizacao:', loc);

                    // Atualiza posição do motorista correspondente em memória sem refetch pesado
                    setMotoristas(prev => prev.map(m => (String(m.id) === String(loc.motorista_id) ? { ...m, lat: loc.lat, lng: loc.lng, ultimo_sinal: loc.created_at || loc.ultimo_sinal || new Date().toISOString() } : m)));

                    // Se a localização pertence ao selecionado, centraliza o mapa
                    if (selectedDriver && String(selectedDriver.id) === String(loc.motorista_id)) {
                        const lat = Number(loc.lat);
                        const lng = Number(loc.lng);
                        setMotoPosition({ lat, lng });
                        try { mapRef.current?.panTo({ lat, lng }); } catch (e) { /* ignore */ }
                    }
                } catch (err) {
                    if (!handleSchemaCacheError(err)) console.warn('Erro ao processar INSERT em localizacoes:', err);
                }
            })
            .subscribe();

        return () => {
            try { supabase.removeChannel(canal); } catch (e) { /* ignore */ }
        };
    }, []);

    // Escolhe primeiro motorista com coordenadas válidas (não 0,0) para centralizar o mapa
    const firstMotoristaComCoords = motoristas.find(m => m.lat != null && m.lng != null && !(m.lat === 0 && m.lng === 0));

    // Ao mudar selectedDriver ou motoPosition enquanto estamos na Visão Geral, força o mapa a panTo (garante re-render visual imediato)
    useEffect(() => {
        if (abaAtiva !== 'visao-geral') return;
        if (!mapRef.current) return;
        try {
            if (selectedDriver && selectedDriver.lat != null && selectedDriver.lng != null) {
                mapRef.current.panTo({ lat: Number(selectedDriver.lat), lng: Number(selectedDriver.lng) });
                mapRef.current.setZoom(15);
            } else if (motoPosition && motoPosition.lat != null && motoPosition.lng != null) {
                mapRef.current.panTo({ lat: Number(motoPosition.lat), lng: Number(motoPosition.lng) });
            }
        } catch (e) {
            console.warn('Erro ao forçar panTo no mapa:', e);
        }
    }, [selectedDriver, motoPosition, abaAtiva]);

    // Quando o selectedDriver muda (id/coords), centraliza o mapa e garante que o Marker ativo seja atualizado
    useEffect(() => {
        if (!mapRef.current) return;
        if (selectedDriver && selectedDriver.lat != null && selectedDriver.lng != null) {
            const lat = Number(selectedDriver.lat);
            const lng = Number(selectedDriver.lng);
            setActiveMarker(prev => {
                if (!prev || prev.id !== selectedDriver.id || prev.lat !== lat || prev.lng !== lng) return { id: selectedDriver.id, lat, lng, nome: selectedDriver.nome };
                return prev;
            });
            try {
                mapRef.current.panTo({ lat, lng });
                mapRef.current.setZoom(15);
            } catch (e) { /* ignore */ }
        }
    }, [selectedDriver?.id, selectedDriver?.lat, selectedDriver?.lng]);

    // Sincroniza posição do activeMarker quando o array de motoristas é atualizado em realtime
    useEffect(() => {
        if (!activeMarker) return;
        const m = motoristas.find(x => String(x.id) === String(activeMarker.id));
        if (m && m.lat != null && m.lng != null && (Number(m.lat) !== activeMarker.lat || Number(m.lng) !== activeMarker.lng)) {
            const updated = { ...activeMarker, lat: Number(m.lat), lng: Number(m.lng) };
            setActiveMarker(updated);
            console.log('UPDATED_ACTIVE_MARKER from motoristas', updated);
        }
    }, [motoristas]);

    // Reatividade adicional: quando o motorista selecionado mudar (em qualquer aba), centraliza o mapa e garante render do marcador
    useEffect(() => {
        if (!mapRef.current) return;
        if (selectedDriver && selectedDriver.lat != null && selectedDriver.lng != null) {
            try {
                // panTo + setZoom garante que o mapa centralize e o marcador apareça
                mapRef.current.panTo({ lat: Number(selectedDriver.lat), lng: Number(selectedDriver.lng) });
                mapRef.current.setZoom(15);
            } catch (e) {
                console.warn('Erro ao centralizar mapa no selectedDriver:', e);
            }
        }
    }, [selectedDriver?.id, selectedDriver?.lat, selectedDriver?.lng]);

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
            <div className="motoristas-wrapper" style={{ flexBasis: leftWidth ? `${leftWidth}px` : undefined }}>
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
                        <p className="value">{motoristas.filter(m => m.isOnline).length}</p>
                    </div>

                    <div className="summary-card indigo">
                        <h3>Rota Ativa</h3>
                        <p className="value">Aguardando</p>
                    </div>
                </div>

                {abaAtiva === 'nova-carga' ? (
                    <NovaCarga setAbaAtiva={setAbaAtiva} prefill={prefill} />
                ) : abaAtiva === 'central-despacho' ? (
                    <CentralDespacho />
                ) : abaAtiva === 'visao-geral' ? (
                    isLoaded ? (
                        <div className="visao-geral-map-card">
                            <div className="visao-geral-map">
                                <GoogleMap
                                    key={selectedDriver?.id || 'mapa-vazio'}
                                    mapContainerStyle={{ width: '100%', height: '420px' }}
                                    center={motoPosition || (firstMotoristaComCoords ? { lat: Number(firstMotoristaComCoords.lat), lng: Number(firstMotoristaComCoords.lng) } : centroPadrao)}
                                    zoom={13}
                                    onLoad={(mapInstance) => {
                                        mapRef.current = mapInstance; if (selectedDriver && selectedDriver.lat && selectedDriver.lng) {
                                            try { mapInstance.panTo({ lat: Number(selectedDriver.lat), lng: Number(selectedDriver.lng) }); } catch (e) { }
                                        }
                                    }}
                                    onUnmount={() => (mapRef.current = null)}
                                >
                                    {/* debug: exposes activeMarker state for e2e checks */}
                                    <div id="active-marker-debug" style={{ display: 'none' }}>{activeMarker ? `${activeMarker.id}|${activeMarker.lat}|${activeMarker.lng}` : ''}</div>
                                    {motoristas.filter(m => m.lat != null && m.lng != null).map(m => {
                                        const online = !!m.isOnline;
                                        const iconColor = online ? '#10b981' : '#3b82f6';
                                        return (
                                            <Marker
                                                key={m.id}
                                                position={{ lat: Number(m.lat), lng: Number(m.lng) }}
                                                icon={{ url: pulsingMotoSvg(iconColor), scaledSize: new window.google.maps.Size(80, 80), anchor: new window.google.maps.Point(40, 40) }}
                                                label={{ text: m.nome || `MOTO ${m.id}`, color: 'white', fontWeight: 'bold', fontSize: '14px' }}
                                            />
                                        );
                                    })}

                                    {/* Marker temporário para o motorista selecionado (garante que a motinha apareça sem precisar de F5) */}
                                    {activeMarker && activeMarker.lat != null && activeMarker.lng != null && (
                                        <Marker
                                            key={`active-marker-${activeMarker.id}-${activeMarker.lat}-${activeMarker.lng}`}
                                            position={{ lat: Number(activeMarker.lat), lng: Number(activeMarker.lng) }}
                                            optimized={false}
                                            icon={{ url: pulsingMotoSvg('#3b82f6'), scaledSize: new window.google.maps.Size(80, 80), anchor: new window.google.maps.Point(40, 40) }}
                                            label={{ text: activeMarker.nome || 'MOTO', color: 'white', fontWeight: 'bold', fontSize: '14px' }}
                                        />
                                    )}
                                </GoogleMap>
                            </div>
                        </div>
                    ) : (
                        <div style={{ color: '#ccc', padding: 20 }}>Iniciando Radar...</div>
                    )
                ) : abaAtiva === 'equipe' ? (
                    <div className="motoristas-wrapper">
                        <div className="motoristas-list">
                            {motoristas && motoristas.length > 0 ? (
                                motoristas.slice().sort((a, b) => (b.isOnline ? 1 : 0) - (a.isOnline ? 1 : 0)).map(m => (
                                    <div key={m.id} className={`motorista-card ${m.isOnline ? 'online' : 'offline'}`} onClick={() => { if (m.lat && m.lng) { setMotoPosition({ lat: Number(m.lat), lng: Number(m.lng) }); setSelectedDriver(m); setAbaAtiva('visao-geral'); try { mapRef.current?.panTo({ lat: Number(m.lat), lng: Number(m.lng) }); } catch (e) { } } else { setSelectedDriver(m); setAbaAtiva('visao-geral'); } }} role="button" tabIndex={0}>
                                        <div className="motorista-row">
                                            <div className="motorista-avatar">{(m.nome || '').split(' ').map(s => s[0]).slice(0, 2).join('')}</div>
                                            <div className="motorista-info">
                                                <div className="motorista-nome">{m.nome || `Motorista ${m.id}`}</div>
                                                <div className="motorista-meta">{m.email || 'sem-email'} • {m.telefone || m.phone || 'sem-telefone'}</div>
                                            </div>
                                            <div className="motorista-status">
                                                <span className="dot" aria-hidden="true" />
                                                <div className="status-label">{m.isOnline ? 'online' : 'offline'}</div>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="text-muted">Nenhum motorista cadastrado.</div>
                            )}
                        </div>
                    </div>
                ) : (
                    <div style={{ color: '#ccc', padding: 20 }}>Aba inválida</div>
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

                            <p className="text-slate-400">Lista de motoristas e gerenciamento. Clique em um motorista na aba à esquerda para ver sua localização no mapa.</p>

                        </div>
                    </div>
                ) : (
                    <>
                        <div className="status-header">
                            <div className="status-header-left">
                                <h2 className="text-slate-200" style={{ marginTop: 0 }}>Status da Operação</h2>
                                <p className="text-slate-400 text-sm mb-2">Rotas recentes</p>
                            </div>

                            <div className="status-header-actions">
                                <button className="btn-secondary" onClick={() => {
                                    // foco rápido no painel (se estiver visível)
                                    const node = document.querySelector('.status-panel');
                                    if (node) node.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                }}>
                                    Status de Operação
                                </button>

                                <button className="btn-primary" onClick={() => setHistoricoOpen(true)}>
                                    Histórico de Clientes/Entregas
                                </button>
                            </div>
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
                                            <p className="rota-cliente">{e.cliente}</p>
                                            <p className="rota-endereco">{e.endereco || ''}</p>

                                            {e.observacoes && (
                                                <p className="rota-observacoes"><strong>Obs:</strong> <em>{e.observacoes}</em></p>
                                            )}
                                        </div>

                                        <div className="rota-status">
                                            <span className={`status-dot delivered ${getDotClass(e.tipo)}`} aria-hidden="true"></span>
                                            {/* Badge com contorno e texto conforme tipo */}
                                            <span className={`status-badge ${getDotClass(e.tipo) === 'entrega' ? 'badge-entrega' : (getDotClass(e.tipo) === 'recolha' ? 'badge-recolha' : 'badge-outros')}`}>
                                                {getDotClass(e.tipo) === 'entrega' ? 'ENTREGA' : (getDotClass(e.tipo) === 'recolha' ? 'RECOLHA' : 'OUTROS')}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </aside>

            <ClientesHistorico open={historicoOpen} onClose={() => setHistoricoOpen(false)} onSelect={(it) => handleSelectCliente(it)} />
        </main>
    );
}