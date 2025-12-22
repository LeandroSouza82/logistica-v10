import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

const somNovaEntrega = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');

function App() {
  const [entregas, setEntregas] = useState([]);
  const [view, setView] = useState(window.innerWidth < 768 ? 'motorista' : 'gestor');

  const buscarDados = async () => {
    const { data } = await supabase.from('entregas')
      .select('*')
      .order('ordem', { ascending: true });
    if (data) setEntregas(data);
  };

  useEffect(() => {
    buscarDados();
    // REALTIME REFORÇADO: Escuta qualquer mudança e atualiza a tela na hora
    const canal = supabase.channel('fluxo_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'entregas' }, () => {
        buscarDados();
        somNovaEntrega.play().catch(() => {});
      })
      .subscribe();
    return () => supabase.removeChannel(canal);
  }, []);

  const concluirEntrega = async (id) => {
    const nomeRecebedor = prompt("Quem recebeu?");
    if (!nomeRecebedor) return;
    await supabase.from('entregas').update({ 
      status: 'Concluído', 
      horario_conclusao: new Date().toISOString(),
      recado: `Entregue para: ${nomeRecebedor}`
    }).eq('id', id);
  };

  const mudarOrdem = async (id, novaOrdem) => {
    await supabase.from('entregas').update({ ordem: novaOrdem }).eq('id', id);
    // O Realtime atualizará a lista para todos automaticamente
  };

  if (view === 'motorista') {
    const fila = entregas.filter(e => e.status === 'Pendente');
    const atual = fila[0];
    const proximas = fila.slice(1);

    return (
      <div style={styles.mobileContainer}>
        <header style={styles.header}>
          <h2 style={{margin:0}}>ENTREGA ATUAL</h2>
          <small>{fila.length} paradas restantes</small>
        </header>

        <div style={styles.scrollArea}>
          {/* 1º CARD: O PRINCIPAL E MAIOR */}
          {atual ? (
            <div style={styles.cardPrincipal}>
              <div style={styles.badgeAtiva}>AGORA</div>
              <h1 style={{margin: '10px 0'}}>{atual.cliente}</h1>
              <p style={{fontSize: '18px', marginBottom: '20px'}}>📍 {atual.endereco}</p>
              
              <div style={styles.gridAcoes}>
                <button onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(atual.endereco)}`, '_blank')} style={styles.btnMapa}>🗺️ ABRIR GPS</button>
                <button onClick={() => concluirEntrega(atual.id)} style={styles.btnConcluir}>✅ CONCLUIR</button>
              </div>
            </div>
          ) : (
            <div style={{textAlign:'center', padding:'40px'}}>🏆 Rota Finalizada!</div>
          )}

          {/* PRÓXIMAS ENTREGAS: CARDS MENORES */}
          <h3 style={{marginTop: '20px', color: '#94a3b8'}}>PRÓXIMAS PARADAS</h3>
          {proximas.map((ent, i) => (
            <div key={ent.id} style={styles.cardMenor}>
              <div style={{flex: 1}}>
                <div style={{fontSize: '11px', color: '#38bdf8'}}>{i + 2}º PARADA</div>
                <div style={{fontWeight: 'bold'}}>{ent.cliente}</div>
                <div style={{fontSize: '12px', color: '#94a3b8'}}>{ent.endereco}</div>
              </div>
              <div style={styles.controleOrdem}>
                <button onClick={() => mudarOrdem(ent.id, ent.ordem - 1.5)}>▲</button>
                <button onClick={() => mudarOrdem(ent.id, ent.ordem + 1.5)}>▼</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return <div style={{padding:'20px', color:'#fff'}}>Dashboard Gestor Ativo. Envie as rotas para ver no celular. <button onClick={() => setView('motorista')}>Ver Celular</button></div>;
}

const styles = {
  mobileContainer: { width: '100vw', height: '100vh', backgroundColor: '#0f172a', color: '#fff', display: 'flex', flexDirection: 'column' },
  header: { padding: '20px', backgroundColor: '#1e293b', borderBottom: '2px solid #38bdf8', textAlign: 'center' },
  scrollArea: { flex: 1, overflowY: 'auto', padding: '15px' },
  cardPrincipal: { backgroundColor: '#1e293b', padding: '25px', borderRadius: '20px', borderLeft: '8px solid #38bdf8', boxShadow: '0 10px 15px rgba(0,0,0,0.3)' },
  badgeAtiva: { backgroundColor: '#38bdf8', color: '#000', display: 'inline-block', padding: '2px 10px', borderRadius: '4px', fontWeight: 'bold', fontSize: '12px' },
  gridAcoes: { display: 'flex', flexDirection: 'column', gap: '10px' },
  btnMapa: { padding: '18px', backgroundColor: '#334155', color: '#fff', border: 'none', borderRadius: '12px', fontWeight: 'bold', fontSize: '16px' },
  btnConcluir: { padding: '18px', backgroundColor: '#00ff88', color: '#000', border: 'none', borderRadius: '12px', fontWeight: 'bold', fontSize: '18px' },
  cardMenor: { backgroundColor: '#1e293b', padding: '12px', borderRadius: '12px', marginTop: '10px', display: 'flex', alignItems: 'center', opacity: 0.8 },
  controleOrdem: { display: 'flex', flexDirection: 'column', gap: '5px', marginLeft: '10px' },
  btnVitoria: { marginTop: '20px', padding: '15px', backgroundColor: '#ffd700', borderRadius: '10px' }
};

export default App;