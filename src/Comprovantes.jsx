import React, { useEffect, useState } from 'react';
import { supabase } from './supabase';

// Comprovantes: lista comprovantes (assinaturas) com download e compartilhamento
export default function Comprovantes() {
    const [comprovantes, setComprovantes] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        fetchComprovantes();
    }, []);

    async function fetchComprovantes() {
        setLoading(true);
        try {
            // Busca entregas que possuem assinatura ou coordenadas de entrega
            const { data, error } = await supabase.from('entregas').select('*').or('assinatura.not.is.null,lat.not.is.null,lng.not.is.null').order('id', { ascending: false });
            if (error) throw error;
            setComprovantes(data || []);
        } catch (err) {
            console.error('Erro ao buscar comprovantes:', err);
            setComprovantes([]);
        } finally {
            setLoading(false);
        }
    }

    // Gera imagem do comprovante em um canvas e dispara download como PNG
    async function downloadComprovanteAsImage(item) {
        try {
            const canvasW = 900;
            const canvasH = 600;
            const canvas = document.createElement('canvas');
            canvas.width = canvasW;
            canvas.height = canvasH;
            const ctx = canvas.getContext('2d');

            // fundo branco
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, canvasW, canvasH);

            // Título
            ctx.fillStyle = '#111';
            ctx.font = '20px Arial';
            ctx.fillText('Comprovante de Entrega', 20, 40);

            // Cliente e data
            ctx.font = '16px Arial';
            ctx.fillText(`Cliente: ${item.cliente || '—'}`, 20, 80);
            const dt = item.criado_em ? new Date(item.criado_em) : (item.updated_at ? new Date(item.updated_at) : new Date());
            ctx.fillText(`Data/hora: ${dt.toLocaleString()}`, 20, 110);

            // Coordenadas / link
            const lat = item.lat != null ? item.lat : '';
            const lng = item.lng != null ? item.lng : '';
            const coordText = (lat && lng) ? `${Number(lat).toFixed(6)}, ${Number(lng).toFixed(6)}` : 'Não disponível';
            ctx.fillText(`Localização: ${coordText}`, 20, 140);
            if (lat && lng) {
                const mapsLink = `https://maps.google.com/?q=${Number(lat)},${Number(lng)}`;
                ctx.fillStyle = '#0366d6';
                ctx.fillText(mapsLink, 20, 170);
                ctx.fillStyle = '#111';
            }

            // Desenha a assinatura (se houver) — usa campo `assinatura` (base64/dataURL)
            if (item.assinatura) {
                await drawImageOnCanvas(ctx, item.assinatura, 20, 200, 860, 320);
            } else {
                ctx.fillStyle = '#666';
                ctx.fillText('Sem assinatura disponível', 20, 220);
            }

            // baixar
            const dataUrl = canvas.toDataURL('image/png');
            const a = document.createElement('a');
            a.href = dataUrl;
            a.download = `comprovante_entrega_${item.id || Date.now()}.png`;
            document.body.appendChild(a);
            a.click();
            a.remove();
        } catch (err) {
            console.error('Erro ao gerar comprovante:', err);
            alert('Erro ao gerar comprovante. Veja console para detalhes.');
        }
    }

    // helper para desenhar imagem (base64/dataURL ou URL)
    async function drawImageOnCanvas(ctx, src, x, y, w, h) {
        // tenta desenhar direto com Image() (funciona para dataURLs e para URLs CORS-enabled)
        try {
            return await new Promise((resolve, reject) => {
                const img = new Image();
                img.crossOrigin = 'anonymous';
                img.onload = () => {
                    const ratio = Math.min(w / img.width, h / img.height);
                    const dw = img.width * ratio;
                    const dh = img.height * ratio;
                    const dx = x + (w - dw) / 2;
                    const dy = y + (h - dh) / 2;
                    ctx.drawImage(img, dx, dy, dw, dh);
                    resolve();
                };
                img.onerror = (e) => reject(e);
                img.src = src;
            });
        } catch (err) {
            // fallback: busca como blob e usa objectURL para evitar problemas de CORS
            try {
                const res = await fetch(src);
                const blob = await res.blob();
                return await new Promise((resolve, reject) => {
                    const img = new Image();
                    const url = URL.createObjectURL(blob);
                    img.onload = () => {
                        const ratio = Math.min(w / img.width, h / img.height);
                        const dw = img.width * ratio;
                        const dh = img.height * ratio;
                        const dx = x + (w - dw) / 2;
                        const dy = y + (h - dh) / 2;
                        ctx.drawImage(img, dx, dy, dw, dh);
                        URL.revokeObjectURL(url);
                        resolve();
                    };
                    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
                    img.src = url;
                });
            } catch (e) {
                throw e;
            }
        }
    }

    function shareViaWhatsApp(item) {
        const lat = item.lat != null ? item.lat : '';
        const lng = item.lng != null ? item.lng : '';
        const mapsLink = (lat && lng) ? `https://maps.google.com/?q=${Number(lat)},${Number(lng)}` : 'Localização não disponível';
        const dt = item.criado_em ? new Date(item.criado_em) : (item.updated_at ? new Date(item.updated_at) : new Date());
        const msg = `Olá, segue comprovante de entrega para ${item.cliente || ''}. Assinado em ${dt.toLocaleString()}. Localização confirmada via GPS: ${mapsLink}`;
        const url = `https://wa.me/?text=${encodeURIComponent(msg)}`;
        window.open(url, '_blank');
    }

    return (
        <div style={{ padding: 16 }}>
            <h2>Comprovantes de Entrega</h2>
            {loading && <p>Carregando...</p>}
            {!loading && comprovantes.length === 0 && <p>Nenhum comprovante registrado.</p>}
            <div className="max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                <div style={{ display: 'grid', gap: 12 }}>
                    {comprovantes.map(c => (
                        <div key={c.id} style={{ background: 'var(--card-dark)', padding: 12, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div>
                                <div style={{ fontWeight: '700' }}>{c.cliente}</div>
                                <div style={{ color: '#9aa4b2', fontSize: 13 }}>{(c.criado_em || c.updated_at) ? new Date(c.criado_em || c.updated_at).toLocaleString() : '—'}</div>
                                <div style={{ fontSize: 13, color: '#9aa4b2' }}>{c.lat != null ? `${Number(c.lat).toFixed(6)}, ${Number(c.lng).toFixed(6)}` : 'Localização: —'}</div>
                            </div>

                            <div style={{ display: 'flex', gap: 8 }}>
                                <button onClick={() => downloadComprovanteAsImage(c)} className="btn-primary">Baixar Comprovante</button>
                                <button onClick={() => shareViaWhatsApp(c)} className="btn-secondary">WhatsApp</button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
