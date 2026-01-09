import React, { useState, useEffect, useRef } from 'react';
import { GoogleMap, useJsApiLoader, Marker } from '@react-google-maps/api';
import { motion, AnimatePresence } from 'framer-motion';
import SignatureCanvas from 'react-signature-canvas';
import Dashboard from './Dashboard.jsx';
import { supabase } from './supabaseClient';

// ⚠️ COLOQUE O SEU NÚMERO DE WHATSAPP AQUI (Com DDD)
const WHATSAPP_GESTOR = "5511999999999";

export default function App() {
  // Lógica para abrir o gestor se tiver "?view=admin" no link ou se a tela for grande
  const [isAdmin, setIsAdmin] = useState(window.location.search.includes('view=admin') || window.innerWidth > 1024);
  const [pedidos, setPedidos] = useState([
    { id: '1', cliente: 'Mercado Silva', local: 'Rua das Flores, 123', status: 'pendente' },
    { id: '2', cliente: 'Padaria Central', local: 'Av. Brasil, 450', status: 'pendente' },
  ]);

  const { isLoaded } = useJsApiLoader({ id: 'google-map-script', googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY, libraries: ['maps'] });

  // Renderiza o painel do gestor (Dashboard com Realtime) quando for admin
  return isAdmin ? (
    <Dashboard isLoaded={isLoaded} />
  ) : (
    <DriverView pedidos={pedidos} setPedidos={setPedidos} />
  );
}

