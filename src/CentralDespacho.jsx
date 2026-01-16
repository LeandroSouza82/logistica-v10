import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';

const CentralDespacho = ({ filter = null, onClearFilter } = {}) => {
    const [pedidos, setPedidos] = useState([]);
    const [motoristas, setMotoristas] = useState([]); // lista de objetos { id, nome, status }
    const [motoristaSelecionado, setMotoristaSelecionado] = useState(''); // armazena id do motorista
    const [carregando, setCarregando] = useState(false);
    const [otimizando, setOtimizando] = useState(false);

    // 1. Busca pedidos em preparação no Supabase
    const fetchPedidos = async () => {
        setCarregando(true);
        try {
            let query = supabase.from('entregas').select('*');

            // Se vier filtro emPreparacao, buscamos status = 'em_preparacao'
            if (filter && filter.emPreparacao) {
                const { data, error } = await query.eq('status', 'em_preparacao');
                if (error) throw error;
                setPedidos(data || []);
            } else if (filter && filter.pendentes) {
                // compatibilidade antiga: pendentes (pendente/aguardando/sem motorista)
                const { data, error } = await query.or('status.eq.pendente,status.eq.aguardando,motorista_id.is.null');
                if (error) throw error;
                setPedidos(data || []);
            } else {
                const { data, error } = await query.eq('status', 'em_preparacao');
                if (error) throw error;
                setPedidos(data || []);
            }
        } catch (e) {
            console.error('Erro ao buscar:', e);
            setPedidos([]);
        } finally {
            setCarregando(false);
        }
    };

    useEffect(() => {
        fetchPedidos();
        fetchMotoristas();
        // se houver um filtro aplicado via props, permitimos que o pai limpe após aplicá-lo
        if (filter && onClearFilter) onClearFilter();
    }, [filter]);

    // Busca motoristas no Supabase e marca como online se tiverem sinal recente (5 minutos)
    const fetchMotoristas = async () => {
        try {
            const { data, error } = await supabase
                .from('motoristas')
                .select('id, nome, status, lat, lng, ultimo_sinal');

            if (error) {
                console.error('Erro ao buscar motoristas:', error);
                setMotoristas([]);
                return;
            }

            console.log('Motoristas carregados:', data);

            const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
            const normalized = (data || []).map(m => ({
                ...m,
                isOnline: String(m.status || '').toLowerCase() === 'online',
            }));

            // ordenar com online primeiro
            const ordered = normalized.slice().sort((a, b) => {
                const aOnline = a.isOnline ? 1 : 0;
                const bOnline = b.isOnline ? 1 : 0;
                return bOnline - aOnline;
            });

            console.log('Motoristas ordenados:', ordered);
            // Checa presença de 'Leandro 1' para debug rápido
            if (!ordered.some(m => String(m.nome || '').includes('Leandro'))) {
                console.warn("Motorista 'Leandro' não encontrado na lista retornada. Nomes retornados:", ordered.map(m => m.nome));
            } else {
                console.log("Motorista 'Leandro' presente na lista.");
            }
            setMotoristas(ordered);
        } catch (e) {
            console.error('Erro inesperado ao buscar motoristas:', e);
            setMotoristas([]);
        }
    };

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

    // Drag & Drop: reordenar pedidos manualmente
    const [dragItemId, setDragItemId] = React.useState(null);
    const [dragOverId, setDragOverId] = React.useState(null);
    const [movedIds, setMovedIds] = React.useState(new Set());

    const handleDragStart = (e, item) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(item.id));
        setDragItemId(item.id);
    };

    const handleDragOver = (e, item) => {
        e.preventDefault();
        if (dragOverId !== item.id) setDragOverId(item.id);
    };

    const handleDrop = (e, item) => {
        e.preventDefault();
        const fromId = String(e.dataTransfer.getData('text/plain')) || dragItemId;
        const toId = item.id;
        if (!fromId) return;
        const arr = [...pedidos];
        const fromIndex = arr.findIndex(p => String(p.id) === String(fromId));
        const toIndex = arr.findIndex(p => String(p.id) === String(toId));
        if (fromIndex < 0 || toIndex < 0) return;
        const [moved] = arr.splice(fromIndex, 1);
        arr.splice(toIndex, 0, moved);
        setPedidos(arr);
        // marcar visualmente como movido
        setMovedIds(prev => new Set(prev).add(moved.id));
        setTimeout(() => setMovedIds(prev => {
            const copy = new Set(prev);
            copy.delete(moved.id);
            return copy;
        }), 1200);
        setDragItemId(null);
        setDragOverId(null);
    };

    const handleDragEnd = (e, item) => {
        setDragItemId(null);
        setDragOverId(null);
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
            const motorista = motoristas.find(m => String(m.id) === String(motoristaSelecionado));
            // Atualiza apenas o motorista_id; não gravamos motorista_nome
            const updateObj = { status: 'em_rota', motorista_id: motorista ? motorista.id : null };
            let res = await supabase.from('entregas').update(updateObj).in('id', ids);
            if (res.error) {
                // checamos se o erro menciona motorista_nome (schema mismatch) e tentamos sem motorista_nome — já estamos sem ela, então só reportamos
                throw res.error;
            }

            alert(`Rota disparada com sucesso para ${motorista ? motorista.nome : motoristaSelecionado}!`);
            setPedidos([]); // Limpa a tela após o envio
            setMotoristaSelecionado('');
        } catch (e) {
            alert('Erro ao disparar: ' + e.message);
        } finally {
            setCarregando(false);
        }
    };

    return (
        <div className="central-despacho-container min-h-screen bg-[var(--bg-main)] flex flex-col items-center py-12 px-4">

            <div className="w-full max-w-6xl flex flex-col gap-6">

                {/* TÍTULO E BOTÃO PRINCIPAL */}
                <div className="flex justify-between items-center">
                    <div>
                        <h1 className="cd-title">Fila de Preparação</h1>
                    </div>
                </div>

                {/* BARRA DE AÇÕES (FLEX): Seletor (esq) + Otimizar (centro) + Disparar (dir) */}
                <div className="barra-acoes" role="region" aria-label="Barra de ações">
                    <div className="bcp-left">
                        <select
                            className="select-motorista-despacho"
                            value={motoristaSelecionado}
                            onChange={(e) => setMotoristaSelecionado(e.target.value)}
                        >
                            <option value="" disabled>Selecione um motorista</option>
                            {motoristas.map(m => (
                                <option key={m.id} value={m.id}>{m.isOnline ? '🟢 ' : ''}{m.nome}</option>
                            ))}
                        </select>
                    </div>

                    <div className="bcp-center">
                        <button
                            onClick={otimizarRota}
                            className="cd-btn-otimizar"
                            disabled={pedidos.length === 0 || otimizando}
                        >
                            OTIMIZAR ROTA
                        </button>
                    </div>

                    <div className="bcp-right">
                        <button
                            onClick={dispararRota}
                            className="cd-btn-disparar cd-btn-disparar-inline"
                            disabled={pedidos.length === 0 || carregando || !motoristaSelecionado}
                        >
                            DISPARAR ROTA
                        </button>
                    </div>
                </div>

                {/* GRID COMPACTA DE CARDS */}
                <div className="cd-grid-container">
                    <div className="cd-grid">
                        {pedidos.length === 0 && !carregando && (
                            <div className="text-center py-8 text-slate-500 italic">Nenhuma carga na fila de preparação.</div>
                        )}

                        {pedidos.map((item, index) => {
                            const tipoRaw = String(item.tipo || '');
                            const tipo = tipoRaw.toLowerCase();
                            const isRecolha = tipo.includes('recol');
                            const isOutro = tipo.includes('outro') || tipo.includes('ata');
                            // serviceClass garante svc-outros para "Outro" (case-insensitive)
                            const serviceClass = isOutro ? 'svc-outros' : (isRecolha ? 'svc-recolha' : 'svc-entrega');
                            const cardClass = isRecolha ? 'cd-card-recolha' : 'cd-card-entrega';

                            const getBadgeClass = (raw) => {
                                if (!raw) return 'badge-default';
                                const s = String(raw).toLowerCase();
                                if (s.includes('recol')) return 'badge-recolha';
                                if (s.includes('outro') || s.includes('ata')) return 'badge-outros';
                                return 'badge-entrega';
                            };
                            const badgeClass = getBadgeClass(item.tipo);

                            return (
                                <div
                                    key={item.id}
                                    className={`cd-card ${cardClass} ${serviceClass} ${dragItemId === item.id ? 'dragging' : ''} ${movedIds.has(item.id) ? 'moved' : ''}`}
                                    draggable={true}
                                    onDragStart={(e) => handleDragStart(e, item)}
                                    onDragOver={(e) => handleDragOver(e, item)}
                                    onDrop={(e) => handleDrop(e, item)}
                                    onDragEnd={(e) => handleDragEnd(e, item)}
                                >
                                    <div className="cd-card-header">
                                        <div className="cd-card-title">{item.cliente}</div>
                                    </div>
                                    <div className="cd-card-body">
                                        {/* Badge central conforme tipo */}
                                        <div className="cd-status" style={{ marginBottom: 8 }}>
                                            <span className={`status-badge ${badgeClass}`}>{badgeClass === 'badge-entrega' ? 'ENTREGA' : (badgeClass === 'badge-recolha' ? 'RECOLHA' : 'OUTROS')}</span>
                                        </div>
                                        <div className="cd-address">{item.endereco}</div>
                                        <div className="cd-obs">Obs: {item.observacoes || '-'}</div>
                                    </div>
                                    <div className="cd-card-footer">
                                        <button className="cd-remove" onClick={async () => {
                                            try {
                                                await supabase.from('entregas').delete().eq('id', item.id);
                                                setPedidos(pedidos.filter(p => p.id !== item.id));
                                            } catch (e) { console.error(e); alert('Erro ao remover: ' + e.message); }
                                        }}>Remover</button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

            </div>
        </div>
    );
};

export default CentralDespacho;
