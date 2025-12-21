export default App; import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Polyline } from 'react-leaflet';
import { supabase } from './supabaseClient';
import 'leaflet/dist/leaflet.css';

// Sons (URLs de exemplo, você pode trocar por arquivos .mp3 próprios)
const somNotificacao = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
const somVitoria = new Audio('https://assets.mixkit.co/active_storage/sfx/2019/2019-preview.mp3');

function App() {
  const [entregas, setEntregas] = useState([]);
  const [motoristas, setMotoristas] = useState([]);
  const [novoPedido, setNovoPedido] = useState({ cliente: '', endereco: '', motorista: '', recado: '' });

  useEffect(() => {
    buscarDados();
    // Escutando mudanças em tempo real para atualizações de entrega
    const subscription = supabase.channel('entregas_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'entregas' }, (payload) => {
        if (payload.eventType === 'UPDATE' && payload.new.status === 'Finalizado') {
          somVitoria.play();
        }
        buscarDados();
      }).subscribe();
    return () => supabase.removeChannel(subscription);
  }, []);

  const buscarDados = async () => {
    const { data: m } = await supabase.from('motoristas').select('*');
    const { data: e } = await supabase.from('entregas').select('*').order('ordem', { ascending: true });
    if (m) setMotoristas(m);
    if (e) setEntregas(e);
  };

  const criarPedido = async (e) => {
    e.preventDefault();
    const novaOrdem = entregas.length + 1;
    await supabase.from('entregas').insert([{ ...novoPedido, status: 'Pendente', ordem: novaOrdem }]);
    setNovoPedido({ cliente: '', endereco: '', motorista: '', recado: '' });
    somNotificacao.play();
  };

  // Concluir entrega individual
  const concluirEntrega = async (id, nomeCliente) => {
    try {
      const { error } = await supabase
        .from('entregas')
        .update({ status: 'Concluído', horario_conclusao: new Date().toISOString() })
        .eq('id', id);

      if (!error) {
        somNotificacao.play();
        alert(`Entrega para ${nomeCliente} concluída!`);
      } else {
        console.error('Erro ao concluir entrega:', error);
        alert('Erro ao concluir entrega. Veja o console para detalhes.');
      }
    } catch (err) {
      console.error('Erro na chamada de concluirEntrega:', err);
      alert('Falha ao concluir entrega.');
    }
  };

  // Finalizar rota completa (marca como Finalizado as entregas que já estão Concluídas)
  const finalizarRotaCompleta = async (nomeMotorista) => {
    try {
      const { error } = await supabase
        .from('entregas')
        .update({ status: 'Finalizado' })
        .eq('motorista', nomeMotorista)
        .eq('status', 'Concluído');

      if (!error) {
        somVitoria.play();
        alert('Rota finalizada com sucesso! Bom trabalho.');
      } else {
        console.error('Erro ao finalizar rota:', error);
        alert('Erro ao finalizar rota. Veja o console para detalhes.');
      }
    } catch (err) {
      console.error('Erro na chamada de finalizarRotaCompleta:', err);
      alert('Falha ao finalizar rota.');
    }
  };

  return (
    <div style={styles.container}>
      {/* LADO ESQUERDO: INPUTS DO GESTOR */}
      <aside style={styles.sidebar}>
        <h2 style={{ color: '#38bdf8' }}>Logística-v2 Gestor</h2>

        <form onSubmit={criarPedido} style={styles.form}>
          <h3>📍 Novo Pedido/Retirada</h3>
          <input placeholder="Nome do Cliente" value={novoPedido.cliente} onChange={e => setNovoPedido({ ...novoPedido, cliente: e.target.value })} style={styles.input} required />
          <input placeholder="Endereço Completo" value={novoPedido.endereco} onChange={e => setNovoPedido({ ...novoPedido, endereco: e.target.value })} style={styles.input} required />
          <select value={novoPedido.motorista} onChange={e => setNovoPedido({ ...novoPedido, motorista: e.target.value })} style={styles.input} required>
            <option value="">Selecione o Motorista</option>
            {motoristas.map(m => <option key={m.id} value={m.nome}>{m.nome}</option>)}
          </select>
          <textarea placeholder="Recado para o motorista" value={novoPedido.recado} onChange={e => setNovoPedido({ ...novoPedido, recado: e.target.value })} style={styles.input} />
          <button type="submit" style={styles.btnEnviar}>ADICIONAR À ROTA</button>
        </form>

        <div style={styles.lista}>
          <h3>📋 Rota Atual (Otimizada)</h3>
          {entregas.map((ent, i) => (
            <div key={ent.id} style={{ ...styles.cardEntrega, opacity: ent.status === 'Concluído' || ent.status === 'Finalizado' ? 0.5 : 1 }}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontWeight: '700' }}>{i + 1}º - {ent.cliente}</span>
                <small style={{ color: '#94a3b8' }}>{ent.endereco || ''} {ent.motorista ? `• ${ent.motorista}` : ''}</small>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => {
                    if (ent.status === 'Concluído' || ent.status === 'Finalizado') return;
                    if (confirm(`Confirmar conclusão da entrega para ${ent.cliente}?`)) {
                      concluirEntrega(ent.id, ent.cliente);
                    }
                  }}
                  disabled={ent.status === 'Concluído' || ent.status === 'Finalizado'}
                  style={styles.btnSmall}
                >
                  Concluir
                </button>

                <button
                  onClick={() => {
                    if (!ent.motorista) { alert('Entrega sem motorista atribuído.'); return; }
                    if (confirm(`Finalizar rota do motorista ${ent.motorista}? Isso marcará como Finalizado todas as entregas já concluídas desse motorista.`)) {
                      finalizarRotaCompleta(ent.motorista);
                    }
                  }}
                  disabled={!ent.motorista}
                  style={styles.btnSmallAlt}
                >
                  Finalizar Rota
                </button>
              </div>
            </div>
          ))}
        </div>
      </aside>

      {/* LADO DIREITO: MAPA COM ZOOM DINÂMICO */}
      <main style={styles.main}>
        <MapContainer center={[-23.55, -46.63]} zoom={12} style={{ height: '100%', borderRadius: '15px' }}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          {/* Aqui entrariam os marcadores das entregas baseados no endereço convertido em lat/lng */}
        </MapContainer>
      </main>
    </div>
  );
}

const styles = {
  container: { display: 'flex', height: '100vh', backgroundColor: '#0f172a', color: '#fff' },
  sidebar: { width: '350px', padding: '20px', overflowY: 'auto', backgroundColor: '#1e293b' },
  form: { display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '30px' },
  input: { padding: '12px', borderRadius: '8px', border: '1px solid #334155', backgroundColor: '#0f172a', color: '#fff' },
  btnEnviar: { backgroundColor: '#38bdf8', color: '#000', padding: '15px', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' },
  cardEntrega: { padding: '10px', backgroundColor: '#334155', marginBottom: '5px', borderRadius: '5px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  main: { flex: 1, padding: '20px' },
  lista: { marginTop: '10px' },
  btnSmall: { backgroundColor: '#10b981', color: '#fff', border: 'none', padding: '8px 10px', borderRadius: '6px', cursor: 'pointer', fontWeight: 700 },
  btnSmallAlt: { backgroundColor: '#94a3b8', color: '#000', border: 'none', padding: '8px 10px', borderRadius: '6px', cursor: 'pointer', fontWeight: 700 }
};

export default App;