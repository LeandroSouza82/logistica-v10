import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
    StyleSheet, Text, View, TouchableOpacity, Pressable, Animated, Modal, Image,
    Dimensions, Linking, FlatList, TextInput, Alert, StatusBar, Platform, UIManager, LayoutAnimation, PanResponder, Easing, ActionSheetIOS
} from 'react-native';

// Dynamic imports for optional native modules
import * as ImagePicker from 'expo-image-picker';
let FileSystem; try { FileSystem = require('expo-file-system'); } catch (e) { FileSystem = null; console.warn('expo-file-system não disponível.'); }

// Número do gestor/patrão (substitua pelo número real)
const BOSS_PHONE = '+5511999999999';
import MapView, { Marker } from 'react-native-maps';
import SignatureScreen from 'react-native-signature-canvas';
import * as Location from 'expo-location'; // Biblioteca para o GPS
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
export default function DeliveryApp(props) {
    // Número padrão do motorista (use seu número real em produção ou carregue via config)
    const MOTORISTA_PHONE = '+5511999999999';
    // Telefone do gestor para receber ocorrências (pode ser passado via props)
    const GESTOR_PHONE = props?.gestorPhone || '+5511999999999';

    const [pedidos, setPedidos] = useState([]);

    // Contadores dinâmicos do resumo (entregas / recolhas) conforme solicitado
    const totalEntregas = pedidos.filter(p => String(p.tipo).toLowerCase().includes('entreg')).length;
    const totalRecolhas = pedidos.filter(p => String(p.tipo).toLowerCase().includes('recolh')).length;

    // Carrega pedidos salvos localmente (se existirem) ou usa fallback para dev
    useEffect(() => {
        (async () => {
            try {
                if (AsyncStorage) {
                    const raw = await AsyncStorage.getItem('@rota_pedidos');
                    if (raw) {
                        const parsed = JSON.parse(raw);
                        setPedidos(parsed);
                        return;
                    }
                } else {
                    console.warn('AsyncStorage não disponível; carregando fallback.');
                }
            } catch (e) { console.warn('Erro ao ler pedidos do AsyncStorage:', e); }

            // fallback de dev (somente se não houver nada salvo)
            setPedidos([
                { id: 1, cliente: 'Leandro (Coleta)', status: 'pendente', lat: -27.596, lng: -48.546, tipo_servico: 'Recolha', driverPhone: '+5511987654321' },
                { id: 2, cliente: 'João Silva', status: 'pendente', lat: -27.600, lng: -48.550, tipo_servico: 'Entrega', driverPhone: '+5511976543210' },
            ]);
        })();
    }, []);

    // Persiste a ordem/estado sempre que 'pedidos' mudar
    useEffect(() => {
        (async () => {
            if (!AsyncStorage) return; // sem persistência se não instalado
            try {
                await AsyncStorage.setItem('@rota_pedidos', JSON.stringify(pedidos));
            } catch (e) { console.warn('Erro ao salvar pedidos no AsyncStorage:', e); }
        })();
    }, [pedidos]);

    const mapRef = useRef(null); // Referência para controlar a câmera do mapa

    const [modalAssinatura, setModalAssinatura] = useState(false);
    const [modalOcorrencia, setModalOcorrencia] = useState(false);
    const [pedidoSelecionado, setPedidoSelecionado] = useState(null);
    const [textoOcorrencia, setTextoOcorrencia] = useState('');
    const [outroSelected, setOutroSelected] = useState(false);
    const inputOcorrenciaRef = useRef(null);



    // LISTENER REALTIME: atualiza a posição quando o Supabase enviar updates (mesma frequência do banco)
    useEffect(() => {
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
                        setPedidos(prev => {
                            // evita duplicata
                            if (prev.some(p => Number(p.id) === Number(normalized.id))) return prev;
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
                        setPedidos(prev => prev.map(p => (Number(p.id) === Number(normalized.id) ? { ...p, ...normalized } : p)));
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
                        console.log('Realtime DELETE entrega para este motorista:', old);
                        setPedidos(prev => prev.filter(p => Number(p.id) !== Number(old.id)));
                    } catch (e) {
                        console.warn('Erro ao processar DELETE em entregas (mobile):', e?.message || e);
                    }
                }
            )
            .subscribe();

        // Busca inicial de entregas atribuídas ao motorista (por padrão 1) desde o início do dia UTC
        (async () => {
            try {
                const motoristaId = 1;
                const hoje = new Date();
                hoje.setUTCHours(0, 0, 0, 0);
                const dataHoje = hoje.toISOString();
                const { data: initial, error: initialErr } = await supabase.from('entregas').select('*').eq('motorista_id', motoristaId).gte('criado_em', dataHoje).order('id', { ascending: false }).limit(50);
                if (initialErr) {
                    console.warn('Erro ao buscar entregas iniciais (mobile):', initialErr.message || initialErr);
                } else if (initial) {
                    // Mostra um exemplo de linha para ajudar debug de nomes de colunas e formato
                    try { console.log('Dados do Banco (exemplo):', initial[0]); } catch (e) { /* ignore */ }

                    // normalize tipo_servico and ensure strings
                    const normalized = initial.map(i => normalizePedido(i));

                    // Se o usuário já reordenou a lista localmente, não destruímos a ordem: apenas atualizamos os itens existentes e anexamos novos
                    setPedidos(prev => {
                        try {
                            if (prev && prev.length > 0 && userReorderedRef.current) {
                                console.log('Mesclando pedidos do servidor preservando ordem local');
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
                            console.warn('Erro ao mesclar pedidos iniciais:', e);
                            return normalized;
                        }
                    });
                }
            } catch (err) {
                console.warn('Erro ao buscar entregas iniciais (mobile):', err?.message || err);
            }
        })();

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
        if (!centeredOnceRef.current && pedidos && pedidos.length > 0) {
            const first = pedidos[0];
            if (first?.lat && first?.lng) {
                const lat = Number(first.lat);
                const lng = Number(first.lng);
                try { mapRef.current?.animateToRegion({ latitude: lat, longitude: lng, latitudeDelta: 0.05, longitudeDelta: 0.05 }, 600); } catch (e) { /* ignore */ }
            }
            centeredOnceRef.current = true;
        }
    }, [pedidos]);

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
    // evita enviar atualizações ao Supabase mais de 1 vez por segundo
    const lastUpdateRef = useRef(0);
    // referência para a subscription do Location.watchPositionAsync
    const locationSubscriptionRef = useRef(null);
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

    // Teste de conexão com Supabase: atualiza motorista id=1 (apenas para teste)
    useEffect(() => {
        const testarConexao = async () => {
            try {
                const motoristaId = props?.motoristaId ?? 1;
                const { data, error } = await supabase
                    .from('motoristas')
                    .update({ nome: `Leandro - Moto ${motoristaId}` })
                    .eq('id', motoristaId);

                if (error) console.log('Erro ao conectar:', error.message);
                else console.log('Conectado ao Supabase com sucesso!', data);
            } catch (e) {
                console.log('Exception ao testar Supabase:', e.message || e);
            }
        };

        testarConexao();
    }, []);

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

        setPedidos(prev => {
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

    const confirmarEntrega = async (item = null) => {
        const target = item || pedidoSelecionado;
        if (!target) return;

        const lat = posicaoMotorista && posicaoMotorista.latitude != null ? Number(posicaoMotorista.latitude) : null;
        const lng = posicaoMotorista && posicaoMotorista.longitude != null ? Number(posicaoMotorista.longitude) : null;

        // 1º: Remove o card da tela imediatamente (optimistic UI) — usa pedidoSelecionado.id conforme solicitado
        try {
            setPedidos(prevPedidos => prevPedidos.filter(p => p.id !== (pedidoSelecionado && pedidoSelecionado.id)));
            setModalAssinatura(false);
            console.log('Removido localmente pedido:', pedidoSelecionado?.id);
        } catch (e) { /* ignore */ }

        // 2º: Tenta atualizar o servidor em segundo plano; se falhar, registra silenciosamente
        const publicUrl = target.assinatura_url || target.assinatura || null;
        try {
            const { data, error } = await callWithTimeout(
                supabase
                    .from('entregas')
                    .update({ status: 'concluido', assinatura_url: publicUrl, lat_entrega: lat, lng_entrega: lng })
                    .eq('id', target.id),
                30000
            );

            if (error) {
                console.log('Erro silencioso no servidor (status update):', error);
                return;
            }

            console.log('Status atualizado no Supabase:', data);
        } catch (err) {
            console.log('Erro silencioso no servidor (exceção):', err);
        }
    };

    // Handler quando a assinatura foi capturada (img é dataURL)
    const handleSignatureOk = async (imgDataUrl) => {
        if (!pedidoSelecionado) {
            Alert.alert('Erro', 'Nenhum pedido selecionado para receber a assinatura.');
            return;
        }

        try {
            // atribui assinatura ao pedido selecionado em memória (salva também em assinatura_url para compatibilidade)
            const assinaturaBase64 = imgDataUrl;
            setPedidos(prev => prev.map(p => (p.id === pedidoSelecionado.id ? { ...p, assinatura: assinaturaBase64, assinatura_url: assinaturaBase64 } : p)));

            // chama confirmarEntrega imediatamente com o item atualizado
            await confirmarEntrega({ ...pedidoSelecionado, assinatura: assinaturaBase64, assinatura_url: assinaturaBase64 });

            // feedback adicional (confirmarEntrega já mostra alert)
        } catch (err) {
            console.error('Erro ao salvar assinatura e confirmar:', err?.message || err);
            Alert.alert('Erro', 'Não foi possível salvar a assinatura. Tente novamente.');
        } finally {
            setModalAssinatura(false);
            setPedidoSelecionado(null);
        }
    };

    // Function to take photo using ImagePicker (expo)
    const tirarFoto = async (item) => {
        if (!ImagePicker) {
            Alert.alert('Erro', 'Camera não disponível. Instale expo-image-picker.');
            return;
        }
        try {
            const perm = await ImagePicker.requestCameraPermissionsAsync();
            if (perm.status !== 'granted') {
                Alert.alert('Permissão', 'Permissão de câmera negada.');
                return;
            }
            const res = await ImagePicker.launchCameraAsync({ quality: 0.7 });
            if (res.cancelled) return;
            const uri = res.uri;

            // try to read file as base64
            if (!FileSystem) {
                Alert.alert('Erro', 'FileSystem não disponível para leitura de imagem.');
                return;
            }
            const b64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
            const dataUrl = `data:image/jpeg;base64,${b64}`;

            // update supabase field foto_entrega (and assinatura_url for compatibility)
            try {
                const { data, error } = await supabase.from('entregas').update({ foto_entrega: dataUrl, assinatura_url: dataUrl }).eq('id', item.id);
                if (error) throw error;
                // update local state (salva também em assinatura_url para compatibilidade)
                setPedidos(prev => prev.map(p => p.id === item.id ? { ...p, foto_entrega: dataUrl, assinatura_url: dataUrl } : p));
                Alert.alert('Sucesso', 'Foto salva.');
            } catch (e) {
                console.error('Erro ao enviar foto para Supabase:', e);
                // still update local state so user sees photo (and save to assinatura_url locally)
                setPedidos(prev => prev.map(p => p.id === item.id ? { ...p, foto_entrega: dataUrl, assinatura_url: dataUrl } : p));
                Alert.alert('Aviso', 'Foto salva localmente, falha ao enviar ao servidor.');
            }
        } catch (err) {
            console.error('Erro ao tirar foto:', err);
            Alert.alert('Erro', 'Não foi possível tirar a foto.');
        }
    };


    // LOGICA PARA PEGAR A LOCALIZAÇÃO REAL EM TEMPO REAL
    useEffect(() => {
        mountedRef.current = true;
        (async () => {
            let { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert('Erro', 'Precisamos da permissão de localização para rastrear!');
                return;
            }

            // 'watchPositionAsync' atualiza a moto conforme o motorista se move
            const subscription = await Location.watchPositionAsync(
                {
                    accuracy: Location.Accuracy.High,
                    timeInterval: 5000,
                    distanceInterval: 1,
                },
                (location) => {
                    const coords = {
                        latitude: location.coords.latitude,
                        longitude: location.coords.longitude,
                    };

                    // Preferir o heading fornecido pelo dispositivo (se existir), senão calcular pelo bearing
                    const deviceHeading = (typeof location.coords.heading === 'number') ? location.coords.heading : null;
                    let finalHeading = deviceHeading;

                    if (finalHeading === null && prevPosRef.current) {
                        const b = calculateBearing(prevPosRef.current.latitude, prevPosRef.current.longitude, coords.latitude, coords.longitude);
                        finalHeading = b;
                    }

                    if (finalHeading !== null) {
                        setHeading(finalHeading);
                    }

                    prevPosRef.current = coords;
                    // Armazenamos também o heading na posição para usos futuros
                    setPosicaoMotorista({ ...coords, heading: finalHeading });

                    // FAZ O MAPA SEMPRE CENTRALIZAR NO MOTORISTA
                    try {
                        mapRef.current?.animateToRegion({
                            latitude: coords.latitude,
                            longitude: coords.longitude,
                            latitudeDelta: 0.01,
                            longitudeDelta: 0.01,
                        }, 1000);
                    } catch (e) {
                        // falha silenciosa se a ref não existir
                    }

                    // Envia posição ao Supabase (forçando id=1)
                    enviarPosicao(location.coords);
                }
            );

            locationSubscriptionRef.current = subscription;
            setTrackingActive(true);
        })();

        return () => {
            mountedRef.current = false;
            // remove listener se existir
            try { locationSubscriptionRef.current?.remove?.(); } catch (e) { /* ignore */ }
            locationSubscriptionRef.current = null;
            // limpa timer agendado de logout se houver
            if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
        };
    }, []);

    // Estado para controle manual de rastreio (botão)
    // Forçando rastreio ativo por padrão para testes
    const [trackingActive, setTrackingActive] = useState(true);

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

    const handleOcorrenciaChoice = async (motivo, item) => {
        try {
            // pega coords atuais no momento do envio
            let coords = null;
            try { const l = await Location.getCurrentPositionAsync(); coords = { latitude: l.coords.latitude, longitude: l.coords.longitude }; } catch (e) { /* ignore */ }

            // Remove o pedido localmente (optimistic) para atualizar contadores imediatamente
            try { setPedidos(prev => prev.filter(p => Number(p.id) !== Number(item?.id))); } catch (e) { /* ignore */ }

            // Tenta atualizar o servidor com a ocorrência (silencioso se falhar)
            (async () => {
                try {
                    if (item?.id) {
                        await supabase.from('entregas').update({ status: 'nao_entregue', ocorrencia: motivo, lat_entrega: coords?.latitude ?? item.lat, lng_entrega: coords?.longitude ?? item.lng }).eq('id', item.id);
                    }
                } catch (err) { console.warn('Erro ao reportar ocorrência ao servidor:', err?.message || err); }
            })();

            await abrirWhatsApp(motivo, item, coords, BOSS_PHONE);

            // Fecha modal e limpa estado
            setModalOcorrencia(false);
            setTextoOcorrencia('');
            setOutroSelected(false);
            setPedidoSelecionado(null);
        } catch (e) { console.warn('Erro ao processar ocorrência rápida:', e); }
    };

    const abrirWhatsApp = async (motivo, item = null, coords = null, phoneOverride = null) => {
        const pedido = item || pedidoSelecionado;
        if (!pedido) {
            Alert.alert('Erro', 'Nenhum pedido selecionado para reportar.');
            return;
        }
        const phone = (phoneOverride || GESTOR_PHONE || BOSS_PHONE || '').replace(/[^0-9]/g, '');
        const lat = coords?.latitude ?? pedido.lat ?? '';
        const lng = coords?.longitude ?? pedido.lng ?? '';
        const maps = (lat && lng) ? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}` : 'Localização não disponível';
        // Mensagem com emojis conforme pedido
        const text = `🚨 Motorista: Leandro\n👤 Cliente: ${pedido.cliente}\n📍 Local: ${maps}\nMotivo: ${motivo}`;
        const url = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
        try {
            await Linking.openURL(url);
            // Fecha modal e limpa campos
            setModalOcorrencia(false);
            setTextoOcorrencia('');
            setOutroSelected(false);
            setPedidoSelecionado(null);
        } catch (err) {
            console.warn('Erro ao abrir WhatsApp:', err);
            Alert.alert('Erro', 'Não foi possível abrir o WhatsApp.');
        }
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
        setPedidos(prev => {
            const novoRoteiro = [...prev]; // cria novo array para forçar rerender
            if (toIndex < 0 || toIndex >= novoRoteiro.length) return prev;
            const [removido] = novoRoteiro.splice(fromIndex, 1);
            novoRoteiro.splice(toIndex, 0, removido);

            // atualiza seleção caso o pedido selecionado seja movido
            if (pedidoSelecionado) {
                const sel = novoRoteiro.find(a => a.id === pedidoSelecionado.id);
                setPedidoSelecionado(sel || null);
            }

            // Update summary counters (will be recalculated from pedidos state)
            return novoRoteiro;
        });
    };

    // centralizar automaticamente quando o primeiro pedido mudar (ex.: reorder)
    const prevFirstRef = useRef(null);
    useEffect(() => {
        const first = pedidos && pedidos[0];
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
    }, [pedidos]);

    const normalizePedido = (it) => {
        const item = { ...(it || {}) };
        // Normalize tipo_servico: ensure string 'Entrega'|'Recolha'|'Outros'
        const t = item.tipo_servico;
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
            else item.tipo_servico = 'Outros';
        } else {
            item.tipo_servico = item.tipo_servico || 'Outros';
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
        try { console.log('PEDIDO COMPLETO:', item); } catch (e) { /* ignore */ }
        try { console.log('Tipo Real:', item.tipo_servico); } catch (e) { /* ignore */ }

        // Use a coluna `tipo` explicitamente (mas normalize para evitar problemas de caixa/espaços)
        const rawTipo = String(item.tipo || '').trim();
        const tipoNormalized = rawTipo.toLowerCase();

        let label = 'Outros';
        let corCard = 'rgba(175, 82, 222, 0.5)'; // Lilás (Outros)

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
                        <TouchableOpacity disabled={idx === pedidos.length - 1} onPress={() => moverPedido(idx, idx + 1)} style={styles.arrowBtn}><Text>⬇️</Text></TouchableOpacity>
                    </View>
                </View>

                <Text style={styles.cardName}>#{item.id} — {item.cliente}</Text>
                {item.observacoes ? <Text style={styles.observacoesText} numberOfLines={2}>{item.observacoes}</Text> : null}
                <Text style={styles.addressText} numberOfLines={2}>{item.endereco || (item.rua ? `${item.rua}, ${item.numero || ''} ${item.bairro || ''}` : 'Endereço não disponível')}</Text>

                <View style={{ height: 12 }} />

                <View style={styles.btnRowThree}>
                    <TouchableOpacity style={[styles.btnSmall, { backgroundColor: '#002366' }]} onPress={() => { const top = pedidos[0] || item; openExternalNavigation(top); }}>
                        <Text style={[styles.btnIconText, { color: '#fff' }]}>ROTA</Text>
                    </TouchableOpacity>

                    {/* Camera button */}
                    <TouchableOpacity style={[styles.btnSmall, { backgroundColor: '#444' }]} onPress={() => tirarFoto(item)}>
                        <Text style={[styles.btnIconText, { color: '#fff' }]}>📷</Text>
                    </TouchableOpacity>

                    {/* Split row: NÃO ENTREGUE (vermelho) | FINALIZAR (verde) - mesmos tamanhos */}
                    <View style={styles.btnSplitContainer}>
                        <TouchableOpacity style={[styles.btnSplit, { backgroundColor: '#e74c3c', marginRight: 8 }]} onPress={() => abrirOcorrenciaRapida(item)}>
                            <Text style={[styles.btnIconText, { color: '#fff' }]}>NÃO ENTREGUE</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={[styles.btnSplit, { backgroundColor: '#28a745', marginLeft: 8 }]} onPress={() => { setPedidoSelecionado(item); setModalAssinatura(true); }}>
                            <Text style={[styles.btnIconText, { color: '#fff' }]}>FINALIZAR</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </TouchableOpacity>
        );
    }



    return (
        <View style={styles.container}>
            {/* Top bar com ações */}
            <View style={styles.topBar} pointerEvents="box-none">
                <TouchableOpacity style={styles.logoutButton} onPress={handleLogoutPress} accessibilityLabel="Sair">
                    <Text style={styles.logoutText}>Sair</Text>
                </TouchableOpacity>
            </View>

            <MapView
                ref={mapRef}
                style={styles.map}
                // 📍 DESATIVADO: a bolinha azul nativa foi escondida para usar o marcador personalizado
                showsUserLocation={false}
                followsUserLocation={true}
                showsMyLocationButton={false} // Escondemos o nativo para usar o seu botão redondo
                initialRegion={{
                    latitude: -23.5505,
                    longitude: -46.6333,
                    latitudeDelta: 0.05,
                    longitudeDelta: 0.05
                }}
            >
                {/* MARCADOR PULSANTE DO MOTORISTA (usando animações) */}
                {posicaoMotorista && posicaoMotorista.latitude != null && posicaoMotorista.longitude != null && (
                    <Marker
                        coordinate={{
                            latitude: Number(posicaoMotorista.latitude),
                            longitude: Number(posicaoMotorista.longitude)
                        }}
                        anchor={{ x: 0.5, y: 0.5 }}
                    >
                        <View style={styles.containerPulsante}>
                            {/* Simples indicador do motorista, sem animação pesada */}
                            <View style={[styles.pulsoVermelhoStatic]} />

                            {/* Bolinha Central Fixa */}
                            <View style={styles.bolinhaVermelhaCentro} />
                        </View>
                    </Marker>
                )}

                {/* MARKERS DOS PEDIDOS */}
                {pedidos.map(p => (
                    (p.lat != null && p.lng != null) ? (
                        <Marker
                            key={p.id}
                            coordinate={{ latitude: Number(p.lat), longitude: Number(p.lng) }}
                            pinColor={p.status === 'entregue' ? 'green' : 'orange'}
                        />
                    ) : null
                ))}

                {/* Marker for selected pedido (highlight) */}
                {pedidoSelecionado && pedidoSelecionado.lat != null && pedidoSelecionado.lng != null && (
                    <Marker key={'selected'} coordinate={{ latitude: Number(pedidoSelecionado.lat), longitude: Number(pedidoSelecionado.lng) }}>
                        <View style={styles.selectedMarker}><View style={styles.selectedMarkerDot} /></View>
                    </Marker>
                )}
            </MapView>




            {/* Bottom sheet - manual Animated View with PanResponder (glass backdrop) */}
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
                            {/* Resumo do dia */}
                            <View style={styles.resumoRow}>
                                <View style={styles.resumoBadge}><Text style={[styles.resumoIcon, {color: '#0077CC'}]}>✅</Text><Text style={styles.resumoText}>Entregas Pendentes: {totalEntregas}</Text></View>
                                <View style={styles.resumoBadge}><Text style={[styles.resumoIcon, {color: '#FF9500'}]}>📦</Text><Text style={styles.resumoText}>Recolhas Pendentes: {totalRecolhas}</Text></View>
                            </View>

                            <FlatList
                                data={pedidos}
                                extraData={pedidos}
                                renderItem={({ item, index }) => renderPedidoItem(item, index)}
                                keyExtractor={item => String(item.id)}
                                contentContainerStyle={{ paddingBottom: 160, paddingTop: 6, paddingHorizontal: 12 }}
                                scrollEnabled={isAtTop}
                                showsVerticalScrollIndicator={false}
                            />
                        </View>
                    </View>
                </View>
            </Animated.View>




            {/* MODAL NÃO ENTREGUE (WHATSAPP) */}
            <Modal visible={modalOcorrencia} animationType="fade" transparent={true}>
                <View style={styles.modalOverlayLight}>
                    <View style={styles.modalOcorrenciaContent}>
                        <Text style={styles.modalTitle}>Motivo da Ocorrência</Text>
                        {['CLIENTE AUSENTE', 'ENDEREÇO NÃO LOCALIZADO', 'RECUSADO PELO CLIENTE', 'ESTABELECIMENTO FECHADO', 'OUTRO (DIGITAR)'].map(motivo => (
                            <TouchableOpacity
                                key={motivo}
                                style={styles.btnMotivo}
                                onPress={() => {
                                    if (motivo === 'OUTRO (DIGITAR)') {
                                        setOutroSelected(true);
                                        setTextoOcorrencia('');
                                        // foco no input quando aparecer
                                        setTimeout(() => { inputOcorrenciaRef.current?.focus && inputOcorrenciaRef.current.focus(); }, 200);
                                    } else {
                                        // envia imediatamente para as opções predefinidas
                                        handleOcorrenciaChoice(motivo, pedidoSelecionado);
                                    }
                                }}
                            >
                                <Text style={styles.txtMotivo}>{motivo}</Text>
                            </TouchableOpacity>
                        ))}

                        {(outroSelected) ? (
                            <TextInput
                                ref={inputOcorrenciaRef}
                                style={styles.inputOcorrencia}
                                placeholder="Digite o motivo"
                                value={textoOcorrencia}
                                onChangeText={setTextoOcorrencia}
                                multiline
                            />
                        ) : null}

                        <View style={styles.modalButtonsRow}>
                            <TouchableOpacity style={styles.btnCancel} onPress={() => { setModalOcorrencia(false); setTextoOcorrencia(''); setOutroSelected(false); }}>
                                <Text style={{ color: '#fff' }}>CANCELAR</Text>
                            </TouchableOpacity>

                            <TouchableOpacity style={styles.btnSend} onPress={() => {
                                // Envia texto digitado (OUTRO) - captura coords e faz o envio
                                const motivo = textoOcorrencia?.trim() || 'Motivo não informado';
                                if (!pedidoSelecionado) {
                                    Alert.alert('Erro', 'Nenhum pedido selecionado.');
                                    return;
                                }
                                handleOcorrenciaChoice(motivo, pedidoSelecionado);
                            }}>
                                <Text style={styles.btnTextGeral}>ENVIAR</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>



            {/* MODAL ASSINATURA (ASSINATURA FULLSCREEN) */}
            <Modal
                visible={modalAssinatura}
                animationType="slide"
                transparent={true}
                statusBarTranslucent={true}
                onRequestClose={() => setModalAssinatura(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalAssinaturaFull}>
                        <Text style={styles.modalTitle}>ASSINATURA DO CLIENTE</Text>

                        {/* ✍️ ÁREA DE DESENHO (90% DA CAIXA) */}
                        <View style={styles.containerAssinatura}>
                            <SignatureScreen
                                onOK={(img) => {
                                    // img é dataURL (base64). Salvamos assinatura + coords no pedido
                                    handleSignatureOk(img);
                                }}
                                onEmpty={() => Alert.alert('Aviso', 'O cliente precisa assinar!')}
                                descriptionText="Assine acima para confirmar"
                                clearText="Apagar"
                                confirmText="Enviar"
                                autoClear={false}
                                imageType="image/png"
                                penColor="black" // Risco preto
                                backgroundColor="white" // Fundo branco
                            />


                        </View>

                        {/* 🔘 BOTÕES DE COMANDO EM BAIXO */}
                        <View style={styles.modalFooterAssina}>
                            <TouchableOpacity style={styles.btnApagarFull} onPress={() => setModalAssinatura(false)}>
                                <Text style={styles.btnTextGeral}>SAIR / LIMPAR</Text>
                            </TouchableOpacity>

                            <TouchableOpacity style={styles.btnConfirmarFull} onPress={confirmarEntrega}>
                                <Text style={styles.btnTextGeral}>CONFIRMAR ENTREGA</Text>
                            </TouchableOpacity>
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
});