// --- VISÃO DO GESTOR ---
function ManagerDashboard({ isLoaded }) {
  const [listaEntregas, setListaEntregas] = useState([]);
  const [carregando, setCarregando] = useState(false);

  // Estado para posições dos motoristas (atualizadas em tempo real)
  const [motoristas, setMotoristas] = useState([]);

  // SVG pulsante para marcador (data URL)
  const pulsingSvg = (color = '#ff3b30') => `
    <svg xmlns="http://www.w3.org/2000/svg" width="60" height="60" viewBox="0 0 60 60">
      <circle cx="30" cy="30" r="6" fill="${color}">
        <animate attributeName="r" from="6" to="18" dur="1.6s" repeatCount="indefinite" />
        <animate attributeName="opacity" from="0.9" to="0" dur="1.6s" repeatCount="indefinite" />
      </circle>
      <circle cx="30" cy="30" r="6" fill="${color}" />
    </svg>`;

  // Função para buscar as entregas concluídas que aparecem no seu banco
  const buscarEntregas = async () => {
    setCarregando(true);
    const { data, error } = await supabase
      .from('entregas')
      .select('id, cliente, status, assinatura, horario_conclusao')
      .order('horario_conclusao', { ascending: false });

    setCarregando(false);

    if (error) {
      console.error('Erro ao buscar entregas:', error);
      return;
    }

    if (data) setListaEntregas(data);
  };

  // Busca lista inicial de motoristas com último sinal
  const buscarMotoristas = async () => {
    const { data, error } = await supabase
      .from('motoristas')
      .select('id, lat, lng, ultimo_sinal')
      .order('ultimo_sinal', { ascending: false });

    if (error) {
      console.error('Erro ao buscar motoristas:', error);
      return;
    }

    if (data) {
      setMotoristas(data.map(m => ({ ...m, lat: Number(m.lat), lng: Number(m.lng) })));
    }
  };

  // Atualiza posição de um motorista no mapa do gestor
  const atualizarPosicaoNoMapaGestor = (lat, lng, id, ultimo_sinal) => {
    if (!lat || !lng) return;
    setMotoristas(prev => {
      const exists = prev.find(m => m.id === id);
      if (exists) {
        return prev.map(m => (m.id === id ? { ...m, lat, lng, ultimo_sinal } : m));
      }
      return [...prev, { id, lat, lng, ultimo_sinal }];
    });
  };

  useEffect(() => {
    buscarEntregas();
    buscarMotoristas();
  }, []);

  useEffect(() => {
    // Inscreve canal Realtime para atualizações na tabela motoristas
    const canal = supabase
      .channel('mudanca-posicao')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'motoristas' }, payload => {
        const { lat, lng, id, ultimo_sinal } = payload.new;
        atualizarPosicaoNoMapaGestor(Number(lat), Number(lng), id, ultimo_sinal);
      })
      .subscribe();

    return () => {
      // remove a inscrição do canal quando o componente desmontar
      try { supabase.removeChannel(canal); } catch (e) { /* ignore */ }
    };
  }, []);

  // Centro do mapa: primeiro motorista ou fallback
  const center = motoristas[0] ? { lat: motoristas[0].lat, lng: motoristas[0].lng } : { lat: -23.55, lng: -46.63 };

  return (
    <div style={{ padding: 20 }}>
      <h2 style={{ marginTop: 0 }}>LogiControl — Entregas concluidas</h2>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button onClick={buscarEntregas} style={{ padding: '8px 12px', cursor: 'pointer' }}>Atualizar</button>
      </div>

      {/* MAPA DO GESTOR (mostra motoristas em tempo real) */}
      <div style={{ height: 380, marginBottom: 16, borderRadius: 8, overflow: 'hidden' }}>
        {isLoaded ? (
          <GoogleMap mapContainerStyle={{ width: '100%', height: '100%' }} center={center} zoom={12} options={{ disableDefaultUI: true }}>
            {motoristas.map(m => {
              const svg = pulsingSvg('#ff3b30');
              const iconUrl = 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
              return (
                <Marker
                  key={m.id}
                  position={{ lat: m.lat, lng: m.lng }}
                  icon={{ url: iconUrl, scaledSize: { width: 40, height: 40 } }}
                />
              );
            })}
          </GoogleMap>
        ) : (
          <div style={{ padding: 20, color: '#ccc' }}>Carregando mapa...</div>
        )}
      </div>

      {/* Lista de motoristas com último sinal */}
      <div style={{ display: 'grid', gap: 10, marginBottom: 14 }}>
        {motoristas.map(m => (
          <div key={m.id} style={{ background: '#121212', padding: 10, borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <strong>Motorista {m.id}</strong>
              <div style={{ fontSize: 12, color: '#aaa' }}>{m.lat?.toFixed?.(5)}, {m.lng?.toFixed?.(5)}</div>
            </div>

            <div style={{ textAlign: 'right', fontSize: 12, color: '#ccc' }}>
              Último sinal
              <div style={{ fontSize: 12, color: '#9e9e9e' }}>{m.ultimo_sinal ? new Date(m.ultimo_sinal).toLocaleString() : '—'}</div>
            </div>
          </div>
        ))}
      </div>

      {carregando ? (
        <div>Carregando...</div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {listaEntregas.length === 0 ? (
            <div>Nenhuma entrega encontrada.</div>
          ) : (
            listaEntregas.map(e => (
              <div key={e.id} style={{ background: '#1f1f1f', padding: 12, borderRadius: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong style={{ fontSize: 16 }}>{e.cliente}</strong>
                  <span style={{ fontSize: 12, color: '#aaa' }}>{e.status}</span>
                </div>

                <div style={{ marginTop: 8, fontSize: 13, color: '#ccc' }}>
                  Conclusão: {e.horario_conclusao ? new Date(e.horario_conclusao).toLocaleString() : '—'}
                </div>

                {e.assinatura && (
                  <div style={{ marginTop: 10 }}>
                    {/* a coluna assinatura pode armazenar uma URL ou data URI (base64) */}
                    <img src={e.assinatura} alt="assinatura" style={{ maxWidth: 240, borderRadius: 6, display: 'block' }} />
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// --- VISÃO DO MOTORISTA (CELULAR) ---
function DriverView({ pedidos, setPedidos }) {
  const [aberto, setAberto] = useState(false);
  const [assinando, setAssinando] = useState(null);
  const sigRef = useRef({});

  const abrirWhatsApp = (item, motivo) => {
    const texto = `Relatório: Pedido ${item.id} - ${motivo}`;
    window.open(`https://wa.me/${WHATSAPP_GESTOR}?text=${encodeURIComponent(texto)}`, '_blank');
  };

  // Define a posição "fechada" baseada na existência de pedidos
  // Se não tem pedidos, fica quase sumido (93%). Se tem, mostra o contador (85%).
  const posicaoFechado = pedidos.length === 0 ? '93%' : '85%';

  return (
    <div style={containerStyle}>
      <GoogleMap mapContainerStyle={mapStyle} center={{ lat: -23.55, lng: -46.63 }} zoom={14} options={{ disableDefaultUI: true }} />

      {/* PAINEL DINÂMICO (BOTTOM SHEET) */}
      <motion.div
        drag="y" // Permite arrastar para cima/baixo
        dragConstraints={{ top: 0, bottom: 0 }} // Limita o arrasto para não sair da tela
        initial={{ y: posicaoFechado }}
        animate={{ y: aberto ? '15%' : posicaoFechado }} // Abre até 15% do topo
        onDragEnd={(e, info) => {
          // Se puxar rápido para cima (offset negativo), ele abre
          if (info.offset.y < -50) setAberto(true);
          // Se puxar para baixo, ele fecha
          if (info.offset.y > 50) setAberto(false);
        }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        style={sheetStyle}
      >
        {/* Barra de Arrastar (Handle) */}
        <div style={dragHandle} onClick={() => setAberto(!aberto)} />

        {/* Cabeçalho que mostra o número de entregas */}
        <div style={{ textAlign: 'center', paddingBottom: '20px' }}>
          <h3 style={{ margin: 0 }}>
            {pedidos.length > 0
              ? `🔔 ${pedidos.length} ${pedidos.length === 1 ? 'Pedido disponível' : 'Pedidos disponíveis'}`
              : '✅ Tudo pronto!'}
          </h3>
          {pedidos.length > 0 && !aberto && (
            <p style={{ fontSize: '12px', color: '#007bff', marginTop: '5px' }}>Arraste para cima para ver</p>
          )}
        </div>

        {/* LISTA DE PEDIDOS COM SCRUB (ROLAGEM) */}
        <div style={scrollListStyle}>
          {pedidos.map(item => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              style={cardStyle}
            >
              <div style={{ flex: 1 }}>
                <strong>{item.cliente}</strong>
                <p style={{ fontSize: '13px', color: '#ccc', margin: '5px 0' }}>{item.local}</p>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => setAssinando(item.id)} style={btnConcluir}>Concluir</button>
                <select
                  style={btnNaoEntregue}
                  onChange={(e) => abrirWhatsApp(item, e.target.value)}
                  defaultValue=""
                >
                  <option value="" disabled>❌</option>
                  <option value="Cliente ausente">Cliente ausente</option>
                  <option value="Local fechado">Local fechado</option>
                </select>
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* MODAL DE ASSINATURA (Permanece igual) */}
      <AnimatePresence>
        {assinando && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={overlay}>
            <div style={modalCorpo}>
              <h3 style={{ marginBottom: '15px' }}>Assinatura do Cliente</h3>
              <div style={{ background: '#fff', borderRadius: '12px', overflow: 'hidden' }}>
                <SignatureCanvas ref={sigRef} canvasProps={{ width: 320, height: 200 }} />
              </div>
              <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                <button onClick={() => setAssinando(null)} style={btnVoltar}>Voltar</button>
                <button
                  onClick={() => {
                    setPedidos(pedidos.filter(p => p.id !== assinando));
                    setAssinando(null);
                  }}
                  style={btnFinal}
                >
                  Confirmar Entrega
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

