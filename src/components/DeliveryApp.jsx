import React, { useState, useRef } from 'react';
import {
    StyleSheet, Text, View, TextInput, TouchableOpacity,
    Animated, PanResponder, Dimensions, Linking
} from 'react-native';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function App() {
    const [mostrandoRota, setMostrandoRota] = useState(true);
    const [search, setSearch] = useState('');

    // Animação da Aba (Começa a meio da tela)
    const pan = useRef(new Animated.ValueXY({ x: 0, y: SCREEN_HEIGHT / 2 })).current;

    const panResponder = useRef(
        PanResponder.create({
            onMoveShouldSetPanResponder: () => true,
            onPanResponderMove: Animated.event([null, { dy: pan.y }], { useNativeDriver: false }),
            onPanResponderRelease: (e, gesture) => {
                if (gesture.dy > 0) {
                    Animated.spring(pan.y, { toValue: SCREEN_HEIGHT / 1.2, useNativeDriver: false }).start();
                } else {
                    Animated.spring(pan.y, { toValue: 80, useNativeDriver: false }).start();
                }
            },
        })
    ).current;

    return (
        <View style={styles.container}>

            {/* 1. BARRA DE PESQUISA PONTA A PONTA NO TOPO (ZONA DA CÂMARA) */}
            <View style={styles.headerPesquisa}>
                <TextInput
                    style={styles.input}
                    placeholder="Para onde vamos em Floripa?"
                    placeholderTextColor="#888"
                    value={search}
                    onChangeText={setSearch}
                />
            </View>

            {/* 2. ABA DE ENTREGAS QUE SOBE E DESCE */}
            <Animated.View
                {...panResponder.panHandlers}
                style={[styles.aba, { transform: [{ translateY: pan.y }] }]}
            >
                {/* BOTÃO NAVEGAR: Fixado no topo da aba - deve ser o PRIMEIRO FILHO (antes de qualquer ScrollView/FlatList) */}
                {mostrandoRota && (
                    <TouchableOpacity
                        style={styles.btnNavegar}
                        onPress={() => {
                            setMostrandoRota(false);
                            Linking.openURL('https://www.google.com/maps/dir/?api=1&destination=Florianopolis');
                        }}
                    >
                        <Text style={styles.btnText}>INICIAR NAVEGAÇÃO 📍</Text>
                    </TouchableOpacity>
                )}

                <View style={styles.divisor} />
                <Text style={styles.tituloAba}>Minhas Entregas</Text>
                <View style={styles.cardExemplo}>
                    <Text style={{ color: '#fff' }}>Pedido #001 - Rua Felipe Schmidt</Text>
                </View>
            </Animated.View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0B1F3A' },
    headerPesquisa: {
        position: 'absolute',
        top: 0, // barra colada no topo da tela
        width: '100%',
        zIndex: 99,
    },
    input: {
        height: 90,
        backgroundColor: '#FFF',
        paddingTop: 45, // Para o texto não ficar escondido pela câmara (Notch) — aumentado para 45
        paddingHorizontal: 20,
        fontSize: 18,
        textAlign: 'center',
        color: '#000',
        borderBottomWidth: 1,
        borderBottomColor: '#ddd',
    },
    aba: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height: SCREEN_HEIGHT,
        backgroundColor: '#0B1F3A',
        borderTopLeftRadius: 30,
        borderTopRightRadius: 30,
        padding: 20,
        paddingTop: 80, // espaço reservado para o botão fixado no topo da aba
    },
    btnNavegar: {
        position: 'absolute',
        top: 20, // travado no topo da aba preta
        alignSelf: 'center',
        zIndex: 999,
        backgroundColor: '#28a745',
        paddingVertical: 15,
        paddingHorizontal: 40,
        borderRadius: 30,
        elevation: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 5 },
        shadowOpacity: 0.3,
        shadowRadius: 5,
    },
    btnText: { color: '#FFF', fontWeight: 'bold', fontSize: 16 },
    divisor: { width: 45, height: 5, backgroundColor: '#444', borderRadius: 10, alignSelf: 'center', marginBottom: 20 },
    tituloAba: { color: '#FFF', fontSize: 20, fontWeight: 'bold', textAlign: 'center', marginBottom: 20 },
    cardExemplo: { backgroundColor: '#333', padding: 20, borderRadius: 15 }
});