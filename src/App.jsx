import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';

const somAlerta = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');

function App() {
  const [entregas, setEntregas] = useState([]);
  const [view, setView] = useState(window.innerWidth < 768 ? 'motorista' : 'gestor');
  const [draggedIndex, setDraggedIndex] = useState(null);

  const buscarDados = async () => {
    const { data } = await supabase.from('entregas').select('*').order('ordem', { ascending: true });
    if (data) setEntregas(data);
  };

  useEffect(() => {
    buscarDados();
    const canal = supabase.channel('drag_drop_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'entregas' }, () => buscarDados())
      .subscribe();
    return () => supabase.removeChannel(canal);
  }, []);

  // Lógica de Arrastar (Drag)
  const onDragStart = (index) => setDraggedIndex(index);

  const onDragOver = (index) => {
    if (draggedIndex === null || draggedIndex === index) return;
    const novasEntregas = [...entregas];
    const itemArrastado = novasEntregas[draggedIndex];
    novasEntregas.splice(draggedIndex, 1);
    novasEntregas.splice(index, 0, itemArrastado);
    setDraggedIndex(index);
    setEntregas(novasEntregas);
  };

  const onDragEnd = async () => {
    setDraggedIndex(null);
    // Atualiza as ordens no Banco de Dados após soltar
    for (let i = 0; i < entregas.length; i++) {
      await supabase.from('entregas').update({ ordem: i + 1 }).eq('id', entregas[i].id);
    }
  };

  if (view === 'motorista') {
    return (
      <div style={styles.appContainer}>
        <header style={styles.header}>
          <h2 style={{margin: 0, fontSize: '18px'}}>MINHA ROTA</h2>
          <small style={{color: '#38bdf8'}}>Segure e arraste para reordenar</small>
        </header>

        <main style={styles.main}>
          <div style={styles.list}>
            {entregas.filter(e => e.status === 'Pendente').map((ent, index) => (
              <div
                key={ent.id}
                draggable
                onDragStart={() => onDragStart(index)}
                onDragOver={(e) => { e.preventDefault(); onDragOver(index); }}
                onDragEnd={onDragEnd}
                // Suporte para Toque no Celular
                onTouchStart={() => onDragStart(index)}
                onTouchMove={(e) => {
                  const touch = e.touches[0];
                  const el = document.elementFromPoint(touch.clientX, touch.clientY);
                  const targetIndex = entregas.findIndex(item => item.id.toString() === el?.id);
                  if (targetIndex !== -1) onDragOver(targetIndex);
                }}
                onTouchEnd={onDragEnd}
                id={ent.id.toString()}
                style={{
                  ...styles.card,
                  opacity: draggedIndex === index ? 0.5 : 1,
                  transform: draggedIndex === index ? 'scale(1.05)' : 'scale(1)',
                  borderLeft: index === 0 ? '6px solid #38bdf8' : '4px solid #334155',
                  backgroundColor: index === 0 ? '#1e293b' : 'rgba(30, 41, 59, 0.5)'
                }}
              >
                <div style={styles.cardContent}>
                  <div style={styles.orderBadge}>{index + 1}º</div>
                  <div style={{flex: 1}}>
                    <div style={{fontWeight: 'bold', fontSize: '16px'}}>{ent.cliente}</div>
                    <div style={{fontSize: '12px', color: '#94a3b8'}}>{ent.endereco}</div>
                  </div>
                  <div style={styles.dragIcon}>☰</div>
                </div>
                
                {index === 0 && (
                  <div style={styles.actions}>
                    <button onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ent.endereco)}`)} style={styles.btnMapa}>MAPA</button>
                    <button onClick={() => {/* função concluir */}} style={styles.btnOk}>OK</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </main>
      </div>
    );
  }

  return <div>Painel Gestor</div>;
}

const styles = {
  appContainer: { width: '100vw', height: '100vh', backgroundColor: '#0f172a', color: '#fff', fontFamily: 'sans-serif' },
  header: { padding: '20px', backgroundColor: '#1e293b', textAlign: 'center', borderBottom: '1px solid #334155' },
  main: { padding: '15px', height: 'calc(100vh - 80px)', overflowY: 'auto' },
  list: { display: 'flex', flexDirection: 'column', gap: '12px' },
  card: { padding: '15px', borderRadius: '15px', transition: 'all 0.2s', cursor: 'grab', userSelect: 'none', touchAction: 'none' },
  cardContent: { display: 'flex', alignItems: 'center', gap: '15px' },
  orderBadge: { background: '#38bdf8', color: '#000', padding: '2px 8px', borderRadius: '5px', fontWeight: 'bold', fontSize: '12px' },
  dragIcon: { color: '#475569', fontSize: '20px' },
  actions: { display: 'flex', gap: '10px', marginTop: '15px' },
  btnMapa: { flex: 1, padding: '10px', borderRadius: '8px', border: 'none', background: '#334155', color: '#fff' },
  btnOk: { flex: 1, padding: '10px', borderRadius: '8px', border: 'none', background: '#00ff88', color: '#000', fontWeight: 'bold' }
};

export default App;