import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';
import SignatureCanvas from 'react-signature-canvas';
import { Trash2, Plus, Send, Settings, CheckCircle, Clock, History, AlertCircle, XCircle, GripVertical, AlertTriangle, MessageCircle, Save, Eye, FileText, Box, Truck, Search, X, Users, MapPin, Activity, Navigation } from 'lucide-react';
import { DndContext, closestCenter } from '@dnd-kit/core';
import { arrayMove, SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// Importações do Mapa
import { GoogleMap, useJsApiLoader, Marker, InfoWindow, Autocomplete, Circle } from '@react-google-maps/api';
import { humanizeSupabaseError, safeInsertMotorista } from './utils/supabaseHelpers';

// Áudio curto para alertas (pode trocar por outro link se desejar)
const SOM_ALARME_URL = 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3';

// Libraries do Google Maps (constante fora do componente para evitar recargas)
const GOOGLE_MAPS_LIBRARIES = ['places', 'maps'];

// Estilo escuro simples para o mapa do motorista
const MAP_DARK_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#0b0e14' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#94a3b8' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0b0e14' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1f2937' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#cbd5e1' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#111827' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#94a3b8' }] },
];

// --- OPÇÕES DE NÃO ENTREGA ---
const motivosOpcoes = [
  "Cliente Ausente",
  "Endereço Não Encontrado",
  "Estabelecimento Fechado",
  "Cliente Recusou Pedido",
  "Veículo Quebrado",
  "Trânsito/Bloqueio",
  "Outros (Digitar...)"
];

// Remoção de configurações do Leaflet e AutoZoom (migração para Google Maps)

// --- COMPONENTES DE ARRASTE (DND-KIT) ---
const ItemDaRota = ({ entrega, index, onAssinar, onFalha }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: entrega.id });

  const cardBaseStyle = {
    background: '#1e293b',
    padding: '15px',
    borderRadius: '12px',
    marginBottom: '10px',
    boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
    color: '#fff'
  };

  const style = {
    ...cardBaseStyle,
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 1,
    opacity: isDragging ? 0.8 : 1,
    background: isDragging ? '#2d3748' : cardBaseStyle.background,
    borderLeft: entrega.tipo === 'Recolha' ? '5px solid #f59e0b' : '5px solid #3b82f6',
    cursor: 'grab',
    touchAction: 'none'
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ color: '#22c55e', fontWeight: 'bold', fontSize: '16px' }}>#{index + 1}</span>
          <span style={{ color: '#fff', fontWeight: 'normal' }}>{entrega.cliente}</span>
        </div>
        {entrega.status === 'concluido' && <span style={{ color: '#22c55e', fontSize: '16px', fontWeight: 'bold' }}>✓ Concluído</span>}
      </div>
      <p style={{ color: '#ccc', fontSize: '13px', margin: '5px 0' }}>{entrega.endereco}</p>
      {/* BOTÕES NO CARD DO MOTORISTA */}
      <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
        {/* BOTÃO CONCLUIR */}
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            console.log('Abrindo assinatura para:', entrega.cliente);
            onAssinar(entrega);
          }}
          style={{ flex: 1, padding: '12px', background: '#22c55e', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold' }}
        >
          CONCLUIR
        </button>

        {/* BOTÃO NÃO ENTREGUE */}
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onFalha(entrega);
          }}
          style={{ flex: 1, padding: '12px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold' }}
        >
          NÃO ENTREGUE
        </button>
      </div>
    </div>
  );
};

