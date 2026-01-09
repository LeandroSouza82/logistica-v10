import React, { useState, useRef } from 'react';
import {
    StyleSheet, Text, View, TextInput, TouchableOpacity,
    Animated, PanResponder, Dimensions, Linking
} from 'react-native';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function DeliveryApp() {
    const [mostrandoRota, setMostrandoRota] = useState(true);
    const [search, setSearch] = useState('');

    // Controle da Aba (Bottom Sheet)
    const pan = useRef(new Animated.ValueXY({ x: 0, y: SCREEN_HEIGHT / 2 })).current;

    const panResponder = useRef(
        PanResponder.create({
            onMoveShouldSetPanResponder: () => true,
            onPanResponderMove: Animated.event([null, { dy: pan.y }], { useNativeDriver: false }),
            onPanResponderRelease: (e, gesture) => {
                if (gesture.dy > 0) {
                    Animated.spring(pan.y, { toValue: SCREEN_HEIGHT / 1.2, useNativeDriver: false }).start();
                } else {
                    Animated.spring(pan.y, { toValue: 100, useNativeDriver: false }).start();
                }
            },
        })
    ).current;

    return (
        <View style={styles.container}>
            {/* BARRA DE PESQUISA PONTA A PONTA */}
            <View style={styles.headerPesquisa}>
                <TextInput
                    style={styles.input}
                    placeholder="Para onde vamos em Florianópolis?"
                    placeholderTextColor="#888"
                    value={search}
                    onChangeText={setSearch}
                />
            </View>

            {/* MAPA FUNDO (REPRESENTAÇÃO) */}
            <View style={styles.mapaFundo}>
                <Text style={{ color: '#444' }}>Mapa carregando...</Text>
            </View>

            {/* ABA DE ENTREGAS */}
            <Animated.View
                {...panResponder.panHandlers}
                style={[styles.aba, { transform: [{ translateY: pan.y }] }]}
            >
                {/* BOTÃO NAVEGAR "GRAMPEADO" NO TOPO */}
                {mostrandoRota && (
                    <TouchableOpacity
                        style={styles.btnNavegar}
                        onPress={() => Linking.openURL('https://www.google.com/maps')}
                    >
                        <Text style={styles.btnText}>INICIAR NAVEGAÇÃO 📍</Text>
                    </TouchableOpacity>
                )}

                <View style={styles.divisorAba} />
                <Text style={styles.tituloAba}>Minhas Entregas</Text>

                {/* Exemplo de Pedido */}
                <View style={styles.cardPedido}>
                    <Text style={styles.textoPedido}>Pedido #001 - Leandro</Text>
                    <Text style={styles.textoEndereco}>Rua Principal, 10</Text>
                </View>
            </Animated.View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000' },
    headerPesquisa: {
        position: 'absolute',
        top: 0, // Encostado no topo da tela
        width: '100%',
        zIndex: 999,
    },
    input: {
        height: 95,
        backgroundColor: '#FFF',
        paddingTop: 45, // Evita que o texto fique sob a câmera
        paddingHorizontal: 20,
        fontSize: 18,
        textAlign: 'center',
        color: '#000',
    },
    mapaFundo: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    aba: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height: SCREEN_HEIGHT,
        backgroundColor: '#1C1C1C', // Cor do fundo das suas imagens
        borderTopLeftRadius: 30,
        borderTopRightRadius: 30,
        padding: 20,
    },
    btnNavegar: {
        position: 'absolute',
        top: -65, // Fixado acima da borda
        alignSelf: 'center',
        backgroundColor: '#28a745',
        paddingVertical: 15,
        paddingHorizontal: 40,
        borderRadius: 30,
        elevation: 10,
        zIndex: 1000,
    },
    btnText: { color: '#FFF', fontWeight: 'bold', fontSize: 16 },
    divisorAba: { width: 40, height: 5, backgroundColor: '#444', borderRadius: 10, alignSelf: 'center', marginBottom: 20 },
    tituloAba: { color: '#FFF', fontSize: 22, fontWeight: 'bold', textAlign: 'center', marginBottom: 20 },
    cardPedido: { backgroundColor: '#333', padding: 15, borderRadius: 15, marginBottom: 10 },
    textoPedido: { color: '#FFF', fontWeight: 'bold' },
    textoEndereco: { color: '#AAA', fontSize: 14 }
});