import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { supabase } from '../supabaseClient';

export default function LoginScreen({ onLogin }) {
    const [id, setId] = useState('1');
    const [loading, setLoading] = useState(false);

    const handleLogin = async () => {
        const parsed = Number(id);
        if (!parsed || parsed <= 0) return Alert.alert('Erro', 'Informe um ID numérico válido');

        setLoading(true);
        try {
            // Verifica se o motorista existe (simples validação)
            const { data, error } = await supabase.from('motoristas').select('id,nome').eq('id', parsed).limit(1).single();
            if (error) {
                Alert.alert('Erro', 'Motorista não encontrado');
                return;
            }

            // Chama callback para subir o estado no App
            onLogin(parsed, data?.nome || `Motorista ${parsed}`);
        } catch (e) {
            Alert.alert('Erro', e.message || String(e));
        } finally {
            setLoading(false);
        }
    };

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Entrar</Text>
            <Text style={styles.subtitle}>Informe o seu ID de motorista (apenas para teste)</Text>

            <TextInput
                value={id}
                onChangeText={setId}
                keyboardType="numeric"
                style={styles.input}
                placeholder="ID do motorista"
                placeholderTextColor="#94a3b8"
            />

            <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading}>
                <Text style={styles.buttonText}>{loading ? 'Carregando...' : 'Entrar'}</Text>
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0f172a', justifyContent: 'center', alignItems: 'center', padding: 24 },
    title: { color: 'white', fontSize: 24, fontWeight: '700' },
    subtitle: { color: '#94a3b8', marginTop: 8, marginBottom: 16, textAlign: 'center' },
    input: { width: '100%', padding: 12, borderRadius: 8, backgroundColor: '#0b1220', color: 'white', marginBottom: 12 },
    button: { backgroundColor: '#06b6d4', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 8 },
    buttonText: { color: '#04263a', fontWeight: '700' }
});
