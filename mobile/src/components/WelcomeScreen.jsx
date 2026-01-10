import React, { useEffect, useState } from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity, Platform } from 'react-native';

export default function WelcomeScreen({ navigation, onFinish }) {
    const DURATION = 5; // segundos
    const [secondsLeft, setSecondsLeft] = useState(DURATION);

    useEffect(() => {
        let mounted = true;
        const interval = setInterval(() => {
            if (!mounted) return;
            setSecondsLeft(s => {
                if (s <= 1) {
                    clearInterval(interval);
                    // Navega ou chama callback quando terminar
                    if (typeof onFinish === 'function') onFinish();
                    else if (navigation && typeof navigation.replace === 'function') navigation.replace('Home');
                    return 0;
                }
                return s - 1;
            });
        }, 1000);

        return () => {
            mounted = false;
            clearInterval(interval);
        };
    }, []);

    const handleSkip = () => {
        setSecondsLeft(0);
        if (typeof onFinish === 'function') onFinish();
        else if (navigation && typeof navigation.replace === 'function') navigation.replace('Home');
    };

    return (
        <View style={styles.container}>
            {/* Placeholder remoto para evitar erro de asset ausente em builds de dev */}
            <Image
                source={{ uri: 'https://via.placeholder.com/150?text=Moto' }}
                style={styles.logo}
            />

            <Text style={styles.title}>Bem-vindo ao MotoTrack</Text>
            <Text style={styles.subtitle}>Sua entrega em boas mãos</Text>

            <Text style={styles.countdown}>Iniciando em {secondsLeft} s</Text>

            <TouchableOpacity style={styles.skipButton} onPress={handleSkip} accessibilityLabel="Pular">
                <Text style={styles.skipText}>Pular</Text>
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#1a202c', justifyContent: 'center', alignItems: 'center' },
    logo: { width: 150, height: 150, marginBottom: 20, resizeMode: 'contain' },
    title: { color: 'white', fontSize: 24, fontWeight: 'bold' },
    subtitle: { color: '#94a3b8', fontSize: 16, marginTop: 6 },
    countdown: { color: '#cbd5e1', marginTop: 14, fontSize: 16 },
    skipButton: { marginTop: 18, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 8, backgroundColor: '#374151' },
    skipText: { color: 'white', fontSize: 16 }
});
