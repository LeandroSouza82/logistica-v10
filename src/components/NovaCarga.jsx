import React, { useState } from 'react';
import { supabase } from '../supabase';

// Pequeno cache para geocoding em memória para reduzir chamadas repetidas
const geocodeCache = new Map();

async function geocodeAddress(address) {
  if (!address) return null;
  if (geocodeCache.has(address)) return geocodeCache.get(address);

  // Usando Nominatim (OpenStreetMap) para geocoding (padrão gratuito)
  const q = encodeURIComponent(address);
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${q}`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'LOGICONTROL/1.0 (mailto:you@example.com)' } });
    const data = await res.json();
    if (!data || data.length === 0) return null;
    const { lat, lon } = data[0];
    const coord = { lat: Number(lat), lng: Number(lon) };
    geocodeCache.set(address, coord);
    return coord;
  } catch (e) {
    console.warn('Erro no geocoding', e);
    return null;
  }
}

async function getOsrmTable(coords) {
  // coords: array of {lat, lng}
  if (!coords || coords.length < 2) return null;
  const coordStr = coords.map(c => `${c.lng},${c.lat}`).join(';');
  // OSRM public demo server
  const url = `https://router.project-osrm.org/table/v1/driving/${coordStr}?annotations=distance,duration`;
  try {
    const res = await fetch(url);
    const json = await res.json();
    if (json && (json.distances || json.durations)) {
      return json;
    }
    return null;
  } catch (e) {
    console.warn('Erro OSRM table', e);
    return null;
  }
}

// Heurística simples: nearest neighbor
function solveTspNearestNeighbor(distMatrix, startIndex = 0) {
  const n = distMatrix.length;
  const visited = Array(n).fill(false);
  const order = [startIndex];
  visited[startIndex] = true;

  for (let step = 1; step < n; step++) {
    const last = order[order.length - 1];
    let next = -1;
    let minD = Number.POSITIVE_INFINITY;
    for (let i = 0; i < n; i++) {
      if (!visited[i] && distMatrix[last] && typeof distMatrix[last][i] === 'number') {
        if (distMatrix[last][i] < minD) {
          minD = distMatrix[last][i];
          next = i;
        }
      }
    }
    if (next === -1) break;
    visited[next] = true;
    order.push(next);
  }
  return order;
}

const NovaCarga = () => {
  const [destinos, setDestinos] = useState([]);
  const [novoEndereco, setNovoEndereco] = useState('');
  const [carregando, setCarregando] = useState(false);

  // 1. Adicionar endereço à lista temporária
  const adicionarParada = () => {
    if (!novoEndereco) return;
    setDestinos([...destinos, { endereco: novoEndereco, id: Date.now() }]);
    setNovoEndereco('');
  };

  // 2. FUNÇÃO CAIXEIRO VIAJANTE (Otimização usando OSRM reais)
  const otimizarRota = async () => {
    if (destinos.length < 2) return;
    setCarregando(true);

    // 1) Geocode todos os endereços (inclui cache)
    const coordsList = [];
    for (const d of destinos) {
      const c = await geocodeAddress(d.endereco);
      if (!c) {
        alert(`Não foi possível geocodificar: ${d.endereco}`);
        setCarregando(false);
        return;
      }
      coordsList.push(c);
    }

    // 2) Chamar OSRM Table para obter matriz de distâncias
    const table = await getOsrmTable(coordsList);
    if (!table || !table.distances) {
      alert('Erro ao calcular matriz de distâncias (OSRM). Tente novamente mais tarde.');
      setCarregando(false);
      return;
    }

    const distMatrix = table.distances; // metros

    // 3) Resolver o TSP (heurística nearest-neighbor)
    const orderIdx = solveTspNearestNeighbor(distMatrix, 0);

    // 4) Reordena destinos de acordo com a ordem retornada
    const novos = orderIdx.map((idx, pos) => ({
      ...destinos[idx],
      ordem: pos + 1,
      lat: coordsList[idx].lat,
      lng: coordsList[idx].lng,
      distanciaParaAnterior: pos === 0 ? 0 : distMatrix[ orderIdx[pos-1] ][ idx ]
    }));

    setDestinos(novos);
    setCarregando(false);
    alert('Rota otimizada (usando distâncias reais por rua)');
  };

  // 3. Enviar para o Motorista no Supabase
  const despacharCarga = async () => {
    if (destinos.length === 0) return;
    const rows = destinos.map(d => ({
      endereco: d.endereco,
      ordem: d.ordem || 999,
      status: 'pendente',
      motorista_id: 1,
      lat: d.lat || null,
      lng: d.lng || null
    }));

    const { error } = await supabase
      .from('entregas')
      .insert(rows);

    if (!error) alert('Cargas enviadas ao celular do motorista!');
    else alert('Erro ao enviar cargas: ' + (error.message || error));
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="bg-white rounded-3xl p-8 shadow-2xl border-t-8 border-blue-600">
        <h2 className="text-2xl font-black text-slate-800 mb-2 uppercase">Central de Roteirização</h2>
        <p className="text-slate-500 mb-6 italic">Adicione os pontos e o sistema organizará a melhor sequência.</p>

        {/* Campo de Entrada */}
        <div className="flex gap-2 mb-8">
          <input 
            value={novoEndereco}
            onChange={(e) => setNovoEndereco(e.target.value)}
            className="flex-1 border-2 border-slate-100 p-4 rounded-2xl focus:border-blue-500 outline-none shadow-inner" 
            placeholder="Digite o endereço da entrega (Rua, Bairro...)" 
          />
          <button onClick={adicionarParada} className="bg-slate-800 text-white px-6 rounded-2xl font-bold hover:bg-black transition">
            + ADICIONAR
          </button>
        </div>

        {/* Lista de Rotas (Visual do Caixeiro Viajante) */}
        <div className="space-y-3 mb-8">
          {destinos.map((item, index) => (
            <div key={item.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border-l-4 border-blue-400">
              <div className="flex items-center gap-4">
                <span className="bg-blue-600 text-white w-8 h-8 flex items-center justify-center rounded-full font-bold">
                  {index + 1}
                </span>
                <div>
                  <div className="font-semibold text-slate-700">{item.endereco}</div>
                  {item.lat && item.lng && (
                    <div className="text-xs text-slate-400">{item.lat.toFixed(6)}, {item.lng.toFixed(6)}</div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-4">
                {item.distanciaParaAnterior != null && (
                  <div className="text-slate-500 text-sm">{(item.distanciaParaAnterior/1000).toFixed(2)} km</div>
                )}
                <button onClick={() => setDestinos(destinos.filter(d => d.id !== item.id))} className="text-red-400 hover:text-red-600">Remover</button>
              </div>
            </div>
          ))}
        </div>

        {/* Ações Inteligentes */}
        <div className="grid grid-cols-2 gap-4">
          <button 
            onClick={otimizarRota}
            disabled={destinos.length < 2 || carregando}
            className="bg-emerald-500 text-white font-black py-4 rounded-2xl hover:bg-emerald-600 transition shadow-lg shadow-emerald-100 uppercase"
          >
            {carregando ? "Calculando..." : "⚡ Otimizar Sequência (Mais Perto)"}
          </button>

          <button 
            onClick={despacharCarga}
            disabled={destinos.length === 0}
            className="bg-blue-600 text-white font-black py-4 rounded-2xl hover:bg-blue-700 transition shadow-lg shadow-blue-100 uppercase"
          >
            Enviar para Motorista
          </button>
        </div>
      </div>
    </div>
  );
};

export default NovaCarga;
