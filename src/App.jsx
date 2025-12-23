import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { motion, Reorder, AnimatePresence } from 'framer-motion';

const somAlerta = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');

function App() {
  const [entregas, setEntregas] = useState([]);
  const [motoristas, setMotoristas] = useState([]);
  const [view, setView] = useState(window.innerWidth < 768 ? 'motorista' : 'gestor');
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

  // --- FUNÇÕES DE STATUS DA ENTREGA ---

  const concluirEntrega = async (id) => {
    // Usamos toISOString() para evitar o erro de sintaxe do timestamp
    const { error } = await supabase
      .from('entregas')
      .update({
        status: 'Concluído',
        horario_conclusao: new Date().toISOString()
      })
      .eq('id', id);

    if (error) {
      alert("Erro ao concluir: " + error.message);
    } else {
      buscarDados();
    }
  };

  const falhaEntrega = async (id) => {
    let motivo = prompt("Motivo da não entrega (Ex: Cliente ausente, Endereço errado):");

    // Re-prompt enquanto o motivo não for nulo e possuir menos de 3 caracteres
    while (motivo !== null && motivo.trim().length < 3) {
      motivo = prompt("Por favor, descreva o motivo com pelo menos 3 caracteres (ou Cancelar para desistir):");
    }

    if (motivo !== null && motivo.trim().length >= 3) {
      const { error } = await supabase
        .from('entregas')
        .update({
          status: 'Não Realizado',
          recado: `FALHA: ${motivo.trim()}`, // Salva o motivo no campo recado
        })
        .eq('id', id);

      if (error) {
        alert("Erro ao registrar falha: " + error.message);
      } else {
        buscarDados();
      }
    }
  };

  const finalizarReordem = async (novaLista) => {
    setEntregas(novaLista);
    for (let i = 0; i < novaLista.length; i++) {
      await supabase.from('entregas').update({ ordem: i + 1 }).eq('id', novaLista[i].id);
    }
  };

  // --- AUTH (CADASTRO / LOGIN) ---
  const acaoCadastro = async (e) => {
    e.preventDefault();
    const { error } = await supabase.from('motoristas').insert([{ ...form, nome: form.nome.trim(), tel: form.tel.trim() }]);
    if (error) alert("Erro: " + error.message);
    else { alert("✅ Sucesso! Faça login."); setPaginaInterna('login'); }
  };

  const acaoLogin = async (e) => {
    e.preventDefault();
    const { data } = await supabase.from('motoristas').select('*').eq('tel', form.tel.trim()).eq('senha', form.senha.trim()).maybeSingle();
    if (data) {
      localStorage.setItem('mot_v10_nome', data.nome);
      setMotoristaLogado(data.nome);
    } else alert("❌ Dados Incorretos!");
  };

  // --- TELAS DE AUTH ---
  if (paginaInterna === 'cadastro' || paginaInterna === 'recuperar') {
    return (
      <div style={styles.universalPage}>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={styles.authCard}>
          <button onClick={() => setPaginaInterna('login')} style={styles.btnVoltar}>← Voltar</button>
          <form onSubmit={acaoCadastro} style={styles.flexCol}>
            <h2 style={styles.titleAuth}>Cadastro Motorista</h2>
            <input placeholder="Nome Completo" style={styles.inputAuth} onChange={e => setForm({ ...form, nome: e.target.value })} required />
            <input placeholder="WhatsApp" style={styles.inputAuth} onChange={e => setForm({ ...form, tel: e.target.value })} required />
            <input placeholder="Veículo" style={styles.inputAuth} onChange={e => setForm({ ...form, veiculo: e.target.value })} required />
            <input placeholder="Senha" type="password" style={styles.inputAuth} onChange={e => setForm({ ...form, senha: e.target.value })} required />
            <button type="submit" style={styles.btnPrimary}>CADASTRAR</button>
          </form>
        </motion.div>
      </div>
    );
  }

  // --- MOTORISTA ---
  if (view === 'motorista') {
    if (!motoristaLogado) {
      return (
        <div style={styles.mobileFull}>
          <div style={styles.loginCenter}>
            <div style={styles.iconCircle}>🚛</div>
            <h2>Logística V10</h2>
            <form onSubmit={acaoLogin} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <input placeholder="WhatsApp" style={styles.inputLogin} onChange={e => setForm({ ...form, tel: e.target.value })} required />
              <input placeholder="Senha" type="password" style={styles.inputLogin} onChange={e => setForm({ ...form, senha: e.target.value })} required />
              <button type="submit" style={styles.btnOk}>ENTRAR</button>
              <span onClick={() => setPaginaInterna('cadastro')} style={styles.linkText}>Não tem conta? Cadastre-se</span>
            </form>
          </div>
        </div>
      );
    }

    const pendentes = entregas.filter(e => e.status === 'Pendente');

    return (
      <div style={styles.mobileFull}>
        <header style={styles.headerMobile}>
          <div>
            <h2 style={{ margin: 0 }}>ROTA ATIVA</h2>
            <span style={styles.statusOnline}>● {motoristaLogado}</span>
          </div>
          <button onClick={() => { localStorage.clear(); window.location.reload(); }} style={styles.btnSair}>SAIR</button>
        </header>

        <main style={styles.mainMobile}>
          {pendentes.length > 0 ? (
            <Reorder.Group axis="y" values={pendentes} onReorder={finalizarReordem} style={styles.list}>
              <AnimatePresence>
                {pendentes.map((ent, index) => (
                  <Reorder.Item
                    key={ent.id}
                    value={ent}
                    style={{
                      ...styles.card,
                      background: index === 0 ? '#1e293b' : 'rgba(30,41,59,0.3)',
                      borderLeft: index === 0 ? '6px solid #38bdf8' : '4px solid transparent'
                    }}
                  >
                    <div style={styles.cardContent}>
                      <div style={styles.dragHandle}>☰</div>
                      <div style={{ flex: 1 }}>
                        <div style={styles.clienteNome}>{ent.cliente}</div>
                        <div style={styles.enderecoText}>📍 {ent.endereco}</div>
                      </div>
                    </div>
                    {index === 0 && (
                      <div style={styles.actions}>
                        <button onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ent.endereco)}`, '_blank')} style={styles.btnMapa}>GPS</button>
                        <button onClick={() => falhaEntrega(ent.id)} style={styles.btnFalha}>FALTOU</button>
                        <button onClick={() => concluirEntrega(ent.id)} style={styles.btnOk}>CONCLUIR</button>
                      </div>
                    )}
                  </Reorder.Item>
                ))}
              </AnimatePresence>
            </Reorder.Group>
          ) : (
            <div style={styles.radarContainer}>
              <div className="radar-circle"><div className="radar-ping"></div></div>
              <h3 style={{ marginTop: '25px', color: '#38bdf8' }}>AGUARDANDO CARGA...</h3>
            </div>
          )}
        </main>
        <style>{`
          .radar-circle { width: 80px; height: 80px; border: 2px solid #38bdf8; border-radius: 50%; position: relative; display: flex; align-items: center; justify-content: center; }
          .radar-ping { width: 100%; height: 100%; background: #38bdf8; border-radius: 50%; position: absolute; animation: radar-pulse 2s infinite ease-out; opacity: 0.5; }
          @keyframes radar-pulse { 0% { transform: scale(0.5); opacity: 0.8; } 100% { transform: scale(2.5); opacity: 0; } }
        `}</style>
      </div>
    );
  }

  // --- GESTOR ---
  return (
    <div style={styles.dashBody}>
      <aside style={styles.sidebar}>
        <h2>GESTOR</h2>
        <button onClick={() => setView('motorista')} style={styles.btnPrimary}>VER MODO MOBILE</button>
      </aside>
      <main style={styles.dashMain}>
        <h1>Logística V10 - Painel de Controle</h1>
        <p>Aqui você acompanha as entregas concluídas e os motivos de falha em tempo real.</p>
        <div style={{ marginTop: '20px' }}>
          <h3>Relatório de Ocorrências</h3>
          {entregas.filter(e => e.status === 'Não Realizado').map(ent => (
            <div key={ent.id} style={{ padding: '10px', backgroundColor: '#450a0a', borderRadius: '8px', marginBottom: '10px', borderLeft: '4px solid #ef4444' }}>
              <strong>{ent.cliente}</strong>
              <p style={{ margin: '5px 0', fontSize: '13px', color: '#fca5a5' }}>{ent.recado}</p>
              <small>Horário: {ent.horario_conclusao ? new Date(ent.horario_conclusao).toLocaleTimeString() : '-'}</small>
            </div>
          ))}
        </div>      </main>
    </div>
  );
}

const styles = {
  container: { display: 'flex', height: '100vh', backgroundColor: '#0f172a', color: '#fff' },
  sidebar: { width: '300px', padding: '20px', backgroundColor: '#1e293b' },
  main: { flex: 1, padding: '20px' },
  mapaPlaceholder: { height: '100%', backgroundColor: '#334155', borderRadius: '15px', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  input: { padding: '10px', marginBottom: '10px', borderRadius: '5px', border: 'none', width: '100%', backgroundColor: '#0f172a', color: '#fff' },
  btnEnviar: { width: '100%', padding: '10px', backgroundColor: '#38bdf8', border: 'none', borderRadius: '5px', fontWeight: 'bold', cursor: 'pointer' },
  log: { fontSize: '12px', padding: '5px', borderBottom: '1px solid #334155' },
  mobileContainer: { padding: '15px', backgroundColor: '#0f172a', minHeight: '100vh', color: '#fff' },
  cardMobile: { backgroundColor: '#1e293b', padding: '15px', borderRadius: '10px', marginBottom: '15px', borderLeft: '5px solid #38bdf8' },
  btnConcluir: { width: '100%', padding: '10px', backgroundColor: '#00ff88', border: 'none', borderRadius: '5px', marginTop: '10px', fontWeight: 'bold' },
  btnTrocar: { padding: '5px 10px', fontSize: '10px', cursor: 'pointer', marginBottom: '10px', backgroundColor: '#334155', color: '#fff', border: '1px solid #475569', borderRadius: '4px' }
};

export default App; // ESTA DEVE SER A ÚNICA LINHA DE EXPORT NO ARQUIVO