import 'react-native-url-polyfill/auto';
import React, { useState, useEffect, useRef } from 'react';
import DeliveryApp from './src/components/DeliveryApp';
import WelcomeScreen from './src/components/WelcomeScreen';
import LoginScreen from './src/components/LoginScreen';
import { supabase } from './src/supabaseClient';
import * as SecureStore from 'expo-secure-store';

export default function App() {
    const [showWelcome, setShowWelcome] = useState(true);
    const [showLogin, setShowLogin] = useState(false);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
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
        setMotoristaId(id);
        setIsAuthenticated(true);
        setShowLogin(false);
        try {
            await SecureStore.setItemAsync('motoristaId', String(id));
        } catch (e) { /* ignore */ }
    };

    const logoutTimerRef = useRef(null);

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

        setIsAuthenticated(false);
        setShowLogin(true);
    };

    if (showWelcome) return <WelcomeScreen onFinish={checkSessionAndRoute} />;
    if (showLogin) return <LoginScreen onLogin={handleLogin} />;
    if (isAuthenticated) return <DeliveryApp motoristaId={motoristaId} onLogout={handleLogout} />;

    // fallback: mostrar DeliveryApp sem autenticação
    return <DeliveryApp motoristaId={motoristaId} onLogout={handleLogout} />;
}