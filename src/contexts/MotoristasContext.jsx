import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../supabase';

const MotoristasContext = createContext(null);

const normalizeMotorista = (m) => {
    if (!m) return m;
    const latSrc = m.latitude ?? m.lat;
    const lngSrc = m.longitude ?? m.lng;
    return {
        ...m,
        lat: latSrc != null ? Number(latSrc) : (m.lat != null ? Number(m.lat) : undefined),
        lng: lngSrc != null ? Number(lngSrc) : (m.lng != null ? Number(m.lng) : undefined),
    };
};

export const MotoristasProvider = ({ children }) => {
    const [motoristas, setMotoristas] = useState([]);
    const [activeDriver, setActiveDriver] = useState(null);
    const [activeMarker, setActiveMarker] = useState(null);

    const isDriverActive = (m) => {
        if (!m) return false;
        if (m.isOnline) return true;
        const s = String(m.status || '').toLowerCase();
        if (s.includes('online') || s.includes('log') || s.includes('logado')) return true;
        return false;
    };

    useEffect(() => {
        let canal = null;
        const fetchInitial = async () => {
            try {
                const { data: mData } = await supabase.from('motoristas').select('*');
                if (mData) setMotoristas(mData.map(normalizeMotorista));

                const { data: locData } = await supabase.from('localizacoes').select('*').order('created_at', { ascending: false }).limit(1000);
                if (locData && locData.length > 0) {
                    const latestByMotorista = {};
                    for (const l of locData) {
                        const id = String(l.motorista_id);
                        if (!latestByMotorista[id]) latestByMotorista[id] = l;
                    }
                    setMotoristas(prev => prev.map(m => {
                        const l = latestByMotorista[String(m.id)];
                        if (l && l.lat != null && l.lng != null) return { ...m, lat: Number(l.lat), lng: Number(l.lng), ultimo_sinal: l.created_at || m.ultimo_sinal };
                        return m;
                    }));
                }
            } catch (e) {
                console.warn('Erro ao buscar motoristas iniciais:', e?.message || e);
            }
        };
        fetchInitial();

        canal = supabase
            .channel('realtime-motoristas')
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'motoristas' }, (payload) => {
                try {
                    const updated = normalizeMotorista(payload.new);
                    setMotoristas(prev => {
                        const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
                        const updatedWithOnline = { ...updated, isOnline: updated.ultimo_sinal ? (new Date(updated.ultimo_sinal) > fiveMinAgo) : false };
                        const found = prev.find(m => String(m.id) === String(updatedWithOnline.id));
                        if (found) return prev.map(m => String(m.id) === String(updatedWithOnline.id) ? { ...m, ...updatedWithOnline } : m);
                        return [updatedWithOnline, ...prev];
                    });

                    // if a driver logged out, clear activeMarker/activeDriver
                    try {
                        const isActiveNow = isDriverActive(updated);
                        if (!isActiveNow) {
                            setActiveMarker(prev => (prev && String(prev.id) === String(updated.id) ? null : prev));
                            setActiveDriver(prev => (prev && String(prev.id) === String(updated.id) ? null : prev));
                        }
                    } catch (e) { /* ignore */ }
                } catch (err) {
                    console.warn('Erro ao processar UPDATE em motoristas (context):', err);
                }
            })
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'localizacoes' }, (payload) => {
                try {
                    const loc = payload.new;
                    setMotoristas(prev => prev.map(m => (String(m.id) === String(loc.motorista_id) ? { ...m, lat: loc.lat, lng: loc.lng, ultimo_sinal: loc.created_at || m.ultimo_sinal || new Date().toISOString() } : m)));
                    // if this location is for activeDriver, update activeMarker
                    setActiveMarker(prev => (prev && String(prev.id) === String(loc.motorista_id) ? { ...prev, lat: Number(loc.lat), lng: Number(loc.lng) } : prev));
                } catch (err) {
                    console.warn('Erro ao processar INSERT em localizacoes (context):', err);
                }
            })
            .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'motoristas' }, (payload) => {
                try {
                    const old = payload.old;
                    setMotoristas(prev => prev.filter(m => String(m.id) !== String(old.id)));
                    setActiveDriver(prev => (prev && String(prev.id) === String(old.id) ? null : prev));
                    setActiveMarker(prev => (prev && String(prev.id) === String(old.id) ? null : prev));
                } catch (err) { console.warn('Erro ao processar DELETE em motoristas (context):', err); }
            })
            .subscribe();

        return () => {
            try { if (canal) supabase.removeChannel(canal); } catch (e) { /* ignore */ }
        };
    }, []);

    const openDriver = async (m) => {
        if (!m) return;
        setActiveDriver(m);
        if (m.lat != null && m.lng != null) {
            setActiveMarker({ id: m.id, lat: Number(m.lat), lng: Number(m.lng), nome: m.nome });
            return;
        }
        try {
            const { data } = await supabase.from('localizacoes').select('lat,lng,created_at').eq('motorista_id', m.id).order('created_at', { ascending: false }).limit(1);
            if (data && data.length > 0) {
                const l = data[0];
                if (l.lat != null && l.lng != null) setActiveMarker({ id: m.id, lat: Number(l.lat), lng: Number(l.lng), nome: m.nome });
            }
        } catch (err) {
            console.warn('Erro ao buscar posição do motorista no context:', err);
        }
    };

    return (
        <MotoristasContext.Provider value={{ motoristas, setMotoristas, activeDriver, setActiveDriver, activeMarker, setActiveMarker, openDriver, isDriverActive }}>
            {children}
        </MotoristasContext.Provider>
    );
};

export const useMotoristasContext = () => {
    const ctx = useContext(MotoristasContext);
    if (!ctx) throw new Error('useMotoristasContext must be used within MotoristasProvider');
    return ctx;
};

export default MotoristasContext;