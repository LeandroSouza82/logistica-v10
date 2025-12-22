import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

// Sons (Links diretos e curtos para carregar rápido)
const somNovaEntrega = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
const somVitoria = new Audio('https://assets.mixkit.co/active_storage/sfx/2019/2019-preview.mp3');

function App() {
  const [entregas, setEntregas] = useState([]);
  const [motoristas, setMotoristas] = useState([]);
  const [view, setView] = useState(window.innerWidth < 768 ? 'motorista' : 'gestor');
  const [novoPedido, setNovoPedido] = useState({ cliente: '', endereco: '', motorista: '', recado: '' });

  // Função para buscar dados
  const buscarDados = async () => {
    const { data: e } = await supabase.from('entregas').select('*').order('ordem', { ascending: true });
    const { data: m } = await supabase.from('motoristas').select('*');
    if (e) setEntregas(e);
    if (m) setMotoristas(m);
  };

  useEffect(() => {
    buscarDados();

    // ESCUTA EM TEMPO REAL (O segredo para não precisar atualizar)
    const canal = supabase.channel('logistica_v2')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'entregas' }, (payload) => {
        console.log("Mudança detectada:", payload);
        if (payload.eventType === 'INSERT') {
          somNovaEntrega.play().catch(() => console.log("Clique na tela para liberar o som"));
        }
        if (payload.new && payload.new.status === 'Concluído') {
          // Se quiser som para cada entrega concluída
        }
        buscarDados(); // Atualiza a lista sozinho
      }).subscribe();

    return () => supabase.removeChannel(canal);
  }, []);

  const criarPedido = async (e) => {
    e.preventDefault();
    await supabase.from('entregas').insert([{ ...novoPedido, status: 'Pendente', ordem: entregas.length + 1 }]);
    setNovoPedido({ cliente: '', endereco: '', motorista: '', recado: '' });
  };

  const concluirEntrega = async (id) => {
    // O segredo está aqui: new Date().toISOString() envia o formato correto
    const agora = new Date().toISOString();

    const { error } = await supabase
      .from('entregas')
      .update({
        status: 'Concluído',
        horario_conclusao: agora // O banco agora vai aceitar!
      })
      .eq('id', id);

    if (error) {
      alert("Erro ao concluir: " + error.message);
    } else {
      // Tocar som de confirmação no celular se desejar
      console.log("Entrega concluída com sucesso!");
    }
  };

  // --- VISÃO DO MOTORISTA (AJUSTADA PARA CELULAR TODO) ---
  if (view === 'motorista') {
    return (
      <div style={styles.mobileContainer} onClick={() => { }}>
        <header style={styles.mobileHeader}>
          <h2 style={{ margin: 0, fontSize: '18px' }}>📦 MINHAS ENTREGAS</h2>
          <small>Clique na tela para ativar o som</small>
        </header>

        <div style={styles.scrollArea}>
          {entregas.filter(e => e.status !== 'Finalizado').map(ent => (
            <div key={ent.id} style={styles.cardMobile}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <strong style={{ color: '#38bdf8' }}>{ent.ordem}º - {ent.cliente}</strong>
                <span style={{ fontSize: '12px' }}>{ent.status}</span>
              </div>
              <p style={{ margin: '10px 0', fontSize: '14px' }}>📍 {ent.endereco}</p>

              {ent.status === 'Pendente' ? (
                <button
                  onClick={(e) => { e.stopPropagation(); concluirEntrega(ent.id); }}
                  style={styles.btnConcluir}
                >
                  CONCLUIR ENTREGA
                </button>
              ) : (
                <div style={styles.tagConcluido}>✅ CONCLUÍDO AS {ent.horario_conclusao}</div>
              )}
            </div>
          ))}
        </div>
        <button onClick={() => setView('gestor')} style={styles.btnFloating}>GESTÃO</button>
      </div>
    );
  }

  // --- VISÃO DO GESTOR ---
  return (
    <div style={styles.container}>
      <aside style={styles.sidebar}>
        <h2>Logística Gestor</h2>
        <form onSubmit={criarPedido} style={styles.form}>
          <input placeholder="Cliente" value={novoPedido.cliente} onChange={e => setNovoPedido({ ...novoPedido, cliente: e.target.value })} style={styles.input} required />
          <input placeholder="Endereço" value={novoPedido.endereco} onChange={e => setNovoPedido({ ...novoPedido, endereco: e.target.value })} style={styles.input} required />
          <select style={styles.input} onChange={e => setNovoPedido({ ...novoPedido, motorista: e.target.value })}>
            <option>Motorista</option>
            {motoristas.map(m => <option key={m.id} value={m.nome}>{m.nome}</option>)}
          </select>
          <button type="submit" style={styles.btnEnviar}>ENVIAR ROTA</button>
        </form>
        <div style={{ marginTop: '20px' }}>
          {entregas.map(ent => <div key={ent.id} style={{ fontSize: '11px', borderBottom: '1px solid #334155' }}>{ent.cliente} - {ent.status}</div>)}
        </div>
      </aside>
      <main style={{ flex: 1, backgroundColor: '#334155' }}>Mapa Ativo</main>
    </div>
  );
}

const styles = {
  container: { display: 'flex', height: '100vh', backgroundColor: '#0f172a', color: '#fff' },
  sidebar: { width: '280px', padding: '15px', backgroundColor: '#1e293b' },
  input: { padding: '10px', marginBottom: '10px', width: '100%', borderRadius: '5px', border: 'none' },
  btnEnviar: { width: '100%', padding: '12px', backgroundColor: '#38bdf8', border: 'none', borderRadius: '5px', fontWeight: 'bold' },

  // MOBILE - OCUPAR TELA TODA
  mobileContainer: {
    position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
    backgroundColor: '#0f172a', color: '#fff', display: 'flex', flexDirection: 'column',
    overflow: 'hidden', boxSizing: 'border-box'
  },
  mobileHeader: { padding: '15px', backgroundColor: '#1e293b', textAlign: 'center', borderBottom: '2px solid #38bdf8' },
  scrollArea: { flex: 1, overflowY: 'auto', padding: '15px' },
  cardMobile: {
    backgroundColor: '#1e293b', padding: '15px', borderRadius: '12px', marginBottom: '15px',
    borderLeft: '5px solid #38bdf8', pointerEvents: 'auto'
  },
  btnConcluir: {
    width: '100%', padding: '15px', backgroundColor: '#00ff88', color: '#000',
    border: 'none', borderRadius: '8px', fontWeight: 'bold', fontSize: '16px',
    marginTop: '10px', cursor: 'pointer', webkitAppearance: 'none'
  },
  tagConcluido: { color: '#00ff88', fontWeight: 'bold', textAlign: 'center', marginTop: '10px' },
  btnFloating: { position: 'fixed', bottom: '10px', right: '10px', padding: '10px', fontSize: '10px', opacity: 0.5 }
};

export default App;