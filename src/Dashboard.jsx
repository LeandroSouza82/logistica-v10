import React, { useEffect, useState } from 'react';
import { GoogleMap, Marker } from '@react-google-maps/api';
import { supabase } from './supabase';

// Definição reutilizável do estilo do container do dashboard/mapa
const containerStyle = {
    width: '100%',
    height: '100vh',
    display: 'flex',
    flexDirection: 'row',
    backgroundColor: '#ff0000',
    color: 'white',
};

// Centro padrão do mapa (Palhoça)
const center = {
    lat: -27.612,
    lng: -48.675,
};



export default function PainelGestor({ isLoaded }) {
    // inicia centralizado no `center` e atualiza com posições do Supabase
    const [motoristaPos, setMotoristaPos] = useState(center);
    const [entregas, setEntregas] = useState([]);

    // Estilo específico do container do GoogleMap (usa 100% do bloco pai)
    const mapContainerStyle = { width: '100%', height: '100%' };

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
        <div style={containerStyle}>
            {/* Conteúdo do Dashboard: Mapa e Lista de Pedidos */}
            <div style={{ flex: 2 }}>
                {isLoaded ? (
                    <GoogleMap mapContainerStyle={mapContainerStyle} center={motoristaPos} zoom={13} options={{ disableDefaultUI: true }}>
                        <Marker position={motoristaPos} />
                    </GoogleMap>
                ) : (
                    <div style={{ color: '#ccc', padding: 20 }}>Carregando mapa...</div>
                )}
            </div>

            <div style={{ flex: 1, backgroundColor: '#0a1a33', padding: 20, overflowY: 'auto' }}>
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
