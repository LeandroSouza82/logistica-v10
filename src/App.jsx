import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

const somAlerta = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');

function App() {
  const [entregas, setEntregas] = useState([]);
  const [view, setView] = useState(window.innerWidth < 768 ? 'motorista' : 'gestor');
  const [motoristaLogado, setMotoristaLogado] = useState(localStorage.getItem('motorista_nome') || 'Motorista');
  const [audioAtivo, setAudioAtivo] = useState(false);

  const buscarDados = async () => {
    const { data } = await supabase.from('entregas').select('*').order('ordem', { ascending: true });
    if (data) setEntregas(data);
  };

  useEffect(() => {
    buscarDados();
    const canal = supabase.channel('logistica_premium')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'entregas' }, (payload) => {
        buscarDados();
        if (payload.eventType === 'INSERT') somAlerta.play().catch(() => {});
      }).subscribe();
    return () => supabase.removeChannel(canal);
  }, []);

  // FUNÇÃO SOFISTICADA PARA TROCAR POSIÇÃO
  const moverPosicao = async (id, ordemAtual, direcao) => {
    const novaOrdem = direcao === 'sobe' ? ordemAtual - 1.1 : ordemAtual + 1.1;
    await supabase.from('entregas').update({ ordem: novaOrdem }).eq('id', id);
    // O Realtime atualizará a lista automaticamente
  };

  const concluirEntrega = async (id) => {
    const nome = prompt("Confirmar recebimento por:");
    if (!nome) return;
    await supabase.from('entregas').update({ 
      status: 'Concluído', 
      horario_conclusao: new Date().toISOString(),
      recado: `Entregue para: ${nome}`
    }).eq('id', id);
  };

  if (view === 'motorista') {
    const pendentes = entregas.filter(e => e.status === 'Pendente');
    const atual = pendentes[0];
    const proximas = pendentes.slice(1);

    return (
      <div style={styles.appContainer} onClick={() => setAudioAtivo(true)}>
        <header style={styles.glassHeader}>
          <div style={styles.headerInfo}>
            <span style={styles.userDot}>●</span>
            <span style={styles.userName}>{motoristaLogado}</span>
          </div>
          <div style={styles.statusBadge}>ONLINE</div>
        </header>

        <main style={styles.mainContent}>
          {atual ? (
            <>
              {/* CARD DE DESTAQUE (SOFT DESIGN) */}
              <div style={styles.mainCard}>
                <div style={styles.categoryTag}>DESTINO ATUAL</div>
                <h1 style={styles.clientTitle}>{atual.cliente}</h1>
                <p style={styles.addressText}>📍 {atual.endereco}</p>
                
                <div style={styles.actionGrid}>
                  <button onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(atual.endereco)}`)} style={styles.secondaryBtn}>ROTA</button>
                  <button onClick={() => concluirEntrega(atual.id)} style={styles.primaryBtn}>CONCLUIR</button>
                </div>
              </div>

              {/* LISTA DE PRÓXIMAS COM TROCA DE POSIÇÃO */}
              <div style={styles.listHeader}>
                <span style={styles.listTitle}>Próximas paradas</span>
                <span style={styles.listCount}>{proximas.length} restantes</span>
              </div>

              <div style={styles.verticalList}>
                {proximas.map((ent, index) => (
                  <div key={ent.id} style={styles.smallCard}>
                    <div style={styles.cardInfo}>
                      <span style={styles.orderNumber}>{index + 2}º</span>
                      <div>
                        <div style={styles.smallClient}>{ent.cliente}</div>
                        <div style={styles.smallAddress}>{ent.endereco}</div>
                      </div>
                    </div>
                    
                    {/* CONTROLES DE POSIÇÃO ELEGANTES */}
                    <div style={styles.orderControls}>
                      <button onClick={() => moverPosicao(ent.id, ent.ordem, 'sobe')} style={styles.orderBtn}>▲</button>
                      <button onClick={() => moverPosicao(ent.id, ent.ordem, 'desce')} style={styles.orderBtn}>▼</button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div style={styles.emptyState}>
              <div className="pulse-ring"></div>
              <p style={styles.emptyText}>Aguardando novas rotas...</p>
            </div>
          )}
        </main>
        
        <style>{`
          .pulse-ring {
            width: 60px; height: 60px; background: #38bdf8; border-radius: 50%;
            animation: pulse 2s infinite ease-in-out; opacity: 0.3;
          }
          @keyframes pulse {
            0% { transform: scale(0.8); box-shadow: 0 0 0 0 rgba(56, 189, 248, 0.7); }
            70% { transform: scale(1.1); box-shadow: 0 0 0 40px rgba(56, 189, 248, 0); }
            100% { transform: scale(0.8); box-shadow: 0 0 0 0 rgba(56, 189, 248, 0); }
          }
        `}</style>
      </div>
    );
  }

  return <div style={{background: '#0f172a', height: '100vh', padding: '50px', textAlign:'center'}}>
    <button onClick={() => setView('motorista')} style={styles.primaryBtn}>Entrar no App</button>
  </div>;
}

const styles = {
  appContainer: { width: '100vw', height: '100vh', backgroundColor: '#0f172a', color: '#f8fafc', display: 'flex', flexDirection: 'column', fontFamily: '-apple-system, sans-serif' },
  glassHeader: { padding: '20px', background: 'rgba(30, 41, 59, 0.7)', backdropFilter: 'blur(10px)', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  headerInfo: { display: 'flex', alignItems: 'center', gap: '8px' },
  userDot: { color: '#22c55e', fontSize: '10px' },
  userName: { fontSize: '14px', fontWeight: '500', letterSpacing: '0.5px' },
  statusBadge: { fontSize: '10px', background: 'rgba(56, 189, 248, 0.1)', color: '#38bdf8', padding: '4px 8px', borderRadius: '20px', fontWeight: 'bold' },
  mainContent: { flex: 1, overflowY: 'auto', padding: '20px' },
  mainCard: { background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)', padding: '25px', borderRadius: '30px', border: '1px solid rgba(255,255,255,0.05)', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.5)' },
  categoryTag: { fontSize: '10px', color: '#94a3b8', fontWeight: 'bold', letterSpacing: '2px' },
  clientTitle: { fontSize: '32px', margin: '10px 0', fontWeight: '800' },
  addressText: { color: '#cbd5e1', fontSize: '16px', lineHeight: '1.4' },
  actionGrid: { display: 'flex', gap: '12px', marginTop: '25px' },
  primaryBtn: { flex: 2, padding: '18px', background: '#38bdf8', color: '#000', border: 'none', borderRadius: '18px', fontWeight: 'bold', fontSize: '16px' },
  secondaryBtn: { flex: 1, padding: '18px', background: 'rgba(255,255,255,0.05)', color: '#fff', border: 'none', borderRadius: '18px', fontWeight: 'bold' },
  listHeader: { display: 'flex', justifyContent: 'space-between', marginTop: '30px', marginBottom: '15px', padding: '0 5px' },
  listTitle: { fontSize: '14px', fontWeight: 'bold', color: '#94a3b8' },
  listCount: { fontSize: '12px', color: '#64748b' },
  verticalList: { display: 'flex', flexDirection: 'column', gap: '12px' },
  smallCard: { background: 'rgba(30, 41, 59, 0.5)', padding: '15px', borderRadius: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid rgba(255,255,255,0.03)' },
  cardInfo: { display: 'flex', alignItems: 'center', gap: '15px' },
  orderNumber: { fontSize: '12px', color: '#38bdf8', fontWeight: 'bold' },
  smallClient: { fontSize: '16px', fontWeight: 'bold' },
  smallAddress: { fontSize: '12px', color: '#64748b' },
  orderControls: { display: 'flex', gap: '5px' },
  orderBtn: { background: 'rgba(255,255,255,0.05)', border: 'none', color: '#fff', width: '35px', height: '35px', borderRadius: '10px', fontSize: '12px' },
  emptyState: { height: '80%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' },
  emptyText: { marginTop: '20px', color: '#64748b', fontSize: '14px' }
};

export default App;