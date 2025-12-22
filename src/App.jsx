import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { motion, Reorder, AnimatePresence } from 'framer-motion';

const somAlerta = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');

function App() {
  const [entregas, setEntregas] = useState([]);
  const [view, setView] = useState(window.innerWidth < 768 ? 'motorista' : 'gestor');
  
  // LOGIN E CADASTRO
  const [motoristaLogado, setMotoristaLogado] = useState(localStorage.getItem('mot_v9') || null);
  const [formReg, setFormReg] = useState({ nome: '', tel: '' });

  const buscarDados = async () => {
    const { data } = await supabase.from('entregas').select('*').order('ordem', { ascending: true });
    if (data) setEntregas(data);
  };

  useEffect(() => {
    buscarDados();
    const canal = supabase.channel('logistica_v9')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'entregas' }, () => buscarDados())
      .subscribe();
    return () => supabase.removeChannel(canal);
  }, []);

  const finalizarReordem = async (novaLista) => {
    setEntregas(novaLista);
    for (let i = 0; i < novaLista.length; i++) {
      await supabase.from('entregas').update({ ordem: i + 1 }).eq('id', novaLista[i].id);
    }
  };

  const concluirEntrega = async (id) => {
    const nomeRecebedor = prompt("Quem recebeu a mercadoria?");
    if (!nomeRecebedor) return;
    const { error } = await supabase.from('entregas')
      .update({ 
        status: 'Concluído', 
        horario_conclusao: new Date().toISOString(),
        recado: `Recebido por: ${nomeRecebedor} | Mot: ${motoristaLogado}` 
      })
      .eq('id', id);
    if (!error) buscarDados();
  };

  const salvarMotorista = (e) => {
    e.preventDefault();
    localStorage.setItem('mot_v9', formReg.nome);
    setMotoristaLogado(formReg.nome);
  };

  // --- VISÃO MOTORISTA (CELULAR TRAVADO) ---
  if (view === 'motorista') {
    if (!motoristaLogado) {
      return (
        <div style={styles.mobileFull}>
          <div style={styles.loginCenter}>
            <div style={styles.iconCircle}>🚛</div>
            <h2 style={{marginBottom:'20px'}}>Identificação</h2>
            <form onSubmit={salvarMotorista} style={{width:'100%', display:'flex', flexDirection:'column', gap:'15px'}}>
              <input placeholder="Seu Nome" style={styles.inputLogin} onChange={e => setFormReg({...formReg, nome: e.target.value})} required />
              <input placeholder="WhatsApp" style={styles.inputLogin} onChange={e => setFormReg({...formReg, tel: e.target.value})} required />
              <button type="submit" style={styles.btnOk}>ATIVAR TURNO</button>
            </form>
          </div>
        </div>
      );
    }

    const pendentes = entregas.filter(e => e.status === 'Pendente');
    return (
      <div style={styles.mobileFull}>
        <header style={styles.headerMobile}>
          <div style={{textAlign:'left'}}>
            <h2 style={{margin: 0, fontSize: '18px', fontWeight: '800'}}>ROTA ATIVA</h2>
            <div style={styles.statusOnline}><div className="dot-live"></div> {motoristaLogado}</div>
          </div>
          <button onClick={() => { localStorage.clear(); window.location.reload(); }} style={styles.btnSair}>SAIR</button>
        </header>

        <main style={styles.mainMobile}>
          <Reorder.Group axis="y" values={pendentes} onReorder={finalizarReordem} style={styles.list}>
            <AnimatePresence>
              {pendentes.map((ent, index) => (
                <Reorder.Item
                  key={ent.id}
                  value={ent}
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
                  {index === 0 && (
                    <div style={styles.actions}>
                      <button onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ent.endereco)}`)} style={styles.btnMapa}>MAPA</button>
                      <button onClick={() => concluirEntrega(ent.id)} style={styles.btnOk}>CONCLUIR</button>
                    </div>
                  )}
                </Reorder.Item>
              ))}
            </AnimatePresence>
          </Reorder.Group>
          {pendentes.length === 0 && <div style={styles.empty}><h3>🏁 Tudo pronto!</h3></div>}
        </main>
        <style>{`.dot-live{width:8px;height:8px;background:#10b981;border-radius:50%;display:inline-block;margin-right:5px;animation:p 2s infinite}@keyframes p{0%{transform:scale(0.8);opacity:1}100%{transform:scale(1.5);opacity:0}}`}</style>
      </div>
    );
  }

  // --- VISÃO GESTOR (COMPUTADOR) ---
  return (
    <div style={styles.dashBody}>
      <aside style={styles.sidebar}>
        <div style={{display:'flex', alignItems:'center', gap:'10px', marginBottom:'40px'}}>
           <div className="live-pulsing-dot"></div>
           <h2 style={{color:'#38bdf8', letterSpacing:'-1px', margin:0}}>DASHBOARD</h2>
        </div>
        <form onSubmit={async (e) => {
          e.preventDefault();
          await supabase.from('entregas').insert([{cliente: e.target.c.value, endereco: e.target.e.value, status:'Pendente', ordem: entregas.length + 1}]);
          e.target.reset();
        }}>
          <input name="c" placeholder="Cliente" style={styles.inputLogin} required />
          <input name="e" placeholder="Endereço" style={styles.inputLogin} required />
          <button type="submit" style={{...styles.btnOk, width:'100%'}}>LANÇAR ROTA</button>
        </form>
        <button onClick={() => setView('motorista')} style={{marginTop:'30px', background:'none', border:'none', color:'#475569', cursor:'pointer'}}>Ver Modo Mobile</button>
      </aside>

      <main style={styles.dashMain}>
        <div style={styles.statsRow}>
          <div style={styles.statCard}><small>TOTAL</small><h1>{entregas.length}</h1></div>
          <div style={styles.statCard}><small>PENDENTES</small><h1 style={{color:'#fbbf24'}}>{entregas.filter(e=>e.status==='Pendente').length}</h1></div>
          <div style={styles.statCard}><small>CONCLUÍDAS</small><h1 style={{color:'#10b981'}}>{entregas.filter(e=>e.status==='Concluído').length}</h1></div>
        </div>
        <table style={styles.table}>
          <thead><tr style={{textAlign:'left', color:'#475569'}}><th>STATUS</th><th>CLIENTE</th><th>ENDEREÇO</th><th>HISTÓRICO</th></tr></thead>
          <tbody>
            {entregas.map(ent => (
              <tr key={ent.id} style={{borderBottom:'1px solid #1e293b'}}>
                <td style={{padding:'15px'}}><span style={{color:ent.status==='Concluído'?'#10b981':'#fbbf24'}}>● {ent.status}</span></td>
                <td style={{fontWeight:'bold'}}>{ent.cliente}</td>
                <td>{ent.endereco}</td>
                <td style={{fontSize:'12px', color:'#94a3b8'}}>{ent.recado || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </main>
      <style>{`.live-pulsing-dot{width:12px;height:12px;background:#10b981;border-radius:50%;animation:pg 2s infinite}@keyframes pg{0%{box-shadow:0 0 0 0 rgba(16,185,129,0.7)}70%{box-shadow:0 0 0 10px rgba(16,185,129,0)}100%{box-shadow:0 0 0 0 rgba(16,185,129,0)}}`}</style>
    </div>
  );
}

const styles = {
  mobileFull: { width: '100vw', height: '100dvh', backgroundColor: '#020617', color: '#fff', overflow: 'hidden', display:'flex', flexDirection:'column' },
  loginCenter: { flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'20px', textAlign:'center' },
  iconCircle: { width:'80px', height:'80px', borderRadius:'50%', border:'2px solid #38bdf8', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'40px', marginBottom:'20px' },
  headerMobile: { padding: '20px', backgroundColor: '#0f172a', borderBottom: '1px solid #1e293b', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  mainMobile: { flex: 1, padding: '15px', overflowY: 'auto' },
  statusOnline: { fontSize: '12px', color: '#10b981', fontWeight: 'bold', display:'flex', alignItems:'center' },
  list: { listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '15px' },
  card: { padding: '20px', borderRadius: '24px', listStyle: 'none' },
  cardContent: { display: 'flex', alignItems: 'center', gap: '15px' },
  dragHandle: { color: '#475569', fontSize: '20px' },
  clienteNome: { fontWeight: '700', fontSize: '20px' },
  enderecoText: { fontSize: '14px', color: '#94a3b8', marginTop: '4px' },
  actions: { display: 'flex', gap: '10px', marginTop: '20px' },
  btnMapa: { flex: 1, padding: '16px', borderRadius: '14px', border: '1px solid #334155', background: 'transparent', color: '#fff', fontWeight: 'bold' },
  btnOk: { flex: 1, padding: '16px', borderRadius: '14px', border: 'none', background: '#38bdf8', color: '#000', fontWeight: 'bold' },
  btnSair: { background:'none', border:'1px solid #ef4444', color:'#ef4444', padding:'5px 10px', borderRadius:'8px', fontSize:'10px' },
  inputLogin: { width:'100%', padding:'15px', borderRadius:'12px', backgroundColor:'#0f172a', border:'1px solid #1e293b', color:'#fff', boxSizing:'border-box' },
  empty: { textAlign: 'center', marginTop: '50px', color: '#475569' },
  // Dash Styles
  dashBody: { display: 'flex', width: '100vw', height: '100vh', backgroundColor: '#020617', color: '#fff' },
  sidebar: { width: '300px', padding: '30px', background: '#0f172a', borderRight: '1px solid #1e293b' },
  dashMain: { flex:1, padding:'40px', overflowY:'auto' },
  statsRow: { display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:'20px', marginBottom:'40px' },
  statCard: { background:'#0f172a', padding:'25px', borderRadius:'20px', border:'1px solid #1e293b' },
  table: { width:'100%', borderCollapse:'collapse' }
};

export default App;