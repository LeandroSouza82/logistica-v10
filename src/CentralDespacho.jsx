import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';

const CentralDespacho = () => {
    const [pedidos, setPedidos] = useState([]);
    const [motoristas, setMotoristas] = useState(['João Silva', 'Carlos Oliveira', 'Ricardo Santos']); // Mock de motoristas
    const [motoristaSelecionado, setMotoristaSelecionado] = useState('');
    const [carregando, setCarregando] = useState(false);
    const [otimizando, setOtimizando] = useState(false);

    // 1. Busca pedidos em preparação no Supabase
    const fetchPedidos = async () => {
        setCarregando(true);
        const { data, error } = await supabase
            .from('entregas')
            .select('*')
            .eq('status', 'em_preparacao');
        
        if (error) console.error('Erro ao buscar:', error);
        else setPedidos(data || []);
        setCarregando(false);
    };

    useEffect(() => {
        fetchPedidos();
    }, []);

    // 2. Lógica de Cores Dinâmicas
    const getServiceColor = (type) => {
        const t = String(type || '').toLowerCase();
        if (t.includes('recol')) return 'border-l-orange-500 bg-orange-500/10';
        if (t.includes('outro') || t.includes('ata')) return 'border-l-indigo-500 bg-indigo-500/10';
        return 'border-l-blue-500 bg-blue-500/10';
    };

    // 3. Simulação de Otimização (Caixeiro Viajante / TSP)
    const otimizarRota = () => {
        setOtimizando(true);
        // Aqui entraria a chamada para geocode e matriz de distância
        // Por agora, vamos simular uma reordenação automática
        setTimeout(() => {
            const listaOtimizada = [...pedidos].sort((a, b) => a.cliente.localeCompare(b.cliente));
            setPedidos(listaOtimizada);
            setOtimizando(false);
            alert('Rota otimizada com sucesso pelo algoritmo TSP!');
        }, 1500);
    };

    // 4. Disparar Rota para o Motorista
    const dispararRota = async () => {
        if (!motoristaSelecionado) {
            alert('Por favor, selecione um motorista antes de enviar.');
            return;
        }

        setCarregando(true);
        try {
            const ids = pedidos.map(p => p.id);
            const { error } = await supabase
                .from('entregas')
                .update({ 
                    status: 'em_rota', 
                    motorista_nome: motoristaSelecionado 
                })
                .in('id', ids);

            if (error) throw error;
            alert(`Rota disparada com sucesso para ${motoristaSelecionado}!`);
            setPedidos([]); // Limpa a tela após o envio
        } catch (e) {
            alert('Erro ao disparar: ' + e.message);
        } finally {
            setCarregando(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#0B1F3A] flex flex-col items-center py-12 px-4">
            
            <div className="w-full max-w-2xl flex flex-col gap-6">
                
                {/* TÍTULO E STATUS */}
                <div className="flex justify-between items-center bg-[#081427] p-6 rounded-2xl border border-slate-800 shadow-xl">
                    <div>
                        <h2 className="text-xl font-black text-white uppercase tracking-tight">Central de Despacho</h2>
                        <p className="text-slate-400 text-sm">{pedidos.length} cargas aguardando envio</p>
                    </div>
                    <button onClick={fetchPedidos} className="text-blue-500 hover:text-blue-400 text-sm font-bold">
                        🔄 Atualizar
                    </button>
                </div>

                {/* LISTA DE CARGAS PARA DESPACHO */}
                <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                    {pedidos.length === 0 && !carregando && (
                        <div className="text-center py-20 text-slate-500 italic">Nenhuma carga na fila de preparação.</div>
                    )}
                    
                    {pedidos.map((item, index) => (
                        <div key={item.id} className={`flex items-center justify-between p-4 rounded-xl border-l-4 shadow-sm transition-all ${getServiceColor(item.tipo)}`}>
                            <div className="flex items-center gap-4">
                                <span className="w-6 h-6 flex items-center justify-center bg-slate-900 rounded-full text-[10px] text-white font-bold">
                                    {index + 1}
                                </span>
                                <div>
                                    <div className="font-bold text-slate-200 text-sm">{item.cliente}</div>
                                    <div className="text-[11px] text-slate-400">{item.endereco}</div>
                                </div>
                            </div>
                            <span className="text-[10px] font-bold text-slate-500 uppercase">{item.tipo}</span>
                        </div>
                    ))}
                </div>

                {/* PAINEL DE CONTROLE FINAL */}
                <div className="bg-[#081427] p-8 rounded-3xl border border-slate-800 shadow-2xl flex flex-col gap-6">
                    
                    {/* Seleção de Motorista */}
                    <div className="flex flex-col gap-2">
                        <label className="text-slate-400 text-xs font-bold uppercase ml-1">Selecionar Motorista Responsável:</label>
                        <select 
                            value={motoristaSelecionado}
                            onChange={(e) => setMotoristaSelecionado(e.target.value)}
                            className="w-full h-12 px-4 bg-slate-800 border border-slate-700 rounded-xl text-white outline-none focus:ring-2 focus:ring-cyan-500"
                        >
                            <option value="">Selecione um motorista...</option>
                            {motoristas.map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                    </div>

                    {/* BOTÕES DE AÇÃO (Lado a lado como na Nova Carga) */}
                    <div className="flex gap-4">
                        <button 
                            onClick={otimizarRota}
                            disabled={pedidos.length === 0 || otimizando}
                            className="flex-1 h-14 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 uppercase disabled:opacity-50"
                        >
                            {otimizando ? 'Otimizando...' : '⚡ Otimizar Rota'}
                        </button>

                        <button 
                            onClick={dispararRota}
                            disabled={pedidos.length === 0 || carregando}
                            className="flex-[1.5] h-14 bg-cyan-600 hover:bg-cyan-700 text-white font-black rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 uppercase disabled:opacity-50"
                        >
                            🚀 Disparar para App
                        </button>
                    </div>
                </div>

            </div>
        </div>
    );
};

export default CentralDespacho;
}
