import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';

// CommandBar: stateless memoized top command bar to avoid re-renders
const CommandBar = React.memo(function CommandBar({ onRefresh, onCenter, onLogout }) {
    return (
        <View style={styles.commandBar} pointerEvents="box-none">
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <TouchableOpacity style={styles.cmdBtnLeft} onPress={onRefresh} accessibilityLabel="Atualizar">
                    <Text style={styles.cmdBtnText}>⟳</Text>
                </TouchableOpacity>

                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <TouchableOpacity style={[styles.cmdBtn, { marginRight: 8 }]} onPress={onCenter} accessibilityLabel="Centralizar">
                        <Text style={styles.cmdBtnText}>🎯</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.cmdBtn} onPress={onLogout} accessibilityLabel="Sair">
                        <Text style={styles.cmdBtnText}>Sair</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </View>
    );
});
import {
    StyleSheet, Text, View, TouchableOpacity, Pressable, Animated, Modal, Image, ActivityIndicator, Vibration,
    Dimensions, Linking, FlatList, TextInput, Alert, StatusBar, Platform, UIManager, LayoutAnimation, PanResponder, Easing, ActionSheetIOS
} from 'react-native';

// Dynamic imports for optional native modules
import * as ImagePicker from 'expo-image-picker';
let FileSystem; try { FileSystem = require('expo-file-system'); } catch (e) { FileSystem = null; console.warn('expo-file-system não disponível.'); }

// Número do gestor/patrão - removed hardcoded default (use Supabase)
const BOSS_PHONE = null;
import MapView, { Marker } from 'react-native-maps';

import * as Location from 'expo-location'; // Biblioteca para o GPS
import Constants from 'expo-constants';

import * as ScreenOrientation from 'expo-screen-orientation';

let AsyncStorage;
try { AsyncStorage = eval('require')('@react-native-async-storage/async-storage').default; } catch (e) { AsyncStorage = null; console.warn('AsyncStorage não disponível; persitência local desabilitada.'); }
import { supabase } from '../supabaseClient';

// Removed optional blur support to improve stability on mobile (use plain translucent background instead)

