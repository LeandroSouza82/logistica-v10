import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Dev-only: mostra um alert para qualquer erro global (temporário)
window.onerror = (msg, source, line, col, error) => alert("Erro detectado: " + (msg || error?.message || "desconhecido"));

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
