import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { motion, Reorder, AnimatePresence } from 'framer-motion';

const somAlerta = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');

function App() {
  const [entregas, setEntregas] = useState([]);
  const [view, setView] = useState(window.innerWidth < 768 ? 'motorista' : 'gestor');

  const buscarDados = async () => {
    const { data } = await supabase.from('entregas').select('*').order('ordem', { ascending: true });
    if (data) setEntregas(data);
  };

  useEffect(() => {
    buscarDados();
    const canal = supabase.channel('logistica_final')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'entregas' }, () => buscarDados())
      .subscribe();
    return () => supabase.removeChannel(canal);
  }, []);

  const finalizarReordem = async (novaLista) => {
    setEntregas(novaLista);
    // Atualiza a ordem no banco para persistir o que o motorista fez
    for (let i = 0; i < novaLista.length; i++) {
      await supabase.from('entregas').update({ ordem: i + 1 }).eq('id', novaLista[i].id);
    }
  };

  // FUNÇÃO DE CONCLUIR REATIVADA
  const concluirEntrega = async (id) => {
    const nomeRecebedor = prompt("Quem recebeu a mercadoria?");
    if (!nomeRecebedor) return;

    const { error } = await supabase.from('entregas')
      .update({ 
        status: 'Concluído', 
        horario_conclusao: new Date().toISOString(),
        recado: `Recebido por: ${nomeRecebedor}` 
      })
      .eq('id', id);

    if (error) {
      alert("Erro ao concluir: " + error.message);
    } else {
      buscarDados(); // Atualiza a lista e remove o card concluído da tela
    }
  };

  if (view === 'motorista') {
    const pendentes = entregas.filter(e => e.status === 'Pendente');

    return (
      <div style={styles.appContainer}>
        <header style={styles.header}>
          <h2 style={{margin: 0, fontSize: '18px', fontWeight: '800'}}>ROTA ATIVA</h2>
          <div style={styles.statusOnline}>● REALTIME</div>
        </header>

        <main style={styles.main}>
          <Reorder.Group axis="y" values={pendentes} onReorder={finalizarReordem} style={styles.list}>
            <AnimatePresence>
              {pendentes.map((ent, index) => (
                <Reorder.Item
                  key={ent.id}
                  value={ent}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -100 }}
                  whileDrag={{ scale: 1.03, boxShadow: "0px 15px 30px rgba(0,0,0,0.5)" }}
                  style={{
                    ...styles.card, 
                    borderLeft: index === 0 ? '6px solid #38bdf8' : '4px solid transparent',
                    background: index === 0 ? '#1e293b' : 'rgba(30, 41, 59, 0.5)'
                  }}
                >
                  <div style={styles.cardContent}>
                    <div style={styles.dragHandle}>☰</div>
                    <div style={{flex: 1}}>
                      <div style={styles.clienteNome}>{ent.cliente}</div>
                      <div style={styles.enderecoText}>📍 {ent.endereco}</div>
                    </div>
                  </div>

                  {/* SÓ MOSTRA OS BOTÕES NA ENTREGA ATUAL (A PRIMEIRA DA LISTA) */}
                  {index === 0 && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={styles.actions}>
                      <button 
                        onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ent.endereco)}`)} 
                        style={styles.btnMapa}
                      >
                        ABRIR GPS
                      </button>
                      <button 
                        onClick={() => concluirEntrega(ent.id)} 
                        style={styles.btnOk}
                      >
                        CONCLUIR
                      </button>
                    </motion.div>
                  )}
                </Reorder.Item>
              ))}
            </AnimatePresence>
          </Reorder.Group>
          
          {pendentes.length === 0 && (
            <div style={styles.empty}>
               <div style={{fontSize: '40px'}}>🏁</div>
               <h3>Fim da jornada!</h3>
               <p>Não há mais entregas pendentes.</p>
            </div>
          )}
        </main>
      </div>
    );
  }

  // --- VISÃO DO GESTOR (DESKTOP) ---
  const pendentes = entregas.filter(e => e.status === 'Pendente');
  const concluidas = entregas.filter(e => e.status === 'Concluído');
  const progressoTotal = entregas.length > 0 ? (concluidas.length / entregas.length) * 100 : 0;

  return (
    <div style={styles.dashContainer}>
      {/* SIDEBAR DE COMANDO */}
      <aside style={styles.sidebar}>
        <div style={styles.logoArea}>
          <h2 style={styles.logo}>LOGÍSTICA <span style={{color:'#38bdf8'}}>PRO</span></h2>
          <p style={styles.subLogo}>Painel Administrativo</p>
        </div>

        <nav style={styles.nav}>
          <div style={styles.navItemActive}>📊 Visão Geral</div>
          <div style={styles.navItem} onClick={() => setView('motorista')}>📱 Ver Celular</div>
        </nav>

        <div style={styles.formContainer}>
          <h3 style={styles.formTitle}>Nova Entrega</h3>
          <form onSubmit={async (e) => {
            e.preventDefault();
            const cliente = e.target.cliente.value;
            const endereco = e.target.endereco.value;
            await supabase.from('entregas').insert([{ cliente, endereco, status: 'Pendente', ordem: entregas.length + 1 }]);
            e.target.reset();
          }} style={styles.form}>
            <input name="cliente" placeholder="Nome do Cliente" style={styles.inputDash} required />
            <input name="endereco" placeholder="Endereço Completo" style={styles.inputDash} required />
            <button type="submit" style={styles.btnDashPrimary}>LANÇAR NA ROTA</button>
          </form>
        </div>
      </aside>

      {/* CONTEÚDO PRINCIPAL */}
      <main style={styles.dashMain}>
        {/* CARDS DE INDICADORES */}
        <header style={styles.dashHeader}>
          <div style={styles.statCard}>
            <span style={styles.statLabel}>TOTAL DE ENTREGAS</span>
            <div style={styles.statValue}>{entregas.length}</div>
          </div>
          <div style={styles.statCard}>
            <span style={styles.statLabel}>CONCLUÍDAS</span>
            <div style={{...styles.statValue, color: '#10b981'}}>{concluidas.length}</div>
          </div>
          <div style={styles.statCard}>
            <span style={styles.statLabel}>PENDENTES</span>
            <div style={{...styles.statValue, color: '#fbbf24'}}>{pendentes.length}</div>
          </div>
          <div style={styles.statCard}>
            <span style={styles.statLabel}>EFICIÊNCIA</span>
            <div style={styles.statValue}>{progressoTotal.toFixed(0)}%</div>
          </div>
        </header>

        {/* TABELA DE MONITORAMENTO EM TEMPO REAL */}
        <section style={styles.tableSection}>
          <div style={styles.tableHeader}>
            <h3>Monitoramento em Tempo Real</h3>
            <div style={styles.liveDot}>● LIVE</div>
          </div>
          
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>ORDEM</th>
                <th style={styles.th}>CLIENTE</th>
                <th style={styles.th}>ENDEREÇO</th>
                <th style={styles.th}>STATUS</th>
                <th style={styles.th}>HORÁRIO</th>
                <th style={styles.th}>OBSERVAÇÃO</th>
              </tr>
            </thead>
            <tbody>
              {entregas.map((ent) => (
                <tr key={ent.id} style={styles.tr}>
                  <td style={styles.td}>#{ent.ordem}</td>
                  <td style={{...styles.td, fontWeight: 'bold'}}>{ent.cliente}</td>
                  <td style={styles.td}>{ent.endereco}</td>
                  <td style={styles.td}>
                    <span style={{
                      ...styles.statusTag, 
                      backgroundColor: ent.status === 'Concluído' ? '#064e3b' : '#451a03',
                      color: ent.status === 'Concluído' ? '#10b981' : '#fbbf24'
                    }}>
                      {ent.status}
                    </span>
                  </td>
                  <td style={styles.td}>{ent.horario_conclusao ? new Date(ent.horario_conclusao).toLocaleTimeString() : '--:--'}</td>
                  <td style={styles.td}>{ent.recado || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </main>
    </div>
  );
}

const styles = {
  appContainer: { width: '100vw', height: '100vh', backgroundColor: '#020617', color: '#fff', fontFamily: '-apple-system, sans-serif' },
  header: { padding: '20px', backgroundColor: '#0f172a', borderBottom: '1px solid #1e293b', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  statusOnline: { fontSize: '10px', color: '#10b981', fontWeight: 'bold' },
  main: { padding: '15px', height: 'calc(100vh - 80px)', overflowY: 'auto' },
  list: { listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '15px' },
  card: { padding: '20px', borderRadius: '24px', listStyle: 'none', userSelect: 'none' },
  cardContent: { display: 'flex', alignItems: 'center', gap: '15px' },
  dragHandle: { color: '#475569', fontSize: '20px' },
  clienteNome: { fontWeight: '700', fontSize: '20px' },
  enderecoText: { fontSize: '14px', color: '#94a3b8', marginTop: '4px' },
  actions: { display: 'flex', gap: '10px', marginTop: '20px' },
  btnMapa: { flex: 1, padding: '16px', borderRadius: '14px', border: '1px solid #334155', background: 'transparent', color: '#fff', fontWeight: 'bold' },
  btnOk: { flex: 1, padding: '16px', borderRadius: '14px', border: 'none', background: '#38bdf8', color: '#000', fontWeight: 'bold' },
  empty: { textAlign: 'center', marginTop: '100px', color: '#475569' },

  // DASHBOARD (GESTOR)
  dashContainer: { display: 'flex', width: '100vw', height: '100vh', backgroundColor: '#020617', color: '#fff', fontFamily: 'sans-serif' },
  sidebar: { width: '300px', backgroundColor: '#0f172a', borderRight: '1px solid #1e293b', padding: '30px', display: 'flex', flexDirection: 'column' },
  logoArea: { marginBottom: '20px' },
  logo: { fontSize: '24px', margin: 0, fontWeight: '800', letterSpacing: '-1px' },
  subLogo: { fontSize: '12px', color: '#475569', marginTop: '5px' },
  nav: { marginTop: '40px', flex: 1 },
  navItemActive: { padding: '12px 15px', backgroundColor: '#1e293b', borderRadius: '8px', color: '#38bdf8', fontWeight: 'bold', marginBottom: '10px' },
  navItem: { padding: '12px 15px', color: '#94a3b8', cursor: 'pointer', borderRadius: '8px', transition: '0.2s' },
  formContainer: { marginTop: '20px', padding: '20px', backgroundColor: '#1e293b', borderRadius: '15px' },
  formTitle: { fontSize: '14px', marginBottom: '15px', color: '#38bdf8' },
  inputDash: { width: '100%', padding: '12px', marginBottom: '10px', borderRadius: '8px', border: '1px solid #334155', backgroundColor: '#020617', color: '#fff', boxSizing: 'border-box' },
  btnDashPrimary: { width: '100%', padding: '15px', backgroundColor: '#38bdf8', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' },
  dashMain: { flex: 1, padding: '40px', overflowY: 'auto' },
  dashHeader: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px', marginBottom: '40px' },
  statCard: { backgroundColor: '#0f172a', padding: '25px', borderRadius: '20px', border: '1px solid #1e293b' },
  statLabel: { fontSize: '11px', color: '#475569', fontWeight: 'bold', letterSpacing: '1px' },
  statValue: { fontSize: '32px', fontWeight: '800', marginTop: '10px' },
  tableSection: { backgroundColor: '#0f172a', borderRadius: '20px', border: '1px solid #1e293b', overflow: 'hidden' },
  tableHeader: { padding: '20px', borderBottom: '1px solid #1e293b', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  liveDot: { color: '#ef4444', fontSize: '12px', fontWeight: 'bold', animation: 'blink 1.5s infinite' },
  table: { width: '100%', borderCollapse: 'collapse', textAlign: 'left' },
  th: { padding: '15px 20px', fontSize: '12px', color: '#475569', textTransform: 'uppercase', borderBottom: '1px solid #1e293b' },
  td: { padding: '18px 20px', fontSize: '14px', borderBottom: '1px solid #1e293b' },
  statusTag: { padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold' }
};

export default App;