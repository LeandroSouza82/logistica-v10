import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Dev-only: mostra um alert para qualquer erro global (temporário)
if (process.env.NODE_ENV !== 'production') {
  window.onerror = (msg, source, line, col, error) => {
    try {
      alert("Erro detectado: " + (msg || error?.message || "desconhecido"));
    } catch (e) {
      console.error('Error in window.onerror handler', e);
    }
  };
} else {
  // Em produção, registre no console para evitar alerts intrusivos
  window.onerror = (msg, source, line, col, error) => console.error('Erro global:', msg || error?.message || 'desconhecido');
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
