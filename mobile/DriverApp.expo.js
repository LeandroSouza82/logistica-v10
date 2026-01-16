import React, { useState, useRef, useMemo, useEffect } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Linking } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import BottomSheet from '@gorhom/bottom-sheet';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import MaterialIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { playAlertSound } from './src/utils/audio';

export default function DriverApp() {
    // 1. Estados da Rota
    const [currentOrder, setCurrentOrder] = useState(0);
    const [isFinished, setIsFinished] = useState(false);
    const [orders, setOrders] = useState([
        { id: 1, title: 'Entrega #101', addr: 'Rua das Flores, 50', coords: { latitude: -23.550, longitude: -46.633 }, status: 'pending' },
        { id: 2, title: 'Entrega #102', addr: 'Av. Paulista, 1000', coords: { latitude: -23.555, longitude: -46.635 }, status: 'pending' },
        { id: 3, title: 'Entrega #103', addr: 'Rua Augusta, 400', coords: { latitude: -23.560, longitude: -46.640 }, status: 'pending' },
    ]);

    // 2. Referências e Configuração do BottomSheet (Tela que sobe)
    const bottomSheetRef = useRef(null);
    const snapPoints = useMemo(() => ['15%', '45%'], []);

    // 3. Função do Jingle (Som ao chegar/receber)
    async function playJingle() {
        try {
            // Small embedded WAV (1 short silent/beep) as data URI so the demo works
            const dataUri = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=';
            await playAlertSound(dataUri);
        } catch (err) {
            console.warn('playJingle failed (playback issue):', err);
        }

        // 4. Navegar com Google Maps
        const handleNavigate = () => {
            const { latitude, longitude } = orders[currentOrder].coords;
            const url = `google.navigation:q=${latitude},${longitude}`;
            Linking.openURL(url);
        };

        // 5. Finalizar Entrega Individual
        const completeOrder = () => {
            let newOrders = [...orders];
            newOrders[currentOrder].status = 'done';
            setOrders(newOrders);

            if (currentOrder < orders.length - 1) {
                setCurrentOrder(currentOrder + 1);
                playJingle(); // Toca o som ao passar para a próxima
            } else {
                setIsFinished(true);
            }
        };

        // 6. Limpar Mapa ao Finalizar
        const resetRoute = () => {
            setOrders([]);
            setIsFinished(false);
        };

        return (
            <GestureHandlerRootView style={{ flex: 1 }}>
                <View style={styles.container}>

                    {/* MAPA */}
                    <MapView
                        style={styles.map}
                        initialRegion={{
                            latitude: -23.550,
                            longitude: -46.633,
                            latitudeDelta: 0.02,
                            longitudeDelta: 0.02,
                        }}
                    >
                        {/* Marcador do Motorista (Motinha) */}
                        <Marker coordinate={{ latitude: -23.552, longitude: -46.636 }}>
                            <MaterialIcons name="motorbike" size={40} color="#2196F3" />
                        </Marker>

                        {/* Marcadores das Entregas */}
                        {orders.map((order, index) => (
                            <Marker key={order.id} coordinate={order.coords}>
                                <View style={[
                                    styles.pin,
                                    { backgroundColor: order.status === 'done' ? '#4CAF50' : '#F44336' }
                                ]}>
                                    <Text style={styles.pinText}>{index + 1}</Text>
                                </View>
                            </Marker>
                        ))}
                    </MapView>

                    {/* Botão de Finalizar Rota (Só aparece no fim) */}
                    {isFinished && (
                        <TouchableOpacity style={styles.clearBtn} onPress={resetRoute}>
                            <Text style={styles.clearBtnText}>Limpar Mapa e Finalizar Rota</Text>
                        </TouchableOpacity>
                    )}

                    {/* BOTTOM SHEET (Tela que sobe leve) */}
                    {!isFinished && orders.length > 0 && (
                        <BottomSheet ref={bottomSheetRef} index={0} snapPoints={snapPoints}>
                            <View style={styles.sheetContent}>
                                <Text style={styles.orderTitle}>{orders[currentOrder].title}</Text>
                                <Text style={styles.orderAddr}>{orders[currentOrder].addr}</Text>

                                <View style={styles.buttonRow}>
                                    <TouchableOpacity style={styles.navBtn} onPress={handleNavigate}>
                                        <MaterialIcons name="google-maps" size={24} color="#fff" />
                                        <Text style={styles.btnText}>Navegar</Text>
                                    </TouchableOpacity>

                                    <TouchableOpacity style={styles.failBtn}>
                                        <Text style={styles.btnText}>Não</Text>
                                    </TouchableOpacity>
                                </View>

                                <TouchableOpacity style={styles.doneBtn} onPress={completeOrder}>
                                    <Text style={styles.btnText}>Marcar como Entregue</Text>
                                </TouchableOpacity>
                            </View>
                        </BottomSheet>
                    )}
                </View>
            </GestureHandlerRootView>
        );
    }

    const styles = StyleSheet.create({
        container: { flex: 1 },
        map: { flex: 1 },
        sheetContent: { padding: 20, alignItems: 'center' },
        orderTitle: { fontSize: 22, fontWeight: 'bold', color: '#333' },
        orderAddr: { fontSize: 16, color: '#666', marginBottom: 20 },
        buttonRow: { flexDirection: 'row', gap: 10, marginBottom: 15 },
        navBtn: { backgroundColor: '#4285F4', padding: 15, borderRadius: 12, flex: 2, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
        failBtn: { backgroundColor: '#607D8B', padding: 15, borderRadius: 12, flex: 1, alignItems: 'center' },
        doneBtn: { backgroundColor: '#4CAF50', padding: 18, borderRadius: 12, width: '100%', alignItems: 'center' },
        btnText: { color: '#fff', fontWeight: 'bold', fontSize: 16, marginLeft: 5 },
        pin: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#fff', elevation: 5 },
        pinText: { color: '#fff', fontWeight: 'bold' },
        clearBtn: { position: 'absolute', top: 60, alignSelf: 'center', backgroundColor: '#000', padding: 15, borderRadius: 30 },
        clearBtnText: { color: '#fff', fontWeight: 'bold' }
    });