import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';
import { motion, AnimatePresence, Reorder } from 'framer-motion';
import SignatureCanvas from 'react-signature-canvas';
import { Trash2, Plus, Send, Settings, ArrowDownToLine, ArrowUpFromLine, Search, XCircle, GripVertical } from 'lucide-react';

// Importações do Mapa
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Correção para ícone do leaflet
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
let DefaultIcon = L.icon({ iconUrl: icon, shadowUrl: iconShadow, iconSize: [25, 41], iconAnchor: [12, 41] });
L.Marker.prototype.options.icon = DefaultIcon;

function App() {
  // --- ESTADOS GERAIS ---
  const [entregas, setEntregas] = useState([]);
  const [motoristas, setMotoristas] = useState([]);
  const [view, setView] = useState(window.innerWidth < 768 ? 'motorista' : 'gestor');

  // --- ESTADOS DO MOTORISTA ---
  const [motoristaLogado, setMotoristaLogado] = useState(localStorage.getItem('mot_v10_nome') || null);
  const [form, setForm] = useState({ tel: '', senha: '' });
  const [mostrarAssinatura, setMostrarAssinatura] = useState(false);
  const [mostrarMotivo, setMostrarMotivo] = useState(false);
  const [motivoTexto, setMotivoTexto] = useState('');
  const [entregaFocada, setEntregaFocada] = useState(null);
  const sigPad = useRef({});

  // --- ESTADOS DO GESTOR ---
  const [rascunho, setRascunho] = useState([]); 
  const [inputEndereco, setInputEndereco] = useState('');
  const [inputInfo, setInputInfo] = useState('');
  const [inputTipo, setInputTipo] = useState('entrega'); 
  const [motoristaSelecionado, setMotoristaSelecionado] = useState('');
  const [coordsMotorista, setCoordsMotorista] = useState(null); 

  // --- BUSCA DE DADOS ---
  const buscarDados = async () => {
    const { data: e } = await supabase.from('entregas').select('*').order('ordem', { ascending: true });
    const { data: m } = await supabase.from('motoristas').select('*');

    if (e && e.length > entregas.length && view === 'motorista') {
      new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3').play().catch(() => { });
    }
    if (e) setEntregas(e);
    if (m) {
        setMotoristas(m);
        if (!motoristaSelecionado && m.length > 0) setMotoristaSelecionado(m[0].nome || m[0].motoristas);
        
        if (motoristaSelecionado) {
            const mot = m.find(x => (x.nome || x.motoristas) === motoristaSelecionado);
            if (mot && mot.lat && mot.lng) {
                setCoordsMotorista([mot.lat, mot.lng]);
            }
        }
    }
  };

  useEffect(() => {
    buscarDados();
    const canal = supabase.channel('logistica_v10').on('postgres_changes', { event: '*', schema: 'public', table: 'entregas' }, () => buscarDados()).subscribe();
    return () => supabase.removeChannel(canal);
  }, [entregas.length, motoristaSelecionado]);

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
  const adicionarAoRascunho = () => {
    if (!inputEndereco) return alert("Digite um endereço!");
    const novoItem = { id: Date.now(), endereco: inputEndereco, info: inputInfo || 'Sem observações', tipo: inputTipo };
    setRascunho([...rascunho, novoItem]);
    setInputEndereco(''); setInputInfo('');
  };

  const removerDoRascunho = (id) => { setRascunho(rascunho.filter(item => item.id !== id)); };

  const enviarRotaParaSupabase = async () => {
    if (rascunho.length === 0) return alert("A lista está vazia!");
    if (!motoristaSelecionado) return alert("Selecione um motorista!");
    const payload = rascunho.map((item, index) => ({
      cliente: `[${item.tipo.toUpperCase()}] ${item.info}`, 
      endereco: item.endereco,
      motorista: motoristaSelecionado,
      status: 'Pendente',
      ordem: index + 1,
      assinatura: 'NAO'
    }));
    const { error } = await supabase.from('entregas').insert(payload);
    if (!error) { alert("Enviado!"); setRascunho([]); buscarDados(); }
  };

  // --- FUNÇÕES DO MOTORISTA ---
  const abrirMapa = (endereco) => {
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(endereco)}`;
    window.open(url, '_blank');
  };

  const iniciarConclusao = (id) => { setEntregaFocada(id); setMostrarAssinatura(true); };
  
  const iniciarNaoEntrega = (id) => { setEntregaFocada(id); setMostrarMotivo(true); setMotivoTexto(''); };

  const finalizarComAssinatura = async () => {
    if (sigPad.current.isEmpty()) return alert("O cliente precisa assinar!");
    const { error } = await supabase.from('entregas').update({
      status: 'Concluído', assinatura: 'SIM', horario_conclusao: new Date().toISOString()
    }).eq('id', entregaFocada);
    if (!error) { setMostrarAssinatura(false); setEntregaFocada(null); buscarDados(); }
  };

  // --- CORREÇÃO AQUI: FINALIZAR SEM ENTREGA ---
  const finalizarSemEntrega = async () => {
    if (!motivoTexto) return alert("Digite o motivo!");
    
    // Agora salvamos o motivo DENTRO do status para evitar erro de coluna inexistente
    const statusComMotivo = `Não Entregue: ${motivoTexto}`;

    const { error } = await supabase.from('entregas').update({
        status: statusComMotivo, 
        assinatura: 'NAO',
        horario_conclusao: new Date().toISOString()
    }).eq('id', entregaFocada);

    if (error) {
        alert("Erro ao salvar: " + error.message);
    } else {
        setMostrarMotivo(false);
        setEntregaFocada(null);
        buscarDados();
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
      const n = data.motoristas || data.nome;
      setMotoristaLogado(n);
      localStorage.setItem('mot_v10_nome', n);
    } else { alert("Dados incorretos!"); }
  };

  // -----------------------------------------------------------------------
  // RENDERIZAÇÃO: VISÃO MOTORISTA
  // -----------------------------------------------------------------------
  if (view === 'motorista') {
    if (!motoristaLogado) {
      return (
        <div style={styles.universalPage}>
          <div style={styles.authCard}>
            <h2 style={{ color: '#38bdf8', textAlign: 'center' }}>Logística V10</h2>
            <form onSubmit={acaoLogin} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <input placeholder="WhatsApp" style={styles.inputAuth} onChange={e => setForm({ ...form, tel: e.target.value })} />
              <input placeholder="Senha" type="password" style={styles.inputAuth} onChange={e => setForm({ ...form, senha: e.target.value })} />
              <button type="submit" style={styles.btnPrimary}>ENTRAR</button>
            </form>
          </div>
        </div>
      );
    }

    const minhasEntregas = entregas.filter(e => e.status === 'Pendente' && (e.motorista === motoristaLogado || e.motoristas === motoristaLogado));

    return (
      <div style={styles.mobileFull}>
        <header style={styles.headerMobile}>
          <h3>ROTA: {motoristaLogado}</h3>
          <button onClick={() => { localStorage.clear(); window.location.reload(); }} style={{ color: '#ef4444', background: 'none', border: 'none' }}>Sair</button>
        </header>

        {mostrarAssinatura && (
          <div style={styles.modal}>
            <div style={styles.cardAssinatura}>
              <h3 style={{ color: '#fff', marginBottom: '10px' }}>Assinatura do Cliente</h3>
              <div style={{ background: '#fff', borderRadius: '10px' }}><SignatureCanvas ref={sigPad} penColor='black' canvasProps={{ width: 300, height: 200 }} /></div>
              <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                <button onClick={() => setMostrarAssinatura(false)} style={styles.btnSec}>VOLTAR</button>
                <button onClick={() => sigPad.current.clear()} style={styles.btnSec}>LIMPAR</button>
                <button onClick={finalizarComAssinatura} style={styles.btnConfirmar}>OK</button>
              </div>
            </div>
          </div>
        )}

        {/* Modal Não Entrega */}
        {mostrarMotivo && (
          <div style={styles.modal}>
            <div style={styles.cardAssinatura}>
              <h3 style={{ color: '#ef4444', marginBottom: '10px' }}>Motivo da Não Entrega</h3>
              <textarea 
                style={{width: '100%', padding: 10, borderRadius: 8, height: 100}} 
                placeholder="Ex: Cliente ausente, Endereço não encontrado..."
                value={motivoTexto}
                onChange={e => setMotivoTexto(e.target.value)}
              />
              <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                <button onClick={() => setMostrarMotivo(false)} style={styles.btnSec}>CANCELAR</button>
                <button onClick={finalizarSemEntrega} style={{...styles.btnConfirmar, background: '#ef4444', color: 'white'}}>CONFIRMAR</button>
              </div>
            </div>
          </div>
        )}

        <main style={styles.mainMobileScroll}>
          <Reorder.Group axis="y" values={minhasEntregas} onReorder={atualizarOrdemEntregas} style={{listStyle: 'none', padding: 0}}>
            <AnimatePresence mode='popLayout'>
              {minhasEntregas.map((ent, idx) => (
                <Reorder.Item key={ent.id} value={ent} style={{position: 'relative'}}>
                  <motion.div
                    layout
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -100 }}
                    style={styles.card}
                    whileDrag={{scale: 1.05, boxShadow: "0px 10px 20px rgba(0,0,0,0.5)"}} 
                  >
                    <div style={{position: 'absolute', right: 10, top: 10, color: '#334155'}}>
                        <GripVertical />
                    </div>

                    <div style={styles.numBadge}>{idx + 1}</div>
                    <strong style={{marginRight: 20}}>{ent.cliente}</strong>
                    <p style={{ fontSize: '14px', color: '#94a3b8' }}>📍 {ent.endereco}</p>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
                      <button onClick={() => abrirMapa(ent.endereco)} style={styles.btnMapa}>🗺️ VER NO MAPA</button>
                      
                      <div style={{display: 'flex', gap: 8}}>
                          <button onClick={() => iniciarNaoEntrega(ent.id)} style={styles.btnNaoEntrega}>
                            <XCircle size={18} /> NÃO
                          </button>
                          <button onClick={() => iniciarConclusao(ent.id)} style={styles.btnConcluir}>
                            CONCLUIR
                          </button>
                      </div>
                    </div>
                  </motion.div>
                </Reorder.Item>
              ))}
            </AnimatePresence>
          </Reorder.Group>
        </main>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // RENDERIZAÇÃO: VISÃO GESTOR
  // -----------------------------------------------------------------------
  return (
    <div style={styles.universalPage}>
      <div style={{ position: 'absolute', top: 20, right: 20, zIndex: 999 }}>
        <button onClick={() => setView('motorista')} style={styles.btnSec}>Ver como Celular</button>
      </div>

      <main style={styles.dashboardContainer}>
        {/* Lado Esquerdo */}
        <div style={{...styles.dashboardCard, flex: 1, display: 'flex', flexDirection: 'column'}}>
          <div style={styles.dashboardHeader}>
            <h2 style={{ color: '#fff', margin: 0, fontSize: '18px' }}>PAINEL DE ROTAS</h2>
            <Settings size={18} color="#94a3b8"/>
          </div>

          <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '15px', overflowY: 'auto' }}>
            <select style={styles.selectInput} value={motoristaSelecionado} onChange={(e) => setMotoristaSelecionado(e.target.value)}>
                <option value="">Selecione um motorista...</option>
                {motoristas.map(m => <option key={m.id} value={m.nome || m.motoristas}>{m.nome || m.motoristas}</option>)}
            </select>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setInputTipo('entrega')} style={inputTipo === 'entrega' ? styles.btnTypeActiveBlue : styles.btnTypeInactive}>ENTREGA</button>
              <button onClick={() => setInputTipo('recolha')} style={inputTipo === 'recolha' ? styles.btnTypeActiveOrange : styles.btnTypeInactive}>RECOLHA</button>
            </div>

            <div style={{ display: 'flex', gap: '5px' }}>
               <input value={inputEndereco} onChange={(e) => setInputEndereco(e.target.value)} placeholder="Endereço" style={{...styles.inputDash, flex: 2}} />
               <input value={inputInfo} onChange={(e) => setInputInfo(e.target.value)} placeholder="Obs" style={{...styles.inputDash, flex: 1}} />
            </div>

            <button onClick={adicionarAoRascunho} style={styles.btnAdd}><Plus size={20} /> ADICIONAR</button>

            <div style={styles.listContainer}>
               {rascunho.map((item, index) => (
                  <div key={item.id} style={styles.listItem}>
                    <span style={{color: '#fff', marginRight: 10}}>{index + 1}.</span>
                    <span style={{color: '#ccc', flex: 1, fontSize: '13px'}}>{item.endereco}</span>
                    <Trash2 size={16} color="#ef4444" onClick={() => removerDoRascunho(item.id)} style={{cursor:'pointer'}}/>
                  </div>
               ))}
            </div>
            <button onClick={enviarRotaParaSupabase} style={styles.btnSend}><Send size={18} /> ENVIAR</button>
          </div>
        </div>

        {/* Lado Direito: MAPA */}
        <div style={{...styles.dashboardCard, flex: 1, marginLeft: 20, height: '600px', position: 'relative'}}>
            <div style={styles.dashboardHeader}>
                <h2 style={{ color: '#fff', margin: 0, fontSize: '18px' }}>
                    MAPA EM TEMPO REAL
                    {motoristaSelecionado && <span style={{fontSize: '12px', color: '#38bdf8', marginLeft: 10}}>Rastreando: {motoristaSelecionado}</span>}
                </h2>
            </div>
            <MapContainer center={coordsMotorista || [-23.5505, -46.6333]} zoom={13} style={{ height: '100%', width: '100%' }}>
                <TileLayer
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                />
                
                {coordsMotorista && (
                    <Marker position={coordsMotorista}>
                        <Popup>
                            <b>{motoristaSelecionado}</b><br/>
                            Está aqui agora.
                        </Popup>
                    </Marker>
                )}
            </MapContainer>
        </div>

      </main>
    </div>
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
  
  label: { display: 'block', color: '#94a3b8', fontSize: '13px', fontWeight: 'bold', marginBottom: '5px', textTransform: 'uppercase' },
  inputDash: { padding: '10px', borderRadius: '8px', backgroundColor: '#020617', border: '1px solid #334155', color: '#fff', outline: 'none' },
  selectInput: { padding: '10px', borderRadius: '8px', backgroundColor: '#020617', border: '1px solid #334155', color: '#fff', outline: 'none', width: '100%' },
  
  btnTypeInactive: { flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #334155', background: 'transparent', color: '#64748b', cursor: 'pointer', fontWeight: 'bold' },
  btnTypeActiveBlue: { flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #3b82f6', background: 'rgba(59, 130, 246, 0.1)', color: '#60a5fa', cursor: 'pointer', fontWeight: 'bold' },
  btnTypeActiveOrange: { flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #f97316', background: 'rgba(249, 115, 22, 0.1)', color: '#fb923c', cursor: 'pointer', fontWeight: 'bold' },

  btnAdd: { width: '100%', padding: '12px', borderRadius: '8px', background: '#3b82f6', color: '#fff', border: 'none', fontWeight: 'bold', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px' },
  btnSend: { width: '100%', padding: '12px', borderRadius: '8px', background: '#10b981', color: '#fff', border: 'none', fontWeight: 'bold', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px', marginTop: 10 },

  listContainer: { flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px', paddingRight: '5px', marginTop: 10 },
  listItem: { display: 'flex', alignItems: 'center', padding: '10px', backgroundColor: '#1e293b', borderRadius: '8px', border: '1px solid #334155' },

  btnPrimary: { padding: '15px', borderRadius: '10px', border: 'none', backgroundColor: '#38bdf8', color: '#000', fontWeight: 'bold', cursor: 'pointer' },
  btnSec: { flex: 1, padding: '10px', background: '#334155', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' },
  btnConfirmar: { flex: 1, padding: '10px', background: '#10b981', color: '#000', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }
};

export default App;