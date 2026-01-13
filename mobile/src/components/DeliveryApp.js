import React, { useState, useRef, useEffect } from 'react';
import {
    StyleSheet, Text, View, TouchableOpacity, Pressable, Animated, Modal, Image,
    Dimensions, Linking, ScrollView, TextInput, Alert, StatusBar, Platform, UIManager, LayoutAnimation, PanResponder, Easing
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import SignatureScreen from 'react-native-signature-canvas';
import * as Location from 'expo-location'; // Biblioteca para o GPS
import { supabase } from '../supabaseClient';

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

    const [pedidos, setPedidos] = useState([
        { id: 1, cliente: 'Leandro (Coleta)', status: 'pendente', lat: -27.596, lng: -48.546, driverPhone: '+5511987654321' },
        { id: 2, cliente: 'João Silva', status: 'pendente', lat: -27.600, lng: -48.550, driverPhone: '+5511976543210' },
    ]);

    const mapRef = useRef(null); // Referência para controlar a câmera do mapa

    const [modalAssinatura, setModalAssinatura] = useState(false);
    const [modalOcorrencia, setModalOcorrencia] = useState(false);
    const [pedidoSelecionado, setPedidoSelecionado] = useState(null);
    const [textoOcorrencia, setTextoOcorrencia] = useState('');

    // dimensões obtidas no escopo do módulo
    // Rastreia o movimento do dedo (pan responder)
    const panY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
    const panResponder = useRef(
        PanResponder.create({
            onMoveShouldSetPanResponder: () => true,
            onPanResponderMove: (e, gesture) => {
                // Movimento direto sem atraso
                panY.setValue(gesture.dy + SCREEN_HEIGHT / 2.2);
            },
            onPanResponderRelease: (e, gesture) => {
                // Se o movimento for rápido (vel) ou longo (dy), ele fecha
                if (gesture.dy > 150 || gesture.vy > 0.5) {
                    Animated.spring(panY, {
                        toValue: SCREEN_HEIGHT - 100,
                        friction: 8, // Controle de balanço
                        tension: 40, // Velocidade de resposta
                        useNativeDriver: false,
                    }).start();
                } else {
                    // Volta para a posição de comando
                    Animated.spring(panY, {
                        toValue: SCREEN_HEIGHT / 2.2,
                        friction: 8,
                        tension: 40,
                        useNativeDriver: false,
                    }).start();
                }
            },
        })
    ).current;

    useEffect(() => {
        Animated.spring(panY, { toValue: SCREEN_HEIGHT / 2.2, useNativeDriver: false }).start();
    }, []);

    // LISTENER REALTIME: atualiza a posição quando o Supabase enviar updates (mesma frequência do banco)
    useEffect(() => {
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
                        setPedidos(prev => {
                            // evita duplicata
                            if (prev.some(p => Number(p.id) === Number(novo.id))) return prev;
                            return [novo, ...prev];
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
                        setPedidos(prev => prev.map(p => (Number(p.id) === Number(novo.id) ? { ...p, ...novo } : p)));
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
                    setPedidos(initial);
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

    // Animação de pulso para o radar da bolinha (loop infinito)
    const scaleAnim = useRef(new Animated.Value(1)).current;
    const opacityAnim = useRef(new Animated.Value(0.5)).current;

    useEffect(() => {
        // Cria o efeito de pulso infinito
        Animated.loop(
            Animated.parallel([
                Animated.timing(scaleAnim, {
                    toValue: 2.2,
                    duration: 2000,
                    useNativeDriver: true,
                }),
                Animated.timing(opacityAnim, {
                    toValue: 0,
                    duration: 2000,
                    useNativeDriver: true,
                }),
            ])
        ).start();
    }, []);




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

        // 2. Configura a animação de flutuação e escala
        LayoutAnimation.configureNext({
            duration: 700,
            update: {
                type: 'spring',
                springDamping: 0.5, // Efeito mola para ele "pousar"
            },
        });

        const novaLista = [...pedidos];
        const [removido] = novaLista.splice(index, 1);
        novaLista.unshift(removido);
        setPedidos(novaLista);

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
    const confirmarEntrega = async () => {
        if (!pedidoSelecionado) return;
        try {
            const lat = posicaoMotorista && posicaoMotorista.latitude != null ? Number(posicaoMotorista.latitude) : null;
            const lng = posicaoMotorista && posicaoMotorista.longitude != null ? Number(posicaoMotorista.longitude) : null;
            const concluded_at = new Date().toISOString();

            const { data, error } = await supabase.from('entregas').update({
                status: 'entregue',
                assinatura: null,
                lat: lat,
                lng: lng,
                concluded_at
            }).eq('id', pedidoSelecionado.id);
            if (error) throw error;

            setPedidos(pedidos.map(it => it.id === pedidoSelecionado.id ? { ...it, status: 'entregue', assinatura: null, lat: lat, lng: lng, concluded_at } : it));
            Alert.alert('Sucesso', 'Entrega confirmada.');
        } catch (err) {
            console.error('Erro ao confirmar entrega:', err?.message || err);
            Alert.alert('Erro', 'Não foi possível confirmar a entrega. Tente novamente.');
        } finally {
            setModalAssinatura(false);
            setPedidoSelecionado(null);
        }
    };

    // Handler quando a assinatura foi capturada (img é dataURL)
    const handleSignatureOk = async (imgDataUrl) => {
        if (!pedidoSelecionado) {
            Alert.alert('Erro', 'Nenhum pedido selecionado para receber a assinatura.');
            return;
        }

        try {
            // pega coordenadas atuais do motorista (capturadas pelo Location watcher)
            const lat = posicaoMotorista && posicaoMotorista.latitude != null ? Number(posicaoMotorista.latitude) : null;
            const lng = posicaoMotorista && posicaoMotorista.longitude != null ? Number(posicaoMotorista.longitude) : null;
            const concluded_at = new Date().toISOString();

            // assinatura em base64/dataURL para salvar no DB
            const assinaturaBase64 = imgDataUrl; // gravamos a assinatura (dataURL/base64) diretamente na coluna `assinatura` e as coordenadas em `lat`/`lng`

            // Atualiza a entrega no banco: gravamos apenas `assinatura`, `lat` e `lng` como requerido
            const { data, error } = await supabase.from('entregas').update({
                assinatura: assinaturaBase64,
                lat: lat,
                lng: lng
            }).eq('id', pedidoSelecionado.id);
            if (error) throw error;

            // Atualiza UI local (mostramos o pedido como entregue localmente)
            setPedidos(pedidos.map(it => it.id === pedidoSelecionado.id ? { ...it, status: 'entregue', assinatura: assinaturaBase64, lat: lat, lng: lng, concluded_at } : it));

            Alert.alert('Sucesso', 'Assinatura registrada e entrega confirmada.');
        } catch (err) {
            console.error('Erro ao salvar assinatura:', err?.message || err);
            Alert.alert('Erro', 'Não foi possível salvar a assinatura. Tente novamente.');
        } finally {
            setModalAssinatura(false);
            setPedidoSelecionado(null);
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
                            {/* Círculo que Pulsa */}
                            <Animated.View
                                style={[
                                    styles.pulsoVermelho,
                                    {
                                        transform: [{ scale: scaleAnim }],
                                        opacity: opacityAnim,
                                    },
                                ]}
                            />

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
            </MapView>




            <Animated.View {...panResponder.panHandlers} style={[styles.aba, { transform: [{ translateY: panY }] }]}>
                <View style={styles.handleContainer}>
                    <View style={styles.handle} />
                </View>
                {pedidos.length > 3 && (
                    <View style={styles.dragHint}>
                        <Text style={styles.dragHintText}>⬇️ Arraste para ver mais</Text>
                    </View>
                )}
                <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 100, paddingTop: 6 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                    {pedidos.map((p, index) => {
                        const estaVoando = idVoando === p.id;

                        return (
                            (() => {
                                const scale = getScale(p.id);
                                return (
                                    <Pressable
                                        key={p.id}
                                        onPress={() => trocarPosicao(p.id, index)}
                                        onPressIn={() => Animated.spring(scale, { toValue: 0.98, useNativeDriver: true, friction: 4 }).start()}
                                        onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 4 }).start()}
                                    >
                                        <Animated.View style={[styles.cardCompacto, idVoando === p.id && styles.cardEmDestaque, { transform: [{ scale }] }]}>
                                            {/* ÁREA DO GESTOR REDUZIDA */}
                                            <View style={styles.areaGestorCompacta}>
                                                <Text style={styles.textoGestorMini} numberOfLines={1}>
                                                    ⚠️ {p.instrucao || "Sem avisos"}
                                                </Text>
                                            </View>

                                            <Text style={styles.clienteNomeMini}>#{p.id} - {p.cliente}</Text>

                                            <View style={styles.btnRowMini}>
                                                <TouchableOpacity style={[styles.btnMini, { backgroundColor: '#3498db' }]} onPress={() => Linking.openURL(`google.navigation:q=${p.lat},${p.lng}`)}>
                                                    <Text style={styles.btnTextMini}>GPS</Text>
                                                </TouchableOpacity>

                                                <TouchableOpacity style={[styles.btnMini, { backgroundColor: '#e74c3c' }]} onPress={() => { setPedidoSelecionado(p); setModalOcorrencia(true); }}>
                                                    <Text style={styles.btnTextMini}>FALHA</Text>
                                                </TouchableOpacity>

                                                <TouchableOpacity style={[styles.btnMini, { backgroundColor: '#2ecc71' }]} onPress={() => { setPedidoSelecionado(p); setModalAssinatura(true); }}>
                                                    <Text style={styles.btnTextMini}>OK</Text>
                                                </TouchableOpacity>
                                            </View>
                                        </Animated.View>
                                    </Pressable>
                                );
                            })()
                        );
                    })}
                </ScrollView>
            </Animated.View>




            {/* MODAL NÃO ENTREGUE (WHATSAPP) */}
            <Modal visible={modalOcorrencia} animationType="fade" transparent={true}>
                <View style={styles.modalOverlayLight}>
                    <View style={styles.modalOcorrenciaContent}>
                        <Text style={styles.modalTitle}>Motivo da Ocorrência</Text>
                        {['Cliente Ausente', 'Endereço não existe', 'Recusou entrega', 'Veículo quebrado', 'Local Fechado'].map(motivo => (
                            <TouchableOpacity key={motivo} style={styles.btnMotivo} onPress={() => abrirWhatsApp(motivo)}>
                                <Text style={styles.txtMotivo}>{motivo}</Text>
                            </TouchableOpacity>
                        ))}
                        <TextInput
                            style={styles.inputOcorrencia}
                            placeholder="Outro motivo... digite aqui"
                            onChangeText={setTextoOcorrencia}
                        />
                        <TouchableOpacity style={styles.btnFechar} onPress={() => setModalOcorrencia(false)}>
                            <Text style={{ color: '#fff' }}>CANCELAR</Text>
                        </TouchableOpacity>
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
                                webStyle={`.m-signature-pad--footer {display: none; margin: 0px;}`} // Esconde botões nativos
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
    cardGrande: {
        backgroundColor: '#1E1E1E',
        borderRadius: 30,
        padding: 22,
        marginBottom: 20,
        elevation: 5,          // Sombra normal para os cards parados
        zIndex: 1,             // Nível normal
    },
    cardName: {
        color: '#FFF',
        fontSize: 22,     // Nome do cliente bem grande
        fontWeight: 'bold',
        marginBottom: 15,
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
        width: 65,            // Largura maior para não cortar
        height: 65,           // Altura maior para não cortar
        borderRadius: 35,
        alignItems: 'center',
        justifyContent: 'center',
        elevation: 12,        // Sombra forte para destacar no mapa
        borderWidth: 3,
        borderColor: '#3498db',
        overflow: 'visible',  // Garante que nada seja cortado
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
        paddingVertical: 12, // Diminuído conforme solicitado
        borderRadius: 15,
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

