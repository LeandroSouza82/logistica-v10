import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './MotoristaSimple.jsx'

// Truque: em mobile, mostre um alert simples para que o aparelho 'grite' o erro (útil para QA)
const isMobile = typeof navigator !== 'undefined' && /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
if (isMobile) {
  // Handler simples e explícito para ser visível em dispositivos móveis (alert)
  window.onerror = function(msg, url, line) {
    try {
      alert("ERRO: " + (msg || 'desconhecido') + "\nLinha: " + (line ?? '?') + "\nArquivo: " + (url || 'desconhecido'));
    } catch (e) {
      /* ignore alert errors */
    }
  };
} else if (process.env.NODE_ENV !== 'production') {
  // Dev: handler mais informativo (desktop)
  window.onerror = (msg, source, line, col, error) => {
    try {
      alert("Erro detectado: " + (msg || error?.message || "desconhecido"));
    } catch (e) {
      console.error('Error in window.onerror handler', e);
    }
  };
} else {
  // Em produção desktop, registre no console para evitar alerts intrusivos
  window.onerror = (msg, source, line, col, error) => console.error('Erro global:', msg || error?.message || 'desconhecido');
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
