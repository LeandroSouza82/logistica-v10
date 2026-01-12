import React, { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { Zap, Send, Trash2, MapPin } from 'lucide-react';

export default function CentralDespacho() {
    const [entregas, setEntregas] = useState([]);
    const [loading, setLoading] = useState(false);
    const [toast, setToast] = useState(null);

    const getDotClass = (type) => {
        if (!type) return 'entrega';
        const t = String(type).toLowerCase();
        if (t.includes('recol')) return 'recolha';
        if (t.includes('outro') || t.includes('ata') || t.includes('atas')) return 'outros';
        return 'entrega';
    };

    const getServiceClass = (type) => {
        if (!type) return 'svc-default';
        const t = String(type).toLowerCase();
        if (t.includes('recol')) return 'svc-recolha';
        if (t.includes('outro') || t.includes('ata') || t.includes('atas')) return 'svc-outros';
        return 'svc-entrega';
    };

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

                <div className="bg-[#1e293b] rounded-3xl p-8 shadow-2xl border border-slate-800">
                    <h2 className="text-2xl font-black text-slate-200 mb-6">Fila de Preparação</h2>
                    <p className="text-slate-400 text-sm mb-6">Organize e dispare as rotas otimizadas</p>

                    <div className="entregas-grid">
                        {entregas.map((e, idx) => (
                            <article key={e.id} className={`entrega-card ${getServiceClass(e.tipo)}`}>
                                <div className="entrega-accent" aria-hidden={true} />
                                <div className="entrega-header">
                                    <h3 className="entrega-titulo truncate">{e.cliente}</h3>
                                    <span className="entrega-tipo">{e.tipo || 'Entrega'}</span>
                                </div>

                                <p className="entrega-endereco"><MapPin size={14} /> {e.endereco}</p>

                                <div className="entrega-observacoes">
                                    <p className="text-sm italic text-slate-300">{e.observacoes || 'Sem instruções'}</p>
                                </div>

                                <div className="entrega-actions">
                                    <div className="text-slate-400 text-xs">#{idx + 1}</div>
                                    <button onClick={() => removerEntrega(e.id)} className="entrega-remove" aria-label={`Remover entrega ${e.cliente}`} title={`Remover ${e.cliente}`}>
                                        <Trash2 size={14} /> Remover
                                    </button>
                                </div>
                            </article>
                        ))}
                    </div>

                    <div className="form-actions mt-6">
                        <button onClick={otimizarRotaTSP} className="btn-opt flex items-center gap-2">
                            <span aria-hidden="true">⚡</span>
                            <span>Otimizar Sequência</span>
                        </button>

                        <button onClick={dispararRota} className="btn-send flex items-center gap-2">
                            <span aria-hidden="true">🚀</span>
                            <span>Enviar para Motorista</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Right: Sidebar fixed w-96 */}
            <aside className="sidebar-status">
                <div className="status-header">
                    <h3 className="text-xl font-black uppercase mb-2">Status da Operação</h3>
                    <p className="text-slate-500 text-xs font-bold uppercase mb-4">Rotas recentes</p>
                </div>

                <div className="rotas-list custom-scrollbar">
                    {entregas.slice(0, 5).map((r, i) => (
                        <div key={r.id} className="rota-card">
                            <div>
                                <p className="rota-cliente font-black text-sm uppercase">{r.cliente}</p>
                                <p className="text-[10px] text-slate-400">#{i + 1} • {r.tipo || 'Entrega'}</p>
                            </div>
                            <div className={`status-dot delivered ${getDotClass(r.tipo)}`} aria-hidden="true" />
                        </div>
                    ))}
                </div>
            </aside>

            {/* Toast */}
            {toast ? <div className={`fixed right-6 bottom-6 z-50 px-4 py-3 rounded-lg shadow-lg ${toast.type === 'success' ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'}`}>{toast.message}</div> : null}
        </div>
    );
}
