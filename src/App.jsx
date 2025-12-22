import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

const somNovaEntrega = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');

function App() {
  const [entregas, setEntregas] = useState([]);
  const [view, setView] = useState(window.innerWidth < 768 ? 'motorista' : 'gestor');

  const formatarDataBR = (isoString) => {
    if (!isoString) return '';
    return new Date(isoString).toLocaleString('pt-BR');
  };

  const buscarDados = async () => {
    const { data } = await supabase.from('entregas').select('*').order('ordem', { ascending: true });
    if (data) setEntregas(data);
  };

  useEffect(() => {
    buscarDados();
    const canal = supabase.channel('mobile_sync').on('postgres_changes', { event: '*', schema: 'public', table: 'entregas' }, () => buscarDados()).subscribe();
    return () => supabase.removeChannel(canal);
  }, []);

  const concluirEntrega = async (id) => {
    const nomeRecebedor = prompt("Quem recebeu a mercadoria?");
    if (!nomeRecebedor) return; // Cancela se não digitar nada

    const agora = new Date().toISOString(); 
    await supabase.from('entregas').update({ 
      status: 'Concluído', 
      horario_conclusao: agora,
      recado: `Recebido por: ${nomeRecebedor}` // Salva quem recebeu no campo de recado
    }).eq('id', id);
  };

  if (view === 'motorista') {
    const concluidas = entregas.filter(e => e.status === 'Concluído').length;
    const progresso = entregas.length > 0 ? (concluidas / entregas.length) * 100 : 0;

    return (
      <div style={styles.mobileContainer}>
        <header style={styles.mobileHeader}>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
             <span style={{fontSize:'10px', color:'#38bdf8'}}>LOGÍSTICA V2</span>
             <button onClick={() => setView('gestor')} style={styles.btnModo}>GESTOR</button>
          </div>
          <h2 style={{margin:'10px 0 5px 0'}}>Minha Rota</h2>
          <div style={styles.progressBg}><div style={{...styles.progressFill, width: `${progresso}%`}}></div></div>
        </header>

        <div style={styles.scrollArea}>
          {entregas.map((ent, index) => (
            <div key={ent.id} style={{...styles.cardMobile, borderColor: ent.status === 'Concluído' ? '#00ff88' : '#38bdf8'}}>
              <div style={{display:'flex', justifyContent:'space-between'}}>
                <span style={styles.badge}>{index + 1}ª PARADA</span>
                <span style={{color: ent.status === 'Concluído' ? '#00ff88' : '#fbbf24', fontSize:'12px'}}>● {ent.status}</span>
              </div>
              
              <h3 style={{margin:'10px 0'}}>{ent.cliente}</h3>
              <p style={{fontSize:'14px', color:'#94a3b8'}}>📍 {ent.endereco}</p>

              {ent.status !== 'Concluído' ? (
                <div style={styles.gridBotoes}>
                  {/* BOTÃO MAPA */}
                  <button onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ent.endereco)}`, '_blank')} style={styles.btnAcao}>🗺️ MAPA</button>
                  
                  {/* BOTÃO WHATSAPP (Usa o telefone do motorista cadastrado ou você pode adicionar campo telefone_cliente) */}
                  <button onClick={() => window.open(`https://wa.me/55${ent.telefone?.replace(/\D/g,'')}`, '_blank')} style={{...styles.btnAcao, backgroundColor:'#25D366', color:'#fff'}}>💬 WHATS</button>
                  
                  {/* BOTÃO CONCLUIR */}
                  <button onClick={() => concluirEntrega(ent.id)} style={{...styles.btnAcao, backgroundColor:'#00ff88', color:'#000', gridColumn:'span 2'}}>✅ CONCLUIR</button>
                </div>
              ) : (
                <div style={styles.txtConcluido}>
                  {ent.recado} <br/>
                  <small>{formatarDataBR(ent.horario_conclusao)}</small>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return <div style={{padding:'50px', color:'#fff', textAlign:'center'}}>
    <h2>PAINEL GESTOR</h2>
    <p>Use o celular para a operação de rua.</p>
    <button onClick={() => setView('motorista')} style={{padding:'10px 20px'}}>Voltar para Motorista</button>
  </div>;
}

const styles = {
  mobileContainer: { width: '100vw', height: '100vh', backgroundColor: '#0f172a', color: '#fff', display: 'flex', flexDirection: 'column' },
  mobileHeader: { padding: '15px', backgroundColor: '#1e293b', borderBottom: '1px solid #334155' },
  progressBg: { width: '100%', height: '6px', backgroundColor: '#334155', borderRadius: '3px', overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#00ff88', transition: 'width 0.5s' },
  scrollArea: { flex: 1, overflowY: 'auto', padding: '15px' },
  cardMobile: { backgroundColor: '#1e293b', padding: '15px', borderRadius: '15px', marginBottom: '15px', borderLeft: '5px solid' },
  badge: { background: '#334155', padding: '2px 8px', borderRadius: '4px', fontSize: '10px' },
  gridBotoes: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '15px' },
  btnAcao: { padding: '12px', border: 'none', borderRadius: '8px', fontWeight: 'bold', fontSize: '13px', cursor: 'pointer', backgroundColor: '#334155', color: '#fff' },
  txtConcluido: { textAlign: 'center', color: '#00ff88', fontSize: '12px', fontWeight: 'bold', marginTop: '10px' },
  btnModo: { padding: '4px 8px', fontSize: '10px', backgroundColor: '#334155', color: '#fff', border: 'none', borderRadius: '4px' }
};

export default App;