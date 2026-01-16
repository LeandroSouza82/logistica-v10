import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from './supabase';
import { getGestorPhone } from './getGestorPhone';

// Comprovantes: lista comprovantes (assinaturas) com download e compartilhamento
export default function Comprovantes() {
    const [comprovantes, setComprovantes] = useState([]);
    const [loading, setLoading] = useState(false);
    const [showBackToTop, setShowBackToTop] = useState(false);
    const scrollRef = React.useRef(null);

    function handleScroll(e) {
        try {
            const st = e?.target?.scrollTop || 0;
            setShowBackToTop(st > 300);
        } catch (err) {
            /* ignore */
        }
    }

    // Pesquisa e preview
    const [searchTerm, setSearchTerm] = useState('');
    const [previewItem, setPreviewItem] = useState(null);
    // Compatibilidade API: setPedidoSelecionado abre o painel lateral (alias para preview)
    const setPedidoSelecionado = (item) => setPreviewItem(item);
    // Alias local usado por algumas integrações e instruções externas
    const pedidoSelecionado = previewItem;

    const filteredComprovantes = useMemo(() => {
        const q = String(searchTerm || '').trim().toLowerCase();
        if (!q) return comprovantes;
        return comprovantes.filter(c => String(c.cliente || '').toLowerCase().includes(q) || String(c.id || '').includes(q));
    }, [comprovantes, searchTerm]);

    // Helper para baixar imagens (dataURL ou URL)
    const downloadImage = async (src, filename = 'comprovante.png') => {
        try {
            if (!src) return;
            if (String(src).startsWith('data:')) {
                const a = document.createElement('a');
                a.href = src;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                a.remove();
                return;
            }
            const res = await fetch(src);
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        } catch (e) {
            console.warn('Erro ao baixar imagem:', e);
            alert('Não foi possível baixar a imagem. Verifique o console para mais detalhes.');
        }
    };

    // Helper: formata datas para horário de Brasília (Dashboard)
    const formatDateBR = (iso) => {
        if (!iso) return '—';
        try {
            return new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
        } catch (e) {
            return String(iso);
        }
    };

    // Helper: formata data+hora curta (dd/mm/yyyy, HH:MM) para Brasília
    const formatDateBRShort = (iso) => {
        if (!iso) return '—';
        try {
            return new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', hour12: false, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        } catch (e) { return String(iso); }
    };

    // Helper: resolve URL pública do Supabase storage para o bucket 'assinaturas' (prefere assinatura_url)
    const getAssinaturaSrc = (item) => {
        if (!item) return null;
        // Prefer assinatura_url, depois assinatura (base64)
        const src = item.assinatura_url || item.assinatura || null;
        if (!src) return null;
        // Se já for URL completa, retorne direto
        if (String(src).startsWith('http')) return src;
        // Se for base64 (data:) retorne direto
        if (String(src).startsWith('data:')) return src;
        // Construir URL pública usando host fixo (fallback explícito requisitado)
        const ASSINATURAS_BASE = 'https://uqxoadxqcwidxqsfayem.supabase.co/storage/v1/object/public/assinaturas/';
        return `${ASSINATURAS_BASE}${src}`;
    };

    useEffect(() => {
        fetchComprovantes();

        // Realtime: atualiza lista quando chegam updates/INSERTs que contenham assinatura
        const channel = supabase
            .channel('comprovantes-realtime')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'entregas' }, (payload) => {
                try {
                    const novo = payload.new || {};
                    const hasAssin = (novo.assinatura_url != null && novo.assinatura_url !== '') || (novo.assinatura != null && novo.assinatura !== '');
                    const concluido = (novo.status === 'Concluído') || (String(novo.status || '').toLowerCase() === 'concluido');

                    // Se não tem assinatura/coordenadas e não é concluído, ignore
                    if (!hasAssin && !(novo.lat_entrega != null && novo.lng_entrega != null) && !concluido) return;

                    // Coloca o item no topo (mais recente primeiro) quando apropriado
                    setComprovantes(prev => {
                        const filtered = prev.filter(p => p.id !== novo.id);
                        return [novo, ...filtered];
                    });
                } catch (e) {
                    console.warn('Erro no realtime de comprovantes:', e);
                }
            })
            .subscribe();

        return () => { try { supabase.removeChannel(channel); } catch (e) { /* ignore */ } };
    }, []);

    async function fetchComprovantes() {
        setLoading(true);
        try {
            // Busca todas as entregas e ordena por id (mais recentes primeiro)
            let { data, error } = await supabase
                .from('entregas')
                .select('*')
                .order('id', { ascending: false });

            // Se houver erro, logamos e mantemos comportamento defensivo
            if (error) {
                console.error('Erro ao buscar comprovantes:', error.message, error.details, error.hint);
            }

            setComprovantes(data || []);
        } catch (err) {
            if (err && typeof err === 'object') {
                console.error('Erro detalhado:', err.message, err.details, err.hint);
            } else {
                console.error('Erro ao buscar comprovantes:', err);
            }
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
            const lat = item.lat_entrega != null ? item.lat_entrega : '';
            const lng = item.lng_entrega != null ? item.lng_entrega : '';
            const coordText = (lat && lng) ? `${Number(lat).toFixed(6)}, ${Number(lng).toFixed(6)}` : 'Não disponível';
            ctx.fillText(`Localização: ${coordText}`, 20, 140);
            if (lat && lng) {
                const mapsLink = `https://maps.google.com/?q=${Number(lat)},${Number(lng)}`;
                ctx.fillStyle = '#0366d6';
                ctx.fillText(mapsLink, 20, 170);
                ctx.fillStyle = '#111';
            }

            // Desenha a assinatura (se houver) — usa campo `assinatura_url` (public URL) ou `assinatura` (base64)
            if (item.assinatura_url) {
                await drawImageOnCanvas(ctx, getAssinaturaSrc(item), 20, 200, 860, 320);
            } else if (item.assinatura) {
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

    async function shareViaWhatsApp(item) {
        const lat = item.lat_entrega != null ? item.lat_entrega : '';
        const lng = item.lng_entrega != null ? item.lng_entrega : '';
        const mapsLink = (lat && lng) ? `https://maps.google.com/?q=${Number(lat)},${Number(lng)}` : 'Localização não disponível';
        const dt = item.criado_em ? new Date(item.criado_em) : (item.updated_at ? new Date(item.updated_at) : new Date());
        const msg = `Olá, segue comprovante de entrega para ${item.cliente || ''}. Assinado em ${formatDateBR(item.updated_at || item.criado_em || new Date())}. Localização confirmada via GPS: ${mapsLink}`;

        // Busca o número do gestor do Supabase/localStorage (sem números hardcoded)
        const phoneDigits = await getGestorPhone();
        if (!phoneDigits) {
            alert('Número do gestor não configurado no sistema.');
            console.warn('shareViaWhatsApp: gestor phone not configured');
            return;
        }

        const url = `https://wa.me/${phoneDigits}?text=${encodeURIComponent(msg)}`;
        window.open(url, '_blank');
    }

    return (
        <div style={{ padding: 16 }}>
            <h2>Comprovantes de Entrega</h2>
            {loading && <p>Carregando...</p>}
            {!loading && comprovantes.length === 0 && <p>Nenhum comprovante registrado.</p>}

            {/* Barra de busca */}
            <div style={{ marginBottom: 12 }}>
                <input
                    type="search"
                    className="comprovantes-search"
                    placeholder="Buscar por cliente ou ID"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    aria-label="Pesquisar comprovantes"
                />
            </div>

            {/* Copilot, vamos realizar o ajuste final na altura da caixa de visualização (div principal). O objetivo é que apareçam exatamente 2 cards inteiros e a metade do terceiro, sinalizando que há mais conteúdo abaixo. Siga estas instruções:

            AJUSTE DA ALTURA DA JANELA:

            Altere a altura da div que contém a lista de 780px para 470px.

            Mantenha o overflow-y: 'scroll' e a barra de rolagem branca sempre visível.

            CONSERVAÇÃO TOTAL (NÃO MEXER EM NADA MAIS):

            Cards: Mantenha a altura de 180px.

            Layout 50/50: Mantenha informações na esquerda e botões na direita.

            Olho (👁️): Mantenha no canto superior direito com a função de abrir/fechar.

            Botões: Mantenha 'Baixar' e 'WhatsApp' alinhados horizontalmente com flex: 1.

            Botão Voltar ao Topo: Mantenha a lógica de aparecer após 300px de scroll.

            Horário: Mantenha o fuso de Brasília (16:22).

            LISTA INFINITA: Certifique-se de que a div interna continue crescendo conforme novas assinaturas chegam, permitindo o scroll por todos os registros. */}
            <div className="comprovantes-scrollbar container-lista-comprovantes" style={{ height: '470px', overflowY: 'scroll', display: 'block', paddingRight: '10px' }}>
                <div className="comprovantes-list" style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingRight: 10, height: 'auto' }}>
                    {filteredComprovantes.map(c => (
                        <div key={c.id} className="comprovantes-card" style={{ position: 'relative', background: 'var(--card-dark)', padding: 12, paddingBottom: 20, borderRadius: 8, display: 'flex', flexDirection: 'row', gap: 12, alignItems: 'stretch', minHeight: 180 }}>
                            {/* Lado esquerdo - Informações (50%) */}
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                                <div style={{ fontWeight: '800', fontSize: 16 }}>{c.cliente}</div>
                                <div style={{ color: '#9aa4b2', fontSize: 13, marginTop: 6 }}>#{c.id}</div>
                                <div style={{ color: '#9aa4b2', fontSize: 13, marginTop: 6 }}>{c.created_at ? formatDateBRShort(c.created_at) : (c.updated_at ? formatDateBRShort(c.updated_at) : '—')}</div>
                                <div style={{ fontSize: 13, color: '#9aa4b2', marginTop: 8 }}>{(c.lat_entrega != null && c.lng_entrega != null) ? (<a href={`https://www.google.com/maps?q=${Number(c.lat_entrega)},${Number(c.lng_entrega)}`} target="_blank" rel="noreferrer">📍 Ver Localização Exata</a>) : 'GPS não capturado'}</div>
                            </div>

                            {/* Lado direito - Ações (50%) centralizado */}
                            <div style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', paddingTop: 15 }}>
                                {/* Olho centralizado acima dos botões */}
                                <div style={{ alignSelf: 'center', marginBottom: 12 }}>
                                    <button className="btn-preview" title="Visualizar" onClick={() => { const pedidoSelecionado = previewItem; const item = c; (pedidoSelecionado && pedidoSelecionado.id === item.id) ? setPedidoSelecionado(null) : setPedidoSelecionado(item); }} style={{ position: 'absolute', top: '10px', right: '10px', zIndex: 50, cursor: 'pointer', fontSize: '24px' }}>👁️</button>
                                </div>

                                {/* Linha de botões (Baixar | WhatsApp) */}
                                <div style={{ display: 'flex', flexDirection: 'row', gap: 10, width: '100%', justifyContent: 'center' }}>
                                    <button onClick={() => { const src = getAssinaturaSrc(c); if (src) downloadImage(src, `comprovante_${c.id}.png`); else downloadComprovanteAsImage(c); }} style={{ flex: 1, height: 48, display: 'flex', justifyContent: 'center', alignItems: 'center' }} className="btn-primary">Baixar</button>
                                    <button onClick={() => shareViaWhatsApp(c)} style={{ flex: 1, height: 48, display: 'flex', justifyContent: 'center', alignItems: 'center', backgroundColor: '#25D366', color: '#fff', border: 'none' }} className="btn-whatsapp">WhatsApp</button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Drawer lateral de visualização (Dashboard) */}
            {/* Copilot, as assinaturas estão no banco, mas o link da imagem está quebrado no Dashboard. Vamos corrigir apenas a exibição da assinatura de forma cirúrgica:

            URL DE ARMAZENAMENTO CORRETA:

            Localize a tag <img> dentro da gaveta/modal lateral.

            Use este formato exato para o src, garantindo que o caminho do bucket 'assinaturas' esteja correto: src={`https://uqxoadxqcwidxqsfayem.supabase.co/storage/v1/object/public/assinaturas/${pedidoSelecionado.assinatura_url}` }.

            LIMPEZA DO CAMINHO:

            Para evitar erro de barras duplas, use: pedidoSelecionado.assinatura_url?.replace(/^\//, '').

            GARANTIR CONTRASTE E ATUALIZAÇÃO:

            Adicione key={pedidoSelecionado.id} na tag <img> para forçar o recarregamento ao trocar de pedido.

            Mantenha o fundo branco na imagem: style={{ backgroundColor: '#FFFFFF', padding: '10px', width: '100%', borderRadius: '8px' }}.

            REGRAS DE OURO (NÃO ALTERAR):

            NÃO mexa na altura dos cards (180px) ou no layout 50/50.

            NÃO altere a posição do Olho (👁️) no canto superior direito.

            NÃO altere a caixa de scroll (470px) ou os botões Baixar/WhatsApp. */}

            {/* Copilot, otimização de carregamento (lazy + resize):

            LAZY LOADING: adicionar loading="lazy" para carregar imagens sob demanda.

            OTIMIZAÇÃO DE STORAGE: anexar query params ?width=400&quality=70 para reduzir tamanho da imagem quando possível.

            INDICADOR DE CARREGAMENTO: adicionar transition de opacity para suavizar aparição (fade-in).

            NÃO ALTERAR LAYOUT OU FUNDO BRANCO. */}

            {previewItem && (
                <div className="comprovantes-drawer" role="dialog" aria-modal="true" style={{ display: 'flex', flexDirection: 'column', height: '95vh', padding: '20px' }}>
                    <div className="comprovantes-drawer-inner" style={{ backgroundColor: '#FFFFFF', display: 'flex', flexDirection: 'column', height: '100%' }}>
                        <div style={{ flex: 1, width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF', border: '1px solid #ddd', borderRadius: '8px', margin: '10px 0' }}>
                            <img
                                key={pedidoSelecionado.id}
                                loading="lazy"
                                src={(pedidoSelecionado && String(pedidoSelecionado.assinatura_url || '').startsWith('data:')) ? pedidoSelecionado.assinatura_url : ((pedidoSelecionado && pedidoSelecionado.assinatura_url) ? `${ASSINATURAS_BASE}${String(pedidoSelecionado.assinatura_url).replace(/^\//, '')}` : getAssinaturaSrc(pedidoSelecionado))}
                                alt={`Comprovante ${pedidoSelecionado.id}`}
                                className="comprovantes-drawer-img"
                                style={{ width: '100%', height: '100%', maxHeight: '70vh', objectFit: 'contain', backgroundColor: '#ffffff' }}
                                onLoad={(e) => { try { e.target.style.opacity = '1'; } catch (err) { } }}
                                onError={(e) => { e.target.style.display = 'none'; console.log('Erro ao carregar imagem:', e.target.src); }}
                            />
                        </div>

                        <div style={{ marginTop: 'auto', width: '100%', flex: '0 0 auto' }}>
                            <button className="btn-save" style={{ width: '100%', height: '55px', marginTop: 'auto' }} onClick={() => { const src = (pedidoSelecionado && String(pedidoSelecionado.assinatura_url || '').startsWith('data:')) ? pedidoSelecionado.assinatura_url : ((pedidoSelecionado && pedidoSelecionado.assinatura_url) ? `${ASSINATURAS_BASE}${String(pedidoSelecionado.assinatura_url).replace(/^\//, '')}` : getAssinaturaSrc(pedidoSelecionado)); if (src) downloadImage(src, `comprovante_${pedidoSelecionado.id}.png`); else downloadComprovanteAsImage(pedidoSelecionado); }}>SALVAR</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
