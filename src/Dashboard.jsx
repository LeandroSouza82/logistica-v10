import React, { useEffect, useState } from 'react';
import { GoogleMap, useJsApiLoader, Marker } from '@react-google-maps/api';
import { supabase } from './supabaseClient';

// Definição reutilizável do estilo do container do mapa
const containerStyle = {
    width: '100%',
    height: '100%',
};



export default function PainelGestor() {
    const [motoristaPos, setMotoristaPos] = useState({ lat: -27.6, lng: -48.6 });
    const [entregas, setEntregas] = useState([]);
    const { isLoaded } = useJsApiLoader({ googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY });

    useEffect(() => {
        // busca entregas iniciais
        const buscarEntregas = async () => {
            const { data } = await supabase
                .from('entregas')
                .select('*')
                .order('horario_conclusao', { ascending: false })
                .limit(50);
            if (data) setEntregas(data);
        };

        buscarEntregas();

        // 1. Escutar a posição do motorista em tempo real
        const canalMotorista = supabase
            .channel('monitoramento')
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'motoristas' }, payload => {
                const lat = Number(payload.new.lat);
                const lng = Number(payload.new.lng);
                setMotoristaPos({ lat, lng });
            })
            .subscribe();

        // 2. Escutar novos pedidos concluídos
        const canalEntregas = supabase
            .channel('entregas')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'entregas' }, payload => {
                // adiciona no topo da lista
                setEntregas(prev => [payload.new, ...prev]);
            })
            .subscribe();

        return () => {
            try { supabase.removeChannel(canalMotorista); } catch (e) { /* ignore */ }
            try { supabase.removeChannel(canalEntregas); } catch (e) { /* ignore */ }
        };
    }, []);

    return (
        <div className="containerPrincipal">
            {/* MAPA DO GESTOR */}
            <div className="mapaContainer">
                {isLoaded ? (
                    <GoogleMap mapContainerStyle={containerStyle} center={motoristaPos} zoom={13} options={{ disableDefaultUI: true }}>
                        <Marker position={motoristaPos} />
                    </GoogleMap>
                ) : (
                    <div style={{ color: '#ccc', padding: 20 }}>Carregando mapa...</div>
                )}
            </div>

            {/* TABELA LATERAL DE ENTREGAS */}
            <div className="sidebar">
                <h2 style={{ marginTop: 0 }}>Entregas do Dia</h2>
                {entregas.map(e => (
                    <div key={e.id} className="cardEntrega">
                        <p style={{ margin: 0 }}><strong>Cliente:</strong> {e.cliente}</p>
                        <p style={{ margin: 0 }}><strong>Status:</strong> ✅ Concluído</p>
                        {e.assinatura && <img src={e.assinatura} alt="assinatura" style={{ width: '100px', marginTop: 8, borderRadius: 6 }} />}
                    </div>
                ))}
            </div>
        </div>
    );
}
