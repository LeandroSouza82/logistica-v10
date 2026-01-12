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

const NovaCarga = ({ setAbaAtiva }) => {
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

    // 1. Adicionar endereço: salva no Supabase com status 'em_preparacao' e limpa o formulário
    const adicionarParada = async () => {
        if (!novoEndereco) {
            alert('Preencha o endereço antes de adicionar.');
            return;
        }
        setCarregando(true);
        const clienteValor = (novoNome && String(novoNome).trim()) || 'Cliente a definir';
        const payload = {
            cliente: clienteValor,
            endereco: novoEndereco,
            tipo: novoTipo,
            observacoes: novoObservacoes,
            status: 'em_preparacao'
        };

        try {
            const { data, error } = await supabase.from('entregas').insert([payload]).select().single();
            if (error) throw error;
            // Adiciona ao preview local (opcional) usando id retornado
            setDestinos(prev => [...prev, {
                id: data.id,
                cliente: data.cliente,
                endereco: data.endereco,
                tipo: data.tipo,
                observacoes: data.observacoes || ''
            }]);

            // limpar formulário
            setNovoNome('');
            setNovoEndereco('');
            setNovoTipo('Entrega');
            setNovoObservacoes('');

            alert('Parada adicionada e salva em preparação!');
        } catch (e) {
            console.warn(e);
            alert('Erro ao salvar parada: ' + (e.message || JSON.stringify(e)));
        } finally {
            setCarregando(false);
        }
    };





    return (
        <div className="min-h-screen bg-[#0B1F3A] flex flex-col items-center justify-center p-8">
            <div className="w-full max-w-[600px] mx-auto flex flex-col items-center">
                {/* Formulário central estilo screenshot */}
                <div className="nova-carga-card w-full bg-[#081427] rounded-3xl p-8 shadow-2xl border border-slate-800 mb-6">
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

                        {/* Botões removidos do card; agora posicionados abaixo do card conforme layout */}

                    </form>
                </div>

                {/* Barra de ações fora do card (layout específico) */}
                <div className="flex flex-row gap-4 w-full max-w-[600px] mx-auto mt-8">
                    <button
                        type="button"
                        onClick={adicionarParada}
                        disabled={carregando}
                        className="flex-[2] bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold uppercase rounded-xl py-4 px-5 flex items-center justify-center gap-3 disabled:opacity-60"
                        aria-label="Adicionar à lista"
                    >
                        <span className="inline-flex items-center justify-center bg-white/10 p-2 rounded-lg">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="text-white" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                                <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                        </span>
                        <span>{carregando ? 'ADICIONANDO...' : 'ADICIONAR À LISTA'}</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => setAbaAtiva && setAbaAtiva('central-despacho')}
                        className="flex-1 bg-slate-700 hover:bg-slate-600 active:scale-95 text-white font-bold uppercase rounded-xl py-4 px-4 flex items-center justify-center gap-2"
                        aria-label="Ir ao despacho"
                    >
                        <span className="whitespace-nowrap">IR AO DESPACHO</span>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-white" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                            <path d="M5 12h14M13 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                    </button>
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
