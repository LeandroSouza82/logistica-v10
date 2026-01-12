import React, { useEffect, useState } from 'react';
import { supabase } from '../supabase';

const ClientesHistorico = ({ open, onClose, onSelect }) => {
    const [items, setItems] = useState([]);
    const [q, setQ] = useState('');
    const [loading, setLoading] = useState(false);
    const [selectedId, setSelectedId] = useState(null);

    useEffect(() => {
        if (!open) return;
        let mounted = true;
        const fetch = async () => {
            setLoading(true);
            try {
                const { data, error } = await supabase.from('entregas').select('cliente, endereco');
                if (error) throw error;
                // deduplicate by cliente + endereco
                const map = new Map();
                (data || []).forEach(r => {
                    const key = (r.cliente || '').trim().toLowerCase() + '||' + (r.endereco || '').trim().toLowerCase();
                    if (!map.has(key) && r.cliente) map.set(key, { cliente: r.cliente, endereco: r.endereco });
                });
                if (mounted) setItems(Array.from(map.values()).sort((a, b) => (a.cliente || '').localeCompare(b.cliente || '')));
            } catch (e) {
                console.error('Erro buscando histórico de entregas', e?.message || e);
                setItems([]);
            } finally {
                if (mounted) setLoading(false);
            }
        };
        fetch();
        return () => { mounted = false; };
    }, [open]);

    const filtered = items.filter(it => {
        if (!q) return true;
        const v = q.trim().toLowerCase();
        return (it.cliente || '').toLowerCase().includes(v) || (it.endereco || '').toLowerCase().includes(v);
    });

    const handleSelect = (it) => {
        setSelectedId(it.cliente + '|' + it.endereco);
        // small delay to show the check before closing so user gets feedback
        if (onSelect) onSelect(it);
    };

    if (!open) return null;

    return (
        <div className="clientes-historico-modal" role="dialog" aria-modal="true">
            <div className="historico-panel">
                <div className="historico-header">
                    <h3>Histórico de Clientes / Entregas</h3>
                    <button className="close-btn" onClick={onClose} aria-label="Fechar">✕</button>
                </div>

                <div className="historico-search">
                    <input
                        placeholder="Buscar cliente ou endereço..."
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        className="historico-search-input"
                        autoFocus
                    />
                </div>

                <div className="historico-list custom-scrollbar">
                    {loading ? (
                        <p className="text-slate-400">Carregando...</p>
                    ) : filtered.length === 0 ? (
                        <p className="text-slate-400">Nenhum cliente encontrado.</p>
                    ) : (
                        filtered.map((it) => (
                            <button
                                key={(it.cliente||'') + '|' + (it.endereco||'')}
                                className="historico-item"
                                onClick={() => handleSelect(it)}
                            >
                                <div>
                                    <div className="historico-item-title"><strong>{it.cliente}</strong></div>
                                    <div className="historico-item-sub">{it.endereco || '—'}</div>
                                </div>
                                <div className="historico-item-actions">
                                    {selectedId === (it.cliente + '|' + it.endereco) ? (
                                        <span className="check">✓</span>
                                    ) : (
                                        <span className="chevron">›</span>
                                    )}
                                </div>
                            </button>
                        ))
                    )}
                </div>

                <div style={{ padding: 12, borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                    <button className="btn-ghost" onClick={onClose}>Fechar</button>
                </div>
            </div>
        </div>
    );
};

export default ClientesHistorico;
