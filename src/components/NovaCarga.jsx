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
    const [novoNome, setNovoNome] = useState('');
    const [novoEndereco, setNovoEndereco] = useState('');
    const [novoTipo, setNovoTipo] = useState('Entrega');
    const [novoObservacoes, setNovoObservacoes] = useState('');
    const [carregando, setCarregando] = useState(false);

    // helper: escolhe classe com cor por tipo
    const getServiceClass = (type) => {
        if (!type) return 'svc-default';
        const t = String(type).toLowerCase();
        if (t.includes('recol')) return 'svc-recolha';
        if (t.includes('outro') || t.includes('ata') || t.includes('atas')) return 'svc-outros';
        return 'svc-entrega';
    };



// Classes para o botão Remover conforme o tipo (retorna classe CSS) 
    const getRemoveButtonClass = (type) => {
        const t = String(type || 'Entrega').toLowerCase();
        if (t.includes('recol')) return 'remove-recolha';
        if (t.includes('outro') || t.includes('ata') || t.includes('atas')) return 'remove-outros';
        return 'remove-entrega';
    };

    // 1. Adicionar endereço à lista temporária
    const adicionarParada = () => {
        if (!novoEndereco) {
            alert('Preencha o endereço antes de adicionar.');
            return;
        }
        const clienteValor = (novoNome && String(novoNome).trim()) || 'Cliente a definir';
        setDestinos([...destinos, {
            id: Date.now(),
            cliente: clienteValor,
            endereco: novoEndereco,
            tipo: novoTipo,
            observacoes: novoObservacoes
        }]);
        // reset campos
        setNovoNome('');
        setNovoEndereco('');
        setNovoTipo('Entrega');
        setNovoObservacoes('');
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
            distanciaParaAnterior: pos === 0 ? 0 : distMatrix[orderIdx[pos - 1]][idx]
        }));

        setDestinos(novos);
        setCarregando(false);
        alert('Rota otimizada (usando distâncias reais por rua)');
    };

    // 3. Enviar para o Motorista no Supabase
    const despacharCarga = async () => {
        if (destinos.length === 0) return;



        setCarregando(true);

        // Estrutura do objeto de envio: garante campo cliente (com fallback 'Cliente a definir'), endereco, status e tipo
        const rows = destinos.map(d => ({
            cliente: (d.cliente && String(d.cliente).trim()) || 'Cliente a definir',
            endereco: d.endereco,
            status: 'pendente',
            tipo: d.tipo || 'Entrega',
            ordem: d.ordem || 999,
            motorista_id: 1,
            lat: d.lat || null,
            lng: d.lng || null
        }));

        try {
            const { data, error } = await supabase
                .from('entregas')
                .insert(rows);

            if (error) {
                // Tratamento de erro: notifica o gestor
                alert('Erro ao enviar cargas: ' + (error.message || JSON.stringify(error)));
                setCarregando(false);
                return;
            }

            alert('Cargas enviadas ao celular do motorista!');
            // Opcional: limpar lista após envio bem-sucedido
            setDestinos([]);
        } catch (e) {
            alert('Erro inesperado ao enviar cargas: ' + (e.message || e));
        } finally {
            setCarregando(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#0B1F3A] flex items-start justify-center p-8">
            <div className="w-full max-w-2xl">
                {/* Formulário central estilo screenshot */}
                <div className="bg-[#081427] rounded-3xl p-8 shadow-2xl border border-slate-800 mb-6">
                    <h2 className="text-2xl font-black text-slate-200 mb-6">Registrar Encomenda</h2>

                    <form className="nova-carga-form" onSubmit={(e) => { e.preventDefault(); adicionarParada(); }}>
                        <div className="tipo-row">
                            <label className="label">Tipo:</label>
                            <select value={novoTipo} onChange={(e) => setNovoTipo(e.target.value)} className="form-input type-select">
                                <option>Entrega</option>
                                <option>Recolha</option>
                                <option>Outros</option>
                            </select>
                        </div>

                        <input
                            value={novoNome}
                            onChange={(e) => setNovoNome(e.target.value)}
                            className="form-input nome-cliente w-full"
                            placeholder="Nome do Cliente"
                        />

                        <input
                            value={novoEndereco}
                            onChange={(e) => setNovoEndereco(e.target.value)}
                            className="form-input endereco w-full"
                            placeholder="Endereço de Entrega"
                        />

                        <input
                            value={novoObservacoes}
                            onChange={(e) => setNovoObservacoes(e.target.value)}
                            className="form-input observacoes w-full mt-2"
                            placeholder="Observações..."
                        />

                        {/* Linha de ação final: Otimizar | ADICIONAR | Enviar */}
                        <div className="action-row-bottom mt-6">
                            <button type="button" onClick={otimizarRota} disabled={destinos.length < 2 || carregando} className="btn-opt">
                                <span aria-hidden="true">⚡</span>
                                <span>Otimizar</span>
                            </button>

                            <button type="submit" className="btn-add-center">
                                ADICIONAR À LISTA
                            </button>

                            <button type="button" onClick={despacharCarga} disabled={destinos.length === 0} className="btn-send">
                                <span aria-hidden="true">🚀</span>
                                <span>Enviar</span>
                            </button>
                        </div>

                    </form>
                </div>

                {/* Lista de endereços abaixo (visível após adicionar) */}
                <div className="mt-6 destinos-list custom-scrollbar">
                    {destinos.map((item, index) => (
                        <div key={item.id} className={`destino-item rounded-xl flex items-center justify-between ${getServiceClass(item.tipo)}`}>
                            <div className="flex items-center gap-6">
                                <span className="destino-index">{index + 1}</span>
                                <div>
                                    <div className="font-semibold text-slate-200">{item.cliente}</div>
                                    <div className="text-sm text-slate-400">{item.endereco}</div>
                                </div>
                            </div>

                            <div className="flex items-center gap-4">
                                <span className="tipo-badge">{item.tipo}</span>
                                <button onClick={() => setDestinos(destinos.filter(d => d.id !== item.id))} className={`${getRemoveButtonClass(item.tipo)} btn-remove`}>Remover</button>
                            </div>
                        </div>
                    ))}
                </div>


            </div>
        </div>
    );
};

export default NovaCarga;
