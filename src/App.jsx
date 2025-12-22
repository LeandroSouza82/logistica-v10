import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { motion, Reorder, AnimatePresence } from 'framer-motion';

const somAlerta = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');

function App() {
  const [entregas, setEntregas] = useState([]);
  const [view, setView] = useState(window.innerWidth < 768 ? 'motorista' : 'gestor');
  const [motoristaLogado, setMotoristaLogado] = useState(localStorage.getItem('mot_v8') || null);
  const [formReg, setFormReg] = useState({ nome: '', tel: '' });

  const buscarDados = async () => {
    const { data } = await supabase.from('entregas').select('*').order('ordem', { ascending: true });
    if (data) setEntregas(data);
  };

  useEffect(() => {
    buscarDados();
    const canal = supabase.channel('logistica_v8')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'entregas' }, () => buscarDados())
      .subscribe();
    return () => supabase.removeChannel(canal);
  }, []);

  const concluirEntrega = async (id) => {
    const nome = prompt("Recebido por:");
    if (!nome) return;
    await supabase.from('entregas').update({ 
      status: 'Concluído', 
      recado: `Recebido por: ${nome} | Mot: ${motoristaLogado}`
    }).eq('id', id);
  };

  // --- INTERFACE MOTORISTA (TRAVADA NA TELA) ---
  if (view === 'motorista') {
    if (!motoristaLogado) {
      return (
        <div style={styles.mobileFull}>
          <div style={styles.loginCard}>
            <div style={styles.iconCircle}>🚛</div>
            <h1 style={{fontSize:'24px', fontWeight:'900'}}>Identificação</h1>
            <form onSubmit={(e)=>{e.preventDefault(); localStorage.setItem('mot_v8', formReg.nome); setMotoristaLogado(formReg.nome);}} style={{display:'flex', flexDirection:'column', gap:'10px', width:'100%'}}>
              <input placeholder="Seu Nome" style={styles.inputGlass} onChange={e=>setFormReg({...formReg, nome:e.target.value})} required />
              <input placeholder="WhatsApp" style={styles.inputGlass} onChange={e=>setFormReg({...formReg, tel:e.target.value})} required />
              <button type="submit" style={styles.btnAction}>ENTRAR NO TURNO</button>
            </form>
          </div>
        </div>
      );
    }

    const pendentes = entregas.filter(e => e.status === 'Pendente');
    return (
      <div style={styles.mobileFull}>
        <header style={styles.mobileHeader}>
          <div style={{textAlign:'left'}}>
            <h2 style={{margin:0, fontSize:'18px'}}>ROTA ATIVA</h2>
            <div style={styles.userBadge}>● {motoristaLogado}</div>
          </div>
          <button onClick={()=>{localStorage.clear(); window.location.reload();}} style={styles.btnSair}>SAIR</button>
        </header>
        <main style={styles.scrollArea}>
          <Reorder.Group axis="y" values={pendentes} onReorder={setEntregas} style={{padding:0, listStyle:'none'}}>
            <AnimatePresence>
              {pendentes.map((ent, index) => (
                <Reorder.Item key={ent.id} value={ent} style={{...styles.premiumCard, borderLeft: index === 0 ? '6px solid #38bdf8' : '4px solid transparent', background: index === 0 ? '#1e293b' : 'rgba(30, 41, 59, 0.4)'}}>
                  <div style={{display:'flex', justifyContent:'space-between'}}><span style={{fontSize:'10px', color:'#38bdf8', fontWeight:'bold'}}>{index + 1}ª PARADA</span><span style={{opacity:0.3}}>☰</span></div>
                  <h2 style={{margin:'8px 0', fontSize:index === 0 ? '22px' : '16px'}}>{ent.cliente}</h2>
                  <p style={{fontSize:'13px', color:'#94a3b8'}}>📍 {ent.endereco}</p>
                  {index === 0 && (
                    <div style={{display:'flex', gap:'10px', marginTop:'15px'}}>
                      <button onClick={()=>window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ent.endereco)}`)} style={styles.btnSec}>MAPA</button>
                      <button onClick={()=>concluirEntrega(ent.id)} style={styles.btnPrim}>CONCLUIR</button>
                    </div>
                  )}
                </Reorder.Item>
              ))}
            </AnimatePresence>
          </Reorder.Group>
        </main>
      </div>
    );
  }

  // --- DASHBOARD GESTOR COM BOLINHA PULSANTE ---
  return (
    <div style={styles.dashBody}>
      <aside style={styles.sidebar}>
        <div style={{display:'flex', alignItems:'center', gap:'10px', marginBottom:'30px'}}>
           <div className="live-pulsing-dot"></div>
           <h2 style={{color:'#38bdf8', letterSpacing:'-1px', margin:0}}>DASHBOARD</h2>
        </div>
        
        <form style={{marginTop:'20px'}} onSubmit={async (e)=>{
          e.preventDefault();
          await supabase.from('entregas').insert([{cliente:e.target.c.value, endereco:e.target.e.value, status:'Pendente', ordem:entregas.length+1}]);
          e.target.reset();
        }}>
          <input name="c" placeholder="Nome do Cliente" style={styles.inputDash} required />
          <input name="e" placeholder="Endereço Completo" style={styles.inputDash} required />
          <button type="submit" style={styles.btnDash}>LANÇAR ROTA</button>
        </form>
        <button onClick={()=>setView('motorista')} style={{marginTop:'30px', background:'none', border:'none', color:'#475569', cursor:'pointer', fontSize:'12px'}}>Simular Celular</button>
      </aside>

      <main style={{flex:1, padding:'40px', overflowY:'auto'}}>
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
                <td style={{fontSize:'12px', color:'#94a3b8'}}>{ent.recado || 'Em trânsito...'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </main>

      <style>{`
        .live-pulsing-dot {
          width: 12px; height: 12px; background: #10b981; border-radius: 50%;
          animation: pulse-green 2s infinite;
        }
        @keyframes pulse-green {
          0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
          70% { transform: scale(1); box-shadow: 0 0 0 10px rgba(16, 185, 129, 0); }
          100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
        }
      `}</style>
    </div>
  );
}

const styles = {
  mobileFull: { width:'100vw', height:'100dvh', background:'#020617', color:'#fff', overflow:'hidden', display:'flex', flexDirection:'column' },
  mobileHeader: { padding:'20px', background:'#0f172a', borderBottom:'1px solid #1e293b', display:'flex', justifyContent:'space-between', alignItems:'center' },
  userBadge: { fontSize:'10px', color:'#38bdf8', fontWeight:'bold' },
  scrollArea: { flex:1, overflowY:'auto', padding:'15px' },
  premiumCard: { padding:'15px', borderRadius:'20px', marginBottom:'10px', userSelect:'none' },
  btnPrim: { flex:1, padding:'12px', background:'#38bdf8', border:'none', borderRadius:'10px', fontWeight:'bold' },
  btnSec: { flex:1, padding:'12px', background:'rgba(255,255,255,0.05)', color:'#fff', border:'none', borderRadius:'10px' },
  loginCard: { width:'100%', padding:'40px', textAlign:'center', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100%' },
  iconCircle: { width:'70px', height:'70px', borderRadius:'50%', border:'2px solid #38bdf8', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 20px', fontSize:'30px' },
  inputGlass: { width:'100%', padding:'15px', borderRadius:'12px', background:'#1e293b', border:'1px solid #334155', color:'#fff', marginBottom:'10px', boxSizing:'border-box' },
  btnAction: { width:'100%', padding:'15px', background:'#38bdf8', border:'none', borderRadius:'12px', fontWeight:'bold', cursor:'pointer' },
  btnSair: { color:'#ef4444', background:'none', border:'1px solid #ef4444', padding:'4px 8px', borderRadius:'6px', fontSize:'10px' },
  dashBody: { display:'flex', width:'100vw', height:'100vh', background:'#020617', color:'#fff' },
  sidebar: { width:'300px', padding:'30px', background:'#0f172a', borderRight:'1px solid #1e293b' },
  inputDash: { width:'100%', padding:'12px', background:'#020617', border:'1px solid #334155', borderRadius:'8px', color:'#fff', marginBottom:'10px', boxSizing:'border-box' },
  btnDash: { width:'100%', padding:'12px', background:'#38bdf8', border:'none', borderRadius:'8px', fontWeight:'bold', cursor:'pointer' },
  statsRow: { display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:'20px', marginBottom:'40px' },
  statCard: { background:'#0f172a', padding:'20px', borderRadius:'15px', border:'1px solid #1e293b' },
  table: { width:'100%', borderCollapse:'collapse' }
};

export default App;