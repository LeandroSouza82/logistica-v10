import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

// Sons de Notificação
const somNovaEntrega = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
const somVitoria = new Audio('https://assets.mixkit.co/active_storage/sfx/2019/2019-preview.mp3');

function App() {
  const [entregas, setEntregas] = useState([]);
  const [motoristas, setMotoristas] = useState([]);
  const [view, setView] = useState('gestor'); // Alterna entre 'gestor' ou 'motorista'
  const [novoPedido, setNovoPedido] = useState({ cliente: '', endereco: '', motorista: '', recado: '' });

  // Detecta dispositivo e busca dados iniciais
  useEffect(() => {
    if (window.innerWidth < 768) {
      setView('motorista');
    }
    buscarDados();

    // Configuração do Realtime do Supabase
    const canal = supabase.channel('logistica_v2')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'entregas' }, (payload) => {
        if (payload.eventType === 'INSERT') somNovaEntrega.play();
        if (payload.new && payload.new.status === 'Rota Finalizada') somVitoria.play();
        buscarDados();
      }).subscribe();

    return () => supabase.removeChannel(canal);
  }, []);

  const buscarDados = async () => {
    const { data: m } = await supabase.from('motoristas').select('*');
    const { data: e } = await supabase.from('entregas').select('*').order('ordem', { ascending: true });
    if (m) setMotoristas(m);
    if (e) setEntregas(e);
  };

  const criarPedido = async (e) => {
    e.preventDefault();
    await supabase.from('entregas').insert([{ ...novoPedido, status: 'Pendente', ordem: entregas.length + 1 }]);
    setNovoPedido({ cliente: '', endereco: '', motorista: '', recado: '' });
  };

  const concluirEntrega = async (id) => {
    const hora = new Date().toLocaleTimeString();
    await supabase.from('entregas').update({ status: 'Concluído', horario_conclusao: hora }).eq('id', id);
  };

  // --- VISÃO DO MOTORISTA (MOBILE) ---
  if (view === 'motorista') {
    return (
      <div style={styles.mobileContainer}>
        <header style={{ textAlign: 'center', padding: '10px', borderBottom: '1px solid #334155', marginBottom: '15px' }}>
          <h2 style={{ margin: 0 }}>📦 MINHAS ENTREGAS</h2>
          <button onClick={() => setView('gestor')} style={styles.btnTrocar}>Acessar como Gestor</button>
        </header>
        <div style={{ overflowY: 'auto', height: 'calc(100vh - 100px)' }}>
          {entregas.filter(e => e.status !== 'Rota Finalizada').map(ent => (
            <div key={ent.id} style={styles.cardMobile}>
              <h3 style={{ margin: '0 0 10px 0', color: '#38bdf8' }}>{ent.ordem}º - {ent.cliente}</h3>
              <p style={{ margin: '5px 0' }}>📍 {ent.endereco}</p>
              {ent.recado && <p style={{ fontSize: '13px', color: '#94a3b8' }}>💬 {ent.recado}</p>}
              
              {ent.status === 'Pendente' ? (
                <button onClick={() => concluirEntrega(ent.id)} style={styles.btnConcluir}>CONCLUIR ENTREGA</button>
              ) : (
                <div style={{ marginTop: '10px', color: '#00ff88', fontWeight: 'bold' }}>✅ Concluído às {ent.horario_conclusao}</div>
              )}
            </div>
          ))}
          {entregas.filter(e => e.status !== 'Rota Finalizada').length === 0 && (
            <p style={{ textAlign: 'center', marginTop: '50px', color: '#94a3b8' }}>Nenhuma entrega pendente.</p>
          )}
        </div>
      </div>
    );
  }

  // --- VISÃO DO GESTOR (DESKTOP) ---
  return (
    <div style={styles.container}>
      <aside style={styles.sidebar}>
        <button onClick={() => setView('motorista')} style={styles.btnTrocar}>Simular Celular</button>
        <h2 style={{ color: '#38bdf8', marginBottom: '20px' }}>Logística-v2 Gestor</h2>
        
        <form onSubmit={criarPedido} style={styles.form}>
          <h4 style={{ margin: '0 0 10px 0' }}>Novo Pedido</h4>
          <input placeholder="Cliente" value={novoPedido.cliente} onChange={e => setNovoPedido({ ...novoPedido, cliente: e.target.value })} style={styles.input} required />
          <input placeholder="Endereço" value={novoPedido.endereco} onChange={e => setNovoPedido({ ...novoPedido, endereco: e.target.value })} style={styles.input} required />
          <select style={styles.input} required onChange={e => setNovoPedido({ ...novoPedido, motorista: e.target.value })}>
            <option value="">Selecionar Motorista</option>
            {motoristas.map(m => <option key={m.id} value={m.nome}>{m.nome}</option>)}
          </select>
          <textarea placeholder="Recado (opcional)" value={novoPedido.recado} onChange={e => setNovoPedido({ ...novoPedido, recado: e.target.value })} style={{ ...styles.input, height: '60px', resize: 'none' }} />
          <button type="submit" style={styles.btnEnviar}>ENVIAR PARA ROTA</button>
        </form>

        <div style={{ marginTop: '30px' }}>
          <h3>Monitoramento</h3>
          <div style={{ overflowY: 'auto', maxHeight: '300px' }}>
            {entregas.map(ent => (
              <div key={ent.id} style={styles.log}>
                <span>{ent.cliente}</span>
                <span style={{ color: ent.status === 'Concluído' ? '#00ff88' : '#fbbf24' }}>
                  {ent.status} {ent.horario_conclusao}
                </span>
              </div>
            ))}
          </div>
        </div>
      </aside>

      <main style={styles.main}>
        <div style={styles.mapaPlaceholder}>
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: '24px', margin: 0 }}>📍</p>
            <p>Mapa de Entregas Ativo</p>
            <small style={{ color: '#94a3b8' }}>{entregas.length} paradas na rota atual</small>
          </div>
        </div>
      </main>
    </div>
  );
}

