import React, { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { Zap, Send, Trash2, MapPin } from 'lucide-react';

export default function CentralDespacho() {
    const [entregas, setEntregas] = useState([]);
    const [loading, setLoading] = useState(false);
    const [toast, setToast] = useState(null);

    const showToast = (msg, t = 'success') => {
        setToast({ message: msg, type: t });
        setTimeout(() => setToast(null), 3000);
    };

    const carregarEntregas = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase.from('entregas').select('*').eq('status', 'pendente').order('ordem_rota', { ascending: true });
            if (error) throw error;
            setEntregas(data || []);
        } catch (e) {
            console.warn(e);
            showToast('Erro ao carregar entregas', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { carregarEntregas(); }, []);



    const otimizarRotaTSP = async () => {
        if (entregas.length < 2) { showToast('Precisamos de ao menos 2 entregas', 'error'); return; }
        // placeholder: ordenação por índice atual (ou implementar TSP real)
        const otimizadas = [...entregas].sort((a, b) => (a.ordem_rota ?? 0) - (b.ordem_rota ?? 0));
        try {
            await Promise.all(otimizadas.map((e, i) => supabase.from('entregas').update({ ordem_rota: i + 1 }).eq('id', e.id)));
            setEntregas(otimizadas);
            showToast('Rota otimizada', 'success');
        } catch (e) {
            console.warn(e);
            showToast('Erro ao salvar ordem', 'error');
        }
    };

    const dispararRota = async () => {
        await otimizarRotaTSP();
        // placeholder para envio de notificações reais
        showToast('Rota disparada', 'success');
    };

    const removerEntrega = async (id) => {
        if (!confirm('Confirma remoção desta carga?')) return;
        try {
            const { error } = await supabase.from('entregas').update({ status: 'cancelado' }).eq('id', id);
            if (error) throw error;
            setEntregas(prev => prev.filter(p => p.id !== id));
            showToast('Entrega removida', 'success');
        } catch (e) {
            console.warn(e);
            showToast('Erro ao remover', 'error');
        }
    };

    return (
        <div className="min-h-screen bg-[#0a1631] flex gap-6 p-8 text-white">
            {/* Left: delivery area (flex-1) */}
            <div className="flex-1">
                <div className="grid grid-cols-3 gap-6 mb-6">
                    <div className="bg-white rounded-[2rem] p-6 shadow-lg border-l-[12px] border-blue-500">
                        <p className="text-xs text-slate-500 uppercase font-black">Pedidos Pendentes</p>
                        <h3 className="text-4xl font-black text-[#0f172a]">{entregas.length}</h3>
                    </div>

                    <div className="bg-white rounded-[2rem] p-6 shadow-lg border-l-[12px] border-emerald-500">
                        <p className="text-xs text-slate-500 uppercase font-black">Motoristas Online</p>
                        <h3 className="text-4xl font-black text-[#0f172a]">1</h3>
                    </div>

                    <div className="bg-white rounded-[2rem] p-6 shadow-lg border-l-[12px] border-blue-700">
                        <p className="text-xs text-slate-500 uppercase font-black">Status da Rota</p>
                        <h3 className="text-2xl font-black text-[#0f172a] uppercase">Aguardando</h3>
                    </div>
                </div>

                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h2 className="text-2xl font-black uppercase">Fila de Preparação</h2>
                        <p className="text-slate-400 text-sm">Organize e dispare as rotas otimizadas</p>
                    </div>

                    <div className="flex gap-3">
                        <button onClick={otimizarRotaTSP} className="bg-white text-slate-900 font-black px-6 py-3 rounded-xl shadow-md flex items-center gap-2 hover:bg-slate-100 transition">
                            <Zap size={18} className="text-orange-500" /> ⚡ OTIMIZAR (TSP)
                        </button>
                        <button onClick={dispararRota} className="bg-[#10b981] hover:bg-emerald-500 text-white font-black px-6 py-3 rounded-xl shadow-md flex items-center gap-2 transition active:scale-95">
                            <Send size={18} /> 🚀 DISPARAR ROTA
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-3 gap-6">
                    {entregas.map((e, idx) => (
                        <div key={e.id} className="bg-[#121b2e] rounded-[2.5rem] p-6 border border-[#1e293b] relative">
                            <div className="absolute left-0 top-4 bottom-4 w-1 bg-blue-500 rounded-r-full" />
                            <div className="flex justify-between items-start mb-3">
                                <h3 className="text-lg font-black uppercase truncate pr-8">{e.cliente}</h3>
                                <span className="bg-white text-black text-[10px] font-black px-3 py-1 rounded-full uppercase">{e.tipo || 'Entrega'}</span>
                            </div>
                            <p className="text-slate-400 text-sm mb-2 flex items-center gap-2"><MapPin size={14} /> {e.endereco}</p>
                            <div className="bg-[#0a1631] rounded-xl p-3 mb-3">
                                <p className="text-sm italic text-slate-300">{e.observacoes || 'Sem instruções'}</p>
                            </div>

                            <div className="flex justify-between items-center">
                                <div className="text-slate-400 text-xs">#{idx + 1}</div>
                                <button onClick={() => removerEntrega(e.id)} className="text-red-500 text-xs font-black uppercase hover:underline flex items-center gap-2">
                                    <Trash2 size={14} /> Remover
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Right: Sidebar fixed w-96 */}
            <aside className="w-96 bg-[#121b2e] rounded-[3rem] p-6 border border-slate-800 shadow-2xl">
                <h3 className="text-xl font-black uppercase mb-4">Status da Operação</h3>
                <p className="text-slate-500 text-xs font-bold uppercase mb-4">Rotas recentes</p>

                <div className="space-y-3 overflow-y-auto max-h-[60vh] pr-2 custom-scrollbar">
                    {entregas.slice(0, 5).map((r, i) => (
                        <div key={r.id} className="bg-[#0a1631] p-4 rounded-xl border border-slate-800 flex justify-between items-center">
                            <div>
                                <p className="font-black text-sm uppercase">{r.cliente}</p>
                                <p className="text-[10px] text-slate-400">#{i + 1} • {r.tipo || 'Entrega'}</p>
                            </div>
                            <div className="w-3 h-3 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]" />
                        </div>
                    ))}
                </div>
            </aside>

            {/* Toast */}
            {toast ? <div className={`fixed right-6 bottom-6 z-50 px-4 py-3 rounded-lg shadow-lg ${toast.type === 'success' ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'}`}>{toast.message}</div> : null}
        </div>
    );
}
