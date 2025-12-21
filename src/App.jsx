import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Configuração de ícone
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
let DefaultIcon = L.icon({
    iconUrl: markerIcon, shadowUrl: markerShadow, iconSize: [25, 41], iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

function RecenterMap({ coords }) {
  const map = useMap();
  useEffect(() => { if (coords) map.setView([coords.lat, coords.lng], 14); }, [coords]);
  return null;
}

function App() {
  const [abaAtiva, setAbaAtiva] = useState('dashboard');
  const [showModal, setShowModal] = useState(false);
  const [posicaoGestor, setPosicaoGestor] = useState({ lat: -23.5505, lng: -46.6333 });

  // Estado dos Motoristas
  const [motoristas, setMotoristas] = useState([
    { id: 1, nome: "João Silva", telefone: "(11) 98888-7777", email: "joao@email.com", cpf: "123.456.789-00", veiculo: "Fiat Fiorino", placa: "ABC-1234", status: "online", lat: -23.5505, lng: -46.6333 },
    { id: 2, nome: "Maria Oliveira", telefone: "(11) 97777-6666", email: "maria@email.com", cpf: "987.654.321-11", veiculo: "Renault Kangoo", placa: "XYZ-9876", status: "offline", lat: -23.5605, lng: -46.6433 }
  ]);

  // Estado do Novo Motorista
  const [novoMoto, setNovoMoto] = useState({ nome: '', telefone: '', veiculo: '', placa: '', status: 'online' });

  const salvarMotorista = (e) => {
    e.preventDefault();
    const id = motoristas.length + 1;
    setMotoristas([...motoristas, { ...novoMoto, id, lat: posicaoGestor.lat, lng: posicaoGestor.lng }]);
    setShowModal(false);
    setNovoMoto({ nome: '', telefone: '', veiculo: '', placa: '', status: 'online' });
  };

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((p) => setPosicaoGestor({ lat: p.coords.latitude, lng: p.coords.longitude }));
    }
  }, []);

  return (
    <div style={styles.container}>
      {/* SIDEBAR */}
      <aside style={styles.sidebar}>
        <h2 style={styles.logo}>PROGETO LOG</h2>
        <nav style={styles.nav}>
          <div onClick={() => setAbaAtiva('dashboard')} style={abaAtiva === 'dashboard' ? styles.navItemActive : styles.navItem}>📊 Dashboard</div>
          <div onClick={() => setAbaAtiva('motoristas')} style={abaAtiva === 'motoristas' ? styles.navItemActive : styles.navItem}>🚚 Motoristas</div>
        </nav>
        <div style={styles.financeBox}>
          <p style={{fontSize: '11px', color: '#94a3b8', margin: '0 0 5px 0'}}>LUCRO LÍQUIDO (META)</p>
          <h3 style={{color: '#00ff88', margin: 0}}>R$ 57.875,00</h3>
        </div>
      </aside>

      <main style={styles.main}>
        <header style={styles.header}>
          <h1>{abaAtiva === 'dashboard' ? 'Visão Geral' : 'Frota Ativa'}</h1>
          <button onClick={() => setShowModal(true)} style={styles.btnPrincipal}>+ NOVO MOTORISTA</button>
        </header>

        {abaAtiva === 'dashboard' ? (
          <>
            <section style={styles.gridCards}>
              <div style={styles.card}><span style={styles.cardLabel}>Faturamento</span><h2 style={styles.cardValue}>R$ 1.875.000,00</h2></div>
              <div style={styles.card}><span style={styles.cardLabel}>Online</span><h2 style={{...styles.cardValue, color: '#00ff88'}}>{motoristas.filter(m => m.status === 'online').length}</h2></div>
              <div style={styles.card}><span style={styles.cardLabel}>Total Frota</span><h2 style={styles.cardValue}>{motoristas.length}</h2></div>
            </section>
            <section style={styles.mapContainer}>
              <MapContainer center={[posicaoGestor.lat, posicaoGestor.lng]} zoom={13} style={{ height: '100%', width: '100%', borderRadius: '12px' }}>
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                {motoristas.filter(m => m.status === 'online').map(m => (
                  <Marker key={m.id} position={[m.lat, m.lng]}><Popup>{m.nome} - {m.placa}</Popup></Marker>
                ))}
                <RecenterMap coords={posicaoGestor} />
              </MapContainer>
            </section>
          </>
        ) : (
          <div style={styles.listaMotoristas}>
             <table style={styles.table}>
              <thead><tr style={styles.tableHead}><th>Status</th><th>Motorista</th><th>Veículo</th><th>Telefone</th></tr></thead>
              <tbody>
                {motoristas.map(m => (
                  <tr key={m.id} style={styles.tableRow}>
                    <td><span style={{color: m.status === 'online' ? '#00ff88' : '#ff4444'}}>● {m.status}</span></td>
                    <td>{m.nome}</td><td>{m.veiculo} ({m.placa})</td><td>{m.telefone}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {/* MODAL DE CADASTRO */}
      {showModal && (
        <div style={styles.modalOverlay}>
          <div style={styles.modal}>
            <h2>Cadastrar Novo Motorista</h2>
            <form onSubmit={salvarMotorista} style={styles.form}>
              <input placeholder="Nome Completo" required style={styles.input} onChange={e => setNovoMoto({...novoMoto, nome: e.target.value})} />
              <input placeholder="Telefone" required style={styles.input} onChange={e => setNovoMoto({...novoMoto, telefone: e.target.value})} />
              <input placeholder="Veículo" required style={styles.input} onChange={e => setNovoMoto({...novoMoto, veiculo: e.target.value})} />
              <input placeholder="Placa" required style={styles.input} onChange={e => setNovoMoto({...novoMoto, placa: e.target.value})} />
              <div style={{display: 'flex', gap: '10px'}}>
                <button type="submit" style={styles.btnSalvar}>SALVAR</button>
                <button type="button" onClick={() => setShowModal(false)} style={styles.btnCancelar}>CANCELAR</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: { display: 'flex', height: '100vh', backgroundColor: '#0f172a', color: '#f8fafc', fontFamily: 'Inter, sans-serif' },
  sidebar: { width: '260px', backgroundColor: '#1e293b', padding: '20px', display: 'flex', flexDirection: 'column', borderRight: '1px solid #334155' },
  logo: { fontSize: '20px', fontWeight: 'bold', marginBottom: '40px', color: '#38bdf8' },
  nav: { flex: 1 },
  navItem: { padding: '12px', cursor: 'pointer', borderRadius: '8px', marginBottom: '5px', color: '#94a3b8' },
  navItemActive: { padding: '12px', cursor: 'pointer', backgroundColor: '#38bdf8', borderRadius: '8px', marginBottom: '5px', color: '#000', fontWeight: 'bold' },
  financeBox: { padding: '15px', backgroundColor: '#334155', borderRadius: '12px' },
  main: { flex: 1, padding: '30px', overflowY: 'auto' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' },
  btnPrincipal: { backgroundColor: '#38bdf8', color: '#000', border: 'none', padding: '10px 20px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' },
  gridCards: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', marginBottom: '30px' },
  card: { backgroundColor: '#1e293b', padding: '20px', borderRadius: '12px', border: '1px solid #334155' },
  cardLabel: { fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase' },
  cardValue: { fontSize: '24px', margin: '10px 0 0 0' },
  mapContainer: { height: '450px', borderRadius: '12px', overflow: 'hidden', border: '1px solid #334155' },
  listaMotoristas: { backgroundColor: '#1e293b', padding: '20px', borderRadius: '12px' },
  table: { width: '100%', borderCollapse: 'collapse' },
  tableHead: { textAlign: 'left', color: '#94a3b8', borderBottom: '1px solid #334155' },
  tableRow: { height: '50px', borderBottom: '1px solid #334155' },
  modalOverlay: { position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
  modal: { backgroundColor: '#1e293b', padding: '30px', borderRadius: '15px', width: '400px', border: '1px solid #334155' },
  form: { display: 'flex', flexDirection: 'column', gap: '15px', marginTop: '20px' },
  input: { padding: '12px', borderRadius: '8px', border: '1px solid #334155', backgroundColor: '#0f172a', color: '#fff' },
  btnSalvar: { backgroundColor: '#00ff88', color: '#000', border: 'none', padding: '12px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', flex: 1 },
  btnCancelar: { backgroundColor: '#ff4444', color: '#fff', border: 'none', padding: '12px', borderRadius: '8px', cursor: 'pointer', flex: 1 }
};

export default App;