const styles = {
  container: { display: 'flex', height: '100vh', backgroundColor: '#0f172a', color: '#fff', fontFamily: 'sans-serif' },
  sidebar: { width: '320px', padding: '20px', backgroundColor: '#1e293b', borderRight: '1px solid #334155', display: 'flex', flexDirection: 'column' },
  form: { display: 'flex', flexDirection: 'column', gap: '5px' },
  main: { flex: 1, padding: '20px' },
  mapaPlaceholder: { height: '100%', backgroundColor: '#334155', borderRadius: '15px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px dashed #475569' },
  input: { padding: '12px', marginBottom: '10px', borderRadius: '6px', border: '1px solid #334155', width: '100%', backgroundColor: '#0f172a', color: '#fff', boxSizing: 'border-box' },
  btnEnviar: { width: '100%', padding: '12px', backgroundColor: '#38bdf8', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', color: '#000' },
  log: { fontSize: '13px', padding: '10px 5px', borderBottom: '1px solid #334155', display: 'flex', justifyContent: 'space-between' },
  mobileContainer: { padding: '15px', backgroundColor: '#0f172a', minHeight: '100vh', color: '#fff', fontFamily: 'sans-serif' },
  cardMobile: { backgroundColor: '#1e293b', padding: '20px', borderRadius: '12px', marginBottom: '15px', borderLeft: '6px solid #38bdf8', boxShadow: '0 4px 6px rgba(0,0,0,0.2)' },
  btnConcluir: { width: '100%', padding: '15px', backgroundColor: '#00ff88', border: 'none', borderRadius: '8px', marginTop: '10px', fontWeight: 'bold', fontSize: '16px', color: '#000' },
  btnTrocar: { padding: '8px 12px', fontSize: '12px', cursor: 'pointer', backgroundColor: '#334155', color: '#fff', border: '1px solid #475569', borderRadius: '5px', marginTop: '5px' }
};

export default App;