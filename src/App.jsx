import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { motion as Motion, Reorder, AnimatePresence } from 'framer-motion';

const _SOM_ALERTA = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');

function App() {
  const [entregas, setEntregas] = useState([]);
  const [motoristas, setMotoristas] = useState([]);
  const [view, setView] = useState(window.innerWidth < 768 ? 'motorista' : 'gestor');

  // LOGIN E PERSISTÊNCIA (LEMBRAR SENHA)
  const [motoristaLogado, setMotoristaLogado] = useState(localStorage.getItem('mot_v10_nome') || null);
  const [paginaInterna, setPaginaInterna] = useState('login');
  const [form, setForm] = useState({ nome: '', tel: '', senha: '', veiculo: '' });

  const buscarDados = async () => {
    // Busca entregas
    const { data: e } = await supabase.from('entregas').select('*').order('ordem', { ascending: true });
    if (e) setEntregas(e);

    // Busca motoristas e força a atualização
    const { data: m, error } = await supabase.from('motoristas').select('*');

    if (error) {
      console.error("Erro ao buscar motoristas:", error.message);
    } else if (m) {
      console.log("Motoristas encontrados:", m);
      setMotoristas([...m]); // O [...m] força o React a atualizar a lista
    }
  };

  useEffect(() => {
    // Chamamos buscarDados() intencionalmente no mount para popular entregas
    // eslint-disable-next-line react-hooks/set-state-in-effect
    buscarDados();
    const canal = supabase.channel('logistica_v10')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'entregas' }, () => buscarDados())
      .subscribe();
    return () => supabase.removeChannel(canal);
  }, []);

  // --- FUNÇÕES DE STATUS DA ENTREGA CORRIGIDAS ---

  const concluirEntrega = async (id) => {
    // CORREÇÃO: Usamos .toISOString() para o formato correto de data/hora exigido pelo banco
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
      // MENSAGEM DE SUCESSO A CADA ENTREGA
      const pendentesAtuais = entregas.filter(e => e.status === 'Pendente');

      if (pendentesAtuais.length <= 1) {
        alert("🏆 Excelente! Você concluiu todas as entregas da sua rota!");
      } else {
        alert("✅ Entrega concluída com sucesso!");
      }

      buscarDados();
    }
  };

  const falhaEntrega = async (id) => {
    let motivo = prompt("Motivo da não entrega (Ex: Cliente ausente, Endereço errado):");

    while (motivo !== null && motivo.trim().length < 3) {
      motivo = prompt("Por favor, descreva o motivo com pelo menos 3 caracteres (ou Cancelar para desistir):");
    }

    if (motivo !== null && motivo.trim().length >= 3) {
      const { error } = await supabase
        .from('entregas')
        .update({
          status: 'Não Realizado',
          recado: `FALHA: ${motivo.trim()}`,
          // CORREÇÃO: Usamos .toISOString() aqui também para evitar o erro de timestamp
          horario_conclusao: new Date().toISOString()
        })
        .eq('id', id);

      if (error) {
        alert("Erro ao registrar falha: " + error.message);
      } else {
        alert("⚠️ Ocorrência registrada.");
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

  // --- GESTOR HELPERS ---
  const [novoPedido, setNovoPedido] = useState({ cliente: '', endereco: '', motorista: '' });

  const criarPedido = async (e) => {
    e.preventDefault();
    const { error } = await supabase.from('entregas').insert([{
      cliente: novoPedido.cliente,
      endereco: novoPedido.endereco,
      motorista: novoPedido.motorista,
      status: 'Pendente',
      ordem: entregas.length + 1
    }]);

    if (error) {
      alert("Erro ao criar pedido: " + error.message);
    } else {
      setNovoPedido({ cliente: '', endereco: '', motorista: '' });
      buscarDados();
    }
  };

  // --- RESTANTE DO CÓDIGO MANTIDO EXATAMENTE IGUAL ---
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

  if (paginaInterna === 'cadastro' || paginaInterna === 'recuperar') {
    return (
      <div style={styles.universalPage}>
        <Motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={styles.authCard}>
          <button onClick={() => setPaginaInterna('login')} style={styles.btnVoltar}>← Voltar</button>
          <form onSubmit={acaoCadastro} style={styles.flexCol}>
            <h2 style={styles.titleAuth}>Cadastro Motorista</h2>
            <input placeholder="Nome Completo" style={styles.inputAuth} onChange={e => setForm({ ...form, nome: e.target.value })} required />
            <input placeholder="WhatsApp" style={styles.inputAuth} onChange={e => setForm({ ...form, tel: e.target.value })} required />
            <input placeholder="Veículo" style={styles.inputAuth} onChange={e => setForm({ ...form, veiculo: e.target.value })} required />
            <input placeholder="Senha" type="password" style={styles.inputAuth} onChange={e => setForm({ ...form, senha: e.target.value })} required />
            <button type="submit" style={styles.btnPrimary}>CADASTRAR</button>
          </form>
        </Motion.div>
      </div>
    );
  }

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

  // --- DASHBOARD GESTOR (VISÃO DESKTOP) ---
  return (
    <div style={styles.dashBody}>
      {/* BARRA LATERAL DE LANÇAMENTO */}
      <aside style={styles.sidebar}>
        <h2 style={{ color: '#38bdf8', marginBottom: '20px' }}>LOGÍSTICA V10</h2>

        <form onSubmit={criarPedido} style={styles.formGestor}>
          <h4 style={{ color: '#94a3b8', marginBottom: '10px' }}>Novo Lançamento</h4>
          <input
            placeholder="Nome do Cliente"
            value={novoPedido.cliente}
            onChange={e => setNovoPedido({ ...novoPedido, cliente: e.target.value })}
            style={styles.inputDash} required
          />
          <input
            placeholder="Endereço Completo"
            value={novoPedido.endereco}
            onChange={e => setNovoPedido({ ...novoPedido, endereco: e.target.value })}
            style={styles.inputDash} required
          />
          <select
            style={styles.inputAuth}
            required
            value={novoPedido.motorista}
            onChange={e => setNovoPedido({ ...novoPedido, motorista: e.target.value })}
          >
            <option value="">Selecionar Motorista</option>
            {motoristas.map((m, index) => (
              <option key={m.id || index} value={m.nome || m.Nome || m.motorista}>
                {m.nome || m.Nome || m.motorista || "Motorista sem nome"}
              </option>
            ))}
          </select>
          <button type="submit" style={styles.btnDashEnviar}>ENVIAR PARA ROTA</button>
        </form>

        <button onClick={() => setView('motorista')} style={styles.btnSimular}>
          📱 Simular Visão Celular
        </button>
      </aside>

      {/* PAINEL CENTRAL DE MONITORAMENTO */}
      <main style={styles.dashMain}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1>Monitoramento em Tempo Real</h1>
          <div style={styles.cardFaturamento}>
            <small>Status da Operação</small>
            <div style={{ color: '#10b981', fontWeight: 'bold' }}>SISTEMA ONLINE</div>
          </div>
        </header>

        <div style={styles.gridDash}>
          {/* TABELA DE ENTREGAS ATIVAS */}
          <section style={styles.secaoTabela}>
            <h3>📦 Entregas na Rota</h3>
            <div style={styles.tabelaContainer}>
              <table style={styles.tabela}>
                <thead>
                  <tr>
                    <th>Ordem</th>
                    <th>Cliente</th>
                    <th>Motorista</th>
                    <th>Status</th>
                    <th>Hora</th>
                  </tr>
                </thead>
                <tbody>
                  {entregas.map(ent => (
                    <tr key={ent.id}>
                      <td>{ent.ordem}º</td>
                      <td>{ent.cliente}</td>
                      <td>{ent.motorista}</td>
                      <td style={{ color: ent.status === 'Concluído' ? '#10b981' : '#fbbf24' }}>
                        {ent.status}
                      </td>
                      <td>{ent.horario_conclusao ? new Date(ent.horario_conclusao).toLocaleTimeString() : '--:--'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* RELATÓRIO DE OCORRÊNCIAS (FALHAS) */}
          <section style={styles.secaoAlertas}>
            <h3>⚠️ Motivos de Falha (Faltou)</h3>
            <div style={styles.listaOcorrencias}>
              {entregas.filter(e => e.status === 'Não Realizado').length === 0 ? (
                <p style={{ color: '#475569' }}>Nenhuma falha registrada hoje.</p>
              ) : (
                entregas.filter(e => e.status === 'Não Realizado').map(ent => (
                  <div key={ent.id} style={styles.cardFalha}>
                    <strong>{ent.cliente}</strong>
                    <p style={styles.motivoTexto}>{ent.recado}</p>
                    <small>{new Date(ent.horario_conclusao).toLocaleTimeString()}</small>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

const styles = {
  universalPage: { width: '100vw', height: '100vh', backgroundColor: '#020617', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  authCard: { backgroundColor: '#0f172a', padding: '30px', borderRadius: '24px', width: '90%', maxWidth: '400px' },
  titleAuth: { color: '#38bdf8', marginBottom: '20px' },
  inputAuth: { width: '100%', padding: '15px', borderRadius: '10px', backgroundColor: '#020617', border: '1px solid #1e293b', color: '#fff', marginBottom: '10px', boxSizing: 'border-box' },
  btnPrimary: { width: '100%', padding: '15px', borderRadius: '10px', border: 'none', backgroundColor: '#38bdf8', fontWeight: 'bold', cursor: 'pointer' },
  btnVoltar: { background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', marginBottom: '10px' },
  mobileFull: { width: '100vw', height: '100dvh', backgroundColor: '#020617', color: '#fff', display: 'flex', flexDirection: 'column' },
  loginCenter: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px' },
  iconCircle: { width: '60px', height: '60px', borderRadius: '50%', border: '2px solid #38bdf8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '30px', marginBottom: '10px' },
  inputLogin: { width: '100%', padding: '15px', borderRadius: '12px', backgroundColor: '#0f172a', border: '1px solid #1e293b', color: '#fff', boxSizing: 'border-box' },
  btnOk: { flex: 1, padding: '15px', borderRadius: '12px', border: 'none', backgroundColor: '#10b981', color: '#000', fontWeight: 'bold' },
  btnFalha: { flex: 1, padding: '15px', borderRadius: '12px', border: 'none', backgroundColor: '#ef4444', color: '#fff', fontWeight: 'bold' },
  linkText: { color: '#38bdf8', marginTop: '15px', cursor: 'pointer', fontSize: '14px' },
  headerMobile: { padding: '20px', borderBottom: '1px solid #1e293b', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  statusOnline: { fontSize: '12px', color: '#10b981' },
  mainMobile: { flex: 1, padding: '15px', overflowY: 'auto' },
  list: { listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '10px' },
  card: { padding: '20px', borderRadius: '20px' },
  cardContent: { display: 'flex', gap: '15px', alignItems: 'center' },
  dragHandle: { color: '#475569' },
  clienteNome: { fontWeight: 'bold', fontSize: '18px' },
  enderecoText: { fontSize: '13px', color: '#94a3b8' },
  actions: { display: 'flex', gap: '8px', marginTop: '15px' },
  btnMapa: { flex: 1, padding: '12px', borderRadius: '10px', border: '1px solid #334155', background: 'none', color: '#fff' },
  radarContainer: { height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' },
  btnSair: { color: '#ef4444', border: '1px solid #ef4444', background: 'none', padding: '5px 10px', borderRadius: '8px', fontSize: '10px' },
  dashBody: { display: 'flex', width: '100vw', height: '100vh', background: '#020617', fontFamily: 'sans-serif' },
  sidebar: { width: '300px', padding: '25px', background: '#0f172a', borderRight: '1px solid #1e293b', display: 'flex', flexDirection: 'column' },
  formGestor: { display: 'flex', flexDirection: 'column', gap: '10px' },
  inputDash: { padding: '12px', borderRadius: '8px', background: '#020617', border: '1px solid #1e293b', color: '#fff' },
  btnDashEnviar: { padding: '15px', borderRadius: '8px', border: 'none', background: '#38bdf8', fontWeight: 'bold', cursor: 'pointer' },
  btnSimular: { marginTop: 'auto', background: 'none', border: '1px solid #334155', color: '#94a3b8', padding: '10px', borderRadius: '8px', cursor: 'pointer' },
  dashMain: { flex: 1, padding: '40px', overflowY: 'auto', color: '#fff' },
  gridDash: { display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '30px', marginTop: '30px' },
  cardFaturamento: { padding: '15px', background: '#0f172a', borderRadius: '12px', border: '1px solid #1e293b', textAlign: 'right' },
  secaoTabela: {},
  tabelaContainer: { background: '#0f172a', borderRadius: '15px', padding: '20px', border: '1px solid #1e293b' },
  tabela: { width: '100%', borderCollapse: 'collapse', textAlign: 'left' },
  secaoAlertas: {},
  listaOcorrencias: { marginTop: '10px' },
  cardFalha: { padding: '15px', background: '#450a0a', borderRadius: '12px', borderLeft: '5px solid #ef4444', marginBottom: '10px' },
  motivoTexto: { margin: '5px 0', fontSize: '14px', color: '#fca5a5' }
};

export default App;