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
        setAbaAtiva('visao-geral');

        // Pegamos a posição direto do objeto motorista (tabela motoristas)
        if (m.lat != null && m.lng != null) {
            const lat = Number(m.lat);
            const lng = Number(m.lng);
            setMotoPosition({ lat, lng });
            setActiveMarker({ id: m.id, lat, lng, nome: m.nome });

            // Move o mapa na hora
            mapRef.current?.panTo({ lat, lng });
            mapRef.current?.setZoom(15);
        }
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
    // Normalizador: usa apenas colunas `lat` e `lng` e converte para Number
    const normalizeMotorista = (m) => {
        if (!m) return m;
        return {
            ...m,
            lat: m.lat != null ? Number(m.lat) : undefined,
            lng: m.lng != null ? Number(m.lng) : undefined,
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
                // Define isOnline com base no campo `status` (somente 'online' exibe a moto)
                enriched = mData.map(m => ({ ...normalizeMotorista(m), isOnline: String(m.status || '').toLowerCase() === 'online' }));
                setMotoristas(enriched);
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
            .channel('schema-db-changes')
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'motoristas' }, (payload) => {
                try {
                    const oldRaw = payload.old || {};
                    const newRaw = payload.new || {};
                    // Log do payload para monitoramento
                    console.log('Realtime UPDATE motorista payload:', payload);

                    // converte lat/lng para números de forma segura
                    const latOld = oldRaw.lat != null ? Number(oldRaw.lat) : null;
                    const lngOld = oldRaw.lng != null ? Number(oldRaw.lng) : null;
                    const latNew = newRaw.lat != null ? Number(newRaw.lat) : null;
                    const lngNew = newRaw.lng != null ? Number(newRaw.lng) : null;
                    const statusOld = String(oldRaw.status || '').toLowerCase();
                    const statusNew = String(newRaw.status || '').toLowerCase();
                    const ultimoOld = oldRaw.ultimo_sinal;
                    const ultimoNew = newRaw.ultimo_sinal;

                    const coordsChanged = (latOld !== latNew) || (lngOld !== lngNew) || (ultimoOld !== ultimoNew);
                    const statusChanged = statusOld !== statusNew;

                    // Atualiza lista de motoristas com o payload novo e garante lat/lng numéricos
                    setMotoristas(prev => prev.map(m =>
                        String(m.id) === String(payload.new.id)
                            ? { ...m, ...payload.new, lat: latNew, lng: lngNew, isOnline: statusNew === 'online' }
                            : m
                    ));

                    const isOnlineNow = statusNew === 'online';

                    // Se as coordenadas mudaram e o motorista está online, atualiza posição imediatamente
                    if (coordsChanged) {
                        const lat = latNew;
                        const lng = lngNew;
                        if (lat != null && lng != null && isOnlineNow && !isNaN(lat) && !isNaN(lng)) {
                            const numeric = { lat: Number(lat), lng: Number(lng) };
                            setMotoPosition(numeric);

                            if (selectedDriver && String(selectedDriver.id) === String(payload.new.id)) {
                                setActiveMarker({ id: payload.new.id, lat: Number(lat), lng: Number(lng), nome: payload.new.nome });
                            } else if (activeMarker && String(activeMarker.id) === String(payload.new.id)) {
                                setActiveMarker(prev => prev ? { ...prev, lat: Number(lat), lng: Number(lng) } : prev);
                            }

                            try { mapRef.current?.panTo({ lat: Number(lat), lng: Number(lng) }); } catch (e) { /* ignore */ }
                        } else {
                            // se removeu coords ou ficou offline, limpa marker ativo
                            if (!isOnlineNow && activeMarker && String(activeMarker.id) === String(payload.new.id)) {
                                setActiveMarker(null);
                            }
                        }
                    } else if (statusChanged) {
                        // Se só o status mudou, e ficou offline, limpa o marker
                        if (!isOnlineNow && activeMarker && String(activeMarker.id) === String(payload.new.id)) {
                            setActiveMarker(null);
                        }
                    }

                } catch (err) {
                    if (!handleSchemaCacheError(err)) console.warn('Erro ao processar UPDATE em motoristas:', err);
                }
            })
            .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'motoristas' }, (payload) => {
                try {
                    const old = payload.old;
                    console.log('Realtime DELETE motorista:', old);
                    const id = String(old.id);
                    setMotoristas(prev => prev.filter(m => String(m.id) !== id));
                    if (activeMarker && String(activeMarker.id) === id) setActiveMarker(null);
                } catch (err) {
                    console.warn('Erro ao processar DELETE em motoristas:', err);
                }
            })
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'motoristas' }, (payload) => {
                try {
                    const novo = payload.new;
                    console.log('Realtime INSERT motorista:', novo);
                    const m = normalizeMotorista(novo);
                    // adiciona ao estado
                    setMotoristas(prev => [{ ...m, isOnline: String(novo.status || '').toLowerCase() === 'online' }, ...prev]);

                    // se já tiver coords e estiver online, atualiza a posição imediatamente
                    const lat = novo.lat != null ? Number(novo.lat) : null;
                    const lng = novo.lng != null ? Number(novo.lng) : null;
                    const isOnlineNow = String(novo.status || '').toLowerCase() === 'online';
                    if (lat != null && lng != null && isOnlineNow) {
                        setMotoPosition({ lat, lng });
                        if (selectedDriver && String(selectedDriver.id) === String(novo.id)) {
                            setActiveMarker({ id: novo.id, lat, lng, nome: novo.nome });
                        }
                        try { mapRef.current?.panTo({ lat, lng }); } catch (e) { /* ignore */ }
                    }
                } catch (err) {
                    if (!handleSchemaCacheError(err)) console.warn('Erro ao processar INSERT em motoristas:', err);
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

    // Helper: considera online/logado como 'ativo' (apenas esses terão markers visíveis)
    const isDriverActive = (m) => {
        if (!m) return false;
        return String(m.status || '').toLowerCase() === 'online';
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
                        <p className="value">{motoristas.filter(m => String(m.status || '').toLowerCase() === 'online').length}</p>
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
                                    // A key baseada no ID e na Lat (numérica) faz o React redesenhar a moto sem F5
                                    key={`${selectedDriver?.id}-${Number(selectedDriver?.lat)}`}
                                    mapContainerStyle={{ width: '100%', height: '420px' }}
                                    // Centraliza no motorista selecionado ou na posição da moto
                                    center={selectedDriver?.lat ? { lat: Number(selectedDriver.lat), lng: Number(selectedDriver.lng) } : motoPosition}
                                    zoom={selectedDriver ? 15 : 13}
                                    onLoad={(mapInstance) => {
                                        mapRef.current = mapInstance;
                                    }}
                                    onUnmount={() => (mapRef.current = null)}
                                >
                                    {motoristas.filter(m => m.lat != null && m.lng != null && !isNaN(Number(m.lat)) && !isNaN(Number(m.lng))).map(m => {
                                        // interpreta status de forma robusta (ex.: 'Online', 'online', 'ONLINE')
                                        const isOnline = String(m.status || '').toLowerCase() === 'online';
                                        const iconColor = isOnline ? '#10b981' : '#3b82f6';
                                        // Escolhe ícone (fallback para ícone do Google se window.google não estiver pronto)
                                        const svgIcon = pulsingMotoSvg(iconColor);
                                        const icon = (typeof window !== 'undefined' && window.google && window.google.maps) ? { url: svgIcon, scaledSize: new window.google.maps.Size(80, 80), anchor: new window.google.maps.Point(40, 40) } : { url: 'http://maps.google.com/mapfiles/ms/icons/motorcycle.png', scaledSize: undefined };
                                        return (
                                            <Marker
                                                key={m.id}
                                                position={{ lat: Number(m.lat), lng: Number(m.lng) }}
                                                icon={icon}
                                                label={{ text: m.nome || `MOTO ${m.id}`, color: 'white', fontWeight: 'bold', fontSize: '14px' }}
                                            />
                                        );
                                    })}

                                    {/* Marker temporário para o motorista selecionado (garante que a motinha apareça sem precisar de F5) */}
                                    {activeMarker && activeMarker.lat != null && activeMarker.lng != null && !isNaN(Number(activeMarker.lat)) && !isNaN(Number(activeMarker.lng)) && (
                                        <Marker
                                            key={`active-marker-${activeMarker.id}-${Number(activeMarker.lat)}-${Number(activeMarker.lng)}`}
                                            position={{ lat: Number(activeMarker.lat), lng: Number(activeMarker.lng) }}
                                            optimized={false}
                                            icon={{ url: pulsingMotoSvg('#3b82f6'), scaledSize: new window.google.maps.Size(80, 80), anchor: new window.google.maps.Point(40, 40) }}
                                            label={{ text: activeMarker.nome || 'MOTO', color: 'white', fontWeight: 'bold', fontSize: '14px' }}
                                        />
                                    )}

                                    {/* Fallback: se não existir activeMarker, mostra a motoPosition atual (numérica e válida) */}
                                    {!activeMarker && motoPosition && motoPosition.lat != null && motoPosition.lng != null && !isNaN(Number(motoPosition.lat)) && !isNaN(Number(motoPosition.lng)) && (
                                        <Marker
                                            key={`moto-pos-${Number(motoPosition.lat)}-${Number(motoPosition.lng)}`}
                                            position={{ lat: Number(motoPosition.lat), lng: Number(motoPosition.lng) }}
                                            optimized={false}
                                            icon={{ url: pulsingMotoSvg('#3b82f6'), scaledSize: new window.google.maps.Size(80, 80), anchor: new window.google.maps.Point(40, 40) }}
                                            label={{ text: 'POS', color: 'white', fontWeight: 'bold', fontSize: '12px' }}
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
                                motoristas.slice().sort((a, b) => (String(b.status || '').toLowerCase() === 'online' ? 1 : 0) - (String(a.status || '').toLowerCase() === 'online' ? 1 : 0)).map(m => {
                                    const isOnline = String(m.status || '').toLowerCase() === 'online';
                                    const initials = (m.nome || '').split(' ').map(s => s[0]).slice(0, 2).join('');
                                    return (
                                        <div key={m.id} className={`motorista-card ${isOnline ? 'online' : 'offline'}`} onClick={() => openDriverOnMap(m)} role="button" tabIndex={0}>
                                            <div className="motorista-row">
                                                <div className="motorista-avatar">
                                                    {initials}
                                                    {isOnline && <span className="dot" aria-hidden="true" style={{ marginLeft: 8 }}></span>}
                                                </div>
                                                <div className="motorista-info">
                                                    <div className="motorista-nome">{m.nome || `Motorista ${m.id}`}</div>
                                                    <div className="motorista-status">
                                                        <div className="motorista-meta">{m.email || 'sem-email'} • {m.telefone || m.phone || 'sem-telefone'}</div>
                                                        <div className="motorista-status-text">{isOnline ? '🟢 Online' : '⚪ Offline'}</div>
                                                    </div>
                                                </div>

                                            </div>
                                        </div>
                                    );
                                })
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