// Bottom sheet (manual implementation using PanResponder & Animated)
// removed dependency on @gorhom/bottom-sheet and react-native-reanimated

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Permite usar LayoutAnimation no Android (experimental)
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Altura da status bar para ajustar modals translúcidos no Android
const STATUSBAR_HEIGHT = Platform.OS === 'android' ? (StatusBar.currentHeight || 0) : 0;
function DeliveryApp(props) {

    // Número padrão do motorista (use seu número real em produção ou carregue via config)
    const MOTORISTA_PHONE = '+5511999999999';
    // Telefone do gestor para receber ocorrências (pode ser passado via props). Avoid hardcoded fallbacks; fetch from Supabase when needed.
    const GESTOR_PHONE = props?.gestorPhone || null;

    // Busca dinâmica do número do gestor diretamente do Supabase (retorna apenas dígitos, com prefixo 55)
    const fetchGestorPhone = async () => {
        try {
            // Query configuracoes.chave = 'gestor_phone'
            const { data, error } = await supabase.from('configuracoes').select('valor').eq('chave', 'gestor_phone').limit(1);
            if (error) {
                console.warn('fetchGestorPhone: erro ao buscar no supabase:', error);
                return null;
            }
            const valor = data && data[0] && data[0].valor ? String(data[0].valor) : null;
            if (!valor) return undefined;
            const digits = valor.replace(/\D/g, '');
            if (!digits) return undefined;
            return digits.startsWith('55') ? digits : `55${digits}`;
        } catch (e) {
            console.warn('fetchGestorPhone: exception:', e);
            return undefined;
        }
    };

    const [entregas, setEntregas] = useState([]);

    // Debug wrapper to trace where setEntregas is called (temporary for debugging render loop)
    const debugSetEntregas = setEntregas;

    // Contadores dinâmicos do resumo (entregas / recolhas / outros) conforme solicitado
    const totalEntregas = entregas.filter(p => p.tipo?.toLowerCase().includes('entrega')).length;
    const totalRecolhas = entregas.filter(p => p.tipo?.toLowerCase().includes('recolha')).length;
    const totalOutros = entregas.filter(p => !p.tipo?.toLowerCase().includes('entrega') && !p.tipo?.toLowerCase().includes('recolha')).length;



    // Alias fetchEntregas for clarity and call on mount (single source: Supabase)
    const fetchEntregas = async () => {
        try {
            await carregarEntregas();
        } catch (e) {
            console.warn('Falha ao carregar entregas:', e);
        }
    };

    // Auto-fetch on mount DISABLED for isolation / debugging of render loop
    // useEffect(() => {
    //     fetchEntregas();
    // }, []);


    // Persiste a ordem/estado sempre que 'entregas' mudar
    useEffect(() => {
        (async () => {
            if (!AsyncStorage) return; // sem persistência se não instalado
            try {
                await AsyncStorage.setItem('@rota_pedidos', JSON.stringify(entregas));
            } catch (e) { console.warn('Erro ao salvar entregas no AsyncStorage:', e); }
        })();
    }, [entregas]);

    const mapRef = useRef(null); // Referência para controlar a câmera do mapa

    const [modalAssinatura, setModalAssinatura] = useState(false);
    const [modalOcorrencia, setModalOcorrencia] = useState(false);
    const [pedidoSelecionado, setPedidoSelecionado] = useState(null);
    const [textoOcorrencia, setTextoOcorrencia] = useState('');
    const [outroSelected, setOutroSelected] = useState(false);
    const inputOcorrenciaRef = useRef(null);
    const [modalProcessing, setModalProcessing] = useState(false);
    // Loading geral (usado para indicar fetch inicial)
    const [loading, setLoading] = useState(true);
    // flag para não repetir o alerta 'Lista Vazia'
    const fetchedOnceRef = useRef(false);
    // previne fetchs concorrentes que causam loop e piscadas na UI
    const fetchInProgressRef = useRef(false);

    // Noutras antigas relacionadas à assinatura removidas: signatureRef, viewShotRef, signatureContainerRef, assinaturaResetKey

    // Novo campo: nome do recebedor e histórico
    const [recebedor, setRecebedor] = useState('');
    // Local state para o input do modal (evita efeitos colaterais ao digitar)
    const [recebedorLocal, setRecebedorLocal] = useState('');
    const [ultimosRecebedores, setUltimosRecebedores] = useState([]);
    const recebedorInputRef = useRef(null);

    // Não Entregue flow: flag e motivo local (isolado para evitar re-renders)
    const [isNaoEntregue, setIsNaoEntregue] = useState(false);
    const [motivoLocal, setMotivoLocal] = useState('');
    const motivoInputRef = useRef(null);
    // Flag para mostrar o input ao escolher 'Outro'
    const [mostrarInputOutro, setMostrarInputOutro] = useState(false);

    // Motivos rápidos para Não Entregue (botões)
    const motivosRapidos = useMemo(() => [
        'Destinatário Ausente',
        'Endereço não Localizado',
        'Recusado pelo Cliente',
        'Local Fechado/Sem Acesso',
        'Outro (Digitar Motivo)'
    ], []);
    // Last selected pedido cache to recover if state is lost
    const lastSelectedRef = useRef(null);

    // Logging control: set to true for categories you want verbose logs (default off to avoid flooding)
    const LOG_LEVEL = { signature: false, realtime: false, buttons: false };
    const debugLog = () => { };

    // keep a ref in sync with pedidoSelecionado
    useEffect(() => {
        if (pedidoSelecionado) lastSelectedRef.current = pedidoSelecionado;
    }, [pedidoSelecionado]);
    // Indica upload em andamento no modal de ocorrência
    const [ocorrenciaUploading, setOcorrenciaUploading] = useState(false);
    // Ref para prevenir concorrência rápida (controle sincrono)
    const uploadingRef = useRef(false);
    // Motivo enfileirado para enviar quando upload terminar (ocorrência)
    const [queuedOcorrenciaMotivo, setQueuedOcorrenciaMotivo] = useState(null);

    // Quando o modal de confirmação (antes era assinatura) abrir, carregamos histórico de recebedores
    useEffect(() => {
        if (!modalAssinatura) return;
        (async () => {
            try {
                if (!AsyncStorage) return;
                let raw = null;
                try { raw = await AsyncStorage.getItem('ultimos_recebedores'); } catch (e) { console.warn('AsyncStorage.getItem falhou ao ler ultimos_recebedores:', e); raw = null; }
                if (raw) {
                    try { const parsed = JSON.parse(raw); setUltimosRecebedores(Array.isArray(parsed) ? parsed : []); } catch (e) { setUltimosRecebedores([]); }
                } else {
                    setUltimosRecebedores([]);
                }
                // If we have a last selected pedido, prefill recebedor to empty
                if (lastSelectedRef.current && !pedidoSelecionado) {
                    const recovered = (entregas || []).find(p => p.id === lastSelectedRef.current.id);
                    if (recovered) setPedidoSelecionado(recovered);
                }

                // Clear local inputs when modal opens (avoid side effects while typing)
                try { setRecebedorLocal(''); } catch (e) { /* ignore */ }
                try { setMotivoLocal(''); } catch (e) { /* ignore */ }

                // Focus the appropriate input when modal opens (helpful in Android/iOS)
                try {
                    if (isNaoEntregue) {
                        motivoInputRef.current && motivoInputRef.current.focus && motivoInputRef.current.focus();
                    } else {
                        recebedorInputRef.current && recebedorInputRef.current.focus && recebedorInputRef.current.focus();
                    }
                } catch (e) { /* ignore */ }
            } catch (e) { console.warn('Erro ao carregar ultimos_recebedores:', e); }
        })();
    }, [modalAssinatura, isNaoEntregue]);
    // Pequeno contador para forçar refresh do modal (re-mount parcial) e dar foco no Android
    const [modalRefreshKey, setModalRefreshKey] = useState(0);
    // Estado que indica processamento final (enviar ocorrência / abrir WhatsApp)
    const [ocorrenciaProcessing, setOcorrenciaProcessing] = useState(false);
    // Estado que guarda link do WhatsApp pendente para abrir a partir da tela principal
    const [linkWhatsAppPendente, setLinkWhatsAppPendente] = useState(null);

    // LISTENER REALTIME: temporariamente DESABILITADO — atualiza a posição quando o Supabase enviar updates (desligado para debug)
    useEffect(() => {
        return; /* realtime disabled for debug */
        (async () => {
            try {
                await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT);
            } catch (e) {
                console.warn('Falha ao travar orientação:', e);
            }
        })();
        const channel = supabase
            .channel('schema-db-changes')
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE', // Quando o GPS do celular mudar
                    schema: 'public',
                    table: 'motoristas',
                },
                (payload) => {
                    try {
                        const motoristaId = props?.motoristaId ?? 1;
                        if (Number(payload.new?.id) !== Number(motoristaId)) return; // Ignore updates for outros motoristas

                        console.log('Posição nova chegando do celular!', payload.new);
                        const latSrc = payload.new?.latitude ?? payload.new?.lat;
                        const lngSrc = payload.new?.longitude ?? payload.new?.lng;
                        const lat = Number(latSrc);
                        const lng = Number(lngSrc);
                        // Ignora posições inválidas ou (0,0)
                        if (!isNaN(lat) && !isNaN(lng) && !(lat === 0 && lng === 0)) {
                            const newPos = { latitude: lat, longitude: lng };
                            if (payload.new.heading != null) {
                                const h = Number(payload.new.heading);
                                if (!isNaN(h)) {
                                    newPos.heading = h;
                                    setHeading(h);
                                }
                            }
                            setPosicaoMotorista(newPos);

                            // centraliza a câmera no motorista quando chegar o novo sinal
                            try {
                                mapRef.current?.animateToRegion({
                                    latitude: lat,
                                    longitude: lng,
                                    latitudeDelta: 0.01,
                                    longitudeDelta: 0.01,
                                }, 500);
                            } catch (e) { /* silent */ }
                        } else {
                            console.warn('Supabase enviou dados de posição inválidos ou (0,0):', payload.new);
                        }
                    } catch (e) {
                        console.warn('Erro no listener realtime:', e?.message || e);
                    }
                }
            )
            // Realtime para entregas referentes a este motorista — evita receber todo o tráfego do DB
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'entregas',
                },
                (payload) => {
                    try {
                        const motoristaId = props?.motoristaId ?? 1;
                        const novo = payload.new || {};
                        if (Number(novo.motorista_id) !== Number(motoristaId)) return;
                        console.log('Realtime INSERT entrega para este motorista:', novo);
                        const normalized = normalizePedido(novo);
                        // evita duplicata
                        debugSetEntregas(prev => {
                            if (prev && prev.some(p => Number(p.id) === Number(normalized.id))) return prev;
                            return [normalized, ...prev];
                        });
                    } catch (e) {
                        console.warn('Erro ao processar INSERT em entregas (mobile):', e?.message || e);
                    }
                }
            )
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'entregas',
                },
                (payload) => {
                    try {
                        const motoristaId = props?.motoristaId ?? 1;
                        const novo = payload.new || {};
                        if (Number(novo.motorista_id) !== Number(motoristaId)) return;
                        console.log('Realtime UPDATE entrega para este motorista:', novo);
                        const normalized = normalizePedido(novo);
                        debugSetEntregas(prev => prev.map(p => (Number(p.id) === Number(normalized.id) ? { ...p, ...normalized } : p)));
                    } catch (e) {
                        console.warn('Erro ao processar UPDATE em entregas (mobile):', e?.message || e);
                    }
                }
            )
            .on(
                'postgres_changes',
                {
                    event: 'DELETE',
                    schema: 'public',
                    table: 'entregas',
                },
                (payload) => {
                    try {
                        const old = payload.old || {};
                        const motoristaId = props?.motoristaId ?? 1;
                        if (Number(old.motorista_id) !== Number(motoristaId)) return;
                        debugSetEntregas(prev => prev.filter(p => Number(p.id) !== Number(old.id)));
                    } catch (e) {
                        console.warn('Erro ao processar DELETE em entregas (mobile):', e?.message || e);
                    }
                }
            )
            // log da inscrição
            .subscribe(() => { /* subscribed to realtime events */ });

        return () => {
            try { supabase.removeChannel(channel); } catch (e) { /* ignore */ }
        };
    }, []);


    // Realtime: novos pedidos (INSERT) — atualiza lista em tempo real e notifica usuário
    useEffect(() => {
        let channel = null;
        (async () => {
            try {
                channel = supabase
                    .channel('realtime-pedidos')
                    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pedidos' }, (payload) => {
                        try {
                            const novoPedido = payload.new;
                            if (!novoPedido || !novoPedido.id) return;
                            const normalized = (typeof normalizePedido === 'function') ? normalizePedido(novoPedido) : novoPedido;
                            setEntregas(prev => {
                                if (prev && prev.some(p => Number(p.id) === Number(normalized.id))) return prev;
                                return [normalized, ...prev];
                            });
                            try { Alert.alert('Novo pedido recebido!', 'Um novo pedido acabou de chegar.'); } catch (e) { /* ignore */ }
                        } catch (e) { console.warn('Realtime (pedidos) handler error:', e); }
                    })
                    .subscribe();
            } catch (e) { console.warn('Erro ao iniciar canal realtime (pedidos):', e); }
        })();

        return () => {
            try { if (channel) supabase.removeChannel(channel); } catch (e) { /* ignore */ }
        };
    }, []);

    // Realtime: novos pedidos (INSERT) — atualiza lista em tempo real e notifica usuário
    useEffect(() => {
        let channel = null;
        (async () => {
            try {
                channel = supabase
                    .channel('realtime-pedidos')
                    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pedidos' }, (payload) => {
                        try {
                            const novoPedido = payload.new;
                            if (!novoPedido || !novoPedido.id) return;
                            const normalized = (typeof normalizePedido === 'function') ? normalizePedido(novoPedido) : novoPedido;
                            setEntregas(prev => {
                                if (prev && prev.some(p => Number(p.id) === Number(normalized.id))) return prev;
                                return [normalized, ...prev];
                            });
                            try { Alert.alert('Novo pedido recebido!', 'Um novo pedido acabou de chegar.'); } catch (e) { /* ignore */ }
                        } catch (e) { console.warn('Realtime (pedidos) handler error:', e); }
                    })
                    .subscribe();
            } catch (e) { console.warn('Erro ao iniciar canal realtime (pedidos):', e); }
        })();

        return () => {
            try { if (channel) supabase.removeChannel(channel); } catch (e) { /* ignore */ }
        };
    }, []);

    const carregarEntregas = useCallback(async () => {
        // throttle concurrent fetches to avoid loops/alternância de tela
        if (fetchInProgressRef.current) {
            return;
        }
        fetchInProgressRef.current = true;
        setLoading(true);

        try {
            const motoristaId = props?.motoristaId ?? 1;
            const hoje = new Date();
            hoje.setUTCHours(0, 0, 0, 0);
            const dataHoje = hoje.toISOString();
            // QUERY PARA TESTE: comentamos filtros temporariamente para verificar dados
            // Obs: .eq('motorista_id', motoristaId) foi comentado para buscar todas as rotas
            // Obs: .eq('status', 'pendente') foi comentado para testar se há qualquer linha na tabela
            // const { data: initial, error: initialErr } = await supabase.from('entregas').select('*').eq('status', 'pendente').order('id', { ascending: false }).limit(1000);
            const { data: initial, error: initialErr } = await supabase.from('entregas').select('*').order('id', { ascending: false }).limit(1000);

            if (initialErr) {
                console.warn('Erro ao buscar entregas iniciais (mobile):', initialErr.message || initialErr);
            } else {
                // normalize tipo_servico and ensure strings
                let normalized = (initial || []).map(i => normalizePedido(i));
                // Filtra apenas entregas pendentes - entregas finalizadas não devem aparecer


                // Se a busca inicial retornar vazia, alertamos 'Lista Vazia' (apenas na primeira vez)
                if (!fetchedOnceRef.current && (!normalized || normalized.length === 0)) {
                    fetchedOnceRef.current = true;
                    Alert.alert('Lista Vazia');
                }

                // Se o usuário já reordenou a lista localmente, não destruímos a ordem: apenas atualizamos os itens existentes e anexamos novos
                debugSetEntregas(prev => {
                    try {
                        if (prev && prev.length > 0 && userReorderedRef.current) {

                            const fetchedById = new Map(normalized.map(f => [String(f.id), f]));
                            const merged = prev.map(p => {
                                const f = fetchedById.get(String(p.id));
                                if (f) {
                                    fetchedById.delete(String(p.id));
                                    return { ...p, ...f }; // mantém ordem local, atualiza com dados do banco
                                }
                                return p;
                            });
                            // adicionar novos itens vindos do banco que não existiam localmente
                            for (const f of fetchedById.values()) merged.push(f);
                            return merged;
                        } else {
                            return normalized;
                        }
                    } catch (e) {
                        console.warn('Erro ao mesclar entregas iniciais:', e);
                        return normalized;
                    }
                });
            }
        } catch (err) {
            console.warn('Erro ao buscar entregas iniciais (mobile):', err?.message || err);
        } finally {
            // garante que loading sempre seja liberado e desmarca fetch em andamento
            try { setLoading(false); } catch (e) { console.error('Erro ao setLoading(false) em carregarEntregas:', e); }
            try { fetchInProgressRef.current = false; } catch (e) { console.error('Erro ao liberar fetchInProgressRef:', e); }
        }



        // exporta a função para uso em realtime handlers
        // (o channel abaixo chamará carregarEntregas() em INSERT/UPDATE para garantir refresh automático)

        return () => {
            try { supabase.removeChannel(channel); } catch (e) { /* ignore */ }
        };
    }, []);

    // (UX) Mapa de Animated.Value para cada card e helper de acesso
    const scalesRef = useRef({});
    const getScale = (id) => {
        if (!scalesRef.current[id]) scalesRef.current[id] = new Animated.Value(1);
        return scalesRef.current[id];
    };



    // Stability improvements: ensure we center map on first pedido once, and center when selection changes
    const centeredOnceRef = useRef(false);
    useEffect(() => {
        if (!centeredOnceRef.current && entregas && entregas.length > 0) {
            const first = entregas[0];
            if (first?.lat && first?.lng) {
                const lat = Number(first.lat);
                const lng = Number(first.lng);
                try { mapRef.current?.animateToRegion({ latitude: lat, longitude: lng, latitudeDelta: 0.05, longitudeDelta: 0.05 }, 600); } catch (e) { /* ignore */ }
            }
            centeredOnceRef.current = true;
        }
    }, [entregas]);

    // Marca se o usuário já reordenou manualmente os pedidos — usado para preservar ordem local ao mesclar dados do servidor
    const userReorderedRef = useRef(false);

    useEffect(() => {
        if (pedidoSelecionado && pedidoSelecionado.lat && pedidoSelecionado.lng) {
            const lat = Number(pedidoSelecionado.lat);
            const lng = Number(pedidoSelecionado.lng);
            try { mapRef.current?.animateToRegion({ latitude: lat, longitude: lng, latitudeDelta: 0.01, longitudeDelta: 0.01 }, 500); } catch (e) { /* ignore */ }
        }
    }, [pedidoSelecionado]);



    // ESTADO PARA A POSIÇÃO DA MOTO (MOTORISTA) E HEADING
    const [posicaoMotorista, setPosicaoMotorista] = useState({ latitude: -23.5505, longitude: -46.6333, latitudeDelta: 0.05, longitudeDelta: 0.05 });
    const [heading, setHeading] = useState(0);


    const prevPosRef = useRef(null);
    // evita enviar atualizações ao Supabase mais de 1 vez por segundo (usado para outros fluxos)
    const lastUpdateRef = useRef(0);
    // último timestamp (ms) que atualizamos a posição no UI (debounce)
    const lastPosUpdateRef = useRef(0);
    // UseRef para armazenar a posição do motorista sem causar re-renders
    const driverLocationRef = useRef(null);
    // ref para controlar uploads ao backend (throttle de 10s)
    const lastUploadRef = useRef(0);
    // referência para a subscription do Location.watchPositionAsync
    const locationSubscriptionRef = useRef(null);
    // indicador que a localização já foi inicializada (garante apenas um watcher)
    const locationStartedRef = useRef(false);
    // refs que garantem certos setState rodem apenas 1 vez (proteção contra loops)
    const headingSetOnceRef = useRef(false);
    const posicaoSetOnceRef = useRef(false);
    // timer para limpar posição após logout
    const logoutTimerRef = useRef(null);
    // marca se componente está montado
    const mountedRef = useRef(true);

    // helper retry com backoff exponencial
    const retryWithBackoff = async (fn, attempts = 3) => {
        let attempt = 0;
        let delay = 500;
        while (attempt < attempts) {
            try {
                return await fn();
            } catch (e) {
                attempt++;
                if (attempt >= attempts) throw e;
                await new Promise(r => setTimeout(r, delay));
                delay *= 2;
            }
        }
    };

    // Envia a posição atual para o Supabase (usa motoristaId do props ou fallback 1)
    const enviarPosicao = async (coords) => {
        const motoristaId = props?.motoristaId ?? 1;
        const payload = {
            lat: coords.latitude,
            lng: coords.longitude,
            // Mantemos o campo existente no banco
            ultimo_sinal: new Date().toISOString()
        };

        const { data, error } = await supabase
            .from('motoristas')
            .update(payload)
            .eq('id', motoristaId)
            .select('*');

        if (error) {
            console.error('Erro ao enviar posição:', error.message);
        }
    };

    // Animação suave de rotação para o ícone da moto
    const rotateAnim = useRef(new Animated.Value(0)).current;
    const rotate = rotateAnim.interpolate({ inputRange: [0, 360], outputRange: ['0deg', '360deg'] });

    useEffect(() => {
        // anima suavemente a rotação quando o heading muda
        Animated.timing(rotateAnim, { toValue: heading, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    }, [heading]);



    // calcula o bearing entre duas coordenadas (em graus)
    const calculateBearing = (lat1, lon1, lat2, lon2) => {
        const toRad = d => d * Math.PI / 180;
        const toDeg = r => r * 180 / Math.PI;
        const φ1 = toRad(lat1);
        const φ2 = toRad(lat2);
        const Δλ = toRad(lon2 - lon1);
        const y = Math.sin(Δλ) * Math.cos(φ2);
        const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
        let brng = toDeg(Math.atan2(y, x));
        brng = (brng + 360) % 360;
        return brng;
    };

    const [idVoando, setIdVoando] = useState(null);

    const trocarPosicao = (id, index) => {
        // 1. Marca qual card vai passar por cima
        setIdVoando(id);
        // O usuário está reordenando manualmente — marca para preservar ordem ao mesclar fetchs
        userReorderedRef.current = true;

        // 2. Configura a animação de flutuação e escala
        LayoutAnimation.configureNext({
            duration: 700,
            update: {
                type: 'spring',
                springDamping: 0.5, // Efeito mola para ele "pousar"
            },
        });

        debugSetEntregas(prev => {
            const novaLista = [...prev];
            const [removido] = novaLista.splice(index, 1);
            novaLista.unshift(removido);

            // atualiza seleção caso o pedido selecionado seja movido
            if (pedidoSelecionado) {
                const sel = novaLista.find(a => a.id === pedidoSelecionado.id);
                setPedidoSelecionado(sel || null);
            }

            return novaLista;
        });

        // 3. Reseta o ID após a animação para ele voltar ao nível normal
        setTimeout(() => setIdVoando(null), 700);
    };

    // Abre o discador para chamar o motorista
    const callMotorista = (phone) => {
        const tel = phone || MOTORISTA_PHONE;
        Linking.openURL(`tel:${tel}`);
    };

    // Logout controlador: confirma e delega a limpeza da posição para o container (App)
    const handleLogoutPress = () => {
        Alert.alert('Sair', 'Deseja encerrar a sessão? A sua posição ficará visível por 10s e será removida em seguida.', [
            { text: 'Cancelar', style: 'cancel' },
            {
                text: 'Sair', style: 'destructive', onPress: () => {
                    try {
                        // Para de observar a localização e de enviar updates
                        try { locationSubscriptionRef.current?.remove?.(); } catch (e) { /* ignore */ }
                        locationSubscriptionRef.current = null;

                        // Notifica o container (App) para finalizar logout e agendar limpeza da posição
                        try { props?.onLogout?.(); } catch (e) { /* ignore */ }

                        // Feedback: permite remover a posição imediatamente através de um botão
                        try {
                            Alert.alert('Sair', 'Sua posição será removida em 10s.', [
                                { text: 'Cancelar', style: 'cancel' },
                                {
                                    text: 'Remover agora', onPress: async () => {
                                        try {
                                            const motoristaId = props?.motoristaId ?? 1;
                                            await supabase.from('motoristas').update({ lat: null, lng: null, ultimo_sinal: null }).eq('id', motoristaId);
                                            if (mountedRef.current) setPosicaoMotorista(null);
                                        } catch (err) {
                                            console.warn('Erro ao remover posição agora:', err?.message || err);
                                            try { const sc = require('../sentryClient'); sc && sc.captureException && sc.captureException(err); } catch (e) { /* ignore */ }
                                        }
                                    }
                                }
                            ]);
                        } catch (e) { /* ignore */ }
                    } catch (e) { console.warn('Erro ao iniciar logout:', e?.message || e); }
                }
            },
        ]);
    };

    // Confirma a entrega do pedido atualmente selecionado (sem assinatura)
    // Confirma a entrega (aceita item opcional para permitir chamada imediata)
    // Helper: timeout wrapper for network calls
    const callWithTimeout = (promise, ms = 30000) => {
        const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));
        return Promise.race([promise, timeout]);
    };


    // Reescrita segura de confirmarEntrega para evitar erros de escopo com await
    const confirmarEntrega = async (item = null) => {
        const target = item || pedidoSelecionado || lastSelectedRef.current;
        try {
            if (!target) {
                // Garante UI consistente caso não haja target
                try { setModalAssinatura(false); } catch (e) { console.error('confirmarEntrega: erro ao fechar modal (nenhum target):', e); }
                try { await carregarEntregas(); } catch (e) { console.error('confirmarEntrega: carregarEntregas erro (nenhum target):', e); }
                return;
            }

            // Valida ID
            if (target.id == null || target.id === '') {
                console.error('confirmarEntrega: ID inválido:', target.id);
                try { await carregarEntregas(); } catch (e) { console.error('confirmarEntrega: carregarEntregas (ID inválido):', e); }
                return;
            }

            // Delega para handleFinalizar que já implementa a lógica segura (inclui recebedor, AsyncStorage e WhatsApp)
            try {
                await handleFinalizar();
            } catch (e) {
                console.error('confirmarEntrega: erro ao finalizar via handleFinalizar:', e);
            }
        } catch (err) {
            console.error('confirmarEntrega: erro inesperado', err);
            try { setModalAssinatura(false); } catch (e) { /* ignore */ }
            try { await carregarEntregas(); } catch (e) { /* ignore */ }
        }
    };

    // Handler quando a assinatura foi capturada (img é dataURL)






    // Função de finalização ULTRA-SEGURA conforme instruções: atualiza o DB, remove card local, fecha modal, limpa seleção e abre WhatsApp com delay
    const handleFinalizar = async () => {

        const target = pedidoSelecionado || lastSelectedRef.current;
        // nomeRecebedorTrim: valor final a ser usado pelo DB e WhatsApp (evita ReferenceError)
        const nomeRecebedor = (typeof recebedorLocal === 'string' && String(recebedorLocal).trim() !== '') ? recebedorLocal : ((typeof recebedor === 'string' && String(recebedor).trim() !== '') ? recebedor : null);
        const nomeRecebedorTrim = nomeRecebedor ? nomeRecebedor.trim() : 'Não informado';
        const horarioAtual = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

        if (!target || !target.id) {
            console.warn('handleFinalizar: nenhum pedido selecionado');
            try { setModalAssinatura(false); } catch (e) { /* ignore */ }
            try { setPedidoSelecionado(null); } catch (e) { /* ignore */ }
            return;
        }

        try {
            // 1) Atualiza o backend e aguarda (status: 'entregue')
            try {
                const payload = { status: 'finalizado', recebedor: nomeRecebedorTrim };
                const { data, error } = await supabase.from('entregas').update(payload).eq('id', target.id).select('*');
                if (error) {
                    console.warn('handleFinalizar: erro ao atualizar supabase', error);
                } else {
                    // update ok
                }
            } catch (e) {
                console.warn('handleFinalizar: exception ao atualizar supabase', e);
            }



            // Persistência do histórico em background (não mais executada no render)
            try {
                if (nomeRecebedorTrim) {
                    (async () => {
                        try {
                            let raw = null;
                            try { raw = await AsyncStorage.getItem('ultimos_recebedores'); } catch (e) { raw = null; }
                            let list = [];
                            if (raw) { try { const parsed = JSON.parse(raw); list = Array.isArray(parsed) ? parsed : []; } catch (e) { list = []; } }
                            const cleaned = nomeRecebedorTrim;
                            list = [cleaned, ...list.filter(x => x !== cleaned)].slice(0, 20);
                            try { await AsyncStorage.setItem('ultimos_recebedores', JSON.stringify(list)); } catch (e) { /* ignore */ }
                            try { setUltimosRecebedores(list); } catch (e) { /* ignore */ }
                            try { setRecebedor(cleaned); } catch (e) { /* ignore */ }
                        } catch (e) { console.warn('Erro ao salvar ultimos_recebedores (background):', e); }
                    })();
                }
            } catch (e) { console.warn('handleFinalizar: erro salvando histórico recebedor', e); }

            // 4) Abre WhatsApp com delay (fora da thread principal) e então fecha modal/remova card
            try {
                const phoneDigits = await fetchGestorPhone();
                if (phoneDigits) {
                    const pedido = target;
                    const endereco = (pedido && pedido.endereco) ? pedido.endereco : (pedido?.endereco_text || pedido?.address || 'Endereço não disponível');
                    const mensagem = '*Entrega Realizada!* ✅\n\n*👤 Recebedor:* ' + nomeRecebedorTrim + '\n*📍 Endereço:* ' + endereco + '\n*⏰ Horário:* ' + horarioAtual;
                    const url = 'whatsapp://send?phone=' + phoneDigits + '&text=' + encodeURIComponent(mensagem);
                    const idToRemove = target.id;
                    setTimeout(() => {
                        Linking.openURL(url)
                            .catch(e => console.warn('handleFinalizar: erro ao abrir WhatsApp (delayed)', e))
                            .finally(() => {
                                try { setModalAssinatura(false); } catch (e) { /* ignore */ }
                                try { setPedidoSelecionado(null); } catch (e) { /* ignore */ }
                                try { setEntregas(prev => prev.filter(item => item.id !== idToRemove)); } catch (e) { /* ignore */ }
                            });
                    }, 1000);
                } else {
                    console.warn('handleFinalizar: número do gestor não encontrado, pulando abertura do WhatsApp');
                }
            } catch (e) { console.warn('handleFinalizar: erro preparando WhatsApp', e); }

        } catch (err) {
            console.error('handleFinalizar: erro inesperado', err);
        }
    };



    // FECHAR MODAL E LIMPAR ESTADOS ANTES DE QUALQUER REDIRECIONAMENTO

    // try { setModalAssinatura(false); } catch (e) { /* ignore */ }
    // try { setPedidoSelecionado(null); } catch (e) { /* ignore */ }
    // NOTE: Persistência do histórico de recebedores agora é feita apenas no momento de finalização (handleFinalizar)
    try { uploadingRef.current = false; } catch (e) { /* ignore */ }
    // try { setLoading(false); } catch (e) { /* ignore */ }



    const confirmarEntregaFromModal = async () => {
        debugLog('signature', 'confirmarEntregaFromModal delegando para handleFinalizar. pedidoSelecionado=', pedidoSelecionado);
        return handleFinalizar();
    };

    // Confirmar NÃO ENTREGA: atualiza DB com status 'problema', envia WhatsApp com motivo e remove card
    // Agora aceita motivoOverride para envio imediato a partir do botão rápido
    const handleConfirmNaoEntregue = async (motivoOverride = null) => {
        const target = pedidoSelecionado || lastSelectedRef.current;
        if (!target || !target.id) {
            console.warn('handleConfirmNaoEntregue: nenhum pedido selecionado');
            try { setModalAssinatura(false); } catch (e) { /* ignore */ }
            try { setPedidoSelecionado(null); } catch (e) { /* ignore */ }
            return;
        }

        const motivoTrim = (motivoOverride !== null) ? (String(motivoOverride).trim() || 'Não informado') : ((motivoLocal && String(motivoLocal).trim() !== '') ? String(motivoLocal).trim() : 'Não informado');
        const horarioAtual = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

        try {
            // Atualiza status no backend para indicar problema/cancelamento
            try {
                const payload = { status: 'cancelado', motivo_nao_entrega: motivoTrim };
                if (error) console.warn('handleConfirmNaoEntregue: erro ao atualizar supabase', error);
            } catch (e) {
                console.warn('handleConfirmNaoEntregue: exception ao atualizar supabase', e);
            }

            // Prepara e envia WhatsApp
            try {
                const phoneDigits = await fetchGestorPhone();
                if (phoneDigits) {
                    const endereco = (target && target.endereco) ? target.endereco : (target?.endereco_text || target?.address || 'Endereço não disponível');
                    // Mensagem conforme solicitado (motivo primeiro, negrito e horário)
                    const mensagem = '*Entrega NÃO Realizada!* ❌\n\n*👤 Motivo:* ' + motivoTrim + '\n*📍 Endereço:* ' + endereco + '\n*⏰ Horário:* ' + horarioAtual;
                    const url = 'whatsapp://send?phone=' + phoneDigits + '&text=' + encodeURIComponent(mensagem);
                    const idToRemove = target.id;
                    setTimeout(() => {
                        Linking.openURL(url)
                            .catch(e => console.warn('handleConfirmNaoEntregue: erro ao abrir WhatsApp (delayed)', e))
                            .finally(() => {
                                try { setModalAssinatura(false); } catch (e) { /* ignore */ }
                                try { setPedidoSelecionado(null); } catch (e) { /* ignore */ }
                                try { setEntregas(prev => prev.filter(item => item.id !== idToRemove)); } catch (e) { /* ignore */ }
                                setIsNaoEntregue(false);
                                setMotivoLocal('');
                                setMostrarInputOutro(false);
                            });
                    }, 1000);
                } else {
                    console.warn('handleConfirmNaoEntregue: número do gestor não encontrado, pulando abertura do WhatsApp');
                }
            } catch (e) { console.warn('handleConfirmNaoEntregue: erro preparando WhatsApp', e); }

        } catch (err) {
            console.error('handleConfirmNaoEntregue: erro inesperado', err);
        }
    };









    // LOGICA DE LOCALIZAÇÃO (WATCH OPCIONAL, CONTROLADO)
    // Leitura inicial única (mantida)
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                let { status } = await Location.requestForegroundPermissionsAsync();
                if (status !== 'granted') {
                    Alert.alert('Erro', 'Precisamos da permissão de localização para rastrear!');
                    return;
                }

                // Leitura única da posição (getCurrentPositionAsync)
                try {
                    const l = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
                    const coords = { latitude: l.coords.latitude, longitude: l.coords.longitude, heading: (typeof l.coords.heading === 'number' ? l.coords.heading : null) };
                    driverLocationRef.current = coords;
                    lastUpdateRef.current = Date.now();
                    // envia posição ao backend (fire-and-forget)
                    enviarPosicao(coords).catch(e => console.warn('enviarPosicao falhou (initial):', e));
                } catch (e) {
                    console.warn('Erro ao obter localização inicial:', e);
                }

            } catch (e) {
                console.warn('Erro ao inicializar localização:', e);
            }
        })();

        return () => { cancelled = true; };
    }, []);

    // WATCHER CONTROLADO: reativa o Location.watchPositionAsync quando trackingActive = true
    useEffect(() => {
        if (!trackingActive) return; // só ativa quando o usuário habilitar
        if (locationStartedRef.current) return; // evita múltiplos watchers
        locationStartedRef.current = true;

        let cancelled = false;
        (async () => {
            try {
                const subscription = await Location.watchPositionAsync(
                    {
                        accuracy: Location.Accuracy.Balanced,
                        timeInterval: 5000, // 5s
                        distanceInterval: 1,
                    },
                    (location) => {
                        try {
                            const coords = { latitude: location.coords.latitude, longitude: location.coords.longitude, heading: (typeof location.coords.heading === 'number' ? location.coords.heading : null) };

                            // Atualiza apenas a ref (sem setState) para evitar re-renders
                            driverLocationRef.current = coords;

                            // Throttle de upload: apenas a cada 10s
                            const now = Date.now();
                            if (now - lastUploadRef.current > 10000) {
                                lastUploadRef.current = now;
                                enviarPosicao(coords).catch(e => console.warn('enviarPosicao falhou (watch):', e));
                            }
                        } catch (e) {
                            console.warn('Erro no callback de localização (watch):', e);
                        }
                    }
                );

                locationSubscriptionRef.current = subscription;
            } catch (e) {
                console.warn('Erro ao iniciar watchPositionAsync:', e);
                locationStartedRef.current = false;
            }
        })();

        return () => {
            // cleanup
            try { locationSubscriptionRef.current?.remove?.(); } catch (e) { /* ignore */ }
            locationSubscriptionRef.current = null;
            locationStartedRef.current = false;
            cancelled = true;
        };
    }, [trackingActive]);

    // Estado para controle manual de rastreio (botão)
    const [trackingActive, setTrackingActive] = useState(false); // desligado por padrão enquanto isolamos o watch

    // Bottom sheet (manual) positions
    const TOP_Y = SCREEN_HEIGHT * 0.10; // 90% height visible
    const MID_Y = SCREEN_HEIGHT * 0.50; // 50% height
    const BOTTOM_Y = SCREEN_HEIGHT * 0.85; // 15% visible

    const sheetTranslateY = useRef(new Animated.Value(BOTTOM_Y)).current;
    const lastSnapY = useRef(BOTTOM_Y);
    const startY = useRef(0);
    const [isAtTop, setIsAtTop] = useState(false); // controls scroll

    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

    const sheetPanResponder = useRef(PanResponder.create({
        onMoveShouldSetPanResponder: (e, gestureState) => {
            // Allow ScrollView to handle vertical gestures when the sheet is at the TOP
            // and the touch did not start on the handle area.
            try {
                const touchedY = (e && e.nativeEvent && typeof e.nativeEvent.locationY === 'number') ? e.nativeEvent.locationY : 0;
                const isHandleArea = touchedY <= 40; // matches handleContainer height
                if (lastSnapY.current === TOP_Y && !isHandleArea) return false;
            } catch (ex) {
                // ignore and fall through to default behavior
            }
            return Math.abs(gestureState.dy) > 5; // require a small vertical move to engage
        },
        onPanResponderGrant: () => { startY.current = lastSnapY.current; },
        onPanResponderMove: (e, gesture) => {
            const newY = clamp(startY.current + gesture.dy, TOP_Y, BOTTOM_Y);
            sheetTranslateY.setValue(newY);
        },
        onPanResponderRelease: (e, gesture) => {
            let vy = gesture.vy;
            const proposedY = clamp(startY.current + gesture.dy, TOP_Y, BOTTOM_Y);
            let chosenY = proposedY;
            if (vy < -0.5) chosenY = TOP_Y;
            else if (vy > 0.5) chosenY = BOTTOM_Y;
            else {
                const distances = [
                    { y: TOP_Y, d: Math.abs(proposedY - TOP_Y) },
                    { y: MID_Y, d: Math.abs(proposedY - MID_Y) },
                    { y: BOTTOM_Y, d: Math.abs(proposedY - BOTTOM_Y) },
                ];
                distances.sort((a, b) => a.d - b.d);
                chosenY = distances[0].y;
            }
            Animated.spring(sheetTranslateY, { toValue: chosenY, useNativeDriver: true }).start(() => {
                lastSnapY.current = chosenY;
                setIsAtTop(chosenY === TOP_Y);
            });
        }
    })).current;

    const abrirOcorrenciaRapida = async (item) => {
        // Abre modal de ocorrência com opções detalhadas
        setPedidoSelecionado(item);
        setTextoOcorrencia('');
        setOutroSelected(false);
        // Delay pequeno pra garantir que o estado foi aplicado antes de focar
        setModalOcorrencia(true);
    };

    // Handler leve para abrir a finalização (abre modal de assinatura e marca pedido)
    const handleAbrirFinalizacao = (item) => {
        try {
            lastSelectedRef.current = item;
            setPedidoSelecionado(item);
            setIsNaoEntregue(false);
            setModalAssinatura(true);
            setModalRefreshKey(k => k + 1);
        } catch (e) {
            console.warn('handleAbrirFinalizacao: erro', e);
        }
    };

    // Abre modal de NÃO ENTREGA com modo apropriado
    const handleNaoEntregue = (item) => {
        try {
            lastSelectedRef.current = item;
            setPedidoSelecionado(item);
            setIsNaoEntregue(true);
            setMotivoLocal('');
            setModalAssinatura(true);
            setModalRefreshKey(k => k + 1);
            // focus will be attempted in the modal useEffect through motivoInputRef
        } catch (e) {
            console.warn('handleNaoEntregue: erro ao abrir modal de não entrega', e);
        }
    };

    // Centraliza o mapa na posição atual conhecida do motorista (usa driverLocationRef sem provocar re-render)
    const handleCentralizarMapa = () => {
        try {
            const pos = driverLocationRef.current || posicaoMotorista;
            if (!pos || pos.latitude == null || pos.longitude == null) {
                Alert.alert('Posição indisponível', 'Posição do motorista ainda não disponível.');
                return;
            }
            mapRef.current?.animateToRegion({ latitude: Number(pos.latitude), longitude: Number(pos.longitude), latitudeDelta: 0.01, longitudeDelta: 0.01 }, 600);
        } catch (e) {
            console.warn('handleCentralizarMapa erro:', e);
        }
    };

    const handleOcorrenciaChoice = async (motivo, item) => {
        // bloqueia interações e mostra spinner durante o processamento final
        if (ocorrenciaUploading || ocorrenciaProcessing) {
            Alert.alert('Aguarde', 'Operação em progresso.');
            return;
        }

        setOcorrenciaProcessing(true);
        try {
            // pega coords atuais no momento do envio
            let coords = null;
            try { const l = await Location.getCurrentPositionAsync(); coords = { latitude: l.coords.latitude, longitude: l.coords.longitude }; } catch (e) { /* ignore */ }

            // Remove o pedido localmente (optimistic) para atualizar contadores imediatamente
            try {
                if (item && item.id != null) {

                    debugSetEntregas(prev => prev.filter(p => Number(p.id) !== Number(item.id)));
                } else {
                    console.warn('Não removeu pedido localmente (ocorrencia): item indefinido', item);
                }
            } catch (e) { console.warn('Erro ao remover pedido localmente (ocorrencia):', e); }

            // Tenta atualizar o servidor com a ocorrência (inclui assinatura_url apenas se existir)
            try {
                if (item?.id) {
                    const payload = { status: 'nao_entregue', ocorrencia: motivo, lat_entrega: coords?.latitude ?? item.lat, lng_entrega: coords?.longitude ?? item.lng };
                    const photoUrl = item?.assinatura_url || pedidoSelecionado?.assinatura_url || null;
                    if (photoUrl) payload.assinatura_url = photoUrl;
                    await supabase.from('entregas').update(payload).eq('id', item.id);
                }
            } catch (err) {
                console.warn('Erro ao reportar ocorrência ao servidor:', err?.message || err);
                // não interrompe o fluxo — vamos tentar enviar o WhatsApp mesmo sem sucesso no update
            }

            // Build WA link but don't open it here — set it as pending and close modal immediately
            try {
                // Fetch gestor phone
                const phoneDigits = await fetchGestorPhone();
                if (!phoneDigits) {
                    Alert.alert('Erro', 'Número do gestor não configurado no sistema.');
                    // close modal and cleanup
                    setModalOcorrencia(false);
                } else {
                    const fotoLine = photoUrl ? `\nFoto: ${photoUrl}` : '';
                    const motorName = item?.motorista || item?.motorista_nome || (item?.motorista_id ? `Motorista ${item.motorista_id}` : (`Motorista ${props?.motoristaId ?? ''}`));
                    const text = `🚨 Motorista: ${motorName}\n👤 Cliente: ${item?.cliente}\n📍 Local: ${coords ? `https://www.google.com/maps/search/?api=1&query=${coords.latitude},${coords.longitude}` : 'Localização não disponível'}\nMotivo: ${motivo}${fotoLine}`;
                    const webUrl = `https://wa.me/${phoneDigits}?text=${encodeURIComponent(text)}`;

                    // Close modal immediately and mark link as pending; main component will open it when safe
                    setModalOcorrencia(false);
                    setLinkWhatsAppPendente({ url: webUrl, motivo, photoUrl, coords });
                }
            } catch (err) {
                console.warn('Erro ao preparar WhatsApp:', err);
                Alert.alert('Erro', 'Não foi possível preparar o envio pelo WhatsApp.');
                // still close modal to unblock UI
                setModalOcorrencia(false);
            }

            // cleanup local state (modal closed, waiting for main to open WhatsApp)
            setTextoOcorrencia('');
            setOutroSelected(false);
            setPedidoSelecionado(null);
            // cleanup: no photo persistence needed in this flow
        } catch (e) {
            console.warn('Erro ao processar ocorrência rápida:', e);
            Alert.alert('Erro', 'Falha ao processar a ocorrência.');
        } finally {
            setOcorrenciaProcessing(false);
        }
    };




    // Helper: upload an image URI to Supabase storage using Expo FileSystem for base64 conversion
    const uploadUriToStorage = async (uri, filenameBase, silent = false) => {
        try {
            if (!uri) throw new Error('URI inválida');
            // Normalize
            let normalized = uri;

            // If data URL, extract base64 directly
            let base64 = null;
            if (typeof normalized === 'string' && normalized.startsWith('data:')) {
                base64 = normalized.split(',')[1] || null;
            }

            // If it's a local file, read via FileSystem
            if (!base64 && FileSystem && (normalized.startsWith('file://') || normalized.startsWith(FileSystem.cacheDirectory) || normalized.startsWith('/'))) {
                try {
                    base64 = await FileSystem.readAsStringAsync(normalized, { encoding: 'base64' });
                } catch (e) {
                    console.warn('uploadUriToStorage: readAsStringAsync failed, will fallback to fetch:', e);
                    base64 = null;
                }
            }

            // If still no base64, try fetching the resource and converting to base64 via dataURL
            if (!base64) {
                try {
                    const fetched = await fetch(normalized);
                    const arrBuf = await fetched.arrayBuffer();
                    // Try to construct a blob and then read via FileReader (browser) or fallback to base64 via btoa
                    let b64 = null;
                    try {
                        const blob = await fetched.blob();
                        const reader = new FileReader();
                        b64 = await new Promise((resolve, reject) => {
                            reader.onerror = reject;
                            reader.onload = () => resolve(reader.result.split(',')[1]);
                            reader.readAsDataURL(blob);
                        });
                    } catch (e) {
                        // Fallback: if atob/btoa available
                        if (typeof btoa === 'function') {
                            const bytes = new Uint8Array(arrBuf);
                            let binary = '';
                            for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
                            b64 = btoa(binary);
                        }
                    }
                    base64 = b64;
                } catch (e) {
                    console.warn('uploadUriToStorage: fetch fallback failed:', e);
                    base64 = null;
                }
            }

            if (!base64) throw new Error('Não foi possível obter base64 da URI para upload');

            // Ensure base64 came from FileSystem write/read path to comply with requirement
            const tmpFile = `${FileSystem.cacheDirectory}upload_${Date.now()}.png`;
            try {
                await FileSystem.writeAsStringAsync(tmpFile, base64, { encoding: 'base64' });
                const base64FromFs = await FileSystem.readAsStringAsync(tmpFile, { encoding: 'base64' });
                const dataUrl = `data:image/png;base64,${base64FromFs}`;
                const resp = await fetch(dataUrl);
                const blob = await resp.blob();

                // Sanitize filename
                const rawName = `${filenameBase}_${Date.now()}.png`;
                const filename = rawName.replace(/[^a-zA-Z0-9._-]/g, '_');
                const contentType = blob.type || 'image/png';



                const { data, error } = await supabase.storage.from('assinaturas').upload(filename, blob, { contentType, upsert: true, cacheControl: '3600' });
                if (error) {
                    console.error('Erro no upload para storage (assinaturas):', error, 'message:', error?.message);
                    if (!silent) {
                        try { Alert.alert('Upload error', error?.message || JSON.stringify(error)); } catch (e) { /* ignore */ }
                    }
                    throw error;
                }

                try { await FileSystem.deleteAsync(tmpFile, { idempotent: true }); } catch (e) { /* ignore */ }

                return filename;
            } catch (e) {
                try { await FileSystem.deleteAsync(tmpFile, { idempotent: true }); } catch (_) { /* ignore */ }
                throw e;
            }
        } catch (err) {
            console.error('Erro uploadUriToStorage:', err);
            throw err;
        }
    };

    // Tocar alerta sonoro alto (usado quando chega nova entrega via Realtime)
    const tocarAlertaSonoro = useCallback(async () => {
        try {
            // ensure audio will play even in silent mode on iOS
            try { await Audio.setAudioModeAsync({ playsInSilentModeIOS: true, staysActiveInBackground: false, allowsRecordingIOS: false }); } catch (e) { /* ignore */ }

            const { sound } = await Audio.Sound.createAsync(
                { uri: 'https://actions.google.com/sounds/v1/alarms/bugle_tune.ogg' },
                { shouldPlay: true, volume: 1.0 }
            );
            if (sound) {
                await sound.playAsync();
                sound.setOnPlaybackStatusUpdate((status) => {
                    if (status.didJustFinish) {
                        try { sound.unloadAsync(); } catch (e) { /* ignore */ }
                    }
                });
            }
        } catch (e) {
            console.warn('Erro ao tocar alerta sonoro:', e);
        }
    }, []);






    // Effect: quando houver um link pendente, aguarda o modal fechar e abre o WhatsApp a partir da tela principal
    useEffect(() => {
        if (!linkWhatsAppPendente) return;
        let cancelled = false;
        (async () => {
            try {
                // Wait until modal is closed
                let waited = 0;
                while (modalOcorrencia && waited < 20 && !cancelled) {
                    await new Promise(r => setTimeout(r, 100));
                    waited += 1;
                }
                // Extra safety delay to let Android free resources
                await new Promise(r => setTimeout(r, 800));

                if (cancelled) return;

                // Verify WhatsApp is installed
                const canOpenWhatsApp = await Linking.canOpenURL('whatsapp://send');
                if (!canOpenWhatsApp) {
                    Alert.alert('Erro', 'WhatsApp não está instalado no dispositivo.');
                    return;
                }

                // Finally open the URL
                await Linking.openURL(linkWhatsAppPendente.url);
            } catch (err) {
                console.warn('Erro ao abrir WhatsApp (deferred):', err);
                Alert.alert('Erro', 'Não foi possível abrir o WhatsApp.');
            } finally {
                setLinkWhatsAppPendente(null);
            }
        })();
        return () => { cancelled = true; };
    }, [linkWhatsAppPendente, modalOcorrencia]);
    const abrirWhatsApp = async (motivo, item = null, coords = null, phoneOverride = null) => {
        const pedido = item || pedidoSelecionado;
        if (!pedido) {
            Alert.alert('Erro', 'Nenhum pedido selecionado para reportar.');
            return;
        }

        // Busca o número do gestor (do Supabase)
        let phoneDigits = null;
        try { phoneDigits = await fetchGestorPhone(); } catch (e) { console.warn('abrirWhatsApp: falha ao buscar número do gestor:', e); phoneDigits = null; }
        if (!phoneDigits) {
            Alert.alert('Erro', 'Número do gestor não configurado no sistema.');
            return;
        }

        const lat = coords?.latitude ?? pedido.lat ?? '';
        const lng = coords?.longitude ?? pedido.lng ?? '';
        const maps = (lat && lng) ? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}` : 'Localização não disponível';
        // Mensagem com emojis conforme pedido (inclui foto se houver)
        const fotoLine = pedido?.assinatura_url ? `\nFoto: ${pedido.assinatura_url}` : '';
        const motorName = pedido?.motorista || pedido?.motorista_nome || (pedido?.motorista_id ? `Motorista ${pedido.motorista_id}` : (`Motorista ${props?.motoristaId ?? ''}`));
        const text = `🚨 Motorista: ${motorName}\n👤 Cliente: ${pedido.cliente}\n📍 Local: ${maps}\nMotivo: ${motivo}${fotoLine}`;

        // Use https://wa.me/ format for better stability on Android
        const webUrl = `https://wa.me/${phoneDigits}?text=${encodeURIComponent(text)}`;

        try {
            // Verify WhatsApp is installed (avoid silent failures)
            const canOpenWhatsApp = await Linking.canOpenURL('whatsapp://send');
            if (!canOpenWhatsApp) {
                Alert.alert('Erro', 'WhatsApp não está instalado no dispositivo.');
                return;
            }

            // Open the wa.me link (browser/OS will redirect to WhatsApp app)
            await Linking.openURL(webUrl);
        } catch (err) {
            console.warn('Erro ao abrir WhatsApp:', err);
            Alert.alert('Erro', 'Não foi possível abrir o WhatsApp. Tente novamente.');
        }
    };

    // Abre o mapa por endereço (fallback quando não há coordenadas)
    const abrirMapa = (endereco) => {
        if (!endereco || String(endereco).trim() === '') {
            Alert.alert('Endereço indisponível', 'Este pedido não tem um endereço cadastrado.');
            return;
        }
        const encoded = encodeURIComponent(endereco);
        const url = Platform.select({
            ios: `maps:0,0?q=${encoded}`,
            android: `geo:0,0?q=${encoded}`,
        });
        Linking.openURL(url)
            .catch(() => {
                // fallback web
                Linking.openURL('https://www.google.com/maps/search/?api=1&query=' + encoded).catch(err => {
                    console.warn('abrirMapa: erro ao abrir mapa', err);
                    Alert.alert('Erro', 'Não foi possível abrir o aplicativo de mapas.');
                });
            });
    };

    const openExternalNavigation = async (item) => {
        // ensure ActionSheet/Alert options include Google / Waze
        // unchanged implementation continues...        const lat = item?.lat;
        const lng = item?.lng;
        if (!lat || !lng) {
            Alert.alert('Localização indisponível', 'Este pedido não tem coordenadas.');
            return;
        }
        const latNum = Number(lat);
        const lngNum = Number(lng);

        const wazeUrl = `waze://?ll=${latNum},${lngNum}&navigate=yes`;
        const googleAndroid = `google.navigation:q=${latNum},${lngNum}`;
        const googleIos = `comgooglemaps://?daddr=${latNum},${lngNum}`;
        const appleUrl = `http://maps.apple.com/?daddr=${latNum},${lngNum}`;
        const webUrl = `https://www.google.com/maps/dir/?api=1&destination=${latNum},${lngNum}`;



        try {
            // Build available options
            const options = [];
            const handlers = [];

            if (Platform.OS === 'ios') {
                const canGoogle = await Linking.canOpenURL(googleIos);
                if (canGoogle) { options.push('Google Maps'); handlers.push(() => Linking.openURL(googleIos)); }
                const canWaze = await Linking.canOpenURL(wazeUrl);
                if (canWaze) { options.push('Waze'); handlers.push(() => Linking.openURL(wazeUrl)); }
                // Apple Maps is always an option on iOS
                options.push('Apple Maps'); handlers.push(() => Linking.openURL(appleUrl));
            } else {
                const canGoogle = await Linking.canOpenURL(googleAndroid);
                if (canGoogle) { options.push('Google Maps'); handlers.push(() => Linking.openURL(googleAndroid)); }
                const canWaze = await Linking.canOpenURL(wazeUrl);
                if (canWaze) { options.push('Waze'); handlers.push(() => Linking.openURL(wazeUrl)); }
            }

            // Fallback web
            options.push('Abrir no navegador'); handlers.push(() => Linking.openURL(webUrl));
            options.push('Cancelar'); handlers.push(() => null);

            if (Platform.OS === 'ios') {
                ActionSheetIOS.showActionSheetWithOptions({ options, cancelButtonIndex: options.length - 1 }, (buttonIndex) => {
                    try { handlers[buttonIndex]?.(); } catch (e) { console.warn('Erro ao abrir opção escolhida:', e); }
                });
            } else {
                // Android: use Alert with buttons
                const buttons = options.map((opt, idx) => ({ text: opt, onPress: handlers[idx] }));
                Alert.alert('Escolha o app de navegação', undefined, buttons);
            }
        } catch (err) {
            console.warn('Erro ao abrir navegação externa:', err);
            Alert.alert('Erro', 'Não foi possível abrir o app de navegação.');
        }
    };

    const moverPedido = (fromIndex, toIndex) => {
        // Marca que o usuário reordenou a lista manualmente
        userReorderedRef.current = true;
        debugSetEntregas(prev => {
            const novoRoteiro = [...prev]; // cria novo array para forçar rerender
            if (toIndex < 0 || toIndex >= novoRoteiro.length) return prev;
            const [removido] = novoRoteiro.splice(fromIndex, 1);
            novoRoteiro.splice(toIndex, 0, removido);

            // atualiza seleção caso o pedido selecionado seja movido
            if (pedidoSelecionado) {
                const sel = novoRoteiro.find(a => a.id === pedidoSelecionado.id);
                setPedidoSelecionado(sel || null);
            }

            // Update summary counters (will be recalculated from entregas state)
            return novoRoteiro;
        });
    };

    // centralizar automaticamente quando o primeiro pedido mudar (ex.: reorder)
    const prevFirstRef = useRef(null);
    useEffect(() => {
        const first = entregas && entregas[0];
        const id = first?.id;
        if (!id) return;
        if (prevFirstRef.current !== id) {
            prevFirstRef.current = id;
            if (first.lat && first.lng) {
                try {
                    mapRef.current?.animateToRegion({ latitude: Number(first.lat), longitude: Number(first.lng), latitudeDelta: 0.05, longitudeDelta: 0.05 }, 500);
                } catch (e) { /* ignore */ }
            }
        }
    }, [entregas]);

    // useEffect(() => {
    //     try {

    //     } catch (e) { /* ignore */ }
    // }, [entregas]);
    // ❌ LOG DE DEBUG desabilitado para evitar logs/ações no mount

    const normalizePedido = (it) => {
        const item = { ...(it || {}) };
        // Map client name from possible DB columns
        item.cliente = item.cliente || item.nome || item.nome_cliente || item.destinatario || item.customer_name || '';

        // Map address from common DB columns
        item.endereco = item.endereco || item.endereco_entrega || item.logradouro || item.address || '';
        if (!item.endereco && item.rua) item.endereco = `${item.rua}${item.numero ? ', ' + item.numero : ''}${item.bairro ? ' - ' + item.bairro : ''}`;

        // Normalize tipo_servico: ensure string 'Entrega'|'Recolha'|'Outros'
        const t = item.tipo_servico || item.tipo || item.categoria;
        if (typeof t === 'string') {
            const tr = t.trim().toLowerCase();
            if (tr === 'entrega') item.tipo_servico = 'Entrega';
            else if (tr === 'recolha') item.tipo_servico = 'Recolha';
            else if (tr === 'outros' || tr === 'outro') item.tipo_servico = 'Outros';
            else item.tipo_servico = t; // keep as-is otherwise
        } else if (typeof t === 'number') {
            // common numeric mapping (best-effort)
            if (t === 1) item.tipo_servico = 'Entrega';
            else if (t === 2) item.tipo_servico = 'Recolha';
            else item.tipo_servico = String(t);
        } else {
            // Do not inject 'Outros' by default; prefer to keep DB value or empty to reflect authoritative data
            item.tipo_servico = item.tipo_servico || item.tipo || '';
        }
        return item;
    };

    const getCardStyle = (item) => {
        // Procura o tipo em várias colunas possíveis que você pode ter usado
        const textoTipo = (item.tipo_servico || item.tipo || item.categoria || item.descricao || '').toLowerCase();

        let corFundo = 'rgba(150, 0, 255, 0.4)'; // Lilás (Padrão)

        if (textoTipo.includes('entreg')) {
            corFundo = 'rgba(0, 122, 255, 0.6)'; // Azul (Ficou mais forte para você ver)
        } else if (textoTipo.includes('recolh') || textoTipo.includes('colet')) {
            corFundo = 'rgba(255, 149, 0, 0.6)'; // Laranja
        }

        return { backgroundColor: corFundo };
    };

    function renderPedidoItem(p, idx) {
        const item = p;
        // Diagnostic: mostra exatamente o objeto do card e o valor bruto do tipo


        // Use a coluna `tipo` explicitamente (mas normalize para evitar problemas de caixa/espaços)
        const rawTipo = String(item.tipo || '').trim();
        const tipoNormalized = rawTipo.toLowerCase();

        let label = (item.tipo_servico || item.tipo || '').trim() || '—';
        let corCard = 'rgba(200,200,200,0.4)'; // Cinza neutro quando tipo desconhecido

        if (tipoNormalized === 'entrega') {
            label = 'Entrega';
            corCard = 'rgba(0, 122, 255, 0.5)'; // Azul
        } else if (tipoNormalized === 'recolha') {
            label = 'Recolha';
            corCard = 'rgba(255, 149, 0, 0.5)'; // Laranja
        }

        const cardStyle = { backgroundColor: corCard };
        return (
            <TouchableOpacity style={[styles.cardGrande, cardStyle, (pedidoSelecionado && pedidoSelecionado.id === item.id) ? styles.cardEmDestaque : null]} key={item.id} onPress={() => {
                // Seleciona o pedido, centraliza o mapa suavemente e sobe a aba para TOP
                setPedidoSelecionado(item);
                lastSelectedRef.current = item;
                if (item.lat && item.lng) {
                    const lat = Number(item.lat);
                    const lng = Number(item.lng);
                    mapRef.current?.animateToRegion({ latitude: lat, longitude: lng, latitudeDelta: 0.01, longitudeDelta: 0.01 }, 500);
                }
                Animated.spring(sheetTranslateY, { toValue: TOP_Y, useNativeDriver: true }).start(() => {
                    lastSnapY.current = TOP_Y;
                    setIsAtTop(true);
                });
            }} activeOpacity={0.9}>

                <View style={styles.cardHeader}>
                    <View style={styles.badge}><Text style={styles.badgeTextLarge}>{idx + 1}º - {label}</Text></View>
                    <View style={{ marginLeft: 10 }}><Text style={styles.badgeId}>#{item.id}</Text></View>
                    <View style={styles.cardHeaderRight}>
                        <TouchableOpacity disabled={idx === 0} onPress={() => moverPedido(idx, idx - 1)} style={styles.arrowBtn}><Text>⬆️</Text></TouchableOpacity>
                        <TouchableOpacity disabled={idx === entregas.length - 1} onPress={() => moverPedido(idx, idx + 1)} style={styles.arrowBtn}><Text>⬇️</Text></TouchableOpacity>
                    </View>
                </View>

                <Text style={styles.cardName}>#{item.id} — {item.cliente}</Text>
                {item.observacoes ? <Text style={styles.observacoesText} numberOfLines={2}>{item.observacoes}</Text> : null}
                <TouchableOpacity onPress={() => { setPedidoSelecionado(item); lastSelectedRef.current = item; setModalAssinatura(true); setModalRefreshKey(k => k + 1); }} activeOpacity={0.7}>
                    <Text style={styles.addressText} numberOfLines={2}>{item.endereco || (item.rua ? `${item.rua}, ${item.numero || ''} ${item.bairro || ''}` : 'Endereço não disponível')}</Text>
                </TouchableOpacity>

                <View style={{ height: 12 }} />

                <View style={styles.btnRowThree}>
                    <TouchableOpacity style={[styles.btnSmall, { backgroundColor: '#002366' }]} onPress={() => { if (item?.lat && item?.lng) { openExternalNavigation(item); } else { abrirMapa(item?.endereco); } }}>
                        <Text style={[styles.btnIconText, { color: '#fff' }]}>ROTA</Text>
                    </TouchableOpacity>

                    {/* Split row: NÃO ENTREGUE (vermelho) | FINALIZAR (verde) - mesmos tamanhos, ocupando largura restante */}
                    <View style={{ flex: 1, marginLeft: 12 }}>
                        <View style={styles.btnSplitContainer}>
                            <TouchableOpacity style={[styles.btnSplit, { backgroundColor: '#ff8c00', marginRight: 8 }]} onPress={() => { handleNaoEntregue(item); }}>
                                <Text style={[styles.btnIconText, { color: '#fff' }]}>NÃO ENTREGUE</Text>
                            </TouchableOpacity>

                            <TouchableOpacity style={[styles.btnSplit, { backgroundColor: '#28a745', marginLeft: 8 }]} onPress={() => { handleAbrirFinalizacao(item); }}>
                                <Text style={[styles.btnIconText, { color: '#fff' }]}>FINALIZAR</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </TouchableOpacity>
        );
    }



    return (
        <View style={styles.container}>
            {/* Top command bar (clean professional UI) */}
            <View style={styles.commandBar} pointerEvents="box-none">
                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <TouchableOpacity style={styles.cmdBtnLeft} onPress={() => { try { carregarEntregas(); } catch (e) { console.warn('Atualizar: erro ao chamar carregarEntregas', e); } }} accessibilityLabel="Atualizar">
                        <Text style={styles.cmdBtnText}>⟳</Text>
                    </TouchableOpacity>

                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <TouchableOpacity style={[styles.cmdBtn, { marginRight: 8 }]} onPress={() => { try { handleCentralizarMapa(); } catch (e) { console.warn('Erro ao centralizar mapa:', e); } }} accessibilityLabel="Centralizar">
                            <Text style={styles.cmdBtnText}>🎯</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.cmdBtn} onPress={handleLogoutPress} accessibilityLabel="Sair">
                            <Text style={styles.cmdBtnText}>Sair</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>

            {/* Simplified UI for Phase 1 testing: no Map, no modals. */}
            <View style={{ padding: 12 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
                    <View style={{ alignItems: 'center' }}><Text>Entregas</Text><Text style={{ fontWeight: 'bold' }}>{totalEntregas}</Text></View>
                    <View style={{ alignItems: 'center' }}><Text>Recolhas</Text><Text style={{ fontWeight: 'bold' }}>{totalRecolhas}</Text></View>
                    <View style={{ alignItems: 'center' }}><Text>Outros</Text><Text style={{ fontWeight: 'bold' }}>{totalOutros}</Text></View>
                </View>
            </View>

            {/* Map restored for production use */}
            <MapView
                ref={mapRef}
                style={styles.map}
                showsUserLocation={true}
                showsMyLocationButton={false}
                initialRegion={{
                    latitude: -27.6146,
                    longitude: -48.6493,
                    latitudeDelta: 0.05,
                    longitudeDelta: 0.05
                }}
            >
                {/* Driver position marker */}
                {posicaoMotorista && posicaoMotorista.latitude != null && posicaoMotorista.longitude != null && (
                    <Marker
                        coordinate={{ latitude: Number(posicaoMotorista.latitude), longitude: Number(posicaoMotorista.longitude) }}
                        anchor={{ x: 0.5, y: 0.5 }}
                    >
                        <View style={styles.containerPulsante}>
                            <View style={[styles.pulsoVermelhoStatic]} />
                            <View style={styles.bolinhaVermelhaCentro} />
                        </View>
                    </Marker>
                )}

                {/* Entregas markers */}
                {entregas.map(p => (
                    (p.lat != null && p.lng != null) ? (
                        <Marker key={p.id} coordinate={{ latitude: Number(p.lat), longitude: Number(p.lng) }} pinColor={p.status === 'entregue' ? 'green' : 'orange'} />
                    ) : null
                ))}

                {/* Selected pedido marker */}
                {pedidoSelecionado && pedidoSelecionado.lat != null && pedidoSelecionado.lng != null ? (
                    <Marker key={'selected'} coordinate={{ latitude: Number(pedidoSelecionado.lat), longitude: Number(pedidoSelecionado.lng) }}>
                        <View style={styles.selectedMarker}><View style={styles.selectedMarkerDot} /></View>
                    </Marker>
                ) : null}

            </MapView>

            <Animated.View
                style={[styles.sheet, { transform: [{ translateY: sheetTranslateY }] }]}
                {...sheetPanResponder.panHandlers}
            >
                <View style={styles.sheetBackdrop}>
                    <View style={styles.sheetGlassFallback} />

                    <View style={styles.sheetInner}>
                        <TouchableOpacity style={styles.handleContainer} activeOpacity={0.7} onPress={() => {
                            const next = (lastSnapY.current === TOP_Y) ? MID_Y : TOP_Y;
                            Animated.spring(sheetTranslateY, { toValue: next, useNativeDriver: true }).start(() => {
                                lastSnapY.current = next;
                                setIsAtTop(next === TOP_Y);
                            });
                        }}>
                            <View style={styles.handle} />
                        </TouchableOpacity>

                        <View style={styles.sheetContentGlass}>
                            <View style={styles.resumoRow}>
                                <View style={styles.resumoBadge}><Text style={[styles.resumoIcon]}>👤</Text><Text style={styles.resumoText}>{totalEntregas}</Text></View>
                                <View style={styles.resumoBadge}><Text style={[styles.resumoIcon]}>📦</Text><Text style={styles.resumoText}>{totalRecolhas}</Text></View>
                                <View style={styles.resumoBadge}><Text style={[styles.resumoIcon]}>✨</Text><Text style={styles.resumoText}>{totalOutros}</Text></View>
                            </View>

                            <FlatList
                                data={entregas}
                                extraData={entregas}
                                renderItem={({ item, index }) => renderPedidoItem(item, index)}
                                keyExtractor={item => String(item.id)}
                                contentContainerStyle={{ paddingBottom: 160, paddingTop: 86, paddingHorizontal: 12 }}
                                scrollEnabled={isAtTop}
                                showsVerticalScrollIndicator={false}
                            />
                        </View>
                    </View>
                </View>
            </Animated.View>



            {/* MODAL ASSINATURA (CONFIRMAR ENTREGA) */}
            <Modal
                visible={modalAssinatura}
                animationType="slide"
                transparent={true}
                statusBarTranslucent={true}
                onRequestClose={() => setModalAssinatura(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalAssinaturaFull}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                            <Text style={styles.modalTitle}>{isNaoEntregue ? 'MOTIVO DA NÃO ENTREGA' : 'CONFIRMAR ENTREGA'}</Text>
                        </View>

                        {modalProcessing ? (
                            <View style={styles.modalProcessing}>
                                <Text style={styles.modalProcessingText}>Carregando...</Text>
                            </View>
                        ) : null}

                        {/* Campo de texto para o nome do recebedor (substitui assinatura) */}
                        <View style={[styles.containerAssinatura, { padding: 12 }]}>
                            {isNaoEntregue ? (
                                <>
                                    <Text style={{ fontWeight: 'bold', marginBottom: 8 }}>Motivo da Não Entrega</Text>

                                    <View style={styles.quickReasonList}>
                                        {motivosRapidos.map((m, i) => (
                                            <TouchableOpacity
                                                key={m + '_' + i}
                                                style={[styles.quickReasonBtn, m === 'Outro (Digitar Motivo)' ? { backgroundColor: '#fff', borderWidth: 1, borderColor: '#ccc' } : {}]}
                                                onPress={() => {
                                                    if (m === 'Outro (Digitar Motivo)') {
                                                        // habilita input para digitar, sem fechar o modal
                                                        setMotivoLocal('');
                                                        setMostrarInputOutro(true);
                                                        // foco rápido ao mostrar input
                                                        setTimeout(() => { try { motivoInputRef.current && motivoInputRef.current.focus && motivoInputRef.current.focus(); } catch (e) { /* ignore */ } }, 100);
                                                    } else {
                                                        // envio imediato com o motivo selecionado
                                                        handleConfirmNaoEntregue(m);
                                                    }
                                                }}
                                            >
                                                <Text style={styles.quickReasonText}>{m}</Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>

                                    {/* input habilitado apenas se escolher "Outro" */}
                                    {mostrarInputOutro ? (
                                        <View style={{ marginTop: 12 }}>
                                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                                <TouchableOpacity onPress={() => { setMostrarInputOutro(false); setMotivoLocal(''); }} style={{ padding: 6 }}>
                                                    <Text style={{ color: '#007bff' }}>← Voltar</Text>
                                                </TouchableOpacity>
                                                <Text style={{ fontSize: 12, color: '#666' }}>Digite o motivo</Text>
                                                <View style={{ width: 60 }} />
                                            </View>

                                            <TextInput
                                                ref={motivoInputRef}
                                                value={motivoLocal}
                                                onChangeText={setMotivoLocal}
                                                placeholder="Descreva o motivo da não entrega"
                                                style={{ borderWidth: 1, borderColor: '#ccc', padding: 8, borderRadius: 6, backgroundColor: '#fff' }}
                                                returnKeyType="done"
                                                autoFocus={true}
                                            />

                                            <View style={{ flexDirection: 'row', marginTop: 12, justifyContent: 'space-between' }}>
                                                <TouchableOpacity style={[styles.btnConfirmarFull, { flex: 1, backgroundColor: '#ff8c00', marginRight: 8 }]} onPress={() => { handleConfirmNaoEntregue(motivoLocal); }}>
                                                    <Text style={styles.btnTextGeral}>CONFIRMAR MOTIVO</Text>
                                                </TouchableOpacity>
                                            </View>

                                            <Text style={{ marginTop: 10, fontSize: 12, color: '#666' }}>Toque em "CONFIRMAR MOTIVO" para confirmar e notificar o gestor.</Text>
                                        </View>
                                    ) : null}
                                </>
                            ) : (
                                <>
                                    <Text style={{ fontWeight: 'bold', marginBottom: 8 }}>Nome do recebedor</Text>
                                    <TextInput
                                        ref={recebedorInputRef}
                                        value={recebedorLocal}
                                        onChangeText={setRecebedorLocal}
                                        placeholder="Digite o nome que recebeu o pedido"
                                        style={{ borderWidth: 1, borderColor: '#ccc', padding: 8, borderRadius: 6, backgroundColor: '#fff' }}
                                        returnKeyType="done"
                                    />

                                    {Array.isArray(ultimosRecebedores) && ultimosRecebedores.length > 0 ? (
                                        <View style={{ marginTop: 12 }}>
                                            <Text style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>Sugestões recentes</Text>
                                            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                                                {ultimosRecebedores.map((r, idx) => (
                                                    <TouchableOpacity key={r + '_' + idx} onPress={() => setRecebedorLocal(r)} style={{ backgroundColor: '#eee', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 16, marginRight: 8, marginBottom: 8 }}>
                                                        <Text>{r}</Text>
                                                    </TouchableOpacity>
                                                ))}
                                            </View>
                                        </View>
                                    ) : null}

                                    <Text style={{ marginTop: 10, fontSize: 12, color: '#666' }}>Você pode deixar em branco se não houver recebedor.</Text>
                                </>
                            )}
                        </View>

                        {/* 🔘 BOTÕES DE COMANDO EM BAIXO */}
                        <View style={styles.modalFooterAssina}>
                            <TouchableOpacity style={styles.btnApagarFull} onPress={() => { setModalAssinatura(false); setRecebedorLocal(''); setMotivoLocal(''); setIsNaoEntregue(false); setMostrarInputOutro(false); }}>
                                <Text style={styles.btnTextGeral}>SAIR / LIMPAR</Text>
                            </TouchableOpacity>

                            {isNaoEntregue ? (
                                <TouchableOpacity style={[styles.btnConfirmarFull, { backgroundColor: '#ff8c00' }]} onPress={() => { handleConfirmNaoEntregue(); }}>
                                    <Text style={styles.btnTextGeral}>ENVIAR MOTIVO</Text>
                                </TouchableOpacity>
                            ) : (
                                <TouchableOpacity style={styles.btnConfirmarFull} onPress={() => { handleFinalizar(); }}>
                                    <Text style={styles.btnTextGeral}>CONFIRMAR ENTREGA</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    </View>
                </View>
            </Modal>

        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000' },
    searchContainer: {
        position: 'absolute', top: 0, width: '100%', zIndex: 100,
        backgroundColor: '#FFF', paddingTop: 50,
    },
    googleContainer: { flex: 0 },
    googleInput: {
        height: 50, color: '#333', fontSize: 16,
        backgroundColor: '#eee', marginHorizontal: 20, borderRadius: 10,
    },
    googleList: { backgroundColor: '#FFF', marginHorizontal: 20, borderRadius: 10, marginTop: 5 },
    map: { width: SCREEN_WIDTH, height: SCREEN_HEIGHT },
    markerPin: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 15, borderWidth: 2, borderColor: '#FFF' },
    markerText: { color: '#FFF', fontWeight: 'bold' },
    aba: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height: SCREEN_HEIGHT, // Altura total para poder subir tudo
        backgroundColor: '#111',
        borderTopLeftRadius: 40,
        borderTopRightRadius: 40,
        padding: 25,
        elevation: 30, // Sombra para destacar do mapa
    },
    handleContainer: {
        width: '100%',
        height: 30, // Área invisível maior para o dedo não escapar
        alignItems: 'center',
        justifyContent: 'center',
    },
    handle: {
        width: 60,
        height: 6,
        backgroundColor: '#555',
        borderRadius: 10,
        alignSelf: 'center',
        marginBottom: 15,
    },
    abaTitle: { color: '#FFF', fontSize: 18, fontWeight: 'bold', textAlign: 'center', marginBottom: 20 },
    sheet: {
        position: 'absolute',
        left: 0,
        right: 0,
        height: SCREEN_HEIGHT,
        backgroundColor: '#0f1720',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        zIndex: 50,
        elevation: 30,
    },
    sheetContent: {
        flex: 1,
        paddingHorizontal: 8,
        paddingBottom: 40,
    },
    /* Glassmorphism backdrop & inner content */
    sheetBackdrop: {
        position: 'absolute',
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
        backgroundColor: 'rgba(12,14,18,0.6)',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        overflow: 'hidden',
    },
    fallbackBlur: {
        position: 'absolute',
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
        backgroundColor: 'rgba(15,23,32,0.9)',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
    },
    sheetInner: {
        flex: 1,
        paddingTop: 6,
    },
    sheetContentGlass: {
        flex: 1,
        backgroundColor: 'rgba(255,255,255,0.9)', // Simple translucent white for stability
        paddingHorizontal: 8,
        paddingBottom: 40,
    },
    sheetGlassFallback: {
        position: 'absolute',
        left: 0,
        right: 0,
        top: 0,
        height: 120,
        backgroundColor: 'rgba(255,255,255,0.9)',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
    },
    pulsoVermelhoStatic: {
        position: 'absolute',
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(255,0,0,0.6)'
    },
    /* Route index / badge */
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    badge: { backgroundColor: '#111827', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 20 },
    badgeText: { color: '#fff', fontWeight: '700' },
    badgeTextLarge: { color: '#fff', fontWeight: '800', fontSize: 22 },
    badgeId: { color: '#fff', fontWeight: '600', fontSize: 12, marginTop: 2 },
    resumoRow: { backgroundColor: '#FFFFFF', padding: 10, borderRadius: 10, marginBottom: 8, alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
    resumoText: { color: '#000', fontWeight: '800', fontSize: 18 },
    resumoBadge: { flexDirection: 'row', alignItems: 'center' },
    resumoIcon: { fontSize: 20, marginRight: 8 },
    modalButtonsRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
    btnCancel: { flex: 1, backgroundColor: '#e74c3c', paddingVertical: 12, borderRadius: 10, marginRight: 8, alignItems: 'center' },
    btnSend: { flex: 1, backgroundColor: '#28a745', paddingVertical: 12, borderRadius: 10, marginLeft: 8, alignItems: 'center' },
    // Split buttons used inside the card so NÃO ENTREGUE and FINALIZAR fill side-by-side
    btnSplitContainer: { flexDirection: 'row', flex: 1, alignItems: 'center' },
    btnSplit: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    cardHeaderRight: { flexDirection: 'row', alignItems: 'center' },
    arrowBtn: { paddingHorizontal: 8, paddingVertical: 4 },
    selectedMarker: { alignItems: 'center', justifyContent: 'center' },
    selectedMarkerDot: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#3498db', borderWidth: 3, borderColor: '#fff' },
    btnRowThree: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    btnSmall: {
        flex: 1,
        paddingVertical: 10,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        marginHorizontal: 4,
    },
    btnIconText: { color: '#111', fontWeight: '700', fontSize: 14, textAlign: 'center' },
    cardGrande: {
        backgroundColor: '#111827',
        borderRadius: 12,
        padding: 14,
        marginBottom: 10,
        elevation: 3,
        zIndex: 1,
    },
    cardName: {
        color: '#FFF',
        fontSize: 24,     // Nome do cliente bem grande
        fontWeight: 'bold',
        marginBottom: 8,
    },
    observacoesText: {
        color: '#FFD580',
        fontStyle: 'italic',
        marginBottom: 8,
        fontSize: 15,
    },
    addressText: {
        color: '#fff',
        fontSize: 16,
        marginBottom: 12,
        fontWeight: '600'
    },
    btnRow: { flexDirection: 'row', justifyContent: 'space-between' },
    modalOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        paddingTop: STATUSBAR_HEIGHT,
        backgroundColor: 'rgba(0,0,0,0.78)', // Overlay mais escuro para foco
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 9999,
    },
    modalOverlayLight: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        paddingTop: STATUSBAR_HEIGHT,
        backgroundColor: 'rgba(0,0,0,0.45)', // Overlay mais claro para modais secundários
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 9998,
    },
    modalOcorrenciaContent: {
        width: '92%',
        backgroundColor: '#141414',
        borderRadius: 16,
        padding: 20,
        elevation: 12,
    },
    modalTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 12 },
    btnMotivo: { paddingVertical: 12, paddingHorizontal: 14, backgroundColor: '#222', borderRadius: 12, marginBottom: 8 },
    txtMotivo: { color: '#fff', fontSize: 14 },
    inputOcorrencia: { backgroundColor: '#1A1A1A', color: '#fff', padding: 12, borderRadius: 10, marginTop: 10, marginBottom: 10 },
    btnFechar: { paddingVertical: 12, alignItems: 'center', backgroundColor: '#444', borderRadius: 10, marginTop: 8 },
    /* Modal assinatura - versão full */
    modalAssinaturaFull: {
        width: '95%', // Quase a largura toda
        height: '90%', // 90% da altura da tela
        backgroundColor: '#FFF',
        borderRadius: 25,
        padding: 15,
        elevation: 30,
        alignItems: 'center',
    },
    quickReasonList: { marginTop: 8, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
    quickReasonBtn: { backgroundColor: '#f2f2f2', paddingVertical: 12, paddingHorizontal: 10, borderRadius: 8, width: '48%', marginBottom: 10, alignItems: 'center', justifyContent: 'center' },
    quickReasonText: { color: '#333', fontSize: 14, textAlign: 'center' },
    /* Overlay shown inside the assinatura modal while uploading/processing the photo */
    modalProcessing: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.6)',
        borderRadius: 25,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10001,
    },
    modalProcessingText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '700'
    },
    modalTransitionOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.6)',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 20000,
        paddingHorizontal: 30
    },
    modalTransitionText: {
        color: '#fff',
        fontSize: 16,
        marginTop: 12,
        fontWeight: '700',
        textAlign: 'center'
    },
    /* Radar styles removed */
    containerAssinatura: {
        flex: 1, // Faz a área de assinatura ocupar todo o centro
        width: '100%',
        backgroundColor: '#FFF',
        borderWidth: 2,
        borderColor: '#EEE',
        borderRadius: 15,
        overflow: 'hidden',
        marginVertical: 15,
    },
    modalFooterAssina: {
        flexDirection: 'row',
        width: '100%',
        height: 70,
        justifyContent: 'space-between',
    },
    btnApagarFull: {
        flex: 1,
        backgroundColor: '#555',
        borderRadius: 15,
        marginRight: 10,
        justifyContent: 'center',
        alignItems: 'center',
    },
    btnConfirmarFull: {
        flex: 1,
        backgroundColor: '#28a745',
        borderRadius: 15,
        justifyContent: 'center',
        alignItems: 'center',
    },
    btnTextGeral: {
        color: '#FFF',
        fontWeight: 'bold',
        fontSize: 14,
    },
    btnRowModal: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 15 },
    actionRow: { flexDirection: 'row', justifyContent: 'space-between' },
    actionBtn: { flex: 1, padding: 12, borderRadius: 12, marginHorizontal: 5, alignItems: 'center' },
    btn: {
        width: '48%', // Garante lado esquerdo e direito
        paddingVertical: 22, // Botão grande conforme pediu
        borderRadius: 15,
        alignItems: 'center',
    },
    btnAction: {
        width: '48%',
        paddingVertical: 12, // Altura reduzida para NÃO ENTREGUE / ENTREGAR
        borderRadius: 15,
        alignItems: 'center',
        justifyContent: 'center',
    },
    btnText: {
        color: '#FFF',
        fontWeight: 'bold',
        fontSize: 16, // Texto do botão maior
    },
    reorderButton: { paddingHorizontal: 6, paddingVertical: 4, justifyContent: 'center' },
    reorderLink: {
        color: '#555',
        fontSize: 10, // Diminuído conforme solicitado
        fontWeight: 'bold',
        textDecorationLine: 'underline',
    },
    motoContainer: {
        backgroundColor: '#FFF',
        width: 60,
        height: 60,
        borderRadius: 30,
        alignItems: 'center',
        justifyContent: 'center',
        elevation: 6,
        borderWidth: 2,
        borderColor: '#3498db',
        overflow: 'visible',
    },
    motoEmoji: {
        fontSize: 38,         // Tamanho da moto
        lineHeight: 45,       // Ajuste de altura da linha para o emoji não subir
    },

    /* Novo container fixo do marcador da moto */
    markerFixed: {
        alignItems: 'center',
        justifyContent: 'center',
        width: 80,
        height: 80,
    },
    motoHalo: {
        position: 'absolute',
        width: 60,
        height: 60,
        borderRadius: 30,
        backgroundColor: 'rgba(52, 152, 219, 0.2)', // Brilho azul suave em volta
        borderWidth: 2,
        borderColor: 'rgba(52, 152, 219, 0.5)',
    },

    /* Moto refinada com imagem (alta definição) */
    motoContainerRefinado: {
        width: 80, // Espaço extra para a rotação não cortar as pontas
        height: 80,
        alignItems: 'center',
        justifyContent: 'center',
        // Sombra azul para o marcador não sumir no mapa claro
        shadowColor: '#3498db',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.8,
        shadowRadius: 6,
    },
    containerMotoFixo: {
        width: 70, // Espaço de sobra para não cortar
        height: 70,
        alignItems: 'center',
        justifyContent: 'center',
    },
    motoImagePng: {
        width: 50,
        height: 50,
        resizeMode: 'contain', // Garante que a imagem apareça inteira
    },

    /* Top bar e botão de logout */
    // Top command bar (clean professional UI)
    commandBar: { position: 'absolute', top: 50, left: 10, right: 10, backgroundColor: 'rgba(255,255,255,0.85)', borderRadius: 15, height: 60, paddingHorizontal: 12, justifyContent: 'center', zIndex: 300, elevation: 12, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
    cmdBtn: { backgroundColor: 'transparent', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
    cmdBtnLeft: { backgroundColor: 'transparent', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
    cmdBtnText: { color: '#111', fontWeight: '700', fontSize: 16 },
    topBar: { position: 'absolute', top: STATUSBAR_HEIGHT + 8, right: 12, zIndex: 200, alignItems: 'flex-end' },
    logoutButton: { backgroundColor: '#ef4444', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8, elevation: 10 },
    logoutText: { color: '#fff', fontWeight: '700' },

    /* FEIÇÃO DE BOLINHA REALÇADA (3 camadas) */
    fundoBolinha: {
        alignItems: 'center',
        justifyContent: 'center',
        width: 100,
        height: 100,
    },
    radarBolinha: {
        position: 'absolute',
        width: 60,
        height: 60,
        borderRadius: 30,
        backgroundColor: 'rgba(27, 114, 232, 0.2)', // Azul clarinho transparente
        borderWidth: 2,
        borderColor: 'rgba(27, 114, 232, 0.4)',
    },
    bordaBolinha: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#FFF', // Borda branca para dar contraste no mapa
        alignItems: 'center',
        justifyContent: 'center',
        elevation: 8, // Sombra para "saltar" do mapa
    },
    pontoCentral: {
        width: 20,
        height: 20,
        borderRadius: 10,
        backgroundColor: '#1B72E8', // Azul Google bem forte
    },

    /* Estilos do marcador pulsante (ajustados para realce máximo) */
    containerPulsante: {
        alignItems: 'center',
        justifyContent: 'center',
        width: 60,
        height: 60,
    },
    pulsoVermelho: {
        position: 'absolute',
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'red',
    },
    bolinhaVermelhaCentro: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: 'red',
        borderWidth: 3,
        borderColor: 'white', // Borda branca para destacar no mapa
        elevation: 5,
    },

    // estilos adicionados para o novo layout de botões
    btnLargo: {
        width: '100%',
        paddingVertical: 16,
        borderRadius: 14,
        alignItems: 'center',
    },
    btnTrocarInferior: {
        position: 'absolute',
        bottom: 12,
        right: 20,
    },
    reorderText: {
        color: '#555',
        fontSize: 10,
        fontWeight: 'bold',
    },
    cardVoando: {
        transform: [{ scale: 1.04 }],
        elevation: 25,
        shadowOffset: { width: 0, height: 20 },
        shadowOpacity: 0.6,
        shadowRadius: 20,
    },
    cardEmDestaque: {
        zIndex: 9999,          // Passa por cima de TUDO
        elevation: 20,         // Sombra máxima no Android
        transform: [{ scale: 1.05 }], // Aumenta levemente para parecer mais perto
        borderColor: '#3498db', // Brilho azul para destacar o movimento
        borderWidth: 2,
    },
    areaGestor: {
        backgroundColor: 'rgba(52, 152, 219, 0.1)', // Azul bem clarinho
        padding: 12,
        borderRadius: 15,
        marginBottom: 15,
        borderLeftWidth: 4,
        borderLeftColor: '#3498db',
    },
    tituloGestor: {
        color: '#3498db',
        fontSize: 10,
        fontWeight: 'bold',
        marginBottom: 4,
    },

    /* Estilos para cards compactos (ajustados para caber dois na tela) */
    cardCompacto: {
        backgroundColor: '#1E1E1E',
        borderRadius: 20,
        padding: 15,
        marginBottom: 12,
        height: 140, // Altura fixa para garantir que caibam dois na tela
        elevation: 5,
    },
    areaGestorCompacta: {
        backgroundColor: 'rgba(52, 152, 219, 0.15)',
        padding: 6,
        borderRadius: 8,
        marginBottom: 8,
    },
    textoGestorMini: {
        color: '#3498db',
        fontSize: 11,
        fontWeight: '600',
    },
    clienteNomeMini: {
        color: '#FFF',
        fontSize: 16,
        fontWeight: 'bold',
        marginBottom: 10,
    },
    btnRowMini: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    btnMini: {
        flex: 1,
        paddingVertical: 10, // Botão mais baixo
        borderRadius: 10,
        marginHorizontal: 3,
        alignItems: 'center',
    },
    btnTextMini: {
        color: '#FFF',
        fontSize: 11,
        fontWeight: 'bold',
    },
    textoGestor: {
        color: '#CCC',
        fontSize: 13,
        fontStyle: 'italic',
    },
    cardCliente: {
        color: '#FFF',
        fontSize: 20,
        fontWeight: 'bold',
        marginBottom: 20,
        marginLeft: 5,
    },
    btnRowCompacto: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 5,
    },
    btnPequeno: {
        flex: 1,
        paddingVertical: 12, // Botão mais baixo (compacto)
        borderRadius: 12,
        marginHorizontal: 4,
        alignItems: 'center',
        justifyContent: 'center',
    },
    btnTextPequeno: {
        color: '#FFF',
        fontWeight: 'bold',
        fontSize: 12,
    },
    callMarker: { backgroundColor: '#fff', padding: 6, borderRadius: 20, borderWidth: 1, borderColor: '#3498db' },
    callMarkerText: { fontSize: 18 },

    reorderText: {
        position: 'absolute',
        bottom: 8,
        right: 15,
        color: '#444',
        fontSize: 9,
        fontWeight: 'bold',
    },
    dragHint: {
        alignItems: 'center',
        marginBottom: 8,
    },
    dragHintText: {
        color: '#9aa4b2',
        fontSize: 12,
    },
    cameraOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.75)',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 30000,
    },
});

export default DeliveryApp;

