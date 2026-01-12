import React, { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { Zap, Send, Trash2, MapPin } from 'lucide-react';

export default function CentralDespacho() {
    const [entregas, setEntregas] = useState([]);
    const [loading, setLoading] = useState(false);
    const [toast, setToast] = useState(null);
    const [motoristas, setMotoristas] = useState([]);
    const [selectedMotorista, setSelectedMotorista] = useState(null);
    const [otimizada, setOtimizada] = useState(false);

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

    const getRemoveButtonClass = (type) => {
        if (!type) return 'remove-entrega';
        const t = String(type).toLowerCase();
        if (t.includes('recol')) return 'remove-recolha';
        if (t.includes('outro') || t.includes('ata') || t.includes('atas')) return 'remove-outros';
        return 'remove-entrega';
    };

    const carregarEntregas = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase.from('entregas').select('*').eq('status', 'em_preparacao').order('ordem_rota', { ascending: true });
            if (error) throw error;
            setEntregas(data || []);
        } catch (e) {
            console.warn(e);
            showToast('Erro ao carregar entregas', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { carregarEntregas(); carregarMotoristas(); }, []);

    const carregarMotoristas = async () => {
        try {
            const { data, error } = await supabase.from('motoristas').select('*').eq('ativo', true).order('nome', { ascending: true });
            if (error) throw error;
            setMotoristas(data || []);
        } catch (e) {
            console.warn(e);
            showToast('Erro ao carregar motoristas', 'error');
        }
    };


    const otimizarRotaTSP = async () => {
        if (entregas.length < 2) { showToast('Precisamos de ao menos 2 entregas', 'error'); return; }
        setLoading(true);
        // placeholder: ordenação por índice atual (ou implementar TSP real usando OSRM)
        const otimizadas = [...entregas].sort((a, b) => (a.ordem_rota ?? 0) - (b.ordem_rota ?? 0));
        try {
            await Promise.all(otimizadas.map((e, i) => supabase.from('entregas').update({ ordem_rota: i + 1 }).eq('id', e.id)));
            setEntregas(otimizadas);
            setOtimizada(true);
            showToast('Rota otimizada', 'success');
        } catch (e) {
            console.warn(e);
            showToast('Erro ao salvar ordem', 'error');
        } finally {
            setLoading(false);
        }
    };

    const dispararRota = async () => {
        if (!otimizada) { showToast('Otimize a rota antes de disparar', 'error'); return; }
        if (!selectedMotorista) { showToast('Selecione um motorista', 'error'); return; }

        setLoading(true);
        try {
            await Promise.all(entregas.map(e => supabase.from('entregas').update({ status: 'em_rota', motorista_id: selectedMotorista }).eq('id', e.id)));
            // atualiza localmente
            setEntregas([]);
            setOtimizada(false);
            showToast('Rota disparada', 'success');
        } catch (e) {
            console.warn(e);
            showToast('Erro ao disparar rota', 'error');
        } finally {
            setLoading(false);
            carregarEntregas();
        }
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

                    <div className="preparacao-list">
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
                                        <button onClick={() => removerEntrega(e.id)} className={`entrega-remove ${getRemoveButtonClass(e.tipo)}`} aria-label={`Remover entrega ${e.cliente}`} title={`Remover ${e.cliente}`}>
                                            <Trash2 size={14} /> Remover
                                        </button>
                                    </div>
                                </article>
                            ))}
                        </div>
                    </div>

                    <div className="form-actions mt-6 items-center">
                        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                            <button onClick={otimizarRotaTSP} className="btn-opt flex items-center gap-2" disabled={loading}>
                                <span aria-hidden="true">⚡</span>
                                <span>⚡ OTIMIZAR (TSP)</span>
                            </button>

                            <select value={selectedMotorista || ''} onChange={(e) => setSelectedMotorista(e.target.value ? Number(e.target.value) : null)} className="form-input" style={{ minWidth: 220 }}>
                                <option value="">Selecione o motorista</option>
                                {motoristas.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
                            </select>
                        </div>

                        <button onClick={dispararRota} className="btn-send flex items-center gap-2" disabled={!otimizada || !selectedMotorista || loading}>
                            <span aria-hidden="true">🚀</span>
                            <span>🚀 DISPARAR ROTA</span>
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
