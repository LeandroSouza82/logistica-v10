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
        <div className="flex flex-col items-center justify-center w-full min-h-screen bg-[#0B1F3A]">
            <div className="w-full max-w-[600px]">

                {/* Card do Formulário */}
                <div className="w-full bg-[#081427] p-8 rounded-2xl border border-slate-800 shadow-2xl">
                    <h2 className="text-2xl font-black text-slate-200 mb-6 text-center">Registrar Encomenda</h2>

                    <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); adicionarParada(); }}>
                        <div className="flex items-center gap-4">
                            <label className="label">Tipo:</label>
                            <select value={novoTipo} onChange={(e) => setNovoTipo(e.target.value)} className="h-12 px-4 bg-[#1e293b] rounded-xl flex-1 text-white">
                                <option>Entrega</option>
                                <option>Recolha</option>
                                <option>Outros</option>
                            </select>
                        </div>

                        <input
                            value={novoNome}
                            onChange={(e) => setNovoNome(e.target.value)}
                            className="w-full h-12 px-4 bg-[#1e293b] rounded-xl text-white placeholder:text-slate-400"
                            placeholder="Nome do Cliente"
                        />

                        <input
                            value={novoEndereco}
                            onChange={(e) => setNovoEndereco(e.target.value)}
                            className="w-full h-12 px-4 bg-[#1e293b] rounded-xl text-white placeholder:text-slate-400"
                            placeholder="Endereço de Entrega"
                        />

                        <input
                            value={novoObservacoes}
                            onChange={(e) => setNovoObservacoes(e.target.value)}
                            className="w-full h-12 px-4 bg-[#1e293b] rounded-xl text-white placeholder:text-slate-400"
                            placeholder="Observações..."
                        />
                    </form>
                </div>

                {/* --- BARRA DE BOTÕES (IGUAL À FOTO) --- */}
                <div className="flex flex-row gap-4 w-full max-w-[600px] mt-6">

                    {/* Botão Azul Largo com Ícone */}
                    <button
                        onClick={adicionarParada}
                        className="flex-[2] h-14 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-xl shadow-lg flex items-center justify-center gap-3 uppercase transition-all active:scale-95"
                    >
                        <span className="inline-flex items-center justify-center bg-white/10 p-2 rounded-xl">
                            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 5v14M5 12h14" />
                            </svg>
                        </span>
                        {carregando ? 'ADICIONANDO...' : 'ADICIONAR À LISTA'}
                    </button>

                    {/* Botão Cinza Estreito com Seta */}
                    <button
                        onClick={() => setAbaAtiva && setAbaAtiva('central-despacho')}
                        className="flex-1 h-14 bg-slate-700 hover:bg-slate-600 text-white font-bold rounded-xl border border-slate-500 flex items-center justify-center gap-2 uppercase text-[10px] md:text-xs transition-all"
                    >
                        IR AO DESPACHO
                        <span className="text-lg">→</span>
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
