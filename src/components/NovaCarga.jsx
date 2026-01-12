import React, { useState } from 'react';
import { supabase } from '../supabase';

const NovaCarga = ({ setAbaAtiva }) => {
    const [destinos, setDestinos] = useState([]);
    const [novoNome, setNovoNome] = useState('');
    const [novoEndereco, setNovoEndereco] = useState('');
    const [novoTipo, setNovoTipo] = useState('Entrega');
    const [novoObservacoes, setNovoObservacoes] = useState('');
    const [carregando, setCarregando] = useState(false);

    // Lógica de cores para o card da lista
    const getServiceColorClass = (type) => {
        const t = String(type || 'Entrega').toLowerCase();
        if (t.includes('recol')) return 'border-l-orange-500 bg-orange-500/10';
        if (t.includes('outro') || t.includes('ata')) return 'border-l-indigo-500 bg-indigo-500/10';
        return 'border-l-blue-500 bg-blue-500/10';
    };

    // Lógica de cores para o botão Remover
    const getRemoveButtonClass = (type) => {
        const t = String(type || 'Entrega').toLowerCase();
        if (t.includes('recol')) return 'bg-orange-600 hover:bg-orange-700';
        if (t.includes('outro') || t.includes('ata')) return 'bg-indigo-600 hover:bg-indigo-700';
        return 'bg-blue-600 hover:bg-blue-700';
    };

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
            
            setDestinos(prev => [...prev, data]);
            setNovoNome('');
            setNovoEndereco('');
            setNovoTipo('Entrega');
            setNovoObservacoes('');
        } catch (e) {
            alert('Erro ao salvar: ' + e.message);
        } finally {
            setCarregando(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#0B1F3A] flex flex-col items-center py-12 px-4">
            
            {/* CONTAINER CENTRALIZADO (Largura máxima controlada) */}
            <div className="w-full max-w-[600px] flex flex-col items-center">
                
                {/* CARD DO FORMULÁRIO */}
                <div className="w-full bg-[#081427] rounded-3xl p-8 shadow-2xl border border-slate-800">
                    <h2 className="text-2xl font-black text-slate-200 mb-8 text-center uppercase tracking-wider">
                        Registrar Encomenda
                    </h2>

                    <div className="flex flex-col gap-5">
                        {/* Tipo de Serviço (Input menor e elegante) */}
                        <div className="flex items-center gap-3">
                            <label className="text-slate-400 text-sm font-bold uppercase">Tipo:</label>
                            <select 
                                value={novoTipo} 
                                onChange={(e) => setNovoTipo(e.target.value)}
                                className="h-10 px-4 bg-slate-800 border border-slate-700 rounded-lg text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                            >
                                <option>Entrega</option>
                                <option>Recolha</option>
                                <option>Outros</option>
                            </select>
                        </div>

                        {/* Nome do Cliente (Input Padronizado) */}
                        <input
                            value={novoNome}
                            onChange={(e) => setNovoNome(e.target.value)}
                            className="w-full h-12 px-4 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder:text-slate-500 focus:ring-2 focus:ring-blue-500 outline-none"
                            placeholder="Nome do Cliente"
                        />

                        {/* Endereço (Mesmo tamanho) */}
                        <input
                            value={novoEndereco}
                            onChange={(e) => setNovoEndereco(e.target.value)}
                            className="w-full h-12 px-4 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder:text-slate-500 focus:ring-2 focus:ring-blue-500 outline-none"
                            placeholder="Endereço de Entrega"
                        />

                        {/* Observações (Alinhado embaixo) */}
                        <input
                            value={novoObservacoes}
                            onChange={(e) => setNovoObservacoes(e.target.value)}
                            className="w-full h-12 px-4 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder:text-slate-500 focus:ring-2 focus:ring-blue-500 outline-none"
                            placeholder="Observações..."
                        />
                    </div>
                </div>

                {/* BOTÕES DE AÇÃO (Lado a lado, mesma largura do card) */}
                <div className="w-full flex gap-4 mt-8">
                    <button 
                        onClick={adicionarParada} 
                        disabled={carregando}
                        className="flex-[2] h-14 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-xl shadow-lg transition-transform active:scale-95 uppercase tracking-tighter"
                    >
                        {carregando ? 'Processando...' : 'Adicionar à Lista'}
                    </button>

                    <button 
                        onClick={() => setAbaAtiva('central-despacho')}
                        className="flex-1 h-14 bg-slate-700 hover:bg-slate-600 text-white font-bold rounded-xl border border-slate-500 transition-all uppercase text-xs"
                    >
                        Ir ao Despacho ➡️
                    </button>
                </div>

                {/* LISTA DE ITENS (Com Scroll interno e cores dinâmicas) */}
                <div className="w-full mt-10 space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                    {destinos.map((item, index) => (
                        <div 
                            key={item.id} 
                            className={`flex items-center justify-between p-5 rounded-xl border-l-4 shadow-md transition-all ${getServiceColorClass(item.tipo)}`}
                        >
                            <div className="flex items-center gap-4">
                                <span className="flex items-center justify-center w-8 h-8 bg-slate-900/50 rounded-full text-white font-bold text-xs">
                                    {index + 1}
                                </span>
                                <div>
                                    <div className="font-bold text-slate-100">{item.cliente}</div>
                                    <div className="text-xs text-slate-400 italic">{item.endereco}</div>
                                </div>
                            </div>

                            <div className="flex items-center gap-4">
                                <button 
                                    onClick={() => setDestinos(destinos.filter(d => d.id !== item.id))}
                                    className={`px-4 py-2 rounded-lg text-xs font-black text-white uppercase transition-colors ${getRemoveButtonClass(item.tipo)}`}
                                >
                                    Remover
                                </button>
                            </div>
                        </div>
                    ))}
                </div>

            </div>
        </div>
    );
};

export default NovaCarga;
};

export default NovaCarga;
