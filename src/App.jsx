import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { motion, Reorder, AnimatePresence } from 'framer-motion';

const somAlerta = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');

function App() {
  const [entregas, setEntregas] = useState([]);
  const [view, setView] = useState(window.innerWidth < 768 ? 'motorista' : 'gestor');
  const [motoristaLogado, setMotoristaLogado] = useState(localStorage.getItem('mot_premium') || null);
  const [formReg, setFormReg] = useState({ nome: '', tel: '' });

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

  const finalizarReordem = async (novaLista) => {
    setEntregas(novaLista);
    for (let i = 0; i < novaLista.length; i++) {
      await supabase.from('entregas').update({ ordem: i + 1 }).eq('id', novaLista[i].id);
    }
  };

  const concluirEntrega = async (id) => {
    const nome = prompt("Confirmar recebimento por:");
    if (!nome) return;
    await supabase.from('entregas').update({ 
      status: 'Concluído', 
      horario_conclusao: new Date().toISOString(),
      recado: `Recebido por: ${nome} | Mot: ${motoristaLogado}`
    }).eq('id', id);
  };

  // --- INTERFACE MOTORISTA (DESIGN PREMIUM) ---
  if (view === 'motorista') {
    if (!motoristaLogado) {
      return (
        <div style={styles.mobileContainer}>
          <div style={styles.loginContent}>
            <motion.div initial={{scale:0}} animate={{scale:1}} style={styles.iconCircle}>🚛</motion.div>
            <h1 style={styles.loginTitle}>Acesso à Rota</h1>
            <p style={styles.loginSub}>Identifique-se para iniciar seu turno.</p>
            <form onSubmit={(e)=>{e.preventDefault(); localStorage.setItem('mot_premium', formReg.nome); setMotoristaLogado(formReg.nome);}} style={styles.loginForm}>
              <input placeholder="Seu Nome" style={styles.inputGlass} onChange={e=>setFormReg({...formReg, nome:e.target.value})} required />
              <input placeholder="WhatsApp" style={styles.inputGlass} onChange={e=>setFormReg({...formReg, tel:e.target.value})} required />
              <button type="submit" style={styles.btnAction}>ATIVAR TURNO</button>
            </form>
          </div>
        </div>
      );
    }

    const pendentes = entregas.filter(e => e.status === 'Pendente');
    const atual = pendentes[0];

    return (
      <div style={styles.mobileContainer}>
        <header style={styles.glassHeader}>
          <div style={{textAlign:'left'}}>
            <h2 style={{margin:0, fontSize:'18px', fontWeight:'800'}}>ROTA ATIVA</h2>
            <div style={styles.userBadge}>● {motoristaLogado}</div>
          </div>
          <button onClick={()=>{localStorage.clear(); window.location.reload();}} style={styles.btnSair}>SAIR</button>
        </header>

        <main style={styles.scrollArea}>
          {atual ? (
            <Reorder.Group axis="y" values={pendentes} onReorder={finalizarReordem} style={{padding:0, listStyle:'none'}}>
              <AnimatePresence>
                {pendentes.map((ent, index) => (
                  <Reorder.Item
                    key={ent.id}
                    value={ent}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -100 }}
                    whileDrag={{ scale: 1.05, boxShadow: "0px 20px 40px rgba(0,0,0,0.6)" }}
                    style={{
                      ...styles.premiumCard,
                      borderLeft: index === 0 ? '8px solid #38bdf8' : '4px solid transparent',
                      background: index === 0 ? 'linear-gradient(145deg, #1e293b, #0f172a)' : 'rgba(30, 41, 59, 0.4)'
                    }}
                  >
                    <div style={styles.cardHeader}>
                      <span style={{fontSize:'10px', color:'#38bdf8', fontWeight:'bold'}}>{index + 1}ª PARADA</span>
                      <div style={styles.dragHandle}>☰</div>
                    </div>
                    <h2 style={{margin:'10px 0', fontSize:index === 0 ? '24px' : '18px'}}>{ent.cliente}</h2>
                    <p style={styles.addressText}>📍 {ent.endereco}</p>
                    
                    {index === 0 && (
                      <div style={styles.cardActions}>
                        <button onClick={()=>window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ent.endereco)}`)} style={styles.btnSec}>MAPA</button>
                        <button onClick={()=>concluirEntrega(ent.id)} style={styles.btnPrim}>CONCLUIR</button>
                      </div>
                    )}
                  </Reorder.Item>
                ))}
              </AnimatePresence>
            </Reorder.Group>
          ) : (
            <div style={styles.radarContainer}>
              <div className="radar-ring"></div>
              <h3 style={{marginTop:'30px', color:'#94a3b8'}}>Aguardando rotas...</h3>
              <style>{`
                .radar-ring { width: 100px; height: 100px; background: #38bdf8; border-radius: 50%; animation: pulse 2s infinite; opacity: 0.2; }
                @keyframes pulse { 0% { transform: scale(0.6); opacity: 0.8; } 100% { transform: scale(1.5); opacity: 0; } }
              `}</style>
            </div>
          )}
        </main>
      </div>
    );
  }

  // --- DASHBOARD GESTOR (PROFISSIONAL) ---
  return (
    <div style={styles.dashBody}>
      <aside style={styles.sidebar}>
        <div style={styles.logo}>LOGÍSTICA <span style={{color:'#38bdf8'}}>PRO</span></div>
        <form style={styles.dashForm} onSubmit={async (e)=>{
          e.preventDefault();
          await supabase.from('entregas').insert([{cliente:e.target.c.value, endereco:e.target.e.value, status:'Pendente', ordem:entregas.length+1}]);
          e.target.reset();
        }}>
          <label style={styles.label}>Novo Pedido</label>
          <input name="c" placeholder="Nome do Cliente" style={styles.inputDash} required />
          <input name="e" placeholder="Endereço Completo" style={styles.inputDash} required />
          <button type="submit" style={styles.btnDash}>LANÇAR ROTA</button>
        </form>
        <button onClick={()=>setView('motorista')} style={styles.btnVerCel}>Modo Mobile</button>
      </aside>

      <main style={styles.dashContent}>
        <div style={styles.statsGrid}>
          <div style={styles.statCard}><small>TOTAL</small><h2>{entregas.length}</h2></div>
          <div style={styles.statCard}><small>PENDENTES</small><h2 style={{color:'#fbbf24'}}>{entregas.filter(e=>e.status==='Pendente').length}</h2></div>
          <div style={styles.statCard}><small>CONCLUÍDAS</small><h2 style={{color:'#10b981'}}>{entregas.filter(e=>e.status==='Concluído').length}</h2></div>
        </div>

        <div style={styles.tableWrapper}>
          <table style={styles.table}>
            <thead><tr><th>STATUS</th><th>CLIENTE</th><th>ENDEREÇO</th><th>FINALIZAÇÃO</th></tr></thead>
            <tbody>
              {entregas.map(ent => (
                <tr key={ent.id} style={styles.tr}>
                  <td><span style={{...styles.dot, background: ent.status === 'Concluído' ? '#10b981' : '#fbbf24'}}/> {ent.status}</td>
                  <td style={{fontWeight:'bold'}}>{ent.cliente}</td>
                  <td>{ent.endereco}</td>
                  <td style={{fontSize:'12px', color:'#94a3b8'}}>{ent.recado || '---'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}

const styles = {
  mobileContainer: { width:'100vw', height:'100vh', background:'#020617', color:'#fff', fontFamily:'sans-serif', overflow:'hidden', display:'flex', flexDirection:'column' },
  glassHeader: { padding:'25px 20px', background:'rgba(15, 23, 42, 0.8)', backdropFilter:'blur(10px)', borderBottom:'1px solid #1e293b', display:'flex', justifyContent:'space-between', alignItems:'center' },
  userBadge: { fontSize:'10px', color:'#38bdf8', fontWeight:'bold', marginTop:'5px' },
  scrollArea: { flex:1, overflowY:'auto', padding:'15px' },
  premiumCard: { padding:'20px', borderRadius:'24px', marginBottom:'15px', listStyle:'none', userSelect:'none' },
  cardHeader: { display:'flex', justifyContent:'space-between', alignItems:'center' },
  dragHandle: { color:'#475569', cursor:'grab' },
  addressText: { color:'#94a3b8', fontSize:'14px', lineHeight:'1.5' },
  cardActions: { display:'flex', gap:'10px', marginTop:'20px' },
  btnPrim: { flex:1, padding:'15px', borderRadius:'14px', border:'none', background:'#38bdf8', color:'#000', fontWeight:'bold' },
  btnSec: { flex:1, padding:'15px', borderRadius:'14px', border:'1px solid #334155', background:'transparent', color:'#fff' },
  radarContainer: { height:'100%', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center' },
  loginContent: { padding:'40px', textAlign:'center', width:'100%', height:'100vh', display:'flex', flexDirection:'column', justifyContent:'center' },
  iconCircle: { width:'80px', height:'80px', borderRadius:'50%', border:'2px solid #38bdf8', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 20px', fontSize:'40px' },
  loginTitle: { fontSize:'28px', fontWeight:'900', marginBottom:'10px' },
  inputGlass: { width:'100%', padding:'18px', borderRadius:'15px', background:'rgba(30, 41, 59, 0.5)', border:'1px solid #334155', color:'#fff', marginBottom:'10px', boxSizing:'border-box' },
  btnAction: { width:'100%', padding:'18px', borderRadius:'15px', border:'none', background:'#38bdf8', color:'#000', fontWeight:'bold', fontSize:'16px' },
  dashBody: { display:'flex', width:'100vw', height:'100vh', background:'#020617', color:'#fff', fontFamily:'sans-serif' },
  sidebar: { width:'320px', background:'#0f172a', padding:'40px', borderRight:'1px solid #1e293b' },
  logo: { fontSize:'22px', fontWeight:'900', letterSpacing:'-1px', marginBottom:'40px' },
  statCard: { background:'#0f172a', padding:'25px', borderRadius:'20px', border:'1px solid #1e293b', textAlign:'center' },
  statsGrid: { display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:'20px', marginBottom:'40px' },
  table: { width:'100%', borderCollapse:'collapse', textAlign:'left' },
  tr: { borderBottom:'1px solid #1e293b' },
  td: { padding:'15px' },
  dot: { width:'8px', height:'8px', borderRadius:'50%', display:'inline-block', marginRight:'8px' },
  inputDash: { width:'100%', padding:'12px', background:'#020617', border:'1px solid #334155', borderRadius:'8px', color:'#fff', marginBottom:'10px' },
  btnDash: { width:'100%', padding:'15px', background:'#38bdf8', border:'none', borderRadius:'8px', fontWeight:'bold', cursor:'pointer' },
  dashContent: { flex:1, padding:'60px', overflowY:'auto' },
  btnSair: { background:'none', border:'1px solid #ef4444', color:'#ef4444', padding:'5px 10px', borderRadius:'8px', fontSize:'10px', cursor:'pointer' }
};

export default App;