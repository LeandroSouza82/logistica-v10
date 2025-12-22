import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { motion, Reorder, AnimatePresence } from 'framer-motion';

const somAlerta = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');

function App() {
  const [entregas, setEntregas] = useState([]);
  const [view, setView] = useState(window.innerWidth < 768 ? 'motorista' : 'gestor');
  
  // LOGIN E PERSISTÊNCIA (LEMBRAR SENHA)
  const [motoristaLogado, setMotoristaLogado] = useState(localStorage.getItem('mot_v10_nome') || null);
  const [paginaInterna, setPaginaInterna] = useState('login'); 
  const [form, setForm] = useState({ nome: '', tel: '', senha: '', veiculo: '' });

  const buscarDados = async () => {
    const { data } = await supabase.from('entregas').select('*').order('ordem', { ascending: true });
    if (data) setEntregas(data);
  };

  useEffect(() => {
    buscarDados();
    const canal = supabase.channel('logistica_v10')
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

  const acaoCadastro = async (e) => {
    e.preventDefault();
    const { error } = await supabase.from('motoristas').insert([form]);
    if (!error) {
      alert("✅ Cadastro realizado com sucesso! Faça o login agora.");
      setPaginaInterna('login');
    } else { 
      alert("❌ Erro ao cadastrar: " + error.message); 
    }
  };

  // LOGIN COM PERSISTÊNCIA
  const acaoLogin = async (e) => {
    e.preventDefault();
    const { data, error } = await supabase
      .from('motoristas')
      .select('*')
      .eq('tel', form.tel)
      .eq('senha', form.senha)
      .single();

    if (data) {
      // SALVA NO NAVEGADOR PARA "LEMBRAR"
      localStorage.setItem('mot_v10_nome', data.nome);
      localStorage.setItem('mot_v10_tel', data.tel);
      setMotoristaLogado(data.nome);
    } else {
      alert("❌ Dados incorretos. Verifique seu WhatsApp e Senha.");
    }
  };

  const acaoRecuperar = (e) => {
    e.preventDefault();
    const mensagem = encodeURIComponent(`Olá, esqueci minha senha. Meu WhatsApp é: ${form.tel}`);
    window.open(`https://wa.me/55${form.tel}?text=${mensagem}`, '_blank');
  };

  // --- TELAS DE AUTH (CADASTRO / RECUPERAR) ---
  if (paginaInterna === 'cadastro' || paginaInterna === 'recuperar') {
    return (
      <div style={styles.universalPage}>
        <motion.div initial={{opacity:0}} animate={{opacity:1}} style={styles.authCard}>
          <button onClick={() => setPaginaInterna('login')} style={styles.btnVoltar}>← Voltar</button>
          {paginaInterna === 'cadastro' ? (
            <form onSubmit={acaoCadastro} style={styles.flexCol}>
              <h2 style={styles.titleAuth}>Cadastro</h2>
              <input placeholder="Nome Completo" style={styles.inputAuth} onChange={e=>setForm({...form, nome:e.target.value})} required />
              <input placeholder="WhatsApp" style={styles.inputAuth} onChange={e=>setForm({...form, tel:e.target.value})} required />
              <input placeholder="Veículo" style={styles.inputAuth} onChange={e=>setForm({...form, veiculo:e.target.value})} required />
              <input placeholder="Senha" type="password" style={styles.inputAuth} onChange={e=>setForm({...form, senha:e.target.value})} required />
              <button type="submit" style={styles.btnPrimary}>CADASTRAR</button>
            </form>
          ) : (
            <form onSubmit={acaoRecuperar} style={styles.flexCol}>
              <h2 style={{...styles.titleAuth, color:'#fbbf24'}}>Recuperação</h2>
              <input placeholder="Seu WhatsApp" style={styles.inputAuth} onChange={e=>setForm({...form, tel:e.target.value})} required />
              <button type="submit" style={{...styles.btnPrimary, backgroundColor:'#fbbf24', color:'#000'}}>RECUPERAR</button>
            </form>
          )}
        </motion.div>
      </div>
    );
  }

  // --- MOTORISTA LOGADO ---
  if (view === 'motorista') {
    if (!motoristaLogado) {
      return (
        <div style={styles.mobileFull}>
          <div style={styles.loginCenter}>
            <div style={styles.iconCircle}>🚛</div>
            <h2>Logística V10</h2>
            <form onSubmit={acaoLogin} style={{width:'100%', display:'flex', flexDirection:'column', gap:'15px', marginTop:'20px'}}>
              <input placeholder="WhatsApp" style={styles.inputLogin} onChange={e=>setForm({...form, tel:e.target.value})} required />
              <input placeholder="Senha" type="password" style={styles.inputLogin} onChange={e=>setForm({...form, senha:e.target.value})} required />
              <button type="submit" style={styles.btnOk}>ENTRAR</button>
              <div style={styles.authLinks}>
                <span onClick={() => setPaginaInterna('cadastro')} style={styles.linkText}>Cadastre-se</span>
                <span>|</span>
                <span onClick={() => setPaginaInterna('recuperar')} style={styles.linkText}>Esqueci a senha</span>
              </div>
            </form>
          </div>
        </div>
      );
    }

    // ROTA ATIVA (CONTEÚDO)
    const pendentes = entregas.filter(e => e.status === 'Pendente');
    return (
      <div style={styles.mobileFull}>
        <header style={styles.headerMobile}>
          <div>
            <h2 style={{margin:0, fontSize:'18px'}}>ROTA ATIVA</h2>
            <div style={styles.statusOnline}>● {motoristaLogado}</div>
          </div>
          <button onClick={() => { localStorage.clear(); window.location.reload(); }} style={styles.btnSair}>SAIR</button>
        </header>
        <main style={styles.mainMobile}>
          <Reorder.Group axis="y" values={pendentes} onReorder={finalizarReordem} style={styles.list}>
            <AnimatePresence>
              {pendentes.map((ent, index) => (
                <Reorder.Item key={ent.id} value={ent} style={{...styles.card, background: index===0 ? '#1e293b':'rgba(30,41,59,0.5)', borderLeft: index===0?'6px solid #38bdf8':'4px solid transparent'}}>
                   <div style={styles.cardContent}>
                      <div style={styles.dragHandle}>☰</div>
                      <div style={{flex:1}}>
                        <div style={styles.clienteNome}>{ent.cliente}</div>
                        <div style={styles.enderecoText}>📍 {ent.endereco}</div>
                      </div>
                   </div>
                   {index === 0 && (
                     <div style={styles.actions}>
                        <button onClick={() => window.open(`http://maps.google.com/?q=${encodeURIComponent(ent.endereco)}`)} style={styles.btnMapa}>GPS</button>
                        <button onClick={async () => {
                           const rec = prompt("Quem recebeu?");
                           if(rec) await supabase.from('entregas').update({status:'Concluído', recado:`Recebido por: ${rec} | Mot: ${motoristaLogado}`}).eq('id', ent.id);
                        }} style={styles.btnOk}>OK</button>
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

  // --- DASHBOARD GESTOR ---
  return (
    <div style={styles.dashBody}>
       <aside style={styles.sidebar}>
         <h2 style={{color:'#38bdf8'}}>DASHBOARD</h2>
         {/* Form de lançamento igual anterior */}
         <button onClick={() => setView('motorista')} style={{marginTop:'20px', background:'none', color:'#475569', border:'none'}}>Ver Mobile</button>
       </aside>
       <main style={styles.dashMain}>
         <h1>Monitoramento em Tempo Real</h1>
         {/* Tabela de entregas igual anterior */}
       </main>
    </div>
  );
}

const styles = {
  universalPage: { width:'100vw', height:'100vh', backgroundColor:'#020617', display:'flex', alignItems:'center', justifyContent:'center', padding:'20px' },
  authCard: { backgroundColor:'#0f172a', padding:'35px', borderRadius:'24px', border:'1px solid #1e293b', width:'100%', maxWidth:'420px' },
  titleAuth: { color:'#38bdf8', fontSize:'24px', marginBottom:'20px' },
  inputAuth: { width:'100%', padding:'15px', borderRadius:'12px', backgroundColor:'#020617', border:'1px solid #1e293b', color:'#fff', marginBottom:'15px', boxSizing:'border-box' },
  btnPrimary: { width:'100%', padding:'18px', borderRadius:'12px', border:'none', backgroundColor:'#38bdf8', color:'#000', fontWeight:'bold', cursor:'pointer' },
  btnVoltar: { background:'none', border:'none', color:'#94a3b8', marginBottom:'20px', cursor:'pointer' },
  mobileFull: { width:'100vw', height:'100dvh', backgroundColor:'#020617', color:'#fff', display:'flex', flexDirection:'column', overflow:'hidden' },
  loginCenter: { flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'30px' },
  iconCircle: { width:'70px', height:'70px', borderRadius:'50%', border:'2px solid #38bdf8', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'30px', marginBottom:'20px' },
  inputLogin: { width:'100%', padding:'15px', borderRadius:'12px', backgroundColor:'#0f172a', border:'1px solid #1e293b', color:'#fff', boxSizing:'border-box' },
  btnOk: { width:'100%', padding:'15px', borderRadius:'12px', border:'none', backgroundColor:'#38bdf8', color:'#000', fontWeight:'bold' },
  authLinks: { display:'flex', gap:'10px', marginTop:'20px', fontSize:'13px' },
  linkText: { color:'#38bdf8', cursor:'pointer' },
  headerMobile: { padding:'20px', backgroundColor:'#0f172a', borderBottom:'1px solid #1e293b', display:'flex', justifyContent:'space-between' },
  statusOnline: { fontSize:'12px', color:'#10b981' },
  mainMobile: { flex:1, padding:'15px', overflowY:'auto' },
  list: { listStyle:'none', padding:0, display:'flex', flexDirection:'column', gap:'10px' },
  card: { padding:'20px', borderRadius:'20px' },
  cardContent: { display:'flex', gap:'15px', alignItems:'center' },
  dragHandle: { color:'#475569' },
  clienteNome: { fontWeight:'bold', fontSize:'18px' },
  enderecoText: { fontSize:'13px', color:'#94a3b8' },
  actions: { display:'flex', gap:'10px', marginTop:'15px' },
  btnMapa: { flex:1, padding:'12px', borderRadius:'10px', border:'1px solid #334155', background:'none', color:'#fff' },
  btnSair: { color:'#ef4444', background:'none', border:'1px solid #ef4444', padding:'5px 10px', borderRadius:'8px', fontSize:'10px' },
  dashBody: { display:'flex', width:'100vw', height:'100vh', background:'#020617' },
  sidebar: { width:'300px', padding:'30px', background:'#0f172a', borderRight:'1px solid #1e293b' },
  dashMain: { flex:1, padding:'40px', color:'#fff' }
};

export default App;