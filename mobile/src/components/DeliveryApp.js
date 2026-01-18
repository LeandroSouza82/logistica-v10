import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
    StyleSheet, Text, View, TouchableOpacity, Pressable, Animated, Modal, Image, ActivityIndicator, Vibration,
    Dimensions, Linking, FlatList, TextInput, Alert, StatusBar, Platform, UIManager, LayoutAnimation, PanResponder, Easing, ActionSheetIOS
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import Constants from 'expo-constants';
import { Audio } from 'expo-av';
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import * as ImagePicker from 'expo-image-picker';

// Dynamic imports for optional native modules
let FileSystem;
try {
    FileSystem = require('expo-file-system');
} catch (e) {
    FileSystem = null;
    console.warn('expo-file-system não disponível.');
}

// Número do gestor/patrão - removed hardcoded default (use Supabase)
const BOSS_PHONE = null;

// Configuração obrigatória para notificações em foreground
Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldVibrate: true,
    }),
});

import * as ScreenOrientation from 'expo-screen-orientation';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabaseClient';

// Removed optional blur support to improve stability on mobile (use plain translucent background instead)

// Bottom sheet (manual implementation using PanResponder & Animated)
// removed dependency on @gorhom/bottom-sheet and react-native-reanimated

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Permite usar LayoutAnimation no Android (experimental)
if (Platform.OS === 'android' && UIManager?.setLayoutAnimationEnabledExperimental) {
    try { UIManager.setLayoutAnimationEnabledExperimental(true); } catch (e) { console.warn('setLayoutAnimationEnabledExperimental falhou:', e); }
}

// Altura da status bar para ajustar modals translúcidos no Android
const STATUSBAR_HEIGHT = Platform.OS === 'android' ? (StatusBar.currentHeight || 0) : 0;

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