const MinhaRotaOrdenavel = ({ entregas, setEntregas, onAssinar, onFalha }) => {
  const aoArrastarFinalizar = (event) => {
    const { active, over } = event;
    if (active.id !== over.id) {
      setEntregas((items) => {
        const antigoIndex = items.findIndex((i) => i.id === active.id);
        const novoIndex = items.findIndex((i) => i.id === over.id);
        return arrayMove(items, antigoIndex, novoIndex);
      });
    }
  };

  return (
    <DndContext collisionDetection={closestCenter} onDragEnd={aoArrastarFinalizar}>
      <SortableContext items={entregas} strategy={verticalListSortingStrategy}>
        <div style={{ padding: '15px' }}>
          {entregas.map((entrega, index) => (
            <ItemDaRota key={entrega.id} entrega={entrega} index={index} onAssinar={onAssinar} onFalha={onFalha} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
};

// --- APP MOTORISTA: GOOGLE MAPS + LAYOUT ANTIGO ---
const MotoristaRestaurado = ({ isLoaded, entregas: entregasIniciais, onConcluir, numeroGestor, setMotoristaLogado, setMotoristaIdLogado }) => {
  const googleMapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  if (!googleMapsApiKey) {
    return (
      <div style={{ color: '#f87171', padding: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100dvh', background: '#0b0e14' }}>
        <div>
          <h3>Chave do Google Maps ausente</h3>
          <p>Configure a variável <code>VITE_GOOGLE_MAPS_API_KEY</code> para carregar o mapa.</p>
        </div>
      </div>
    );
  }

  // Fluxo interno do motorista: welcome -> register -> map
  const [motoristaStep, setMotoristaStep] = useState('welcome');
  const [regForm, setRegForm] = useState({ nome: '', tel: '', senha: '' });

  // 1) Estado do centro do mapa (inicial com valor padrão)
  const [centroMapa, setCentroMapa] = useState({ lat: -23.5505, lng: -46.6333 });
  // Container fixo do mapa (usa dvh para altura real no mobile)
  const mapContainerStyle = { width: '100vw', height: '100dvh', position: 'absolute', top: 0, left: 0 };
  const [mapaInstancia, setMapaInstancia] = useState(null);
  // Mostra a sobreposição de debug automaticamente em dev no mobile ou se ?debug=1
  const [debugOverlayVisible, setDebugOverlayVisible] = useState((process.env.NODE_ENV !== 'production' && window.innerWidth < 768) || (new URLSearchParams(window.location.search).get('debug') === '1'));
  const [geoPermission, setGeoPermission] = useState(null);
  const [entregas, setEntregas] = useState(entregasIniciais);
  const [showSignature, setShowSignature] = useState(false);
  const [entregaAtual, setEntregaAtual] = useState(null);
  const sigPad = useRef(null);

  useEffect(() => {
    setEntregas(entregasIniciais);
  }, [entregasIniciais]);

  // 2) Captura a localização atual do motorista (uma vez ao abrir o app)
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const pos = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          };
          setCentroMapa(pos); // Move o mapa para onde o motorista está
          if (mapaInstancia && window.google && window.google.maps) {
            mapaInstancia.panTo(pos);
          }
          console.log('Localização do motorista capturada:', pos);
        },
        (err) => {
          console.error('Erro: O motorista negou o GPS ou o sinal está fraco.', err);
        },
        { enableHighAccuracy: true }
      );
    }

    // Pergunta o estado da permissão (se suportado)
    if (navigator.permissions) {
      navigator.permissions.query({ name: 'geolocation' }).then((p) => {
        setGeoPermission(p.state);
        p.onchange = () => setGeoPermission(p.state);
      }).catch(() => setGeoPermission(null));
    } else {
      setGeoPermission('unsupported');
    }
  }, []);

  // Função para buscar entregas atualizadas do banco
  const buscarEntregas = async () => {
    try {
      const motoristaId = localStorage.getItem('motoristaId') || localStorage.getItem('mot_v10_id');
      if (!motoristaId) return;

      const { data, error } = await supabase
        .from('entregas')
        .select('*')
        .eq('motorista_id', motoristaId)
        .order('ordem', { ascending: true });

      if (!error && data) {
        setEntregas(data);
        console.info('buscarEntregas: carregadas', data.length, 'entregas');
      }
    } catch (err) {
      console.error('Erro ao buscar entregas:', err);
    }
  };

  // Se o motorista ainda não avançou para o mapa, mostramos o fluxo de boas-vindas / cadastro
  if (motoristaStep === 'welcome') {
    return (
      <div style={{ height: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0b0e14', color: '#fff', padding: 20 }}>
        <div style={{ maxWidth: 480, textAlign: 'center' }}>
          <h1 style={{ fontSize: 28, marginBottom: 8 }}>🚚 Bem-vindo, Motorista</h1>
          <p style={{ color: '#94a3b8', marginBottom: 20 }}>Use o botão abaixo para criar sua conta e começar a receber entregas no app motorista.</p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button onClick={() => setMotoristaStep('register')} style={{ padding: '12px 18px', background: '#22c55e', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold' }}>Criar Conta</button>
            <button onClick={() => setMotoristaStep('map')} style={{ padding: '12px 18px', background: '#3b82f6', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold' }}>Entrar sem cadastro</button>
          </div>
        </div>
      </div>
    );
  }

  if (motoristaStep === 'register') {
    return (
      <div style={{ height: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0b0e14', color: '#fff', padding: 20 }}>
        <div style={{ width: '100%', maxWidth: 480 }}>
          <h2 style={{ marginTop: 0 }}>Criar Conta de Motorista</h2>
          <label style={{ color: '#94a3b8' }}>Nome completo</label>
          <input value={regForm.nome} onChange={(e) => setRegForm(r => ({ ...r, nome: e.target.value }))} style={{ width: '100%', padding: 10, marginBottom: 10 }} />
          <label style={{ color: '#94a3b8' }}>Telefone (com DDD)</label>
          <input value={regForm.tel} onChange={(e) => setRegForm(r => ({ ...r, tel: e.target.value }))} style={{ width: '100%', padding: 10, marginBottom: 10 }} />
          <label style={{ color: '#94a3b8' }}>Senha</label>
          <input type="password" value={regForm.senha} onChange={(e) => setRegForm(r => ({ ...r, senha: e.target.value }))} style={{ width: '100%', padding: 10, marginBottom: 20 }} />
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={async () => {
              const telClean = (regForm.tel || '').replace(/\D/g, '');
              if (!telClean || telClean.length < 10) return alert('Informe um telefone válido com DDD (ex: 5511999999999).');
              try {
                const payload = { nome: regForm.nome || regForm.tel, motoristas: regForm.nome || regForm.tel, tel: regForm.tel, telefone: regForm.tel, senha: regForm.senha };
                const { data, error } = await supabase.from('motoristas').insert([payload]).select().maybeSingle();
                if (error) {
                  alert(humanizeSupabaseError(error));
                } else {
                  const nomeUsuario = data?.motoristas || data?.nome || payload.motoristas;
                  setMotoristaLogado?.(nomeUsuario);
                  setMotoristaIdLogado?.(data?.id || null);
                  localStorage.setItem('mot_v10_nome', nomeUsuario);
                  if (data?.id) { localStorage.setItem('mot_v10_id', data.id); localStorage.setItem('motoristaId', data.id); }
                  setMotoristaStep('map');
                  buscarEntregas();
                }
              } catch (err) {
                console.error('Erro ao cadastrar motorista:', err);
                alert('Erro ao cadastrar motorista. Tente novamente.');
              }
            }} style={{ padding: '12px 18px', background: '#22c55e', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold' }}>Cadastrar</button>
            <button onClick={() => setMotoristaStep('welcome')} style={{ padding: '12px 18px', background: '#64748b', border: 'none', borderRadius: 8, cursor: 'pointer' }}>Voltar</button>
          </div>
        </div>
      </div>
    );
  }

  // Somente quando for pra renderizar o mapa exigimos que o Google já esteja carregado
  if (!isLoaded && motoristaStep === 'map') {
    return (
      <div style={{ background: '#0b0e14', height: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
        <strong>Carregando GPS Ativo...</strong>
      </div>
    );
  }

  // Sobreposição de debug local (útil em mobile/dev ou com ?debug=1)
  const debugOverlay = debugOverlayVisible ? (
    <div style={{ position: 'fixed', left: 8, top: 8, zIndex: 5000, background: 'rgba(0,0,0,0.75)', color: '#fff', padding: 10, borderRadius: 6, fontSize: 12 }}>
      <div style={{ fontWeight: 'bold', marginBottom: 6 }}>DEBUG (mobile)</div>
      <div>isLoaded: {String(isLoaded)}</div>
      <div>google: {window && window.google ? 'ok' : 'missing'}</div>
      <div>mapaInstancia: {mapaInstancia ? 'ready' : 'null'}</div>
      <div>geolocalização suportada: {navigator && navigator.geolocation ? 'sim' : 'não'}</div>
      <div>permissão GPS: {geoPermission ?? 'desconhecido'}</div>
      <div style={{ marginTop: 8 }}>
        <button onClick={() => setDebugOverlayVisible(false)} style={{ padding: '6px 8px', borderRadius: 6, border: 'none', background: '#334155', color: 'white', cursor: 'pointer' }}>Fechar</button>
      </div>
    </div>
  ) : null;

  // Centro padrão do mapa (pode ser atualizado dinamicamente) — usando a constante já definida no topo do componente

  // Permite forçar um refresh/resizing do mapa (útil para debug no mobile)
  const forceRefreshMapa = () => {
    try {
      if (mapaInstancia && window.google && window.google.maps) {
        console.info('forceRefreshMapa: acionando resize');
        window.google.maps.event.trigger(mapaInstancia, 'resize');
        if (entregas && entregas.length > 0) {
          mapaInstancia.panTo({ lat: Number(entregas[0].lat) || centroMapa.lat, lng: Number(entregas[0].lng) || centroMapa.lng });
        } else {
          mapaInstancia.panTo(centroMapa);
        }
      } else {
        console.warn('forceRefreshMapa: mapaInstancia ou window.google ausente', { mapaInstancia, hasGoogle: !!window.google });
      }
    } catch (e) {
      console.error('Erro em forceRefreshMapa:', e);
    }
  };

  const comunicarFalha = async (item) => {
    if (!item) return;
    try {
      // 1. Atualiza o banco primeiro
      const { error } = await supabase
        .from('entregas')
        .update({ status: 'falha' })
        .eq('id', item.id);

      if (!error) {
        // 2. Busca o número do gestor na tabela 'tel' (fallback)
        let foneGestor = '';
        try {
          const { data: telData } = await supabase.from('tel').select('numero').single();
          foneGestor = (telData?.numero || numeroGestor || '5548999999999').replace(/\D/g, '');
        } catch {
          foneGestor = (numeroGestor || '5548999999999').replace(/\D/g, '');
        }

        const mensagem = `AVISO: Entrega para ${item.cliente} NÃO realizada. Motivo: Cliente Ausente.`;
        const url = `https://api.whatsapp.com/send?phone=${foneGestor}&text=${encodeURIComponent(mensagem)}`;
        window.open(url, '_blank');

        // 3. Atualiza a lista na tela (local)
        setEntregas((prev) => prev.map((e) => (e.id === item.id ? { ...e, status: 'falha' } : e)));
      } else {
        alert('Erro ao atualizar status: ' + error.message);
      }
    } catch (err) {
      alert('Erro ao comunicar a falha.');
    }
  };

  const abrirAssinatura = (item) => {
    setEntregaAtual(item);
    setShowSignature(true);
  };

  const salvarAssinatura = async () => {
    try {
      const imagemBase64 = sigPad.current.getCanvas().toDataURL('image/png');

      // 1. Atualiza no Supabase
      const { error } = await supabase
        .from('entregas')
        .update({
          status: 'concluido',
          assinatura: imagemBase64
        })
        .eq('id', entregaAtual.id);

      if (!error) {
        // 2. Fecha o modal
        setShowSignature(false);

        // 3. O SEGREDO: Atualiza a lista local.
        await buscarEntregas();
        console.info('salvarAssinatura: entrega', entregaAtual.id, 'marcada como concluido');

        alert("Entrega realizada!");
      }
    } catch (err) {
      console.error('Erro salvarAssinatura:', err);
      alert('Erro ao salvar: ' + (err.message || err));
    }

  };

  // Função para finalizar rota (apagar registros e limpar estado local)
  const finalizarRotaCompleta = async () => {
    // GARANTA QUE ESSA LINHA EXISTE DENTRO DA FUNÇÃO
    const motoristaIdLogado = localStorage.getItem('motoristaId') || "2";

    if (window.confirm("Deseja apagar o mapa?")) {
      const { error } = await supabase
        .from('entregas')
        .delete()
        .eq('motorista_id', motoristaIdLogado);

      if (!error) setEntregas([]);
    }
  };

  // --- Helpers de teste (disponibiliza funções no window.__test para QA/manual) ---
  const marcarEntregaConcluida = async (id) => {
    try {
      const { error } = await supabase.from('entregas').update({ status: 'concluido' }).eq('id', id);
      if (error) throw error;
      await buscarEntregas();
      console.info('marcarEntregaConcluida: id', id);
    } catch (err) {
      console.error('Erro ao marcar entrega como concluida:', err.message || err);
    }
  };

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') {
      window.__test = {
        buscarEntregas,
        finalizarRotaCompleta,
        marcarEntregaConcluida
      };
      console.info('Hooks de teste disponíveis em window.__test (buscarEntregas, finalizarRotaCompleta, marcarEntregaConcluida)');
    }
  }, [buscarEntregas, finalizarRotaCompleta, marcarEntregaConcluida]);

  return (
    <div style={{
      width: '100vw',
      height: '100dvh', // 'dvh' adapta a altura ignorando a barra de endereços do celular
      display: 'flex',
      flexDirection: 'column',
      position: 'relative',
      overflow: 'hidden', // Impede que a tela "dance" no celular
      background: '#0b0e14'
    }}>
      {/* Debug overlay (apenas em dev) */}
      {debugOverlayVisible && (
        <div style={{ position: 'fixed', left: 12, bottom: 12, zIndex: 4000, background: 'rgba(0,0,0,0.75)', color: '#fff', padding: 10, borderRadius: 8, fontSize: 12, minWidth: 180 }}>
          <div style={{ fontWeight: 'bold', marginBottom: 6 }}>DEBUG</div>
          <div>isLoaded: {String(isLoaded)}</div>
          <div>google: {window && window.google ? 'ok' : 'missing'}</div>
          <div>mapaInstancia: {mapaInstancia ? 'ready' : 'null'}</div>
          <div>entregas: {entregas ? entregas.length : 0}</div>
          <div>vv.h: {window.visualViewport ? Math.round(window.visualViewport.height) : 'na'}</div>
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <button onClick={forceRefreshMapa} style={{ background: '#22c55e', color: '#000', border: 'none', padding: '6px 8px', borderRadius: 6 }}>Forçar resize</button>
            <button onClick={() => { console.log({ isLoaded, mapaInstancia, entregas, hasGoogle: !!window.google, vv: window.visualViewport?.height }); }} style={{ background: '#3b82f6', color: '#fff', border: 'none', padding: '6px 8px', borderRadius: 6 }}>Log</button>
            <button onClick={() => setDebugOverlayVisible(false)} style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '6px 8px', borderRadius: 6 }}>Fechar</button>
          </div>
        </div>
      )}

      {/* MAPA: ocupa toda a tela (atrás do painel inferior) */}
      <div style={{ flex: 1, position: 'relative' }}>
        <GoogleMap
          mapContainerStyle={mapContainerStyle}
          center={centroMapa}
          zoom={14}
          options={{ disableDefaultUI: true, backgroundColor: '#0b0e14' }}
          onLoad={(mapInstance) => { setMapaInstancia(mapInstance); console.info('Motorista map loaded'); }}
        >
          {entregas.map((p, index) => (
            <Marker
              key={p.id}
              position={{ lat: Number(p.lat), lng: Number(p.lng) }}
              label={{ text: `${index + 1}`, color: 'black', fontWeight: 'bold' }}
              icon={(() => {
                try {
                  if (window.google && window.google.maps) {
                    return {
                      path: "M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z",
                      fillColor: p.status === 'concluido' ? '#22c55e' : 'red',
                      fillOpacity: 1,
                      strokeWeight: 2,
                      strokeColor: '#fff',
                      scale: 2,
                      anchor: new window.google.maps.Point(12, 22),
                      labelOrigin: new window.google.maps.Point(12, 9)
                    };
                  }
                } catch (e) {
                  console.error('Erro ao criar ícone do marcador:', e);
                }

                // Fallback simples: pino do Google Maps (URL)
                return {
                  url: p.status === 'concluido' ? 'https://maps.google.com/mapfiles/ms/icons/green-dot.png' : 'https://maps.google.com/mapfiles/ms/icons/red-dot.png'
                };
              })()}
            />
          ))}
        </GoogleMap>
      </div>

      {/* LISTA DE CARDS - FILTRADA */}
      {/* Painel inferior: fundo semi-transparente com blur */}
      <div style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        height: '50%',
        background: 'rgba(21, 26, 34, 0.85)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        borderTop: '1px solid rgba(255, 255, 255, 0.1)',
        padding: '15px',
        overflowY: 'auto',
        zIndex: 10,
        borderTopLeftRadius: '20px',
        borderTopRightRadius: '20px'
      }}>
        {/* Filtramos para mostrar apenas quem NÃO tem status 'concluido' */}
        {entregas.filter(e => e.status !== 'concluido').length > 0 ? (
          <MinhaRotaOrdenavel
            entregas={entregas.filter(e => e.status !== 'concluido')}
            setEntregas={setEntregas}
            onAssinar={abrirAssinatura}
            onFalha={comunicarFalha}
          />
        ) : (
          /* QUANDO TERMINAR TUDO, APARECE O BOTÃO FINAL */
          <div style={{ textAlign: 'center', padding: '20px' }}>
            <h3 style={{ color: '#22c55e' }}>🎉 Todas as entregas feitas!</h3>
            <button
              onClick={finalizarRotaCompleta}
              style={{
                width: '100%',
                padding: '20px',
                background: '#22c55e',
                color: '#fff',
                fontWeight: 'bold',
                border: 'none',
                borderRadius: '10px',
                fontSize: '18px',
                cursor: 'pointer',
                boxShadow: '0 4px 15px rgba(34, 197, 94, 0.4)'
              }}
            >
              CONCLUIR ROTA (APAGAR MAPA)
            </button>
          </div>
        )}
      </div>

      {/* MODAL DE ASSINATURA */}
      {showSignature && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ background: '#fff', padding: '20px', borderRadius: '15px', width: '100%', maxWidth: '400px' }}>
            <h3 style={{ color: '#000', marginTop: 0 }}>Assine aqui:</h3>
            <div style={{ border: '2px dashed #ccc', borderRadius: '10px', overflow: 'hidden' }}>
              <SignatureCanvas ref={sigPad} canvasProps={{ width: 350, height: 200, className: 'sigCanvas' }} />
            </div>
            <div style={{ display: 'flex', gap: '10px', marginTop: '15px' }}>
              <button onClick={() => { setShowSignature(false); setEntregaAtual(null); }} style={{ flex: 1, padding: '10px', background: '#666', border: 'none', color: '#fff', borderRadius: '5px' }}>Cancelar</button>
              <button onClick={() => sigPad.current && sigPad.current.clear()} style={{ flex: 1, padding: '10px', background: '#f59e0b', border: 'none', color: '#fff', borderRadius: '5px' }}>Limpar</button>
              <button onClick={salvarAssinatura} style={{ flex: 2, padding: '10px', background: '#22c55e', border: 'none', color: '#fff', borderRadius: '5px', fontWeight: 'bold' }}>FINALIZAR</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};


function WelcomeScreen({ onNext }) {
  return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0b0e14', color: '#fff', padding: 20 }}>
      <div style={{ maxWidth: 480, textAlign: 'center' }}>
        <h1 style={{ fontSize: 28, marginBottom: 8 }}>🚚 Logística V2</h1>
        <p style={{ color: '#94a3b8', marginBottom: 20 }}>Bem-vindo ao sistema. Clique em começar para acessar o app.</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button onClick={onNext} style={{ padding: '12px 18px', background: '#22c55e', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold' }}>Começar</button>
        </div>
      </div>
    </div>
  );
}

function App() {
  // Se estivermos na tela de boas-vindas, exibe e retorna (aparece sempre)
  if (view === 'welcome') {
    return <WelcomeScreen onNext={() => setView(window.innerWidth < 768 ? 'motorista' : 'gestor')} />;
  }

  // --- ESTADOS GERAIS ---
  const [entregas, setEntregas] = useState([]);
  const [motoristas, setMotoristas] = useState([]);

  // --- ESTADO NOVO: WHATSAPP DO GESTOR ---
  const [numeroGestor, setNumeroGestor] = useState('5500000000000');
  const [inputZapConfig, setInputZapConfig] = useState('');

  // --- ESTADOS MOTORISTA ---
  const [motoristaLogado, setMotoristaLogado] = useState(localStorage.getItem('mot_v10_nome') || null);
  const [motoristaIdLogado, setMotoristaIdLogado] = useState(localStorage.getItem('mot_v10_id') ? Number(localStorage.getItem('mot_v10_id')) : null);
  const [configurado, setConfigurado] = useState(localStorage.getItem('mot_v10_checkin') === 'true');
  const [form, setForm] = useState({ tel: '', senha: '' });
  const [mostrarAssinatura, setMostrarAssinatura] = useState(false);
  const [mostrarMotivo, setMostrarMotivo] = useState(false);
  const [motivoSelecionado, setMotivoSelecionado] = useState('');
  const [motivoTexto, setMotivoTexto] = useState('');
  const [entregaFocada, setEntregaFocada] = useState(null);

  const sigPad = useRef(null);

  // --- ESTADOS GESTOR ---
  const [rascunho, setRascunho] = useState([]);
  const [inputCliente, setInputCliente] = useState('');
  const [inputEndereco, setInputEndereco] = useState('');
  const [inputInfo, setInputInfo] = useState('');
  const [inputTipo, setInputTipo] = useState('entrega');
  const [tipoPonto, setTipoPonto] = useState('Entrega'); // 'Entrega' ou 'Recolha'
  const [motoristaSelecionado, setMotoristaSelecionado] = useState('');
  const [coordsMotorista, setCoordsMotorista] = useState(null);
  const [coordsGestor, setCoordsGestor] = useState(null);
  const [tabAtiva, setTabAtiva] = useState('nova');
  const [abaMotoristasAberta, setAbaMotoristasAberta] = useState(false);
  const [abaAtiva, setAbaAtiva] = useState('rota'); // 'rota' ou 'historico'
  const [autocomplete, setAutocomplete] = useState(null);
  const [tempCoords, setTempCoords] = useState(null);
  const [somHabilitado, setSomHabilitado] = useState(true);
  const somNovaEntregaRef = useRef(null);

  // Dev helper: limpa localStorage de motorista para testes
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') {
      localStorage.removeItem('mot_v10_id');
      localStorage.removeItem('motoristaId');
      localStorage.removeItem('mot_v10_nome');
      console.info('dev: cleared motorista localStorage keys');
    }
  }, []);

  // Loader do Google Maps e InfoWindow selecionada
  const googleMapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  if (!googleMapsApiKey) console.error('VITE_GOOGLE_MAPS_API_KEY não definida — o mapa pode falhar ao carregar.');

  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey,
    libraries: GOOGLE_MAPS_LIBRARIES,
  });
  const [pontoAtivo, setPontoAtivo] = useState(null);
  const [mapaInstancia, setMapaInstancia] = useState(null);
  // Debug overlay (apenas em dev)
  const [debugOverlayVisible, setDebugOverlayVisible] = useState(process.env.NODE_ENV !== 'production');

  // Ajustes para mobile: força resize quando a viewport visual muda (barra de endereço aparece/some)
  useEffect(() => {
    const handleResize = () => {
      try {
        if (mapaInstancia && window.google && window.google.maps) {
          console.info('Forçando resize do mapa por mudança de viewport/resize');
          window.google.maps.event.trigger(mapaInstancia, 'resize');
          // Recentraliza para evitar tiles pretos
          if (entregas && entregas.length > 0) {
            mapaInstancia.panTo({ lat: Number(entregas[0].lat) || centroMapa.lat, lng: Number(entregas[0].lng) || centroMapa.lng });
          } else {
            mapaInstancia.panTo(centroMapa);
          }
        }
      } catch (e) {
        console.warn('Erro no resize handler do mapa:', e);
      }
    };

    const vv = window.visualViewport;
    if (vv && vv.addEventListener) {
      vv.addEventListener('resize', handleResize);
    } else {
      window.addEventListener('resize', handleResize);
      window.addEventListener('orientationchange', handleResize);
    }

    return () => {
      if (vv && vv.removeEventListener) {
        vv.removeEventListener('resize', handleResize);
      } else {
        window.removeEventListener('resize', handleResize);
        window.removeEventListener('orientationchange', handleResize);
      }
    };
  }, [mapaInstancia, entregas]);

  const [comprovanteAtivo, setComprovanteAtivo] = useState(null);
  const [temposEstimados, setTemposEstimados] = useState([]);
  const [direcoes, setDirecoes] = useState(null);
  const [resumoRota, setResumoRota] = useState({ km: 0, tempo: 0 });

  // --- BUSCA DE DADOS ---
  const buscarDados = async () => {
    // Versão simplificada para destravar o erro 400
    if (view === 'motorista' && motoristaIdLogado) {
      // No celular, busca direto pelo ID do motorista logado
      const { data, error } = await supabase
        .from('entregas')
        .select('*')
        .eq('motorista_id', motoristaIdLogado)
        .order('ordem', { ascending: true });

      if (error) {
        console.error("ERRO DETALHADO DO SUPABASE:", error.message);
        console.error("DICA DO ERRO:", error.hint);
      } else {
        setEntregas(data || []);
      }
    } else {
      // No gestor, continua a busca normal
      // 1) Motoristas primeiro (para descobrirmos o ID do selecionado)
      const { data: m } = await supabase.from('motoristas').select('*');
      let motoristaIdSelecionado = null;
      if (m) {
        const listaReal = m.filter(x => x.motoristas !== 'CONFIG_ZAP');
        setMotoristas(listaReal);

        const config = m.find(x => x.motoristas === 'CONFIG_ZAP');
        if (config && config.tel) setNumeroGestor(config.tel);

        if (motoristaSelecionado) {
          const mot = listaReal.find(x => (x.nome || x.motoristas) === motoristaSelecionado);
          if (mot) motoristaIdSelecionado = mot.id;
          if (mot && mot.lat && mot.lng) setCoordsMotorista({ lat: mot.lat, lng: mot.lng });
        }
      }

      // 2) Buscar entregas filtradas pelo motorista (preferência por motorista_id)
      let baseQuery = supabase.from('entregas').select('*');
      if (motoristaSelecionado) {
        if (motoristaIdSelecionado) {
          baseQuery = baseQuery.eq('motorista_id', motoristaIdSelecionado);
        } else {
          baseQuery = baseQuery.eq('motorista', motoristaSelecionado);
        }
      }

      // Ordena por 'ordem'
      let eRes = await baseQuery.order('ordem', { ascending: true });
      if (eRes.data) setEntregas(eRes.data);
      if (eRes.error) console.error("Erro ao buscar entregas:", eRes.error.message);
    }
  };

  useEffect(() => {
    buscarDados();
    buscarZapGestor(); // Carregar número do WhatsApp do gestor
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setCoordsGestor({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        (err) => console.error(err)
      );
    }
    const canal = supabase.channel('logistica_v10').on('postgres_changes', { event: '*', schema: 'public', table: 'entregas' }, () => buscarDados()).subscribe();
    return () => supabase.removeChannel(canal);
  }, [entregas.length, motoristaSelecionado]);

  // Ouvinte de novas entregas para o motorista logado: comparação flexível para aceitar número ou string
  useEffect(() => {
    if (!motoristaIdLogado) return;

    // Criamos um canal único para evitar conflito com sessões antigas
    const canalV2 = supabase
      .channel(`rota-ativa-${Math.random()}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'entregas'
        },
        (payload) => {
          console.log("Sinal recebido!", payload);
          // Usamos == (dois iguais) para comparar 2 com "2" sem dar erro
          if (String(payload.new.motorista_id) === String(motoristaIdLogado)) {
            if (somHabilitado && somNovaEntregaRef.current) {
              try {
                somNovaEntregaRef.current.currentTime = 0;
                somNovaEntregaRef.current.play();
              } catch (e) {
                console.log('Erro ao tocar áudio:', e);
              }
            }

            if (navigator.vibrate) {
              navigator.vibrate([200, 100, 200]);
            }

            buscarDados();
          }
        }
      )
      .subscribe();

    return () => supabase.removeChannel(canalV2);
  }, [motoristaIdLogado, somHabilitado]);

  // Inicializa o som uma única vez para evitar recriações por render
  useEffect(() => {
    try {
      somNovaEntregaRef.current = new Audio(SOM_ALARME_URL);
      somNovaEntregaRef.current.preload = 'auto';
      somNovaEntregaRef.current.volume = 1.0;
    } catch { }
  }, []);

  // Restaura check-in salvo
  useEffect(() => {
    const salvo = localStorage.getItem('mot_v10_checkin');
    if (salvo === 'true') setConfigurado(true);
  }, []);

  // Realtime: atualiza pinos e cores no mapa do gestor quando uma entrega é atualizada
  useEffect(() => {
    const canalUpdates = supabase
      .channel('mudancas-entregas')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'entregas' }, (payload) => {
        console.log('Mudança detectada!', payload);
        buscarDados();
      })
      .subscribe();

    return () => { supabase.removeChannel(canalUpdates); };
  }, []);

  // === CONFIGURAÇÃO DE EMERGÊNCIA (Reconexão Realtime) ===
  useEffect(() => {
    const canalV2 = supabase
      .channel('db-changes')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'entregas' },
        (payload) => {
          console.log("Mudança detectada no canal de emergência!", payload);
          // Recarrega os dados se houver qualquer mudança na tabela
          buscarDados();
        }
      )
      .subscribe((status) => {
        console.log("Status da conexão Realtime:", status);
      });

    return () => { supabase.removeChannel(canalV2); };
  }, []);

  // === AUTO-CORREÇÃO DE ENVIO (Canal de Emergência para INSERTs) ===
  useEffect(() => {
    const canalEmergencia = supabase
      .channel('reparo-envio')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'entregas' }, (payload) => {
        // Forçamos a atualização independente de filtros complexos
        console.log("Nova entrega detectada no banco!");
        buscarDados();
      })
      .subscribe();

    return () => supabase.removeChannel(canalEmergencia);
  }, []);

  // Auto-zoom para mostrar rascunho e posição da moto
  useEffect(() => {
    if (mapaInstancia && (rascunho.length > 0 || coordsMotorista)) {
      try {
        const bounds = new window.google.maps.LatLngBounds();

        // Inclui a moto/gestor nos limites
        if (coordsMotorista) {
          bounds.extend({ lat: Number(coordsMotorista.lat), lng: Number(coordsMotorista.lng) });
        } else {
          bounds.extend({ lat: -27.6438, lng: -48.6674 });
        }

        // Inclui todos os pedidos do rascunho em Palhoça e região
        rascunho.forEach((ponto) => {
          if (ponto.lat && ponto.lng) {
            bounds.extend({ lat: Number(ponto.lat), lng: Number(ponto.lng) });
          }
        });

        // Faz o mapa se distanciar para mostrar tudo
        if (rascunho.length > 0 || coordsMotorista) {
          mapaInstancia.fitBounds(bounds, 80);
        }
      } catch (e) {
        console.warn('Erro ao ajustar zoom:', e);
      }
    }
  }, [rascunho, coordsMotorista, mapaInstancia]);


  // --- RASTREAMENTO DO MOTORISTA ---
  useEffect(() => {
    let watchId;
    if (view === 'motorista' && motoristaLogado) {
      if ("geolocation" in navigator) {
        watchId = navigator.geolocation.watchPosition(async (pos) => {
          await supabase.from('motoristas').update({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            ultimo_sinal: new Date().toISOString()
          }).eq('nome', motoristaLogado);
        }, (err) => console.error(err), { enableHighAccuracy: true });
      }
    }
    return () => { if (watchId) navigator.geolocation.clearWatch(watchId); }
  }, [view, motoristaLogado]);


  // --- FUNÇÕES DO GESTOR ---
  // Função para buscar o Zap do Gestor na tabela 'tel'
  const buscarZapGestor = async () => {
    try {
      const { data, error } = await supabase
        .from('tel')
        .select('numero')
        .single();

      if (!error && data) {
        setNumeroGestor(data.numero);
      }
    } catch (err) {
      console.warn('Tabela tel não encontrada ou vazia:', err);
      // Usa número padrão se tabela não existir
    }
  };

  const salvarWhatsappGestor = async () => {
    if (!inputZapConfig || inputZapConfig.length < 10) return alert("Digite um número válido com DDD (Ex: 5511999999999)");

    try {
      // Salvar na tabela 'tel'
      const { data: existe } = await supabase.from('tel').select('*').single();

      let error;
      if (existe) {
        const res = await supabase.from('tel').update({ numero: inputZapConfig });
        error = res.error;
      } else {
        const res = await supabase.from('tel').insert({ numero: inputZapConfig });
        error = res.error;
      }

      if (error) {
        alert(humanizeSupabaseError(error));
      } else {
        alert("Número do WhatsApp atualizado com sucesso!");
        setNumeroGestor(inputZapConfig);
        setInputZapConfig('');
        buscarDados();
      }
    } catch (err) {
      console.error('Erro ao acessar tabela tel:', err);
      alert('Tabela tel não existe. Crie a tabela no Supabase primeiro.');
    }
  };

  const abrirWhatsapp = async () => {
    try {
      const { data, error } = await supabase.from('tel').select('numero').single();
      if (!error && data?.numero) {
        const numLimpo = data.numero.replace(/\D/g, '');
        window.open(`https://wa.me/55${numLimpo}`, '_blank');
      } else {
        // Usa número padrão se tabela não existir
        const numLimpo = numeroGestor.replace(/\D/g, '');
        window.open(`https://wa.me/${numLimpo}`, '_blank');
      }
    } catch (err) {
      console.warn('Tabela tel não acessível, usando número padrão:', err);
      const numLimpo = numeroGestor.replace(/\D/g, '');
      window.open(`https://wa.me/${numLimpo}`, '_blank');
    }
  };

  // Compartilhar comprovante/entrega via Web Share API (fallback alert)
  const compartilharEntrega = (ent) => {
    const texto = `Comprovante: ${ent.cliente} - Status: ${ent.status || '—'}`;
    if (navigator.share) {
      navigator.share({ title: 'Logística Ativa', text: texto, url: window.location.href }).catch(() => { });
    } else {
      try {
        navigator.clipboard?.writeText(texto);
      } catch { }
      alert('Copiado: ' + texto);
    }
  };

  const buscarCoordenadas = (enderecoDigitado) => new Promise((resolve) => {
    if (!window.google || !window.google.maps || !window.google.maps.Geocoder) {
      resolve(null);
      return;
    }
    const enderecoCompleto = `${enderecoDigitado}, Palhoça, SC, Brasil`;
    const geocoder = new window.google.maps.Geocoder();
    geocoder.geocode({ address: enderecoCompleto, region: 'BR' }, (results, status) => {
      if (status === 'OK' && results && results.length > 0) {
        const result = results[0];
        resolve({
          lat: result.geometry.location.lat(),
          lng: result.geometry.location.lng(),
          enderecoFormatado: result.formatted_address,
        });
      } else {
        resolve(null);
      }
    });
  });

  const onLoadAutocomplete = (auto) => setAutocomplete(auto);
  const onPlaceChanged = () => {
    if (!autocomplete) return;
    const place = autocomplete.getPlace();

    if (place && place.geometry && place.geometry.location) {
      const novaLat = place.geometry.location.lat();
      const novaLng = place.geometry.location.lng();
      const enderecoFormatado = place.formatted_address;

      // Monta o novo ponto com dados do formulário
      const novoPonto = {
        id: Date.now(),
        cliente: inputCliente || 'Cliente a definir',
        endereco: enderecoFormatado,
        info: inputInfo || 'Sem observações',
        tipo: tipoPonto, // Usa o estado tipoPonto (Entrega ou Recolha)
        status: 'Pendente',
        lat: novaLat,
        lng: novaLng,
      };

      // Origem: localização do Gestor (se disponível) ou Palhoça central
      const origem = coordsGestor || { lat: -27.6438, lng: -48.6674 };
      const novaListaBruta = [...rascunho, novoPonto];
      const listaOtimizada = organizarPelaDistancia(origem, novaListaBruta);

      setRascunho(listaOtimizada);
      // Limpa os campos após adicionar
      setInputCliente('');
      setInputEndereco('');
      setInputInfo('');
      setTempCoords(null);
    } else {
      alert('Por favor, selecione um endereço da lista que aparece embaixo do texto.');
    }
  };

  const adicionarAoRascunho = async () => {
    // Nota: o Autocomplete já adiciona diretamente ao selecionar.
    // Este botão serve apenas como fallback ou confirmação manual se necessário.
    if (!inputEndereco) return alert("Selecione um endereço no campo de busca!");
    alert('Use o campo de busca e selecione um endereço da lista para adicionar ao mapa.');
  };

  const removerDoRascunho = (id) => { setRascunho(rascunho.filter(item => item.id !== id)); };

  const calcularDistancia = (lat1, lon1, lat2, lon2) => {
    if (!lat1 || !lon1 || !lat2 || !lon2) return 9999999;
    const p = 0.017453292519943295;
    const c = Math.cos;
    const a = 0.5 - c((lat2 - lat1) * p) / 2 + c(lat1 * p) * c(lat2 * p) * (1 - c((lon2 - lon1) * p)) / 2;
    return 12742 * Math.asin(Math.sqrt(a));
  };

  // Distância entre dois pontos no formato { lat, lng }
  const distanciaEntrePontos = (a, b) => {
    if (!a || !b) return Infinity;
    return calcularDistancia(a.lat, a.lng, b.lat, b.lng);
  };

  // Organiza a lista por vizinho mais próximo a partir de um ponto inicial
  const organizarPelaDistancia = (pontoInicial, listaParaOrdenar) => {
    if (!pontoInicial || !listaParaOrdenar || listaParaOrdenar.length === 0) return listaParaOrdenar || [];
    let ordenados = [];
    let restantes = [...listaParaOrdenar];
    let localAtual = { lat: Number(pontoInicial.lat), lng: Number(pontoInicial.lng) };

    while (restantes.length > 0) {
      let indiceMaisProximo = 0;
      let menorD = distanciaEntrePontos(localAtual, restantes[0]);

      for (let i = 1; i < restantes.length; i++) {
        const d = distanciaEntrePontos(localAtual, restantes[i]);
        if (d < menorD) {
          menorD = d;
          indiceMaisProximo = i;
        }
      }

      const proximo = restantes.splice(indiceMaisProximo, 1)[0];
      ordenados.push(proximo);
      localAtual = { lat: Number(proximo.lat), lng: Number(proximo.lng) };
    }
    return ordenados;
  };

  // Otimiza a ordem do rascunho tomando o Gestor em Palhoça como referência
  const otimizarRascunhoComGestor = () => {
    const origem = coordsGestor || { lat: -27.6438, lng: -48.6674 }; // Palhoça centro como fallback
    const listaOrdenada = organizarPelaDistancia(origem, rascunho);
    setRascunho(listaOrdenada);
    alert('Ordem otimizada a partir do Gestor (Palhoça).');
  };

  // Limpa completamente o rascunho e zera o resumo/rota
  const limparRascunhoCompleto = () => {
    if (window.confirm('Deseja realmente apagar todo o rascunho desta rota?')) {
      setRascunho([]);
      setResumoRota({ km: 0, tempo: 0 });
      setDirecoes(null);
      setInputEndereco('');
      setInputCliente('');
    }
  };

  const focarNoMotorista = (motorista) => {
    if (!mapaInstancia || !motorista || !motorista.lat || !motorista.lng) return;
    const novaPosicao = { lat: Number(motorista.lat), lng: Number(motorista.lng) };
    mapaInstancia.panTo(novaPosicao);
    mapaInstancia.setZoom(15);
  };

  // Calcula a rota pelas ruas e captura os tempos por trecho
  const calcularRotaPelasRuas = () => {
    try {
      if (!isLoaded || !window.google || !window.google.maps) return;
      if (!rascunho || rascunho.length === 0) { setTemposEstimados([]); setDirecoes(null); return; }

      const origem = coordsMotorista || coordsGestor || { lat: -27.6438, lng: -48.6674 };
      const pontos = rascunho.filter(p => p.lat && p.lng).map(p => ({ lat: Number(p.lat), lng: Number(p.lng) }));
      if (pontos.length === 0) { setTemposEstimados([]); setDirecoes(null); return; }

      const destination = pontos[pontos.length - 1];
      const waypoints = pontos.slice(0, -1).map(pt => ({ location: pt, stopover: true }));

      const directionsService = new window.google.maps.DirectionsService();
      const config = {
        origin: origem,
        destination,
        waypoints,
        travelMode: window.google.maps.TravelMode.DRIVING,
        optimizeWaypoints: false,
      };

      directionsService.route(config, (result, status) => {
        if (status === 'OK' && result && result.routes && result.routes[0]) {
          setDirecoes(result);
          const legs = result.routes[0].legs || [];
          const novosTempos = legs.map(leg => leg.duration?.text || '—');
          setTemposEstimados(novosTempos);

          // Resumo: somatório de distância e tempo
          let totalMetros = 0;
          let totalSegundos = 0;
          legs.forEach(leg => {
            totalMetros += leg.distance?.value || 0;
            totalSegundos += leg.duration?.value || 0;
          });
          setResumoRota({ km: Number((totalMetros / 1000).toFixed(1)), tempo: Math.round(totalSegundos / 60) });
        } else {
          setDirecoes(null);
          setTemposEstimados([]);
          setResumoRota({ km: 0, tempo: 0 });
        }
      });
    } catch (e) {
      console.warn('Falha ao calcular rota/ETA:', e?.message || e);
    }
  };

  // Recalcula ETA quando origem ou lista mudar
  useEffect(() => {
    calcularRotaPelasRuas();
  }, [isLoaded, rascunho, coordsMotorista, coordsGestor]);

  const otimizarRota = (pontos, inicioLat, inicioLng) => {
    if (!inicioLat || !inicioLng) return pontos;
    let rotaOrdenada = [];
    let pontosRestantes = [...pontos];
    let pontoAtual = { lat: inicioLat, lng: inicioLng };

    while (pontosRestantes.length > 0) {
      let maisProximo = null; let menorDistancia = Infinity; let indexMaisProximo = -1;
      for (let i = 0; i < pontosRestantes.length; i++) {
        const p = pontosRestantes[i];
        if (!p.lat) continue;
        if (p.lat && p.lng) {
          const d = calcularDistancia(pontoAtual.lat, pontoAtual.lng, p.lat, p.lng);
          if (d < menorDistancia) { menorDistancia = d; maisProximo = p; indexMaisProximo = i; }
        }
      }
      if (maisProximo) { rotaOrdenada.push(maisProximo); pontoAtual = maisProximo; pontosRestantes.splice(indexMaisProximo, 1); }
      else { rotaOrdenada.push(...pontosRestantes); break; }
    }
    return rotaOrdenada;
  };

  const otimizarRotaOrdem = () => {
    if (rascunho.length < 2) return alert("Adicione pelo menos 2 pontos para otimizar!");

    // Criamos o serviço de direções do Google
    const directionsService = new google.maps.DirectionsService();

    const pontosIntermediarios = rascunho.slice(1, -1).map(p => ({
      location: { lat: p.lat, lng: p.lng },
      stopover: true
    }));

    directionsService.route(
      {
        origin: { lat: rascunho[0].lat, lng: rascunho[0].lng },
        destination: { lat: rascunho[rascunho.length - 1].lat, lng: rascunho[rascunho.length - 1].lng },
        waypoints: pontosIntermediarios,
        optimizeWaypoints: true, // A MÁGICA ACONTECE AQUI
        travelMode: google.maps.TravelMode.DRIVING,
      },
      (result, status) => {
        if (status === "OK") {
          const novaOrdemIndices = result.routes[0].waypoint_order;
          const rascunhoOtimizado = [rascunho[0]];

          novaOrdemIndices.forEach(index => {
            rascunhoOtimizado.push(rascunho[index + 1]);
          });

          rascunhoOtimizado.push(rascunho[rascunho.length - 1]);
          setRascunho(rascunhoOtimizado);
          alert("✅ Rota otimizada com sucesso!");
        }
      }
    );
  };

  const enviarRotaParaSupabase = async () => {
    if (!motoristaSelecionado) {
      alert("Selecione um motorista na lista lateral!");
      setAbaMotoristasAberta(true);
      return;
    }

    if (rascunho.length === 0) {
      alert("A lista está vazia! Adicione entregas antes de enviar.");
      return;
    }

    // Descobre o objeto do motorista selecionado
    const motoristaObj = motoristas.find(x => (x.nome || x.motoristas) === motoristaSelecionado);

    if (!motoristaObj || !motoristaObj.id) {
      alert('Não foi possível obter o ID do motorista selecionado. Atualize a lista em "Equipe" e tente novamente.');
      return;
    }

    // Teste rápido: force o número 2 (seu ID de teste)
    const idTeste = motoristaObj.id || 2;

    const dadosParaEnviar = rascunho.map((ponto, index) => ({
      cliente: ponto.cliente || "Cliente a definir",
      endereco: ponto.endereco,
      lat: Number(ponto.lat),
      lng: Number(ponto.lng),
      motorista_id: idTeste, // Use o nome exato da coluna no Supabase
      motorista: motoristaObj.nome || motoristaObj.motoristas,
      status: 'Pendente',
      ordem: index + 1,
      tipo: ponto.tipo || 'entrega',
      assinatura: 'NAO'
    }));

    console.log("Enviando dados:", dadosParaEnviar);

    const { error } = await supabase.from('entregas').insert(dadosParaEnviar);

    if (!error) {
      setRascunho([]);
      alert("✅ Rota enviada! Verifique o celular.");
      await buscarDados();
    } else {
      console.error(error);
      alert(humanizeSupabaseError(error));
    }
  };

  // --- FUNÇÕES MOTORISTA ---
  const abrirMapa = (endereco) => {
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(endereco)}`;
    window.open(url, '_blank');
  };
  const iniciarConclusao = (id) => { setEntregaFocada(id); setMostrarAssinatura(true); };
  const iniciarNaoEntrega = (id) => { setEntregaFocada(id); setMostrarMotivo(true); setMotivoSelecionado(''); setMotivoTexto(''); };

  const finalizarComAssinatura = async () => {
    if (sigPad.current.isEmpty()) return alert("Assine primeiro!");
    const assinaturaImagem = sigPad.current.toDataURL('image/png');
    const { error } = await supabase.from('entregas').update({
      status: 'Concluído',
      assinatura: assinaturaImagem,
      horario_conclusao: new Date().toISOString()
    }).eq('id', entregaFocada);

    if (error) { alert("Erro ao salvar no banco. Tente novamente."); }
    else { setMostrarAssinatura(false); setEntregaFocada(null); buscarDados(); }
  };

  // Finaliza sem assinatura: atualiza status e toca som (se habilitado)
  const finalizarEntrega = async (idEntrega) => {
    try {
      const { error } = await supabase
        .from('entregas')
        .update({ status: 'Concluído', horario_conclusao: new Date().toISOString(), assinatura: 'NAO' })
        .eq('id', idEntrega);

      if (error) throw error;

      if (somHabilitado && somNovaEntregaRef.current) {
        try { somNovaEntregaRef.current.currentTime = 0; somNovaEntregaRef.current.play(); } catch { }
      }

      alert("Entrega concluída com sucesso!");
      buscarDados();
    } catch (err) {
      alert("Erro ao finalizar: " + err.message);
    }
  };

  const finalizarSemEntrega = async () => {
    let motivoFinal = motivoSelecionado;
    if (motivoSelecionado === 'Outros (Digitar...)') motivoFinal = motivoTexto;
    if (!motivoFinal) return alert("Selecione ou digite um motivo!");

    const statusComMotivo = `Não Entregue: ${motivoFinal}`;
    const { error } = await supabase.from('entregas').update({
      status: statusComMotivo, assinatura: 'NAO', horario_conclusao: new Date().toISOString()
    }).eq('id', entregaFocada);

    if (error) { alert(humanizeSupabaseError(error)); }
    else {
      const entregaAtual = entregas.find(e => e.id === entregaFocada);
      if (entregaAtual) {
        const mensagem = `🚨 *ALERTA: NÃO ENTREGA* 🚨\n\n` +
          `👤 *Motorista:* ${motoristaLogado}\n` +
          `📦 *Cliente:* ${entregaAtual.cliente}\n` +
          `📍 *Local:* ${entregaAtual.endereco}\n` +
          `⚠️ *Motivo:* ${motivoFinal}`;
        const linkZap = `https://wa.me/${numeroGestor}?text=${encodeURIComponent(mensagem)}`;
        window.open(linkZap, '_blank');
      }
      setMostrarMotivo(false); setEntregaFocada(null); buscarDados();
    }
  };

  const atualizarOrdemEntregas = async (novaOrdem) => {
    setEntregas(novaOrdem);
    for (let i = 0; i < novaOrdem.length; i++) {
      await supabase.from('entregas').update({ ordem: i + 1 }).eq('id', novaOrdem[i].id);
    }
  };

  const acaoLogin = async (e) => {
    e.preventDefault();
    const { data } = await supabase.from('motoristas').select('*').eq('tel', form.tel.trim()).eq('senha', form.senha.trim()).maybeSingle();
    if (data) {
      const nomeUsuario = data.motoristas || data.nome;
      if (nomeUsuario === 'CONFIG_ZAP') return alert("Acesso negado.");
      setMotoristaLogado(nomeUsuario);
      setMotoristaIdLogado(data.id || null);
      localStorage.setItem('mot_v10_nome', nomeUsuario);
      if (data.id) {
        localStorage.setItem('mot_v10_id', data.id);
        localStorage.setItem('motoristaId', data.id);
      }
    } else { alert("Dados incorretos!"); }
  };

  // Removido cálculo de limites de mapa do Leaflet (não utilizado no Google Maps)

  // --- RENDERIZAÇÃO ---
  const historicoEnderecos = [...new Set(entregas.map(e => e.endereco))];
  const historicoClientes = [...new Set(entregas.map(e => e.cliente))];

  // --- FUNÇÃO CONCLUIR ENTREGA (COMPARTILHADA) ---
  const concluirEntrega = async (id) => {
    try {
      const { error } = await supabase.from('entregas').delete().eq('id', id);
      if (error) throw error;
      await buscarDados();
      alert('Tarefa concluída com sucesso!');
    } catch (err) {
      console.error('Erro ao concluir:', err.message);
      alert('Erro ao salvar no banco.');
    }
  };

  // 1. APP MOTORISTA
  if (view === 'motorista') {
    const minhasEntregas = entregas.filter(e => e.motorista_id === motoristaIdLogado || e.motorista_id === Number(localStorage.getItem('motoristaId')));
    return <MotoristaRestaurado isLoaded={isLoaded} entregas={minhasEntregas} onConcluir={concluirEntrega} numeroGestor={numeroGestor} setMotoristaLogado={setMotoristaLogado} setMotoristaIdLogado={setMotoristaIdLogado} />;
  }

  // 2. PAINEL GESTOR
  const listaConcluidas = entregas
    .filter(e => e.status === 'Concluído' && (!motoristaSelecionado || e.motorista === motoristaSelecionado))
    .sort((a, b) => new Date(b.horario_conclusao) - new Date(a.horario_conclusao));

  const listaFalhas = entregas
    .filter(e => e.status && e.status.includes('Não Entregue') && (!motoristaSelecionado || e.motorista === motoristaSelecionado))
    .sort((a, b) => new Date(b.horario_conclusao) - new Date(a.horario_conclusao));

  const entregasFinalizadas = entregas
    .filter(e => e.status && (e.status === 'Concluído' || e.status.startsWith('Não Entregue')) && (!motoristaSelecionado || e.motorista === motoristaSelecionado))
    .sort((a, b) => new Date(b.horario_conclusao) - new Date(a.horario_conclusao));

  // --- ESTILOS GESTOR ---
  const btnBranco = { background: '#fff', color: '#000', border: 'none', padding: '8px 15px', borderRadius: '5px', fontWeight: 'bold', cursor: 'pointer', fontSize: '14px' };
  const btnCelular = { background: '#334155', color: '#fff', border: 'none', padding: '8px 15px', borderRadius: '5px', fontSize: '12px', cursor: 'pointer' };

  const inputDark = {
    background: '#0b0e14', border: '1px solid #2d3748',
    color: '#fff', padding: '12px', borderRadius: '5px', fontSize: '15px', outline: 'none', width: '100%', boxSizing: 'border-box'
  };

  const btnAzul = {
    background: '#3b82f6', color: '#fff', border: 'none',
    padding: '12px', borderRadius: '5px', fontWeight: 'bold', cursor: 'pointer', fontSize: '14px', width: '100%'
  };

  const btnVerde = {
    background: '#22c55e', color: '#fff', border: 'none',
    padding: '15px', borderRadius: '5px', fontWeight: 'bold',
    cursor: 'pointer', fontSize: '14px', width: '100%'
  };

  const cardEntrega = {
    background: '#1e293b', padding: '12px', borderRadius: '8px', marginBottom: '8px',
    display: 'flex', gap: '10px', alignItems: 'center', color: '#fff', fontSize: '13px'
  };

  return (
    <>
      {/* === VERIFICAÇÃO DE SEGURANÇA: Entregas ainda carregando === */}
      {!entregas && (
        <div style={{ background: '#000', height: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '24px', marginBottom: '20px' }}>⏳</div>
            <div>Carregando Logística...</div>
          </div>
        </div>
      )}

      {entregas && (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', backgroundColor: '#0b0e14' }}>
          {/* === HEADER === */}
          <header style={{ height: '60px', backgroundColor: '#151a22', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 20px', borderBottom: '1px solid #2d3748', zIndex: 1000, boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
              <div style={{ color: '#22c55e', fontWeight: 'bold', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e' }} />
                LOGÍSTICA ATIVA
              </div>
              <button onClick={() => setAbaAtiva('rota')} style={btnBranco}>Gerenciar Rota</button>
              <button onClick={() => setAbaAtiva('historico')} style={btnBranco}>Histórico</button>
              <button onClick={() => setAbaMotoristasAberta(true)} style={btnBranco}>Equipe</button>
              <button onClick={abrirWhatsapp} style={btnBranco}>WhatsApp</button>
            </div>
            <button onClick={() => setView('motorista')} style={btnCelular}>Ver como Celular</button>
          </header>

          {/* === MAIN CONTENT (SIDEBAR + MAP) === */}
          {abaAtiva === 'historico' ? (
            <div style={{ padding: '20px', overflowY: 'auto', background: '#151a22', flex: 1 }}>
              <h2 style={{ color: '#fff', marginTop: 0 }}>Histórico de Entregas</h2>
              <table style={{ width: '100%', color: '#fff', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #333' }}>
                    <th style={{ textAlign: 'left', padding: '8px' }}>Cliente</th>
                    <th style={{ textAlign: 'left', padding: '8px' }}>Status</th>
                    <th style={{ textAlign: 'left', padding: '8px' }}>Assinatura</th>
                    <th style={{ textAlign: 'left', padding: '8px' }}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {entregasFinalizadas.map((ent) => (
                    <tr key={ent.id} style={{ borderBottom: '1px solid #222' }}>
                      <td style={{ padding: '8px' }}>{ent.cliente}</td>
                      <td style={{ padding: '8px', color: ent.status === 'Concluído' ? '#22c55e' : '#ef4444' }}>{(ent.status || '').toUpperCase()}</td>
                      <td style={{ padding: '8px' }}>
                        {ent.assinatura && ent.assinatura !== 'NAO' && ent.assinatura.length > 20 ? (
                          <img src={ent.assinatura} width="80" alt="Assinatura" style={{ filter: 'invert(1)', borderRadius: '4px' }} />
                        ) : (
                          <span style={{ color: '#94a3b8' }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: '8px' }}>
                        <button onClick={() => compartilharEntrega(ent)} style={{ background: '#334155', color: '#fff', border: 'none', padding: '6px 10px', borderRadius: '6px', cursor: 'pointer' }}>Compartilhar</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
              {/* SIDEBAR */}
              <aside style={{ width: '380px', backgroundColor: '#151a22', padding: '20px', display: 'flex', flexDirection: 'column', borderRight: '1px solid #2d3748', boxSizing: 'border-box', overflow: 'hidden' }}>
                <h2 style={{ color: '#fff', fontSize: '16px', margin: '0 0 20px 0', fontWeight: 'bold', letterSpacing: '0.5px' }}>GERENCIAR ROTA</h2>

                {/* --- SELETOR DE TIPO (RECOLHA OU ENTREGA) --- */}
                <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
                  <button
                    onClick={() => setTipoPonto('Entrega')}
                    style={{
                      flex: 1, padding: '10px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                      background: tipoPonto === 'Entrega' ? '#3b82f6' : '#334155',
                      color: '#fff', fontWeight: 'bold', fontSize: '12px', transition: '0.3s'
                    }}
                  >
                    📦 ENTREGA
                  </button>
                  <button
                    onClick={() => setTipoPonto('Recolha')}
                    style={{
                      flex: 1, padding: '10px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                      background: tipoPonto === 'Recolha' ? '#f59e0b' : '#334155',
                      color: '#fff', fontWeight: 'bold', fontSize: '12px', transition: '0.3s'
                    }}
                  >
                    🔄 RECOLHA
                  </button>
                </div>

                {/* Inputs */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '15px' }}>
                  <input type="text" placeholder="Nome do Cliente" value={inputCliente} onChange={(e) => setInputCliente(e.target.value)} style={inputDark} />
                  {isLoaded ? (
                    <Autocomplete
                      onLoad={onLoadAutocomplete}
                      onPlaceChanged={onPlaceChanged}
                      options={{
                        componentRestrictions: { country: 'br' },
                        bounds: { south: -28.0, north: -27.3, west: -49.0, east: -48.3 },
                      }}
                    >
                      <input
                        list="historico-enderecos-list"
                        value={inputEndereco}
                        onChange={(e) => { setInputEndereco(e.target.value); setTempCoords(null); }}
                        placeholder="Endereço da Entrega"
                        style={inputDark}
                      />
                    </Autocomplete>
                  ) : (
                    <input
                      list="historico-enderecos-list"
                      value={inputEndereco}
                      onChange={(e) => setInputEndereco(e.target.value)}
                      placeholder="Endereço da Entrega"
                      style={inputDark}
                    />
                  )}
                  <datalist id="historico-enderecos-list">{historicoEnderecos.map((end, i) => (<option key={i} value={end} />))}</datalist>
                  <button onClick={adicionarAoRascunho} style={btnAzul}>ADICIONAR AO MAPA</button>
                </div>

                {/* Rascunho List */}
                <div style={{ flex: 1, overflowY: 'auto', marginBottom: '15px', paddingRight: '5px' }}>
                  {rascunho.map((p, i) => (
                    <div key={i} style={{
                      background: '#1e293b', padding: '12px', borderRadius: '8px',
                      marginBottom: '10px', color: '#fff',
                      borderLeft: p.tipo === 'Recolha' ? '4px solid #f59e0b' : '4px solid #3b82f6',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                        <b style={{ marginRight: '8px', color: '#3b82f6' }}>{i + 1}</b>
                        <span style={{ fontSize: '13px' }}>{p.endereco}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{
                          fontSize: '10px', padding: '2px 6px', borderRadius: '4px',
                          background: p.tipo === 'Recolha' ? '#f59e0b' : '#3b82f6', color: '#000', fontWeight: 'bold'
                        }}>
                          {p.tipo === 'Recolha' ? 'REC' : 'ENT'}
                        </span>
                        <Trash2 size={14} color="#ef4444" style={{ cursor: 'pointer' }} onClick={() => removerDoRascunho(p.id)} />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Bottom Buttons */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <button onClick={otimizarRotaOrdem} style={btnVerde}>OTIMIZAR</button>
                  <button onClick={enviarRotaParaSupabase} style={btnVerde}>ENVIAR</button>
                </div>
              </aside>

              {/* MAPA */}
              <main style={{ flex: 1, background: '#000', position: 'relative', height: '100%', width: '100%', boxSizing: 'border-box', overflow: 'hidden' }}>
                {isLoaded ? (
                  <GoogleMap
                    mapContainerStyle={{ height: '100%', width: '100%' }}
                    center={coordsMotorista || coordsGestor || { lat: -27.6438, lng: -48.6674 }}
                    zoom={13}
                    options={{ disableDefaultUI: true, zoomControl: true }}
                    onLoad={(mapInstance) => setMapaInstancia(mapInstance)}
                  >
                    {coordsGestor && (
                      <Marker position={coordsGestor} icon={'https://maps.google.com/mapfiles/ms/icons/blue-dot.png'} />
                    )}
                    {/* MARCADOR MOTORISTA */}
                    {coordsMotorista && (
                      <>
                        <Marker
                          position={{ lat: Number(coordsMotorista.lat), lng: Number(coordsMotorista.lng) }}
                          icon={{
                            url: 'https://cdn-icons-png.flaticon.com/512/1165/1165961.png',
                            scaledSize: new window.google.maps.Size(45, 45),
                            anchor: new window.google.maps.Point(22, 22),
                          }}
                          zIndex={100}
                          title="Motorista em trânsito"
                        />
                        <Circle
                          center={{ lat: Number(coordsMotorista.lat), lng: Number(coordsMotorista.lng) }}
                          radius={100}
                          options={{
                            fillColor: '#38bdf8',
                            fillOpacity: 0.2,
                            strokeColor: '#38bdf8',
                            strokeWeight: 1,
                            clickable: false,
                          }}
                        />
                      </>
                    )}

                    {/* MARCADORES RASCUNHO */}
                    {rascunho.map((item, index) => (
                      item.lat && item.lng ? (
                        <Marker
                          key={item.id}
                          position={{ lat: Number(item.lat), lng: Number(item.lng) }}
                          label={{
                            text: (index + 1).toString(),
                            color: 'white',
                            fontWeight: 'bold',
                            fontSize: '14px',
                          }}
                          icon={{
                            path: window.google.maps.SymbolPath.CIRCLE,
                            fillColor: '#38bdf8',
                            fillOpacity: 0.7,
                            strokeColor: 'white',
                            strokeWeight: 2,
                            scale: 10,
                          }}
                          onClick={() => setPontoAtivo(item)}
                        />
                      ) : null
                    ))}

                    {/* MARCADORES ENTREGAS BANCO */}
                    {entregas.map((ent, index) => (
                      ent.lat && ent.lng ? (
                        <Marker
                          key={`entrega-${ent.id}`}
                          position={{ lat: Number(ent.lat), lng: Number(ent.lng) }}
                          label={{
                            text: (index + 1).toString(),
                            color: 'white',
                            fontWeight: 'bold',
                            fontSize: '12px',
                          }}
                          icon={{
                            path: window.google.maps.SymbolPath.CIRCLE,
                            fillColor: ent.status === 'Concluído' ? '#22c55e' : '#ef4444',
                            fillOpacity: 1,
                            strokeColor: 'white',
                            strokeWeight: 2,
                            scale: 12,
                          }}
                          onClick={() => setPontoAtivo(ent)}
                        />
                      ) : null
                    ))}

                    {/* INFO WINDOW */}
                    {pontoAtivo && (
                      <InfoWindow
                        position={{ lat: Number(pontoAtivo.lat), lng: Number(pontoAtivo.lng) }}
                        onCloseClick={() => setPontoAtivo(null)}
                      >
                        <div style={{ color: '#000', padding: '5px' }}>
                          <h4 style={{ margin: '0 0 5px 0' }}>{pontoAtivo.cliente}</h4>
                          <p style={{ margin: 0, fontSize: '12px' }}>{pontoAtivo.endereco}</p>
                          <hr />
                          <p style={{ margin: '5px 0 0 0', fontWeight: 'bold', color: '#38bdf8' }}>
                            Status: {pontoAtivo.status || 'Pendente'}
                          </p>
                          <p style={{ margin: '3px 0 0 0', color: '#64748b', fontSize: '12px' }}>
                            ETA: {
                              (() => {
                                const idx = rascunho.findIndex(p => p.id === pontoAtivo.id);
                                return temposEstimados[idx] || '—';
                              })()
                            }
                          </p>
                        </div>
                      </InfoWindow>
                    )}
                  </GoogleMap>
                ) : (
                  <div style={{ color: '#94a3b8', padding: '10px' }}>Carregando mapa...</div>
                )}
              </main>
            </div>
          )}

          {/* === MODAL COMPROVANTE === */}
          {comprovanteAtivo && (
            <div style={styles.modal} onClick={() => setComprovanteAtivo(null)}>
              <div style={{ ...styles.cardAssinatura, width: '400px', background: '#fff', color: '#000' }} onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #eee', paddingBottom: 10, marginBottom: 15 }}>
                  <h3 style={{ color: '#000', margin: 0 }}>Comprovante de Entrega</h3>
                  <button onClick={() => setComprovanteAtivo(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20 }}>✖</button>
                </div>
                <div style={{ textAlign: 'left', marginBottom: 20, lineHeight: '1.6' }}>
                  <div><strong>Cliente:</strong> {comprovanteAtivo.cliente}</div>
                  <div><strong>Endereço:</strong> {comprovanteAtivo.endereco}</div>
                  <div style={{ color: '#3b82f6', fontWeight: 'bold', marginTop: 5 }}>
                    📅 {comprovanteAtivo.horario_conclusao ? new Date(comprovanteAtivo.horario_conclusao).toLocaleDateString() : 'N/A'}
                    ⏰ {comprovanteAtivo.horario_conclusao ? new Date(comprovanteAtivo.horario_conclusao).toLocaleTimeString() : 'N/A'}
                  </div>
                  <div style={{ fontWeight: 'bold', color: comprovanteAtivo.tipo === 'recolha' ? '#f97316' : '#10b981', marginTop: 5 }}>
                    TIPO: {comprovanteAtivo.tipo === 'recolha' ? 'RECOLHA' : 'ENTREGA'}
                  </div>
                </div>
                <div style={{ border: '1px dashed #ccc', padding: 10, borderRadius: 8, background: '#f8f9fa', minHeight: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {comprovanteAtivo.assinatura && comprovanteAtivo.assinatura !== 'NAO' && comprovanteAtivo.assinatura.length > 20 ? (
                    <img src={comprovanteAtivo.assinatura} alt="Assinatura" style={{ maxWidth: '100%', maxHeight: '200px' }} />
                  ) : (
                    <div style={{ color: '#94a3b8', fontSize: 14, textAlign: 'center' }}>
                      <FileText size={40} style={{ display: 'block', margin: '0 auto 10px auto', color: '#cbd5e1' }} />
                      Assinatura não disponível.
                    </div>
                  )}
                </div>
                <p style={{ fontSize: 12, color: '#666', marginTop: 5, textAlign: 'center' }}>Assinatura do Recebedor</p>
                <button onClick={() => setComprovanteAtivo(null)} style={{ ...styles.btnPrimary, marginTop: 20, width: '100%' }}>FECHAR</button>
              </div>
            </div>
          )}

          {/* === ABA LATERAL MOTORISTAS === */}
          {abaMotoristasAberta && (
            <div onClick={() => setAbaMotoristasAberta(false)} style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 999 }} />
          )}
          <div style={{
            position: 'fixed', top: 0, right: abaMotoristasAberta ? 0 : '-350px',
            width: '320px', height: '100vh', backgroundColor: '#0f172a',
            boxShadow: '-5px 0 15px rgba(0,0,0,0.3)', transition: 'right 0.3s ease-in-out',
            zIndex: 1000, padding: '20px', display: 'flex', flexDirection: 'column'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ color: '#fff', fontSize: '16px', margin: 0 }}>Equipe de Entrega</h2>
              <button onClick={() => setAbaMotoristasAberta(false)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', paddingRight: 4 }}>
              {motoristas.map((mot) => {
                const nomeMot = mot.nome || mot.motoristas;
                let online = false;
                try {
                  if (mot.ultimo_sinal) {
                    online = (Date.now() - new Date(mot.ultimo_sinal).getTime()) < (3 * 60 * 1000);
                  }
                } catch { }
                const selecionado = motoristaSelecionado === nomeMot;
                return (
                  <div
                    key={mot.id}
                    onClick={() => {
                      setMotoristaSelecionado(nomeMot);
                      focarNoMotorista(mot);
                      setAbaMotoristasAberta(false);
                    }}
                    style={{ padding: '12px', backgroundColor: selecionado ? '#1e40af' : '#1e293b', borderRadius: '8px', marginBottom: '8px', cursor: 'pointer', border: selecionado ? '1px solid #38bdf8' : '1px solid transparent' }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: '#fff', fontWeight: 'bold', fontSize: '14px' }}>{nomeMot}</span>
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: online ? '#22c55e' : '#64748b' }} />
                    </div>
                    <div style={{ color: '#94a3b8', fontSize: '12px', marginTop: '4px' }}>Clique para focar</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// --- ESTILOS ---
const styles = {
  universalPage: { width: '100vw', minHeight: '100vh', backgroundColor: '#020617', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'sans-serif', overflow: 'hidden' },
  authCard: { backgroundColor: '#0f172a', padding: '30px', borderRadius: '24px', width: '350px', border: '1px solid #1e293b' },
  inputAuth: { padding: '15px', borderRadius: '10px', backgroundColor: '#020617', border: '1px solid #1e293b', color: '#fff', fontSize: '16px' },
  mobileFull: { width: '100vw', height: '100vh', backgroundColor: '#020617', color: '#fff', display: 'flex', flexDirection: 'column' },
  headerMobile: { padding: '20px', borderBottom: '1px solid #1e293b', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#0f172a' },
  mainMobileScroll: { padding: '15px', flex: 1, overflowY: 'auto' },
  card: { background: '#0f172a', padding: '20px', borderRadius: '15px', marginBottom: '20px', position: 'relative', borderLeft: '5px solid #38bdf8', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)', touchAction: 'none' },
  numBadge: { position: 'absolute', top: '-10px', left: '-10px', background: '#38bdf8', color: '#000', width: '28px', height: '28px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '14px' },
  btnMapa: { background: '#334155', color: '#fff', border: 'none', padding: '12px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', width: '100%' },
  btnConcluir: { flex: 2, background: '#10b981', color: '#000', border: 'none', padding: '12px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' },
  btnNaoEntrega: { flex: 1, background: '#ef4444', color: '#fff', border: 'none', padding: '12px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  modal: { position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  cardAssinatura: { background: '#1e293b', padding: '20px', borderRadius: '20px', textAlign: 'center', width: '90%', maxWidth: '400px' },
  dashboardContainer: { width: '95%', height: '90vh', display: 'flex', flexDirection: 'row', maxWidth: '1400px' },
  dashboardCard: { backgroundColor: '#0f172a', borderRadius: '16px', border: '1px solid #1e293b', overflow: 'hidden', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)' },
  dashboardHeader: { backgroundColor: '#1e293b', padding: '15px', borderBottom: '1px solid #334155', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  tabActive: { background: 'none', border: 'none', borderBottom: '2px solid #38bdf8', color: '#38bdf8', padding: '5px 10px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', gap: 5, alignItems: 'center' },
  tabInactive: { background: 'none', border: 'none', color: '#64748b', padding: '5px 10px', cursor: 'pointer', display: 'flex', gap: 5, alignItems: 'center' },
  inputDash: { padding: '10px', borderRadius: '8px', backgroundColor: '#020617', border: '1px solid #334155', color: '#fff', outline: 'none' },
  selectInput: { padding: '10px', borderRadius: '8px', backgroundColor: '#020617', border: '1px solid #334155', color: '#fff', outline: 'none', width: '100%' },
  btnTypeInactive: { flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #334155', background: 'transparent', color: '#64748b', cursor: 'pointer', fontWeight: 'bold' },
  btnTypeActiveBlue: { flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #3b82f6', background: 'rgba(59, 130, 246, 0.1)', color: '#60a5fa', cursor: 'pointer', fontWeight: 'bold' },
  btnTypeActiveOrange: { flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #f97316', background: 'rgba(249, 115, 22, 0.1)', color: '#fb923c', cursor: 'pointer', fontWeight: 'bold' },
  btnAdd: { width: '100%', padding: '12px', borderRadius: '8px', background: '#3b82f6', color: '#fff', border: 'none', fontWeight: 'bold', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px' },
  btnSend: { width: '100%', padding: '12px', borderRadius: '8px', background: '#10b981', color: '#fff', border: 'none', fontWeight: 'bold', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px', marginTop: 10 },
  listContainer: { flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px', paddingRight: '5px', marginTop: 10 },
  listItem: { display: 'flex', alignItems: 'center', padding: '10px', backgroundColor: '#1e293b', borderRadius: '8px', border: '1px solid #334155', position: 'relative', overflow: 'hidden' },
  btnPrimary: { padding: '15px', borderRadius: '10px', border: 'none', backgroundColor: '#38bdf8', color: '#000', fontWeight: 'bold', cursor: 'pointer' },
  btnSec: { flex: 1, padding: '10px', background: '#334155', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' },
  btnConfirmar: { flex: 1, padding: '10px', background: '#10b981', color: '#000', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' },
  label: { display: 'block', color: '#94a3b8', fontSize: '13px', fontWeight: 'bold', marginBottom: '5px', textTransform: 'uppercase' },

  // Estilos para novo layout gestor
  headerGestor: { height: '60px', backgroundColor: '#151a22', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 20px', borderBottom: '1px solid #2d3748' },
  mainGestor: { display: 'flex', flex: 1, overflow: 'hidden' },
  sidebarGestor: { width: '380px', backgroundColor: '#151a22', borderRight: '1px solid #2d3748', display: 'flex', flexDirection: 'column', padding: '15px', overflowY: 'auto' },
  mapaGestor: { flex: 1, position: 'relative', backgroundColor: '#000' },
  inputGestor: { width: '100%', padding: '10px', backgroundColor: '#0b0e14', border: '1px solid #2d3748', borderRadius: '6px', color: '#fff', marginBottom: '8px', fontSize: '13px' },
  btnGestor: { width: '100%', padding: '10px', backgroundColor: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', marginBottom: '8px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px' },
  btnGestorVerde: { width: '100%', padding: '10px', backgroundColor: '#22c55e', color: '#000', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', marginBottom: '6px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px' }
};

export default App;