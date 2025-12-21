import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Configuração de ícone para o mapa
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
let DefaultIcon = L.icon({
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

function RecenterMap({ coords }) {
  const map = useMap();
  useEffect(() => {
    if (coords) map.setView([coords.lat, coords.lng], 14);
  }, [coords]);
  return null;
}

function App() {
  const [abaAtiva, setAbaAtiva] = useState('dashboard');
  const [posicaoGestor, setPosicaoGestor] = useState({ lat: -23.5505, lng: -46.6333 });

  // Simulação do Banco de Dados de Motoristas
  const [motoristas, setMotoristas] = useState([
    { id: 1, nome: "João Silva", telefone: "(11) 98888-7777", email: "joao@email.com", cpf: "123.456.789-00", veiculo: "Fiat Fiorino", placa: "ABC-1234", status: "online", lat: -23.5505, lng: -46.6333 },
    { id: 2, nome: "Maria Oliveira", telefone: "(11) 97777-6666", email: "maria@email.com", cpf: "987.654.321-11", veiculo: "Renault Kangoo", placa: "XYZ-9876", status: "offline", lat: -23.5605, lng: -46.6433 },
    { id: 3, nome: "Carlos Souza", telefone: "(11) 96666-5555", email: "carlos@email.com", cpf: "456.789.123-22", veiculo: "Vw Delivery", placa: "LOG-5050", status: "online", lat: -23.5405, lng: -46.6233 },
  ]);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((position) => {
        setPosicaoGestor({ lat: position.coords.latitude, lng: position.coords.longitude });
      });
    }
  }, []);

  return (
    <div style={styles.container}>
      {/* SIDEBAR SOFISTICADA */}
      <aside style={styles.sidebar}>
        <h2 style={styles.logo}>PROGETO LOG</h2>
        <nav style={styles.nav}>
          <div onClick={() => setAbaAtiva('dashboard')} style={abaAtiva === 'dashboard' ? styles.navItemActive : styles.navItem}>📊 Dashboard</div>
          <div onClick={() => setAbaAtiva('motoristas')} style={abaAtiva === 'motoristas' ? styles.navItemActive : styles.navItem}>🚚 Motoristas</div>
        </nav>
        <div style={styles.financeBox}>
          <p style={{ fontSize: '12px', color: '#94a3b8' }}>Lucro Líquido (Meta)</p>
          <h3 style={{ color: '#00ff88', margin: 0 }}>R$ 57.875,00</h3>
        </div>
      </aside>

      <main style={styles.main}>
        {abaAtiva === 'dashboard' ? (
          <>
            <header style={styles.header}>
              <h1>Visão Geral do Gestor</h1>
              <button style={styles.btnPrincipal}>OTIMIZAR ROTAS AGORA</button>
            </header>

            <section style={styles.gridCards}>
              <div style={styles.card}><span style={styles.cardLabel}>Faturamento Corridas</span><h2 style={styles.cardValue}>R$ 1.875.000,00</h2></div>
              <div style={styles.card}><span style={styles.cardLabel}>Motoristas Online</span><h2 style={{ ...styles.cardValue, color: '#00ff88' }}>{motoristas.filter(m => m.status === 'online').length}</h2></div>
              <div style={styles.card}><span style={styles.cardLabel}>Frota Total</span><h2 style={styles.cardValue}>{motoristas.length}</h2></div>
            </section>

            <section style={styles.mapContainer}>
              <MapContainer center={[posicaoGestor.lat, posicaoGestor.lng]} zoom={13} style={{ height: '100%', width: '100%', borderRadius: '12px' }}>
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                <Marker position={[posicaoGestor.lat, posicaoGestor.lng]}><Popup>Gestor (Você)</Popup></Marker>
                {motoristas.filter(m => m.status === 'online').map(m => (
                  <Marker key={m.id} position={[m.lat, m.lng]}>
                    <Popup><b>{m.nome}</b><br />{m.veiculo} - {m.placa}</Popup>
                  </Marker>
                ))}
                <RecenterMap coords={posicaoGestor} />
              </MapContainer>
            </section>
          </>
        ) : (
          /* TELA DE MOTORISTAS DETALHADA */
          <section style={styles.listaMotoristas}>
            <h1 style={{ marginBottom: '20px' }}>Gerenciamento de Frota</h1>
            <table style={styles.table}>
              <thead>
                <tr style={styles.tableHead}>
                  <th>Status</th>
                  <th>Motorista</th>
                  <th>Veículo / Placa</th>
                  <th>CPF</th>
                  <th>Contato</th>
                </tr>
              </thead>
              <tbody>
                {motoristas.map(m => (
                  <tr key={m.id} style={styles.tableRow}>
                    <td>
                      <span style={{
                        padding: '4px 10px',
                        borderRadius: '20px',
                        fontSize: '12px',
                        backgroundColor: m.status === 'online' ? '#00ff8833' : '#ff444433',
                        color: m.status === 'online' ? '#00ff88' : '#ff4444'
                      }}>
                        {m.status.toUpperCase()}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontWeight: 'bold' }}>{m.nome}</div>
                      <div style={{ fontSize: '12px', color: '#94a3b8' }}>{m.email}</div>
                    </td>
                    <td>{m.veiculo} <br /> <small style={{ color: '#38bdf8' }}>{m.placa}</small></td>
                    <td>{m.cpf}</td>
                    <td>{m.telefone}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </main>
    </div>
  );
}

const styles = {
  container: { display: 'flex', height: '100vh', backgroundColor: '#0f172a', color: '#f8fafc', fontFamily: 'Inter, sans-serif' },
  sidebar: { width: '260px', backgroundColor: '#1e293b', padding: '20px', display: 'flex', flexDirection: 'column', borderRight: '1px solid #334155' },
  logo: { fontSize: '22px', fontWeight: 'bold', letterSpacing: '2px', marginBottom: '40px', color: '#38bdf8' },
  nav: { flex: 1 },
  navItem: { padding: '14px', cursor: 'pointer', borderRadius: '8px', marginBottom: '8px', color: '#94a3b8', transition: '0.2s' },
  navItemActive: { padding: '14px', cursor: 'pointer', backgroundColor: '#38bdf8', borderRadius: '8px', marginBottom: '8px', color: '#000', fontWeight: 'bold' },
  financeBox: { padding: '15px', backgroundColor: '#334155', borderRadius: '12px' },
  main: { flex: 1, padding: '30px', overflowY: 'auto' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' },
  btnPrincipal: { backgroundColor: '#38bdf8', color: '#000', border: 'none', padding: '12px 24px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' },
  gridCards: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', marginBottom: '30px' },
  card: { backgroundColor: '#1e293b', padding: '20px', borderRadius: '12px', border: '1px solid #334155' },
  cardLabel: { fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '1px' },
  cardValue: { fontSize: '26px', margin: '10px 0 0 0', fontWeight: 'bold' },
  mapContainer: { height: '500px', backgroundColor: '#1e293b', borderRadius: '12px', padding: '10px', border: '1px solid #334155' },
  listaMotoristas: { backgroundColor: '#1e293b', padding: '25px', borderRadius: '15px', border: '1px solid #334155' },
  table: { width: '100%', borderCollapse: 'collapse', textAlign: 'left' },
  tableHead: { borderBottom: '2px solid #334155', color: '#94a3b8', fontSize: '13px' },
  tableRow: { borderBottom: '1px solid #334155', height: '60px' }
};

export default App;