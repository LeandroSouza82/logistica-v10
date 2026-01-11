import 'react-native-url-polyfill/auto';
import React, { useState, useEffect, useRef } from 'react';
import DeliveryApp from './src/components/DeliveryApp';
import WelcomeScreen from './src/components/WelcomeScreen';
import LoginScreen from './src/components/LoginScreen';
import { supabase } from './src/supabaseClient';
import * as SecureStore from 'expo-secure-store';
import * as Location from 'expo-location';

export default function App() {
    // Forçar o app como logado para testes locais
    const [showWelcome, setShowWelcome] = useState(false);
    const [showLogin, setShowLogin] = useState(false);
    const [isAuthenticated, setIsAuthenticated] = useState(true);
    // Força motoristaId = 1 por padrão
    const [motoristaId, setMotoristaId] = useState(1);

    useEffect(() => {
        // tenta restaurar login salvo rapidamente
        (async () => {
            try {
                const saved = await SecureStore.getItemAsync('motoristaId');
                if (saved) {
                    setMotoristaId(Number(saved));
                    setIsAuthenticated(true);
                    setShowWelcome(false);
                    setShowLogin(false);
                }
            } catch (e) {
                // ignore
            }
        })();
    }, []);

    const checkSessionAndRoute = async () => {
        try {
            const { data, error } = await supabase.auth.getSession();
            if (data?.session) {
                setIsAuthenticated(true);
                setShowWelcome(false);
                setShowLogin(false);
            } else {
                // sem sessão: mostrar tela de login
                setShowWelcome(false);
                setShowLogin(true);
            }
        } catch (e) {
            // falha na checagem: vai para login
            setShowWelcome(false);
            setShowLogin(true);
        }
    };

    const handleLogin = async (id, nome) => {
        // Forçando ID 1 para testes locais conforme solicitado
        const forcedId = 1;
        setMotoristaId(forcedId); // Força o ID 1
        setIsAuthenticated(true); // Força o estado de logado
        setShowLogin(false);
        try {
            await SecureStore.setItemAsync('motoristaId', String(forcedId));
        } catch (e) { /* ignore */ }
    };

    const logoutTimerRef = useRef(null);
    const locationWatcherRef = useRef(null);

    const handleLogout = async () => {
        try {
            await SecureStore.deleteItemAsync('motoristaId');
        } catch (e) {
            // ignore
        }
        try { await supabase.auth.signOut(); } catch (e) { /* ignore */ }

        // Cancela qualquer timer anterior
        if (logoutTimerRef.current) {
            clearTimeout(logoutTimerRef.current);
            logoutTimerRef.current = null;
        }

        // Limpa IMEDIATAMENTE a posição no DB (garante remoção sem refresh)
        const idToClear = motoristaId;
        (async () => {
            try {
                await supabase.from('motoristas').update({ lat: null, lng: null, ultimo_sinal: null }).eq('id', idToClear);
                console.log('Posição do motorista removida imediatamente no logout (App)');
            } catch (e) {
                console.warn('Erro ao limpar posição imediatamente no logout:', e?.message || e);
            }
        })();

        // Agenda limpeza da posição em 10s como fallback
        logoutTimerRef.current = setTimeout(async () => {
            try {
                await supabase.from('motoristas').update({ lat: null, lng: null, ultimo_sinal: null }).eq('id', idToClear);
                console.log('Posição do motorista removida após logout (App fallback)');
            } catch (e) { console.warn('Erro ao limpar posição no logout (fallback):', e?.message || e); }
            logoutTimerRef.current = null;
        }, 10000);

        // Remove o watcher de localização, se ativo
        try {
            if (locationWatcherRef.current) {
                locationWatcherRef.current.remove();
                locationWatcherRef.current = null;
            }
        } catch (e) {
            console.warn('Erro ao remover location watcher no logout:', e);
        }

        setIsAuthenticated(false);
        setShowLogin(true);
    };

    // Inicia watcher de GPS quando estiver autenticado e motoristaId estiver definido
    useEffect(() => {
        if (!isAuthenticated || !motoristaId) return;

        let mounted = true;
        (async () => {
            try {
                const { status } = await Location.requestForegroundPermissionsAsync();
                if (status !== 'granted') {
                    console.log('Permissão de localização negada');
                    return;
                }

                // inicia o watcher
                locationWatcherRef.current = await Location.watchPositionAsync(
                    {
                        accuracy: Location.Accuracy.High,
                        timeInterval: 5000,
                        distanceInterval: 2,
                    },
                    async (location) => {
                        const { latitude, longitude } = location.coords;
                        await enviarLocalizacao(latitude, longitude);
                    }
                );
            } catch (e) {
                console.warn('Erro ao iniciar watchPosition:', e);
            }
        })();

        return () => {
            // cleanup
            try {
                if (locationWatcherRef.current) {
                    locationWatcherRef.current.remove();
                    locationWatcherRef.current = null;
                }
            } catch (e) { /* ignore */ }
        };
    }, [isAuthenticated, motoristaId]);

    const enviarLocalizacao = async (lat, lng) => {
        if (!motoristaId) return;
        try {
            const { error } = await supabase
                .from('motoristas')
                .update({ lat, lng, ultimo_sinal: new Date() })
                .eq('id', motoristaId);

            if (error) console.error('Erro ao subir GPS:', error.message);
            else console.log('Localização enviada:', lat, lng);
        } catch (e) {
            console.error('Erro ao enviar localização:', e);
        }
    };

    if (showWelcome) return <WelcomeScreen onFinish={checkSessionAndRoute} />;
    if (showLogin) return <LoginScreen onLogin={handleLogin} />;
    if (isAuthenticated) return <DeliveryApp motoristaId={motoristaId} onLogout={handleLogout} />;

    // fallback: mostrar DeliveryApp sem autenticação
    return <DeliveryApp motoristaId={motoristaId} onLogout={handleLogout} />;
}