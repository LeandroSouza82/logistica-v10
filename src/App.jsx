import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { motion, Reorder, AnimatePresence } from 'framer-motion';

function App() {
  const [entregas, setEntregas] = useState([]);
  const [view, setView] = useState(window.innerWidth < 768 ? 'motorista' : 'gestor');
  const [motoristaLogado, setMotoristaLogado] = useState(localStorage.getItem('mot_v5') || null);
  const [form, setForm] = useState({ nome: '', tel: '' });

  const buscar = async () => {
    const { data } = await supabase.from('entregas').select('*').order('ordem', { ascending: true });
    if (data) setEntregas(data);
  };

  useEffect(() => {
    buscar();
    const c = supabase.channel('v_final').on('postgres_changes',{event:'*',schema:'public',table:'entregas'},()=>buscar()).subscribe();
    return () => supabase.removeChannel(c);
  }, []);

  const login = (e) => {
    e.preventDefault();
    localStorage.setItem('mot_v5', form.nome);
    setMotoristaLogado(form.nome);
  };

  const concluir = async (id) => {
    const nome = prompt("Quem recebeu?");
    if (!nome) return;
    await supabase.from('entregas').update({ status: 'Concluído', recado: `Recebido por: ${nome}` }).eq('id', id);
  };

  // --- TELA DO CELULAR ---
  if (view === 'motorista') {
    if (!motoristaLogado) {
      return (
        <div style={{padding:'50px 20px', textAlign:'center', backgroundColor:'#020617', height:'100vh', color:'#fff'}}>
          <h2>🚚 ACESSO MOTORISTA</h2>
          <form onSubmit={login} style={{display:'flex', flexDirection:'column', gap:'10px', marginTop:'20px'}}>
            <input placeholder="Seu Nome" style={styles.input} onChange={e=>setForm({...form, nome:e.target.value})} required />
            <input placeholder="WhatsApp" style={styles.input} onChange={e=>setForm({...form, tel:e.target.value})} required />
            <button type="submit" style={styles.btn}>ENTRAR</button>
          </form>
        </div>
      );
    }
    return (
      <div style={{backgroundColor:'#020617', minHeight:'100vh', color:'#fff'}}>
        <header style={{padding:'20px', display:'flex', justifyContent:'space-between', background:'#0f172a'}}>
          <span>👤 {motoristaLogado}</span>
          <button onClick={()=>{localStorage.clear(); window.location.reload();}} style={{color:'#ef4444', background:'none', border:'none'}}>SAIR</button>
        </header>
        <main style={{padding:'15px'}}>
          <Reorder.Group axis="y" values={entregas.filter(e=>e.status==='Pendente')} onReorder={setEntregas} style={{padding:0}}>
            {entregas.filter(e=>e.status==='Pendente').map((ent, i) => (
              <Reorder.Item key={ent.id} value={ent} style={{padding:'20px', background:'#1e293b', borderRadius:'15px', marginBottom:'10px', listStyle:'none'}}>
                <strong>{ent.cliente}</strong>
                <p style={{fontSize:'12px', color:'#94a3b8'}}>{ent.endereco}</p>
                {i === 0 && <button onClick={()=>concluir(ent.id)} style={{marginTop:'10px', width:'100%', padding:'10px', background:'#00ff88', border:'none', borderRadius:'8px', fontWeight:'bold'}}>CONCLUIR</button>}
              </Reorder.Item>
            ))}
          </Reorder.Group>
        </main>
      </div>
    );
  }

  // --- TELA DO GESTOR (DASHBOARD) ---
  return (
    <div style={{display:'flex', height:'100vh', backgroundColor:'#020617', color:'#fff'}}>
      <aside style={{width:'300px', padding:'30px', background:'#0f172a', borderRight:'1px solid #1e293b'}}>
        <h2 style={{color:'#38bdf8'}}>DASHBOARD GESTOR</h2>
        <form style={{marginTop:'30px'}} onSubmit={async (e)=>{
          e.preventDefault();
          await supabase.from('entregas').insert([{cliente:e.target.c.value, endereco:e.target.e.value, status:'Pendente', ordem:entregas.length+1}]);
          e.target.reset();
        }}>
          <input name="c" placeholder="Novo Cliente" style={styles.input} required />
          <input name="e" placeholder="Endereço" style={styles.input} required />
          <button type="submit" style={styles.btn}>LANÇAR ROTA</button>
        </form>
        <button onClick={()=>setView('motorista')} style={{marginTop:'20px', opacity:0.5, color:'#fff', background:'none', border:'none', cursor:'pointer'}}>Ver Celular</button>
      </aside>
      <main style={{flex:1, padding:'40px', overflowY:'auto'}}>
        <h3>Entregas em Tempo Real</h3>
        <table style={{width:'100%', marginTop:'20px', borderCollapse:'collapse'}}>
          <thead><tr style={{textAlign:'left', color:'#475569'}}><th style={styles.pad}>CLIENTE</th><th style={styles.pad}>STATUS</th><th style={styles.pad}>OBS</th></tr></thead>
          <tbody>
            {entregas.map(ent=>(
              <tr key={ent.id} style={{borderBottom:'1px solid #1e293b'}}>
                <td style={styles.pad}>{ent.cliente}</td>
                <td style={styles.pad}><span style={{color:ent.status==='Concluído'?'#00ff88':'#fbbf24'}}>{ent.status}</span></td>
                <td style={styles.pad}>{ent.recado}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </main>
    </div>
  );
}

const styles = {
  input: { width:'100%', padding:'12px', marginBottom:'10px', borderRadius:'8px', border:'1px solid #334155', backgroundColor:'#020617', color:'#fff', boxSizing:'border-box' },
  btn: { width:'100%', padding:'12px', borderRadius:'8px', border:'none', backgroundColor:'#38bdf8', fontWeight:'bold', cursor:'pointer' },
  pad: { padding:'15px' }
};

export default App;