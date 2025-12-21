import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

// Configuração de ícones para o Leaflet não bugar no React
import L from 'leaflet';
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
    if (coords) {
      map.setView([coords.lat, coords.lng], 15); // Zoom de 15 é ideal para visualização urbana
    }
  }, [coords]);
  return null;
}

function App() {
  const [posicaoGestor, setPosicaoGestor] = useState({ lat: -27.63718, lng: -48.70789 }); // Padrão Palhoça
  const [notificacao, setNotificacao] = useState(false);
  
  // Som de Notificação (Beep profissional)
  const tocarSom = () => {
    const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
    audio.play();
  };

  // Tenta obter a localização real do Gestor e atualiza o estado
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((position) => {
        setPosicaoGestor({
          lat: position.coords.latitude,
          lng: position.coords.longitude
        });
      }, (err) => {
        console.warn('Geolocation error:', err);
      });
    }
  }, []);

  const enviarRota = () => {
    tocarSom();
    setNotificacao(true);
    setTimeout(() => setNotificacao(false), 5000);
    alert("🚀 Rota Otimizada (Caixeiro Viajante) enviada ao motorista!");
  };

  const dadosFinanceiros = {
    faturamento: "1.875.000,00",
    comissao: "187.500,00",
    lucro: "57.875,00",
    motoristas: 500
  };

  return (
    <div style={styles.container}>
      {/* Sidebar de Gestão */}
      <aside style={styles.sidebar}>
        <h2 style={styles.logo}>PROGETO LOG</h2>
        <nav style={styles.nav}>
          <div style={styles.navItemActive}>📊 Dashboard</div>
          <div style={styles.navItem}>🚚 Motoristas</div>
          <div style={styles.navItem}>📍 Rotas Ativas</div>
          <div style={styles.navItem}>💰 Financeiro</div>
        </nav>

        <div style={styles.financeBox}>
          <p>Lucro Líquido Previsto</p>
          <h3 style={{color: '#00ff88'}}>R$ {dadosFinanceiros.lucro}</h3>
        </div>
      </aside>

      {/* Conteúdo Principal */}
      <main style={styles.main}>
        <header style={styles.header}>
          <div>
            <h1 style={{margin: 0}}>Painel de Controle de Frotas</h1>
            <p style={{color: '#666'}}>Monitoramento em tempo real e otimização de rotas</p>
          </div>
          <button onClick={enviarRota} style={styles.btnPrincipal}>
            ENVIAR ROTA OTIMIZADA
          </button>
        </header>

        {/* Cards de Indicadores */}
        <section style={styles.gridCards}>
          <div style={styles.card}>
            <span style={styles.cardLabel}>Faturamento Corridas</span>
            <h2 style={styles.cardValue}>R$ {dadosFinanceiros.faturamento}</h2>
          </div>
          <div style={styles.card}>
            <span style={styles.cardLabel}>Comissão App (10%)</span>
            <h2 style={styles.cardValue}>R$ {dadosFinanceiros.comissao}</h2>
          </div>
          <div style={styles.card}>
            <span style={styles.cardLabel}>Motoristas On-line</span>
            <h2 style={{...styles.cardValue, color: '#00ff88'}}>{dadosFinanceiros.motoristas}</h2>
          </div>
        </section>

        {/* Mapa com Leaflet */}
        <section style={styles.mapContainer}>
          <MapContainer 
            center={[posicaoGestor.lat, posicaoGestor.lng]} 
            zoom={15} 
            style={{ height: '100%', width: '100%', borderRadius: '12px' }}
          >
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

            {/* Marcador do Gestor (posição atual) */}
            <Marker position={[posicaoGestor.lat, posicaoGestor.lng]}>
              <Popup>Você está aqui (Gestor)</Popup>
            </Marker>

            {/* Marcador da Sede */}
            <Marker position={[-27.63718, -48.70789]}>
              <Popup>
                <strong>Sede Progeto Log</strong> <br />
                Rua Walmor Beppler, Palhoça - SC
              </Popup>
            </Marker>

            <RecenterMap coords={posicaoGestor} />
          </MapContainer>
        </section>
      </main>

      {/* Overlay de Notificação Simulado */}
      {notificacao && (
        <div style={styles.notificacaoPop}>
          🔔 Notificação enviada ao celular do motorista!
        </div>
      )}
    </div>
  );
}

const styles = {
  container: { display: 'flex', height: '100vh', backgroundColor: '#0f172a', color: '#f8fafc', fontFamily: 'Inter, sans-serif' },
  sidebar: { width: '260px', backgroundColor: '#1e293b', padding: '20px', display: 'flex', flexDirection: 'column' },
  logo: { fontSize: '22px', fontWeight: 'bold', letterSpacing: '2px', marginBottom: '40px', color: '#38bdf8' },
  nav: { flex: 1 },
  navItem: { padding: '12px', cursor: 'pointer', borderRadius: '8px', marginBottom: '8px', color: '#94a3b8' },
  navItemActive: { padding: '12px', cursor: 'pointer', backgroundColor: '#334155', borderRadius: '8px', marginBottom: '8px', color: '#fff' },
  financeBox: { padding: '15px', backgroundColor: '#334155', borderRadius: '12px', marginTop: 'auto' },
  main: { flex: 1, padding: '30px', overflowY: 'auto' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' },
  btnPrincipal: { backgroundColor: '#38bdf8', color: '#000', border: 'none', padding: '12px 24px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', transition: '0.3s' },
  gridCards: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', marginBottom: '30px' },
  card: { backgroundColor: '#1e293b', padding: '20px', borderRadius: '12px', border: '1px solid #334155' },
  cardLabel: { fontSize: '12px', color: '#94a3b8', textTransform: 'uppercase' },
  cardValue: { fontSize: '24px', margin: '10px 0 0 0' },
  mapContainer: { height: '500px', backgroundColor: '#1e293b', borderRadius: '12px', padding: '10px', border: '1px solid #334155' },
  notificacaoPop: { position: 'fixed', top: '20px', right: '20px', backgroundColor: '#00ff88', color: '#000', padding: '15px 25px', borderRadius: '8px', fontWeight: 'bold', boxShadow: '0 10px 15px rgba(0,0,0,0.3)', zIndex: 9999 }
};

export default App;