function DeliveryApp(props) {

    // Safety check for supabase connection
    if (!supabase) {
        return (
            <View style={{ flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#fff', fontSize: 16 }}>Conectando ao sistema...</Text>
                <ActivityIndicator size="large" color="#fff" style={{ marginTop: 20 }} />
            </View>
        );
    }

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
    // Estado para armazenar o histórico de entregas finalizadas
    const [historico, setHistorico] = useState([]);
    // Estado de controle de exibição do histórico (para evitar abrir sozinho)
    const [exibirHistorico, setExibirHistorico] = useState(false);

    // Estado para controlar overlay de alerta vermelho
    const [alertaVisivel, setAlertaVisivel] = useState(false);

    // Pedido selecionado pelo usuário (null quando nenhum)
    const [pedidoSelecionado, setPedidoSelecionado] = useState(null);

    // Estado que guarda link do WhatsApp pendente para abrir a partir da tela principal
    const [linkWhatsAppPendente, setLinkWhatsAppPendente] = useState(null);

    // Modals: assinatura (finalizar) e ocorrência (relatar problema)
    const [modalAssinatura, setModalAssinatura] = useState(false);
    const [modalOcorrencia, setModalOcorrencia] = useState(false);

    // Modal processing spinner
    const [modalProcessing, setModalProcessing] = useState(false);

    // Estados relacionados ao fluxo de finalizar / não entregue
    const [isNaoEntregue, setIsNaoEntregue] = useState(false);
    const [motivoLocal, setMotivoLocal] = useState('');
    const [mostrarInputOutro, setMostrarInputOutro] = useState(false);
    const [outroSelected, setOutroSelected] = useState(false);

    // Texto e foto para ocorrências (modal)
    const [textoOcorrencia, setTextoOcorrencia] = useState('');
    const [ocorrenciaPhotoUrl, setOcorrenciaPhotoUrl] = useState(null);

    // 📦 SISTEMA DE CATEGORIAS V10 (Estados Limpos)
    const [categoria, setCategoria] = useState('');
    const [nome, setNome] = useState('');
    const [apto, setApto] = useState('');

    // Último pedido selecionado (cache para fallback)
    const lastSelectedRef = useRef(null);

    // Razões rápidas para não-entrega
    const [motivosRapidos, setMotivosRapidos] = useState([
        'Cliente Ausente',
        'Endereço não localizado',
        'Recusado pelo Cliente',
        'Local Fechado',
        'Veículo com Problema',
        'Sem Tempo Hábil',
        'Mercadoria Avariada',
        'Falta de Documento',
        'Área de Risco',
        'Outros'
    ]);

    // Modal refresh key para forçar re-mounts/parcial refresh
    const [modalRefreshKey, setModalRefreshKey] = useState(0);

    // Refs para inputs de modal
    const recebedorInputRef = useRef(null);
    const motivoInputRef = useRef(null);
    const inputOcorrenciaRef = useRef(null);

    // Controle de uploads/concorrência para ocorrências
    const [ocorrenciaUploading, setOcorrenciaUploading] = useState(false);
    const [ocorrenciaProcessing, setOcorrenciaProcessing] = useState(false);
    const uploadingRef = useRef(false);

    // Controle para evitar fetchs concorrentes
    const fetchInProgressRef = useRef(false);
    // flag para evitar alertas duplicados na busca inicial
    const fetchedOnceRef = useRef(false);

    // Debug wrapper to trace where setEntregas is called (temporary for debugging render loop)
    const debugSetEntregas = setEntregas;

    // Loading geral (usado para indicar fetch inicial)
    const [loading, setLoading] = useState(true);

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

    // Função unificadora de notificação (Configurada para Alarme Único e Persistente)
    const dispararNotificacao = async () => {
        try {
            await Notifications.requestPermissionsAsync({
                ios: {
                    allowAlert: true,
                    allowSound: true,
                    allowBadge: true,
                    allowCriticalAlerts: true,
                },
                android: {},
            });
            // Dispara notificação crítica - Proteção para Development Build
            if (Notifications && Notifications.scheduleNotificationAsync) {
                await Notifications.scheduleNotificationAsync({
                    content: {
                        title: '🚨 ALERTA DE ROTA',
                        body: 'Pedido em rota — TOQUE PARA PARAR',
                        sound: 'default',
                        channelId: 'ALERTA_SIRENE_FINAL',
                        priority: Notifications.AndroidNotificationPriority.MAX,
                        sticky: true,
                        autoDismiss: false,
                    },
                    trigger: null,
                });
            } else {
                console.warn('Notifications API não disponível - notificação não enviada');
            }
        } catch (e) {
            console.warn('Erro ao dispararNotificacao:', e);
        }
    };

    // Ref para controlar o objeto de som (Sirene Real via Expo AV)
    const soundRef = useRef(null);

    // Efeito para tocar SOM DE SIRENE REAL + Vibração
    useEffect(() => {
        let isMounted = true;

        const playSiren = async () => {
            if (!alertaVisivel) return;

            try {
                // Configura áudio para tocar mesmo em modo silencioso
                await Audio.setAudioModeAsync({
                    playsInSilentModeIOS: true,
                    staysActiveInBackground: true,
                    shouldDuckAndroid: true,
                    playThroughEarpieceAndroid: false
                });

                // Carrega o som (Beep em loop cria efeito de sirene)
                const { sound } = await Audio.Sound.createAsync(
                    { uri: 'https://www.soundjay.com/buttons/beep-01a.mp3' },
                    { shouldPlay: true, isLooping: true, volume: 1.0 }
                );

                soundRef.current = sound;

                // Garante o play
                if (isMounted) {
                    await sound.playAsync();
                } else {
                    await sound.unloadAsync();
                }

                // Dispara notificação VISUAL (apenas uma vez)
                dispararNotificacao();

                // Vibração infinita
                Vibration.vibrate([0, 500, 1000], true);

            } catch (error) {
                console.warn('Erro ao tocar sirene:', error);
            }
        };

        const stopSiren = async () => {
            if (soundRef.current) {
                try {
                    await soundRef.current.stopAsync();
                    await soundRef.current.unloadAsync();
                } catch (e) { }
                soundRef.current = null;
            }
            Vibration.cancel();
            Notifications.dismissAllNotificationsAsync();
        };

        if (alertaVisivel) {
            playSiren();
        } else {
            stopSiren();
        }

        // Cleanup na desmontagem
        return () => {
            isMounted = false;
            stopSiren();
        };
    }, [alertaVisivel]);

    // Auto-fetch + Realtime + GPS automático (centralizado, sem duplicação de listeners)
    useEffect(() => {
        let channel = null;

        // Configurar canal de notificação Android com som de alarme e solicitar permissões
        const setupNotificationChannel = async () => {
            try {
                // Solicitar permissões explicitamente (iOS Critical Alerts)
                const { status } = await Notifications.requestPermissionsAsync({
                    ios: {
                        allowAlert: true,
                        allowSound: true,
                        allowBadge: true,
                        allowCriticalAlerts: true,
                    },
                    android: {},
                });
                console.log('Status da permissão de notificação:', status);

                if (Platform.OS === 'android') {
                    // Canal 'ALERTA_SIRENE_FINAL' - Proteção contra null reference em Development Build
                    try {
                        if (Notifications && Notifications.setNotificationChannelAsync) {
                            await Notifications.setNotificationChannelAsync('ALERTA_SIRENE_FINAL', {
                                name: 'Alerta Sirene Final',
                                importance: Notifications.AndroidImportance.MAX,
                                sound: 'default',
                                enableVibrate: true,
                                vibrationPattern: [0, 500, 1000, 500],
                                audioAttributes: {
                                    usage: Notifications.AndroidAudioUsage.ALARM,
                                    contentType: Notifications.AndroidAudioContentType.SONIFICATION,
                                },
                                bypassDnd: true,
                                lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
                            });
                            console.log('Canal de notificação Android (ALERTA_SIRENE_FINAL) criado com sucesso');
                        } else {
                            console.warn('Notifications API não disponível - canal ALERTA_SIRENE_FINAL não criado');
                        }
                    } catch (err) {
                        console.warn('Erro ao criar canal de notificação:', err);
                    }

                    // Instrução visual para o motorista (pode ser vista no Log ou Alert durante desenvolvimento)
                    console.log('>>> MOTORISTA: Vá em Configurações > Apps > DriverApp > Notificações > Alerta Sirene Final e escolha um som de SIRENE longo.');
                }
            } catch (e) {
                console.warn('Erro ao configurar notificações:', e);
            }
        };

        const start = async () => {
            // Configurar canal de notificações antes de tudo
            await setupNotificationChannel();

            try {
                console.log('Iniciando busca de entregas...');
                await carregarEntregas();
            } catch (e) {
                console.warn('Erro em carregarEntregas (init):', e);
            }

            // 2. Carrega Histórico (Finalizadas) - Carregamento Automático
            try {
                const motoristaId = props?.motoristaId ?? 1;
                // CORREÇÃO: Usando apenas colunas existentes no schema
                const { data: hist, error: histError } = await supabase
                    .from('entregas')
                    .select('id, status, cliente, endereco, observacoes, data_entrega')
                    .eq('motorista_id', motoristaId)
                    .eq('status', 'entregue')
                    .order('id', { ascending: false })
                    .limit(20);

                console.log('LOG SUPABASE (histórico):', hist, histError);

                if (hist) {
                    const normHist = hist.map(x => (typeof normalizePedido === 'function') ? normalizePedido(x) : x);
                    setHistorico(normHist);
                }
            } catch (e) { console.warn('Erro carregar histórico init:', e); }

            try {
                console.log('Conectando Realtime (entregas)...');
                channel = supabase
                    .channel('realtime-entregas')
                    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'entregas' }, (payload) => {
                        try {
                            const novo = payload.new || {};
                            const motoristaId = props?.motoristaId ?? 1;
                            if (Number(novo.motorista_id) !== Number(motoristaId)) return; // ignore others

                            const normalized = (typeof normalizePedido === 'function') ? normalizePedido(novo) : novo;
                            const status = normalized.status || 'pendente';
                            // Filtro estrito: só aceita pendente ou em_rota
                            if (status !== 'pendente' && status !== 'em_rota') return;

                            console.log('Realtime INSERT entrega pendente para este motorista:', normalized);

                            setEntregas(prev => {
                                if (prev && prev.some(p => Number(p.id) === Number(normalized.id))) return prev; // evita duplicata
                                return [normalized, ...(prev || [])];
                            });
                        } catch (e) {
                            console.warn('Erro ao processar INSERT em entregas (mobile):', e);
                        }
                    })
                    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'entregas' }, (payload) => {
                        try {
                            const novo = payload.new || {};
                            const motoristaId = props?.motoristaId ?? 1;
                            if (Number(novo.motorista_id) !== Number(motoristaId)) return;
                            console.log('Realtime UPDATE entrega para este motorista:', novo);

                            // Código de alerta de rota removido (agora usando apenas status em_rota)

                            // 🚨 ALERTA quando status vira "em_rota" (independente de rota)
                            try {
                                const newStatus = payload?.new?.status;

                                // Detecta mudança para em_rota
                                if (newStatus === 'em_rota') {
                                    console.log('🚨 Status mudou para em_rota - ACIONANDO ALERTA');

                                    // Tarefa 3 — Sincronia Total do Alerta
                                    // Apenas ativar o estado visual: o useEffect cuidará do som e vibração de forma persistente
                                    setAlertaVisivel(true);
                                }
                            } catch (e) {
                                console.warn('Erro ao detectar mudança de status para em_rota:', e);
                            }

                            // Trigger the same refresh used by the manual button to keep behavior consistent
                            try {
                                if (typeof carregarEntregas === 'function') {
                                    // call asynchronously; carregarEntregas has its own concurrency guard
                                    carregarEntregas().catch(err => console.warn('carregarEntregas (realtime update) falhou:', err));
                                }
                            } catch (err) {
                                console.warn('Erro ao disparar carregarEntregas no realtime (UPDATE):', err);
                            }

                            const normalized = (typeof normalizePedido === 'function') ? normalizePedido(novo) : novo;
                            const status = normalized.status || 'pendente';

                            // Remove da lista se status for cancelado ou entregue
                            if (status === 'entregue' || status === 'cancelado') {
                                setEntregas(prev => (prev || []).filter(p => Number(p.id) !== Number(normalized.id)));

                                // Adiciona ao histórico se virar 'entregue'
                                if (status === 'entregue') {
                                    setHistorico(prev => {
                                        if (prev.some(h => String(h.id) === String(normalized.id))) return prev;
                                        return [normalized, ...prev];
                                    });
                                }
                            } else if (status === 'pendente' || status === 'em_rota') {
                                // Atualiza apenas se for pendente ou em_rota
                                setEntregas(prev => (prev || []).map(p => (Number(p.id) === Number(normalized.id) ? { ...p, ...normalized } : p)));
                            }
                        } catch (e) {
                            console.warn('Erro ao processar UPDATE em entregas (mobile):', e);
                        }
                    })
                    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'entregas' }, (payload) => {
                        try {
                            const old = payload.old || {};
                            const motoristaId = props?.motoristaId ?? 1;
                            if (Number(old.motorista_id) !== Number(motoristaId)) return;
                            setEntregas(prev => (prev || []).filter(p => Number(p.id) !== Number(old.id)));
                        } catch (e) {
                            console.warn('Erro ao processar DELETE em entregas (mobile):', e);
                        }
                    })
                    .subscribe(status => console.log('Realtime (entregas) status:', status));

                console.log('Realtime conectado (entregas)');
            } catch (e) {
                console.warn('Erro ao conectar realtime (entregas):', e);
            }

            // GPS: solicitar permissão e iniciar watch (somente uma vez)
            try {
                console.log('Solicitando permissão de localização...');
                const { status } = await Location.requestForegroundPermissionsAsync();
                if (status === 'granted') {
                    console.log('GPS ativo (permissão concedida)');
                    if (!locationStartedRef.current) {
                        locationStartedRef.current = true;
                        locationSubscriptionRef.current = await Location.watchPositionAsync({
                            accuracy: Location.Accuracy.Balanced,
                            timeInterval: 5000,
                            distanceInterval: 5,
                        }, async (loc) => {
                            try {
                                const coords = loc?.coords || {};
                                const { latitude, longitude, heading: hd } = coords;
                                if (isNaN(latitude) || isNaN(longitude)) return;

                                const newPos = { latitude, longitude };
                                if (hd != null && !isNaN(hd)) {
                                    newPos.heading = Number(hd);
                                    setHeading(Number(hd));
                                }

                                if (mountedRef.current) setPosicaoMotorista(newPos);

                                const now = Date.now();
                                // throttle uploads (10s)
                                if (now - lastUploadRef.current > 10000) {
                                    lastUploadRef.current = now;
                                    try {
                                        await enviarPosicao({ latitude, longitude });
                                    } catch (e) { console.warn('Erro ao enviarPosicao (watch):', e); }
                                }
                            } catch (e) { console.warn('Erro no callback do watchPosition:', e); }
                        });
                    }
                } else {
                    console.warn('Permissão de localização negada:', status);
                }
            } catch (e) {
                console.warn('Erro ao iniciar GPS:', e);
            }
        };

        (async () => {
            try {
                await start();
            } catch (e) {
                console.error('Erro na inicialização:', e);
            } finally {
                setLoading(false);
            }
        })();

        return () => {
            try { if (channel) supabase.removeChannel(channel); } catch (e) { /* ignore */ }
            try { locationSubscriptionRef.current?.remove?.(); locationSubscriptionRef.current = null; } catch (e) { /* ignore */ }
        };
    }, []);

    const carregarEntregas = useCallback(async () => {
        console.log('Iniciando busca de entregas');
        // throttle concurrent fetches to avoid loops/alternância de tela
        if (fetchInProgressRef?.current) {
            setLoading(false);
            return;
        }
        if (fetchInProgressRef) fetchInProgressRef.current = true;
        if (setLoading) try { setLoading(true); } catch (e) { console.error('carregarEntregas: falha ao setLoading(true):', e); }

        try {
            const motoristaId = props?.motoristaId ?? 1;
            const hoje = new Date();
            hoje.setUTCHours(0, 0, 0, 0);
            const dataHoje = hoje.toISOString();

            // Busca APENAS pedidos com status 'pendente' ou 'em_rota'
            console.log('🔍 LOG SUPABASE (carregarEntregas) - Buscando entregas...');
            const { data: initial, error: initialErr } = await supabase
                .from('entregas')
                .select('*')
                .in('status', ['pendente', 'em_rota'])
                .order('id', { ascending: false })
                .limit(1000);

            console.log('🔍 LOG SUPABASE (carregarEntregas) - Resultado:', initial, initialErr);

            if (initialErr) {
                console.error('🔴 ERRO SUPABASE:', initialErr.message);
                debugSetEntregas([]);
            } else {
                // normalize tipo_servico and ensure strings
                let normalized = (initial || []).map(i => normalizePedido(i));
                // Filtro estrito: apenas pendente ou em_rota
                normalized = normalized.filter(x => {
                    const status = x.status || 'pendente';
                    return status === 'pendente' || status === 'em_rota';
                });

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
            console.error('Erro ao buscar entregas iniciais (mobile):', err);
            debugSetEntregas([]);
        } finally {
            // garante que loading sempre seja liberado e desmarca fetch em andamento
            try { if (setLoading) setLoading(false); } catch (e) { console.error('Erro ao setLoading(false) em carregarEntregas:', e); }
            try { if (fetchInProgressRef) fetchInProgressRef.current = false; } catch (e) { console.error('Erro ao liberar fetchInProgressRef:', e); }
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

    // Referência para o MapView — desativado temporariamente
    const mapRef = useRef(null); // Mantido para evitar erros de referência


    // Stability improvements: ensure we center map on first pedido once, and center when selection changes
    const centeredOnceRef = useRef(false);
    // REMOVIDO: Centralização de mapa comentada pois colunas lat/lng não existem no schema
    // useEffect(() => {
    //     if (!centeredOnceRef.current && entregas && entregas.length > 0) {
    //         const first = entregas[0];
    //         if (first?.lat && first?.lng) {
    //             const lat = Number(first.lat);
    //             const lng = Number(first.lng);
    //             try { mapRef.current?.animateToRegion({ latitude: lat, longitude: lng, latitudeDelta: 0.05, longitudeDelta: 0.05 }, 600); } catch (e) { /* ignore */ }
    //         }
    //         centeredOnceRef.current = true;
    //     }
    // }, [entregas]);

    // Marca se o usuário já reordenou manualmente os pedidos — usado para preservar ordem local ao mesclar dados do servidor
    const userReorderedRef = useRef(false);

    // REMOVIDO: Centralização ao selecionar pedido comentada
    // useEffect(() => {
    //     if (pedidoSelecionado?.lat && pedidoSelecionado?.lng) {
    //         const lat = Number(pedidoSelecionado?.lat);
    //         const lng = Number(pedidoSelecionado?.lng);
    //         try { mapRef.current?.animateToRegion({ latitude: lat, longitude: lng, latitudeDelta: 0.01, longitudeDelta: 0.01 }, 500); } catch (e) { /* ignore */ }
    //     }
    // }, [pedidoSelecionado]);



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

    // Função para parar alerta (som + vibração + notificações)
    const pararAlerta = async () => {
        try {
            // -- BOTÃO DE PÂNICO: Parar Tudo Imediatamente --

            // 1. Para o SOM (Sirene Real)
            if (soundRef.current) {
                try {
                    await soundRef.current.stopAsync();
                    await soundRef.current.unloadAsync();
                } catch (e) { console.warn('Erro ao parar som:', e); }
                soundRef.current = null;
            }

            // 2. Para vibração
            Vibration.cancel();

            // 3. Cancela todas as notificações (para o som nativo)
            Notifications.dismissAllNotificationsAsync();

            // Esconde overlay
            setAlertaVisivel(false);

            console.log('🛑 Alerta cancelado pelo motorista');
        } catch (e) {
            console.log('Erro ao parar alerta:', e);
        }
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
                            Alert.alert('Sair', 'Você está saindo do sistema.', [
                                { text: 'Cancelar', style: 'cancel' },
                                {
                                    text: 'Confirmar', onPress: async () => {
                                        try {
                                            // REMOVIDO: Update de lat/lng comentado (colunas não existem na tabela motoristas)
                                            // const motoristaId = props?.motoristaId ?? 1;
                                            // await supabase.from('motoristas').update({ lat: null, lng: null, ultimo_sinal: null }).eq('id', motoristaId);
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
        // Garante que o histórico não abra sozinho ao iniciar o processo
        try { setExibirHistorico(false); } catch (e) { /* ignore */ }

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
            // ✅ VALIDAÇÃO: Categoria + Nome obrigatórios
            if (!categoria || categoria.trim() === '') {
                Alert.alert('Atenção', 'Por favor, selecione uma categoria (Porteiro, Zelador, etc)!');
                return;
            }
            if (!nome || nome.trim() === '') {
                Alert.alert('Atenção', 'Por favor, digite o nome de quem recebeu!');
                return;
            }
            if (categoria === 'Morador' && (!apto || apto.trim() === '')) {
                Alert.alert('Atenção', 'Por favor, informe o número do apartamento!');
                return;
            }

            // 📦 MONTAGEM DO NOME FINAL: [CATEGORIA]: [NOME] - [APTO]
            let infoRecebedor;
            if (categoria === 'Morador' && apto) {
                infoRecebedor = `[${categoria.toUpperCase()}]: ${nome.trim()} - ${apto.trim()}`;
            } else {
                infoRecebedor = `[${categoria.toUpperCase()}]: ${nome.trim()}`;
            }

            // 📍 CAPTURA AUTOMÁTICA DE GPS (Prova de Presença no Local)
            let lat_conclusao = null;
            let lng_conclusao = null;

            try {
                const { status } = await Location.requestForegroundPermissionsAsync();
                if (status !== 'granted') {
                    console.warn('handleFinalizar: permissão de localização negada');
                } else {
                    const location = await Location.getCurrentPositionAsync({
                        accuracy: Location.Accuracy.High,
                        timeout: 10000,
                        maximumAge: 5000
                    });
                    lat_conclusao = location.coords.latitude;
                    lng_conclusao = location.coords.longitude;
                    console.log('✅ GPS capturado:', { lat_conclusao, lng_conclusao });
                }
            } catch (gpsError) {
                console.warn('handleFinalizar: erro ao capturar GPS', gpsError);
                // Continua mesmo sem GPS
            }

            // 1) Atualiza o backend
            try {
                const payload = {
                    status: 'entregue',
                    recebedor: infoRecebedor,
                    horario_conclusao: new Date().toISOString()
                };

                // 📍 Adiciona GPS se foi capturado
                if (lat_conclusao !== null && lng_conclusao !== null) {
                    payload.lat_conclusao = lat_conclusao;
                    payload.lng_conclusao = lng_conclusao;
                }
                console.log('🔍 LOG SUPABASE (handleFinalizar) - Payload:', payload);
                const { data, error } = await supabase.from('entregas').update(payload).eq('id', target.id).select('*');
                console.log('🔍 LOG SUPABASE (handleFinalizar) - Resultado:', data, error);
                if (error) {
                    console.error('🔴 ERRO SUPABASE:', error.message);
                    Alert.alert('Erro', 'Não foi possível finalizar a entrega. Tente novamente.');
                } else {
                    // ✅ REMOVE IMEDIATAMENTE DA LISTA LOCAL (STOP FETCHING)
                    try { setEntregas(prev => prev.filter(item => item.id !== target.id)); } catch (err) { console.warn('handleFinalizar: falha ao remover pedido localmente:', err); }

                    // Atualiza histórico
                    try {
                        const itemAtualizado = { ...target, status: 'entregue', recebedor: infoRecebedor };
                        setHistorico(prev => {
                            if (prev.some(x => String(x.id) === String(target.id))) return prev;
                            return [itemAtualizado, ...prev];
                        });
                        setExibirHistorico(false);
                    } catch (err) { console.warn('handleFinalizar: erro ao atualizar historico:', err); }

                    // 📱 WHATSAPP: Enviar mensagem com nome final
                    try {
                        const phoneDigits = await fetchGestorPhone();
                        if (phoneDigits) {
                            const endereco = target?.endereco || 'Endereço não disponível';
                            const horario = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                            const mensagem = `✅ *Entrega Concluída!*\n\n*👤 Recebedor:* ${infoRecebedor}\n*📍 Endereço:* ${endereco}\n*⏰ Horário:* ${horario}`;
                            const url = 'whatsapp://send?phone=' + phoneDigits + '&text=' + encodeURIComponent(mensagem);

                            setTimeout(() => {
                                Linking.openURL(url).catch(() => {
                                    console.warn('Não foi possível abrir WhatsApp');
                                });
                            }, 500);
                        }
                    } catch (whatsErr) {
                        console.warn('Erro ao enviar WhatsApp:', whatsErr);
                    }
                }
            } catch (error) {
                console.error('handleFinalizar: exception ao atualizar supabase', error);
                Alert.alert('Erro', 'Não foi possível finalizar a entrega. Verifique a conexão e tente novamente.');
            } finally {
                try { setAbaAtiva('rota'); } catch (e) { /* ignore */ }
                try { setModalAssinatura(false); } catch (e) { /* ignore */ }
                try { setPedidoSelecionado(null); } catch (e) { /* ignore */ }
                try { if (setLoading) setLoading(false); } catch (e) { console.error('Erro ao setLoading(false):', e); }
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
                                // Limpa histórico e modal antes de fechar para evitar glitch
                                try { setExibirHistorico(false); } catch (e) { /* ignore */ }
                                try { setAbaAtiva('rota'); } catch (e) { /* ignore */ }
                                try { setModalAssinatura(false); } catch (e) { /* ignore */ }
                                try { setPedidoSelecionado(null); } catch (e) { /* ignore */ }
                                try { setIsNaoEntregue(false); } catch (e) { /* ignore */ }
                                try { setRecebedorLocal(''); } catch (e) { /* ignore */ }
                                try { setMotivoLocal(''); } catch (e) { /* ignore */ }
                                try { setMostrarInputOutro(false); } catch (e) { /* ignore */ }
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
            try { setModalAssinatura(false); } catch (error) { /* ignore */ }
            try { setPedidoSelecionado(null); } catch (error) { /* ignore */ }
            return;
        }

        const motivoTrim = (motivoOverride !== null) ? (String(motivoOverride).trim() || 'Não informado') : ((motivoLocal && String(motivoLocal).trim() !== '') ? String(motivoLocal).trim() : 'Não informado');
        const horarioAtual = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

        try {
            // Atualiza status para 'falha' e salva motivo em observacoes
            try {
                const payload = {
                    status: 'falha',
                    observacoes: motivoTrim
                };
                console.log('🔍 LOG SUPABASE (handleConfirmNaoEntregue) - Payload:', payload);
                const { data: updated, error: supabaseError } = await supabase
                    .from('entregas')
                    .update(payload)
                    .eq('id', target.id)
                    .select('*');

                console.log('🔍 LOG SUPABASE (handleConfirmNaoEntregue) - Resultado:', updated, supabaseError);

                if (supabaseError) {
                    console.error('🔴 ERRO SUPABASE:', supabaseError.message);
                    Alert.alert('Erro', 'Não foi possível salvar o motivo de não entrega. Tente novamente.');
                    return;
                }

                console.log('✅ Motivo atualizado com sucesso');

                // Atualiza localmente
                try {
                    setEntregas(prev => (prev || []).map(p => (Number(p.id) === Number(target.id) ? { ...p, observacoes: motivoTrim, status: 'falha' } : p)));
                } catch (e) { console.warn('handleConfirmNaoEntregue: falha ao atualizar estado local:', e); }

            } catch (error) {
                console.error('🔴 ERRO SUPABASE:', error.message);
                Alert.alert('Erro', 'Erro ao atualizar o motivo no servidor. Tente novamente.');
                return;
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
                            .catch(error => console.warn('handleConfirmNaoEntregue: erro ao abrir WhatsApp (delayed)', error))
                            .finally(() => {
                                try { setExibirHistorico(false); } catch (e) { /* ignore */ }
                                try { setAbaAtiva('rota'); } catch (e) { /* ignore */ }
                                try { setModalAssinatura(false); } catch (e) { /* ignore */ }
                                try { setPedidoSelecionado(null); } catch (e) { /* ignore */ }
                                try { setIsNaoEntregue(false); } catch (e) { /* ignore */ }
                                try { setRecebedorLocal(''); } catch (e) { /* ignore */ }
                                try { setMotivoLocal(''); } catch (e) { /* ignore */ }
                                try { setMostrarInputOutro(false); } catch (e) { /* ignore */ }
                                try { setEntregas(prev => prev.filter(item => item.id !== idToRemove)); } catch (e) { /* ignore */ }
                            });
                    }, 1000);
                } else {
                    console.warn('handleConfirmNaoEntregue: número do gestor não encontrado, pulando abertura do WhatsApp');
                }
            } catch (error) { console.warn('handleConfirmNaoEntregue: erro preparando WhatsApp', error); }

        } catch (error) {
            console.error('handleConfirmNaoEntregue: erro inesperado', error);
        } finally {
            try { setAbaAtiva('rota'); } catch (e) { /* ignore */ }
            try { setModalAssinatura(false); } catch (e) { /* ignore */ }
            try { setPedidoSelecionado(null); } catch (e) { /* ignore */ }
            try { if (setLoading) setLoading(false); } catch (e) { /* ignore */ }
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
        selectPedido(item);
        setTextoOcorrencia('');
        setOutroSelected(false);
        // Delay pequeno pra garantir que o estado foi aplicado antes de focar
        setModalOcorrencia(true);
    };

    // Handler leve para abrir a finalização (abre modal de registro rápido e marca pedido)
    const handleAbrirFinalizacao = (item) => {
        try {
            // Limpa estados do sistema de categorias
            setCategoria('');
            setNome('');
            setApto('');

            // Usa selectPedido para centralizar comportamento
            selectPedido(item, { openModal: true });
            setIsNaoEntregue(false);
        } catch (e) {
            console.warn('handleAbrirFinalizacao: erro', e);
        }
    };

    // Abre modal de NÃO ENTREGA com modo apropriado
    const handleNaoEntregue = (item) => {
        try {
            // Usa a função centralizada de seleção para manter comportamento consistente
            selectPedido(item, { openModal: true });
            setIsNaoEntregue(true);
            setMotivoLocal('');
            setModalRefreshKey(k => k + 1);
            // focus will be attempted in the modal useEffect through motivoInputRef
        } catch (e) {
            console.warn('handleNaoEntregue: erro ao abrir modal de não entrega', e);
        }
    };

    // Função auxiliar: seleciona um pedido, centraliza mapa, abre sheet/modal conforme opções
    const selectPedido = useCallback((item, opts = { openModal: false, openTop: true }) => {
        try {
            lastSelectedRef.current = item;
            setPedidoSelecionado(item);

            // REMOVIDO: centralização de mapa comentada (colunas lat/lng não existem)
            // if (item?.lat && item?.lng) {
            //     const lat = Number(item.lat);
            //     const lng = Number(item.lng);
            //     try { mapRef.current?.animateToRegion({ latitude: lat, longitude: lng, latitudeDelta: 0.01, longitudeDelta: 0.01 }, 500); } catch (e) { /* ignore */ }
            // }

            // sobe a aba/sheet para o topo, se desejado
            if (opts.openTop) {
                try {
                    Animated.spring(sheetTranslateY, { toValue: TOP_Y, useNativeDriver: true }).start(() => {
                        lastSnapY.current = TOP_Y;
                        setIsAtTop(true);
                    });
                } catch (e) { /* ignore */ }
            }

            // abre modal de assinatura se solicitado
            if (opts.openModal) {
                setModalAssinatura(true);
                setModalRefreshKey(k => k + 1);
            }
        } catch (e) {
            console.warn('selectPedido: erro ao selecionar pedido:', e);
        }
    }, []);

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

            // Tenta atualizar o servidor com a ocorrência
            try {
                if (item?.id) {
                    const payload = {
                        status: 'falha',
                        observacoes: motivo
                    };
                    console.log('🔍 LOG SUPABASE (ocorrência) - Payload:', payload);
                    const { data: updateData, error: updateError } = await supabase.from('entregas').update(payload).eq('id', item.id);
                    console.log('🔍 LOG SUPABASE (ocorrência) - Resultado:', updateData, updateError);
                    if (updateError) {
                        console.error('🔴 ERRO SUPABASE:', updateError.message);
                    }
                }
            } catch (err) {
                console.error('❌ Exception ao reportar ocorrência:', err?.message || err);
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
            await playAlertSound('https://actions.google.com/sounds/v1/alarms/bugle_tune.ogg');
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
    // REMOVIDO: Centralização comentada (colunas lat/lng não existem)
    // useEffect(() => {
    //     const first = entregas && entregas[0];
    //     const id = first?.id;
    //     if (!id) return;
    //     if (prevFirstRef.current !== id) {
    //         prevFirstRef.current = id;
    //         if (first.lat && first.lng) {
    //             try {
    //                 mapRef.current?.animateToRegion({ latitude: Number(first.lat), longitude: Number(first.lng), latitudeDelta: 0.05, longitudeDelta: 0.05 }, 500);
    //             } catch (e) { /* ignore */ }
    //         }
    //     }
    // }, [entregas]);

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
        // Garantir que pedidos sem status no banco sejam tratados como 'pendente' no app
        item.status = item.status || 'pendente';
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

        // 1. Normalização dos dados com fallback para Entrega
        const tipoBruto = item.tipo || 'Entrega';
        const tipoLimpo = tipoBruto.toLowerCase().trim();

        // 2. Definição da Identidade Visual (Cores Sólidas Premium)
        let config = {
            corFundo: '#4A148C', // Lilás/Roxo Profundo
            corDestaque: '#6A1B9A',
            label: 'OUTROS',
            icone: 'cube-outline',
            iconeLib: 'Ionicons'
        };

        if (tipoLimpo.includes('entrega')) {
            config = {
                corFundo: '#0D47A1', // Azul Profundo
                corDestaque: '#1565C0',
                label: 'ENTREGA',
                icone: 'truck-delivery-outline',
                iconeLib: 'MaterialCommunityIcons'
            };
        } else if (tipoLimpo.includes('recolha') || tipoLimpo.includes('coleta')) {
            config = {
                corFundo: '#E65100', // Laranja Vibrante
                corDestaque: '#F57C00',
                label: 'RECOLHA',
                icone: 'archive-outline',
                iconeLib: 'Ionicons'
            };
        }

        const numeroExibicao = item.ordem_entrega || (idx + 1);

        // Estrutura FLAT: TouchableOpacity como raiz para estabilidade
        return (
            <TouchableOpacity
                key={item.id}
                activeOpacity={0.85}
                style={[
                    styles.cardModernV10,
                    { backgroundColor: config.corFundo },
                    (pedidoSelecionado?.id === item.id) ? styles.cardSelecionadoV10 : null
                ]}
                onPress={() => selectPedido(item)}
            >
                {/* Camada de Brilho Interno (Simula Vidro) */}
                <View style={styles.innerGlowV10} />

                {/* Cabeçalho do Card */}
                <View style={styles.headerRowV10}>
                    <View style={styles.headerLeftV10}>
                        <View style={[styles.typeBadgeV10, { backgroundColor: config.corDestaque }]}>
                            {config.iconeLib === 'MaterialCommunityIcons' ? (
                                <MaterialCommunityIcons name={config.icone} size={14} color="#FFF" />
                            ) : (
                                <Ionicons name={config.icone} size={14} color="#FFF" />
                            )}
                            <Text style={styles.typeLabelV10}>{config.label}</Text>
                        </View>
                        <View style={styles.numeroBadgeV10}>
                            <Text style={styles.numeroTextV10}>{numeroExibicao}º</Text>
                        </View>
                    </View>
                    <View style={styles.headerRightV10}>
                        <Text style={styles.idLabelV10}>#{item.id}</Text>
                        <TouchableOpacity
                            disabled={idx === 0}
                            onPress={() => moverPedido(idx, idx - 1)}
                            style={styles.arrowBtnV10}
                        >
                            <Text style={styles.arrowTextV10}>⬆️</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            disabled={idx === entregas.length - 1}
                            onPress={() => moverPedido(idx, idx + 1)}
                            style={styles.arrowBtnV10}
                        >
                            <Text style={styles.arrowTextV10}>⬇️</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Nome do Cliente - Destaque Absoluto */}
                <Text style={styles.clientTitleV10}>{item.cliente}</Text>

                {/* Observações (se existirem) */}
                {item.observacoes ? (
                    <View style={styles.observacoesIslandV10}>
                        <Ionicons name="information-circle" size={16} color="#FFD580" />
                        <Text style={styles.observacoesTextV10} numberOfLines={2}>
                            {item.observacoes}
                        </Text>
                    </View>
                ) : null}

                {/* Container de Endereço (Ilha de Leitura) */}
                <View style={styles.addressIslandV10}>
                    <Ionicons name="location" size={16} color="rgba(255,255,255,0.6)" />
                    <Text style={styles.addressTextV10} numberOfLines={2}>
                        {item.endereco || (item.rua ? `${item.rua}, ${item.numero || ''} ${item.bairro || ''}` : 'Endereço não disponível')}
                    </Text>
                </View>

                {/* Botões de Ação */}
                <View style={styles.actionContainerV10}>
                    {/* Botão de Navegação (GPS) - Circular e Destacado */}
                    <TouchableOpacity
                        style={styles.routeBtnV10}
                        onPress={() => {
                            // REMOVIDO: Verifica\u00e7\u00e3o de lat/lng comentada (colunas n\u00e3o existem)
                            // Abre navega\u00e7\u00e3o apenas pelo endere\u00e7o
                            abrirMapa(item?.endereco);
                        }}
                    >
                        <Ionicons name="navigate" size={24} color="#FFFFFF" />
                    </TouchableOpacity>

                    {/* Botões de Ação - Simetria Total */}
                    <View style={styles.actionRowV10}>
                        <TouchableOpacity
                            style={styles.confirmBtnV10}
                            onPress={() => handleAbrirFinalizacao(item)}
                        >
                            <Text style={styles.confirmBtnTextV10}>CONCLUIR</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.errorBtnV10}
                            onPress={() => handleNaoEntregue(item)}
                        >
                            <Ionicons name="alert-circle" size={20} color="#FFFFFF" />
                            <Text style={styles.errorBtnTextV10}>FALHA</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </TouchableOpacity>
        );
    }

    // Tela de loading durante inicialização
    if (loading) {
        return (
            <View style={{ flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#fff', fontSize: 18, marginBottom: 20 }}>Aguarde enquanto configuramos o sistema...</Text>
                <ActivityIndicator size="large" color="#fff" />
            </View>
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

            {/* Test button removed as per instructions */}

            {/* Simplified UI for Phase 1 testing: no Map, no modals. */}
            <View style={{ padding: 12 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
                    <View style={{ alignItems: 'center' }}><Text>Entregas</Text><Text style={{ fontWeight: 'bold' }}>{totalEntregas}</Text></View>
                    <View style={{ alignItems: 'center' }}><Text>Recolhas</Text><Text style={{ fontWeight: 'bold' }}>{totalRecolhas}</Text></View>
                    <View style={{ alignItems: 'center' }}><Text>Outros</Text><Text style={{ fontWeight: 'bold' }}>{totalOutros}</Text></View>
                </View>
            </View>

            {/* Map temporariamente desativado - colunas lat/lng não existem no schema */}
            {/* Placeholder temporário para testes sem Google Maps */}
            <View style={[styles.map, { backgroundColor: '#333', alignItems: 'center', justifyContent: 'center' }]}>
                <Text style={{ color: '#fff', fontSize: 16, fontWeight: 'bold' }}>📍 Mapa desativado</Text>
                <Text style={{ color: '#aaa', fontSize: 12, marginTop: 8 }}>Configure coordenadas no banco de dados</Text>
            </View>

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
                                    {/* 🔽 ARQUITETURA UX PREMIUM - MODAL DE FALHA */}

                                    {/* TOPO: TextInput para entrada manual */}
                                    <Text style={styles.failureModalLabel}>Motivo da Falha</Text>
                                    <TextInput
                                        ref={motivoInputRef}
                                        value={motivoLocal}
                                        onChangeText={setMotivoLocal}
                                        placeholder="Digite ou selecione um motivo abaixo..."
                                        placeholderTextColor="rgba(255,255,255,0.5)"
                                        style={styles.failureInputField}
                                        multiline
                                        numberOfLines={3}
                                        returnKeyType="done"
                                        autoFocus={false}
                                    />

                                    {/* MEIO: Opções Rápidas (Chips) */}
                                    <Text style={styles.failureChipsLabel}>Seleção Rápida</Text>
                                    <View style={styles.failureChipsContainer}>
                                        {motivosRapidos.map((motivo, index) => {
                                            const isSelected = motivoLocal === motivo;
                                            return (
                                                <TouchableOpacity
                                                    key={motivo + '_' + index}
                                                    style={[
                                                        styles.failureChipBtn,
                                                        isSelected && styles.failureChipBtnSelected
                                                    ]}
                                                    onPress={() => {
                                                        setMotivoLocal(motivo);
                                                    }}
                                                >
                                                    <Text style={[
                                                        styles.failureChipText,
                                                        isSelected && styles.failureChipTextSelected
                                                    ]}>
                                                        {motivo}
                                                    </Text>
                                                </TouchableOpacity>
                                            );
                                        })}
                                    </View>

                                    {/* BASE: Botões de Ação */}
                                    <View style={styles.failureActionsRow}>
                                        <TouchableOpacity
                                            style={styles.failureBtnCancel}
                                            onPress={() => {
                                                setModalAssinatura(false);
                                                setMotivoLocal('');
                                                setIsNaoEntregue(false);
                                            }}
                                        >
                                            <Text style={styles.failureBtnCancelText}>VOLTAR</Text>
                                        </TouchableOpacity>

                                        <TouchableOpacity
                                            style={styles.failureBtnConfirm}
                                            onPress={() => {
                                                if (!motivoLocal.trim()) {
                                                    alert('Por favor, digite ou selecione um motivo!');
                                                    return;
                                                }
                                                handleConfirmNaoEntregue(motivoLocal);
                                            }}
                                        >
                                            <Text style={styles.failureBtnConfirmText}>CONFIRMAR</Text>
                                        </TouchableOpacity>
                                    </View>
                                </>
                            ) : (
                                <>
                                    {/* � REGISTRO RÁPIDO V10 - CAMPO DE RECEBEDOR COM AUTOCOMPLETE */}
                                    <View style={styles.categoryContainer}>
                                        <Text style={styles.categoryLabel}>QUEM ESTÁ RECEBENDO?</Text>

                                        {/* GRADE DE CATEGORIAS (4 botões) */}
                                        <View style={styles.categoryChipsContainer}>
                                            {['Porteiro', 'Zelador', 'Faxineira', 'Morador'].map((cat) => (
                                                <TouchableOpacity
                                                    key={cat}
                                                    style={[
                                                        styles.categoryChipBtn,
                                                        categoria === cat && styles.categoryChipBtnSelected
                                                    ]}
                                                    onPress={() => setCategoria(cat)}
                                                >
                                                    <Text style={[
                                                        styles.categoryChipText,
                                                        categoria === cat && styles.categoryChipTextSelected
                                                    ]}>
                                                        {cat.toUpperCase()}
                                                    </Text>
                                                </TouchableOpacity>
                                            ))}
                                        </View>

                                        {/* INPUT DE NOME (ESCURO) */}
                                        <TextInput
                                            value={nome}
                                            onChangeText={(t) => setNome(t)}
                                            placeholder="Nome de quem recebeu"
                                            placeholderTextColor="#666"
                                            style={styles.categoryInputNome}
                                            returnKeyType="done"
                                            autoCapitalize="words"
                                            autoFocus={true}
                                        />

                                        {/* CAMPO APARTAMENTO (CONDICIONAL - SÓ MORADOR) */}
                                        {categoria === 'Morador' && (
                                            <TextInput
                                                value={apto}
                                                onChangeText={(t) => setApto(t)}
                                                placeholder="Número do Apartamento"
                                                placeholderTextColor="#666"
                                                keyboardType="numeric"
                                                style={styles.categoryInputApto}
                                                returnKeyType="done"
                                            />
                                        )}

                                        {/* INFORMAÇÃO DE GPS */}
                                        <View style={styles.gpsInfoContainer}>
                                            <Ionicons name="location" size={16} color="#1B5E20" />
                                            <Text style={styles.gpsInfoText}>
                                                Ao confirmar, sua localização será registrada automaticamente
                                            </Text>
                                        </View>
                                    </View>
                                </>
                            )}
                        </View>

                        {/* 🔘 BOTÕES PREMIUM - BASE DO MODAL */}
                        <View style={styles.modalFooterPremium}>
                            {isNaoEntregue ? (
                                <>
                                    <TouchableOpacity
                                        style={styles.btnModalVoltar}
                                        onPress={() => {
                                            setModalAssinatura(false);
                                            setCategoria('');
                                            setNome('');
                                            setApto('');
                                            setMotivoLocal('');
                                            setIsNaoEntregue(false);
                                            setMostrarInputOutro(false);
                                        }}
                                    >
                                        <Text style={styles.btnModalVoltarText}>VOLTAR</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={styles.btnModalFinalizar}
                                        onPress={() => { handleConfirmNaoEntregue(); }}
                                    >
                                        <Ionicons name="alert-circle" size={22} color="#FFF" />
                                        <Text style={styles.btnModalFinalizarText}>ENVIAR MOTIVO</Text>
                                    </TouchableOpacity>
                                </>
                            ) : (
                                <>
                                    <TouchableOpacity
                                        style={styles.btnModalVoltar}
                                        onPress={() => {
                                            setModalAssinatura(false);
                                            setCategoria('');
                                            setNome('');
                                            setApto('');
                                            setMotivoLocal('');
                                            setIsNaoEntregue(false);
                                            setMostrarInputOutro(false);
                                        }}
                                    >
                                        <Text style={styles.btnModalVoltarText}>VOLTAR</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={styles.btnModalFinalizar}
                                        onPress={() => { handleFinalizar(); }}
                                    >
                                        <Ionicons name="checkmark-circle" size={22} color="#FFF" />
                                        <Text style={styles.btnModalFinalizarText}>FINALIZAR</Text>
                                    </TouchableOpacity>
                                </>
                            )}
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Overlay de alerta vermelho (tela cheia - toque para parar) */}
            {alertaVisivel && (
                <TouchableOpacity
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        backgroundColor: 'rgba(255, 0, 0, 0.85)',
                        zIndex: 99999,
                        elevation: 99999,
                        justifyContent: 'center',
                        alignItems: 'center',
                    }}
                    onPress={pararAlerta}
                    activeOpacity={0.9}
                >
                    <Text style={{ color: '#FFF', fontSize: 32, fontWeight: 'bold', textAlign: 'center' }}>
                        🚨{"\n"}
                        ALERTA DE ENTREGA{"\n"}
                        {"\n"}
                        Toque para parar
                    </Text>
                </TouchableOpacity>
            )}

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
        width: '95%',
        height: '90%',
        backgroundColor: '#FFF',
        borderRadius: 25,
        padding: 15,
        borderWidth: 1.5, // ✅ Borda para profundidade
        borderColor: 'rgba(0, 0, 0, 0.15)',
        elevation: 20, // ✅ Elevação máxima (destaque total)
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.5,
        shadowRadius: 20,
        alignItems: 'center',
    },
    quickReasonList: { marginTop: 8, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
    quickReasonBtn: { backgroundColor: '#f2f2f2', paddingVertical: 12, paddingHorizontal: 10, borderRadius: 8, width: '48%', marginBottom: 10, alignItems: 'center', justifyContent: 'center' },
    quickReasonText: { color: '#333', fontSize: 14, textAlign: 'center' },

    // 🎨 MODAL DE FALHA - LAYOUT EM CAIXA COM PROFUNDIDADE
    failureModalLabel: {
        color: '#FFFFFF', // ✅ Branco puro
        fontSize: 15,
        fontWeight: '900', // ✅ Negrito (ultra bold)
        marginBottom: 10,
        letterSpacing: 1.2,
        textTransform: 'uppercase',
    },
    failureInputField: {
        backgroundColor: '#000000', // ✅ Preto sólido (máximo contraste)
        borderWidth: 1.5,
        borderColor: 'rgba(255, 255, 255, 0.2)', // ✅ Borda de vidro visível
        borderRadius: 12,
        padding: 14,
        color: '#FFFFFF', // ✅ Texto branco
        fontSize: 15,
        fontWeight: '500',
        minHeight: 85,
        textAlignVertical: 'top',
        marginBottom: 22,
    },
    failureChipsLabel: {
        color: '#B0B0B0', // ✅ Cinza claro visível
        fontSize: 13,
        fontWeight: '700',
        marginBottom: 12,
        textTransform: 'uppercase',
        letterSpacing: 1.5,
    },
    failureChipsContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between', // ✅ Alinhamento nas bordas
        marginBottom: 24,
    },
    failureChipBtn: {
        backgroundColor: '#333333', // ✅ Grafite (aceso)
        borderWidth: 1.5,
        borderColor: 'rgba(255, 255, 255, 0.5)', // ✅ Borda branca MUITO visível
        borderRadius: 10,
        paddingVertical: 13,
        paddingHorizontal: 12,
        width: '48%', // ✅ Duas colunas exatas
        minHeight: 48, // ✅ Altura mínima para estabilidade
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 10, // ✅ Espaçamento vertical entre linhas
        elevation: 3, // ✅ Profundidade nos chips inativos
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.4,
        shadowRadius: 3,
    },
    failureChipBtnSelected: {
        backgroundColor: '#D32F2F', // ✅ Vermelho vibrante V10
        borderColor: '#FFFFFF', // ✅ Borda branca pura (brilho)
        borderWidth: 2, // ✅ Borda mais grossa quando selecionado
        elevation: 6, // ✅ Profundidade máxima quando ativo
        shadowOpacity: 0.6,
        shadowRadius: 5,
    },
    failureChipText: {
        color: '#FFFFFF', // ✅ Branco puro
        fontSize: 13, // ✅ Ajustado para caber em 2 colunas
        fontWeight: '700', // ✅ Bold para contraste
        textAlign: 'center',
        lineHeight: 18, // ✅ Permite múltiplas linhas sem corte
        letterSpacing: 0.2,
        flexShrink: 1, // ✅ Permite compressão do texto
    },
    failureChipTextSelected: {
        color: '#FFFFFF', // ✅ Permanece branco (já tem contraste pelo fundo vermelho)
        fontWeight: '700',
    },
    failureActionsRow: {
        flexDirection: 'row',
        gap: 12,
        marginTop: 8,
    },
    failureBtnCancel: {
        flex: 1,
        backgroundColor: '#2C2C2C', // ✅ Cinza escuro (visível)
        borderRadius: 12,
        paddingVertical: 15,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1.5,
        borderColor: 'rgba(255, 255, 255, 0.15)',
        elevation: 4,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
    },
    failureBtnCancelText: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '700',
        letterSpacing: 1.2,
    },
    failureBtnConfirm: {
        flex: 1,
        backgroundColor: '#D32F2F', // ✅ Vermelho vibrante V10
        borderRadius: 12,
        paddingVertical: 15,
        alignItems: 'center',
        justifyContent: 'center',
        elevation: 6, // ✅ Profundidade para botão primário
        shadowColor: '#D32F2F',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.5,
        shadowRadius: 6,
    },
    failureBtnConfirmText: {
        color: '#FFF',
        fontSize: 14,
        fontWeight: '900',
        letterSpacing: 1,
    },

    // � REGISTRO RÁPIDO V10 - CAMPO DE RECEBEDOR COM AUTOCOMPLETE
    // 📦 SISTEMA DE CATEGORIAS V10
    categoryContainer: {
        width: '100%',
        paddingTop: 8,
    },
    categoryLabel: {
        color: '#1B5E20',
        fontSize: 16,
        fontWeight: '900',
        marginBottom: 12,
        letterSpacing: 1.5,
        textTransform: 'uppercase',
    },
    categoryInputNome: {
        backgroundColor: '#1A1A1A',
        borderWidth: 2,
        borderColor: '#444',
        borderRadius: 12,
        padding: 16,
        fontSize: 17,
        fontWeight: '600',
        color: '#FFFFFF',
        marginBottom: 12,
    },
    categoryChipsContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
        marginBottom: 16,
    },
    categoryChipBtn: {
        width: '48%',
        backgroundColor: '#333',
        borderWidth: 2,
        borderColor: 'rgba(255, 255, 255, 0.5)',
        borderRadius: 10,
        paddingVertical: 13,
        alignItems: 'center',
        justifyContent: 'center',
    },
    categoryChipBtnSelected: {
        backgroundColor: '#1B5E20',
        borderColor: '#FFFFFF',
    },
    categoryChipText: {
        color: '#FFFFFF',
        fontSize: 13,
        fontWeight: '700',
        letterSpacing: 1,
    },
    categoryChipTextSelected: {
        color: '#FFFFFF',
        fontWeight: '900',
    },
    categoryInputApto: {
        backgroundColor: '#1A1A1A',
        borderWidth: 2,
        borderColor: '#444',
        borderRadius: 12,
        padding: 14,
        fontSize: 15,
        color: '#FFFFFF',
        marginBottom: 12,
    },

    gpsInfoContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginTop: 16,
        paddingVertical: 10,
        paddingHorizontal: 14,
        backgroundColor: 'rgba(27, 94, 32, 0.08)',
        borderRadius: 10,
        borderLeftWidth: 4,
        borderLeftColor: '#1B5E20',
    },
    gpsInfoText: {
        flex: 1,
        color: '#1B5E20',
        fontSize: 12,
        fontWeight: '600',
        lineHeight: 18,
    },

    // 🔘 BOTÕES PREMIUM DO MODAL - V10
    modalFooterPremium: {
        flexDirection: 'row',
        gap: 12,
        width: '100%',
        paddingTop: 20,
    },
    btnModalVoltar: {
        flex: 1,
        backgroundColor: '#6B6B6B',
        borderRadius: 14,
        paddingVertical: 18,
        alignItems: 'center',
        justifyContent: 'center',
        elevation: 6,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.4,
        shadowRadius: 5,
    },
    btnModalVoltarText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '900',
        letterSpacing: 1.5,
    },
    btnModalFinalizar: {
        flex: 2,
        flexDirection: 'row',
        gap: 10,
        backgroundColor: '#1B5E20',
        borderRadius: 14,
        paddingVertical: 18,
        alignItems: 'center',
        justifyContent: 'center',
        elevation: 8,
        shadowColor: '#1B5E20',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.5,
        shadowRadius: 6,
    },
    btnModalFinalizarText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '900',
        letterSpacing: 1.5,
    },

    // 🔘 BOTÕES DE CONCLUSÃO DE ENTREGA V10 (LEGADO)
    deliveryBtnCancel: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        backgroundColor: '#6B6B6B', // Cinza
        borderRadius: 14,
        paddingVertical: 16,
        marginRight: 8,
        elevation: 4,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
    },
    deliveryBtnCancelText: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '700',
        letterSpacing: 1,
    },
    deliveryBtnConfirm: {
        flex: 2,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        backgroundColor: '#1B5E20', // ✅ Verde V10
        borderRadius: 14,
        paddingVertical: 16,
        elevation: 6,
        shadowColor: '#1B5E20',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.5,
        shadowRadius: 6,
    },
    deliveryBtnFailure: {
        flex: 2,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        backgroundColor: '#D32F2F', // Vermelho
        borderRadius: 14,
        paddingVertical: 16,
        elevation: 6,
        shadowColor: '#D32F2F',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.5,
        shadowRadius: 6,
    },
    deliveryBtnText: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '900',
        letterSpacing: 1.2,
    },

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

    // ========== ESTILOS V10 ULTRA-MODERNOS (ESTRUTURA FLAT ESTÁVEL) ==========
    cardModernV10: {
        marginHorizontal: 16,
        marginVertical: 12,
        borderRadius: 28,
        padding: 22,
        overflow: 'hidden',
        borderWidth: 1.5,
        borderColor: 'rgba(255, 255, 255, 0.15)', // Borda de vidro
        // Elevação profunda Android
        elevation: 12,
        // Sombra profunda iOS
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.4,
        shadowRadius: 10,
    },
    cardSelecionadoV10: {
        elevation: 16,
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.5,
        shadowRadius: 14,
        transform: [{ scale: 1.02 }],
        borderColor: 'rgba(255, 255, 255, 0.25)',
    },
    innerGlowV10: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: '40%',
        backgroundColor: 'rgba(255, 255, 255, 0.05)', // Brilho interno sutil
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
    },
    headerRowV10: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 18,
        zIndex: 1,
    },
    headerLeftV10: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    headerRightV10: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    typeBadgeV10: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 12,
        gap: 6,
    },
    typeLabelV10: {
        color: '#FFF',
        fontSize: 11,
        fontWeight: '900',
        letterSpacing: 1.2,
    },
    numeroBadgeV10: {
        backgroundColor: 'rgba(255, 255, 255, 0.15)',
        paddingVertical: 4,
        paddingHorizontal: 10,
        borderRadius: 10,
    },
    numeroTextV10: {
        color: '#FFF',
        fontSize: 13,
        fontWeight: '800',
    },
    idLabelV10: {
        color: 'rgba(255, 255, 255, 0.35)',
        fontSize: 12,
        fontWeight: 'bold',
    },
    arrowBtnV10: {
        paddingHorizontal: 4,
        paddingVertical: 2,
    },
    arrowTextV10: {
        fontSize: 16,
    },
    clientTitleV10: {
        color: '#FFF',
        fontSize: 24,
        fontWeight: '800',
        marginBottom: 14,
        letterSpacing: -0.8,
        zIndex: 1,
    },
    observacoesIslandV10: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255, 213, 128, 0.15)',
        padding: 12,
        borderRadius: 16,
        marginBottom: 12,
        gap: 8,
        zIndex: 1,
    },
    observacoesTextV10: {
        color: '#FFD580',
        fontSize: 13,
        lineHeight: 19,
        flex: 1,
        fontStyle: 'italic',
    },
    addressIslandV10: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.25)', // Ilha de leitura mais escura
        padding: 14,
        borderRadius: 20,
        marginBottom: 22,
        gap: 10,
        zIndex: 1,
    },
    addressTextV10: {
        color: 'rgba(255, 255, 255, 0.75)',
        fontSize: 14,
        lineHeight: 20,
        flex: 1,
        fontWeight: '500',
    },
    actionContainerV10: {
        flexDirection: 'column',
        gap: 12,
        zIndex: 1,
    },
    actionRowV10: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        zIndex: 1,
    },
    routeBtnV10: {
        width: 64,
        height: 64,
        backgroundColor: '#007AFF', // Azul Royal
        borderRadius: 32, // Circular perfeito
        justifyContent: 'center',
        alignItems: 'center',
        alignSelf: 'center', // Centraliza o botão
        elevation: 8,
        shadowColor: '#007AFF',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.5,
        shadowRadius: 10,
    },
    confirmBtnV10: {
        backgroundColor: '#FFFFFF', // Branco sólido
        flex: 1, // Simetria total
        height: 56,
        borderRadius: 18,
        justifyContent: 'center',
        alignItems: 'center',
        elevation: 6,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.2,
        shadowRadius: 6,
    },
    confirmBtnTextV10: {
        color: '#000', // Texto preto
        fontWeight: '900',
        fontSize: 14,
        letterSpacing: 1,
    },
    errorBtnV10: {
        backgroundColor: '#D32F2F', // Vermelho sólido
        flex: 1, // Simetria total
        height: 56,
        borderRadius: 18,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 6,
        elevation: 6,
        shadowColor: '#D32F2F',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.3,
        shadowRadius: 6,
    },
    errorBtnTextV10: {
        color: '#FFFFFF', // Texto branco
        fontWeight: '900',
        fontSize: 14,
        letterSpacing: 1,
    },
});

export default DeliveryApp;

