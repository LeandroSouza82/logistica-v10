import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';
import { motion, AnimatePresence } from 'framer-motion';
import SignatureCanvas from 'react-signature-canvas';
// Importando ícones para o painel
import { Trash2, MapPin, Info, Plus, Send, Settings, Moon, ArrowDownToLine, ArrowUpFromLine, Search } from 'lucide-react';

function App() {
  // --- ESTADOS GERAIS ---
  const [entregas, setEntregas] = useState([]);
  const [motoristas, setMotoristas] = useState([]);
  const [view, setView] = useState(window.innerWidth < 768 ? 'motorista' : 'gestor');

  // --- ESTADOS DO MOTORISTA ---
  const [motoristaLogado, setMotoristaLogado] = useState(localStorage.getItem('mot_v10_nome') || null);
  const [form, setForm] = useState({ tel: '', senha: '' });
  const [mostrarAssinatura, setMostrarAssinatura] = useState(false);
  const [entregaFocada, setEntregaFocada] = useState(null);
  const sigPad = useRef({});

  // --- ESTADOS DO GESTOR (NOVOS) ---
  const [rascunho, setRascunho] = useState([]); // Lista temporária antes de enviar pro banco
  const [inputEndereco, setInputEndereco] = useState('');
  const [inputInfo, setInputInfo] = useState('');
  const [inputTipo, setInputTipo] = useState('entrega'); // 'entrega' ou 'recolha'
  const [motoristaSelecionado, setMotoristaSelecionado] = useState('');

  // --- BUSCA DE DADOS ---
  const buscarDados = async () => {
    const { data: e } = await supabase.from('entregas').select('*').order('ordem', { ascending: true });
    const { data: m } = await supabase.from('motoristas').select('*');

    // Tocar som se for motorista e tiver nova entrega
    if (e && e.length > entregas.length && view === 'motorista') {
      new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3').play().catch(() => { });
    }
    if (e) setEntregas(e);
    if (m) {
        setMotoristas(m);
        // Se não tiver motorista selecionado no painel, seleciona o primeiro da lista
        if (!motoristaSelecionado && m.length > 0) setMotoristaSelecionado(m[0].nome || m[0].motoristas);
    }
  };

  useEffect(() => {
    buscarDados();
    const canal = supabase.channel('logistica_v10').on('postgres_changes', { event: '*', schema: 'public', table: 'entregas' }, () => buscarDados()).subscribe();
    return () => supabase.removeChannel(canal);
  }, [entregas.length]);

  // --- FUNÇÕES DO GESTOR (NOVAS) ---
  const adicionarAoRascunho = () => {
    if (!inputEndereco) return alert("Digite um endereço!");
    
    const novoItem = {
      id: Date.now(),
      endereco: inputEndereco,
      info: inputInfo || 'Sem observações',
      tipo: inputTipo
    };

    setRascunho([...rascunho, novoItem]);
    setInputEndereco('');
    setInputInfo('');
  };

  const removerDoRascunho = (id) => {
    setRascunho(rascunho.filter(item => item.id !== id));
  };

  const enviarRotaParaSupabase = async () => {
    if (rascunho.length === 0) return alert("A lista está vazia!");
    if (!motoristaSelecionado) return alert("Selecione um motorista!");

    // Prepara os dados para o formato do Supabase
    // Mapeando: 'cliente' vai receber o Tipo + Info para aparecer bonito pro motorista
    const payload = rascunho.map((item, index) => ({
      cliente: `[${item.tipo.toUpperCase()}] ${item.info}`, 
      endereco: item.endereco,
      motorista: motoristaSelecionado,
      status: 'Pendente',
      ordem: index + 1, // Define ordem simples baseada na lista
      assinatura: 'NAO'
    }));

    const { error } = await supabase.from('entregas').insert(payload);

    if (error) {
      alert("Erro ao enviar: " + error.message);
    } else {
      alert("Rota enviada com sucesso para " + motoristaSelecionado);
      setRascunho([]); // Limpa o painel
      buscarDados(); // Atualiza a tela
    }
  };

  // --- FUNÇÕES DO MOTORISTA ---
  const abrirMapa = (endereco) => {
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(endereco)}`;
    window.open(url, '_blank');
  };

  const iniciarConclusao = (id) => { setEntregaFocada(id); setMostrarAssinatura(true); };

  const finalizarComAssinatura = async () => {
    if (sigPad.current.isEmpty()) return alert("O cliente precisa assinar!");
    const { error } = await supabase.from('entregas').update({
      status: 'Concluído',
      assinatura: 'SIM',
      horario_conclusao: new Date().toISOString()
    }).eq('id', entregaFocada);

    if (!error) { setMostrarAssinatura(false); setEntregaFocada(null); buscarDados(); }
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
  // RENDERIZAÇÃO: VISÃO MOTORISTA (Intacta)
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

        <main style={styles.mainMobileScroll}>
          <AnimatePresence mode='popLayout'>
            {entregas
              .filter(e => e.status === 'Pendente' && (e.motorista === motoristaLogado || e.motoristas === motoristaLogado))
              .sort((a, b) => a.ordem - b.ordem)
              .map((ent, idx) => (
                <motion.div
                  key={ent.id}
                  layout
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -100 }}
                  transition={{ duration: 0.3 }}
                  style={styles.card}
                >
                  <div style={styles.numBadge}>{idx + 1}</div>
                  <strong>{ent.cliente}</strong>
                  <p style={{ fontSize: '14px', color: '#94a3b8' }}>📍 {ent.endereco}</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
                    <button onClick={() => abrirMapa(ent.endereco)} style={styles.btnMapa}>🗺️ VER NO MAPA</button>
                    <button onClick={() => iniciarConclusao(ent.id)} style={styles.btnConcluir}>CONCLUIR</button>
                  </div>
                </motion.div>
              ))}
          </AnimatePresence>
        </main>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // RENDERIZAÇÃO: VISÃO GESTOR (Novo Dashboard)
  // -----------------------------------------------------------------------
  return (
    <div style={styles.universalPage}>
      {/* Sidebar / Menu simples */}
      <div style={{ position: 'absolute', top: 20, right: 20 }}>
        <button onClick={() => setView('motorista')} style={styles.btnSec}>
            Ver como Celular
        </button>
      </div>

      <main style={styles.dashboardContainer}>
        <div style={styles.dashboardCard}>
          
          <div style={styles.dashboardHeader}>
            <h2 style={{ color: '#fff', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
               PAINEL DE ROTAS
            </h2>
            <div style={{color: '#94a3b8', fontSize: '14px'}}>
                <Settings size={18} style={{display:'inline', marginRight: 10}}/> 
                Gestão V10
            </div>
          </div>

          <div style={{ padding: '30px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            {/* Seletor de Motorista */}
            <div>
                <label style={styles.label}>Para qual motorista?</label>
                <select 
                    style={styles.selectInput}
                    value={motoristaSelecionado}
                    onChange={(e) => setMotoristaSelecionado(e.target.value)}
                >
                    <option value="">Selecione um motorista...</option>
                    {motoristas.map(m => {
                        const nome = m.nome || m.motoristas;
                        return <option key={m.id} value={nome}>{nome}</option>
                    })}
                </select>
            </div>

            {/* Seletor de Tipo (Entrega/Recolha) */}
            <div>
              <label style={styles.label}>Tipo de Operação</label>
              <div style={{ display: 'flex', gap: '15px' }}>
                <button 
                  onClick={() => setInputTipo('entrega')}
                  style={inputTipo === 'entrega' ? styles.btnTypeActiveBlue : styles.btnTypeInactive}
                >
                  <ArrowDownToLine size={20} /> ENTREGA
                </button>
                <button 
                  onClick={() => setInputTipo('recolha')}
                  style={inputTipo === 'recolha' ? styles.btnTypeActiveOrange : styles.btnTypeInactive}
                >
                  <ArrowUpFromLine size={20} /> RECOLHA
                </button>
              </div>
            </div>

            {/* Inputs de Endereço */}
            <div style={{ display: 'flex', gap: '10px' }}>
                <div style={{ flex: 2 }}>
                    <label style={styles.label}>Endereço</label>
                    <div style={{display: 'flex', gap: 5}}>
                        <input 
                            value={inputEndereco}
                            onChange={(e) => setInputEndereco(e.target.value)}
                            placeholder="Rua, Número, Bairro" 
                            style={styles.inputDash} 
                        />
                        <button style={styles.btnIcon}><Search size={20}/></button>
                    </div>
                </div>
                <div style={{ flex: 1 }}>
                    <label style={styles.label}>Obs. Motorista</label>
                    <input 
                        value={inputInfo}
                        onChange={(e) => setInputInfo(e.target.value)}
                        placeholder="Ex: Cão bravo" 
                        style={styles.inputDash} 
                    />
                </div>
            </div>

            <button onClick={adicionarAoRascunho} style={styles.btnAdd}>
              <Plus size={20} /> ADICIONAR À LISTA
            </button>

            <hr style={{ borderColor: '#334155', margin: '10px 0' }} />

            {/* Lista de Rascunho */}
            <div>
              <label style={styles.label}>Rascunho da Rota ({rascunho.length})</label>
              <div style={styles.listContainer}>
                {rascunho.length === 0 && <p style={{color: '#64748b', textAlign: 'center', padding: 20}}>Nenhuma parada adicionada.</p>}
                
                {rascunho.map((item, index) => (
                  <div key={item.id} style={styles.listItem}>
                    <div style={{
                        width: '4px', height: '100%', position: 'absolute', left: 0, top: 0,
                        backgroundColor: item.tipo === 'entrega' ? '#3b82f6' : '#f97316'
                    }}></div>
                    
                    <div style={{marginLeft: 10, marginRight: 10, color: '#94a3b8', fontWeight: 'bold'}}>{index + 1}.</div>
                    
                    <div style={{flex: 1}}>
                        <div style={{display: 'flex', alignItems: 'center', gap: 5}}>
                            <span style={{
                                fontSize: '10px', padding: '2px 6px', borderRadius: '4px', textTransform: 'uppercase', fontWeight: 'bold',
                                backgroundColor: item.tipo === 'entrega' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(249, 115, 22, 0.2)',
                                color: item.tipo === 'entrega' ? '#60a5fa' : '#fb923c'
                            }}>
                                {item.tipo}
                            </span>
                        </div>
                        <div style={{color: '#e2e8f0', fontWeight: '500'}}>{item.endereco}</div>
                        <div style={{color: '#64748b', fontSize: '12px'}}>{item.info}</div>
                    </div>

                    <button onClick={() => removerDoRascunho(item.id)} style={{background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer'}}>
                        <Trash2 size={18} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <button onClick={enviarRotaParaSupabase} style={styles.btnSend}>
               <Send size={20} /> ENVIAR ROTA PARA MOTORISTA
            </button>

          </div>
        </div>
      </main>
    </div>
  );
}

// --- ESTILOS (CSS IN JS) ---
const styles = {
  universalPage: { width: '100vw', minHeight: '100vh', backgroundColor: '#020617', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'sans-serif' },
  
  // Auth & Mobile Base
  authCard: { backgroundColor: '#0f172a', padding: '30px', borderRadius: '24px', width: '350px', border: '1px solid #1e293b' },
  inputAuth: { padding: '15px', borderRadius: '10px', backgroundColor: '#020617', border: '1px solid #1e293b', color: '#fff', fontSize: '16px' },
  
  // Mobile UI
  mobileFull: { width: '100vw', height: '100vh', backgroundColor: '#020617', color: '#fff', display: 'flex', flexDirection: 'column' },
  headerMobile: { padding: '20px', borderBottom: '1px solid #1e293b', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#0f172a' },
  mainMobileScroll: { padding: '15px', flex: 1, overflowY: 'auto' },
  card: { background: '#0f172a', padding: '20px', borderRadius: '15px', marginBottom: '20px', position: 'relative', borderLeft: '5px solid #38bdf8', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' },
  numBadge: { position: 'absolute', top: '-10px', left: '-10px', background: '#38bdf8', color: '#000', width: '28px', height: '28px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '14px' },
  btnMapa: { background: '#334155', color: '#fff', border: 'none', padding: '12px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' },
  btnConcluir: { background: '#10b981', color: '#000', border: 'none', padding: '12px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' },
  
  // Modal Assinatura
  modal: { position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  cardAssinatura: { background: '#1e293b', padding: '20px', borderRadius: '20px', textAlign: 'center', width: '90%', maxWidth: '400px' },

  // GESTOR DASHBOARD STYLES (NOVO)
  dashboardContainer: { width: '100%', maxWidth: '800px', padding: '20px' },
  dashboardCard: { backgroundColor: '#0f172a', borderRadius: '16px', border: '1px solid #1e293b', overflow: 'hidden', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)' },
  dashboardHeader: { backgroundColor: '#1e293b', padding: '20px', borderBottom: '1px solid #334155', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  
  label: { display: 'block', color: '#94a3b8', fontSize: '13px', fontWeight: 'bold', marginBottom: '5px', textTransform: 'uppercase' },
  inputDash: { width: '100%', padding: '12px', borderRadius: '8px', backgroundColor: '#020617', border: '1px solid #334155', color: '#fff', outline: 'none' },
  selectInput: { width: '100%', padding: '12px', borderRadius: '8px', backgroundColor: '#020617', border: '1px solid #334155', color: '#fff', outline: 'none' },
  
  // Type Buttons
  btnTypeInactive: { flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid #334155', background: 'transparent', color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontWeight: 'bold' },
  btnTypeActiveBlue: { flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid #3b82f6', background: 'rgba(59, 130, 246, 0.1)', color: '#60a5fa', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontWeight: 'bold' },
  btnTypeActiveOrange: { flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid #f97316', background: 'rgba(249, 115, 22, 0.1)', color: '#fb923c', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontWeight: 'bold' },

  btnAdd: { width: '100%', padding: '15px', borderRadius: '8px', background: '#3b82f6', color: '#fff', border: 'none', fontWeight: 'bold', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px', marginTop: '10px' },
  btnSend: { width: '100%', padding: '15px', borderRadius: '8px', background: 'linear-gradient(to right, #10b981, #059669)', color: '#fff', border: 'none', fontWeight: 'bold', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px', marginTop: '10px', fontSize: '16px' },
  btnIcon: { padding: '0 15px', borderRadius: '8px', background: '#334155', color: '#fff', border: 'none', cursor: 'pointer' },

  // List Items
  listContainer: { maxHeight: '300px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px', paddingRight: '5px' },
  listItem: { display: 'flex', alignItems: 'center', padding: '12px', backgroundColor: '#1e293b', borderRadius: '8px', position: 'relative', overflow: 'hidden', border: '1px solid #334155' },

  // Generic Buttons
  btnPrimary: { padding: '15px', borderRadius: '10px', border: 'none', backgroundColor: '#38bdf8', color: '#000', fontWeight: 'bold', cursor: 'pointer' },
  btnSec: { flex: 1, padding: '10px', background: '#334155', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' },
  btnConfirmar: { flex: 1, padding: '10px', background: '#10b981', color: '#000', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }
};

export default App;