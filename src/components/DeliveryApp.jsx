import React, { useState } from 'react';
import { motion, AnimatePresence, Reorder } from 'framer-motion';
import SignatureCanvas from 'react-signature-canvas';

const DeliveryApp = ({ initialPedidos = null }) => {
    const [pedidos, setPedidos] = useState(initialPedidos || [
        { id: 1, cliente: 'João Silva', endereco: 'Rua A, 123', status: 'pendente' },
        { id: 2, cliente: 'Maria Oliveira', endereco: 'Av. B, 456', status: 'pendente' },
        { id: 3, cliente: 'Empresa X', endereco: 'Rua C, 789', status: 'pendente' },
    ]);

    const [assinando, setAssinando] = useState(false);
    const [sheetOpen, setSheetOpen] = useState(false);

    // Função para abrir o Google Maps externo para navegar
    const navegar = (endereco) => {
        window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(endereco)}`, '_blank');
    };

    return (
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, top: 0, pointerEvents: 'none' }}>
            {/* PAINEL DE PEDIDOS (BOTTOM SHEET) */}
            <motion.div
                drag="y"
                dragConstraints={{ top: -420, bottom: 0 }}
                initial={{ y: 300 }}
                animate={{ y: sheetOpen ? 0 : 300 }}
                transition={{ type: 'spring', damping: 20 }}
                style={{ ...sheetStyle, pointerEvents: 'all' }}
            >
                {/* Barra de arrastar */}
                <div onClick={() => setSheetOpen(!sheetOpen)} style={handleStyle} />

                <h3 style={{ textAlign: 'center', margin: '10px 0' }}>📦 Seus Pedidos (Arraste para reordenar)</h3>

                {/* LISTA REORDENÁVEL COM O DEDO */}
                <Reorder.Group axis="y" values={pedidos} onReorder={setPedidos} style={{ listStyle: 'none', padding: 0 }}>
                    {pedidos.map((pedido) => (
                        <Reorder.Item key={pedido.id} value={pedido} style={cardStyle}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <div>
                                    <strong>{pedido.cliente}</strong>
                                    <p style={{ fontSize: '0.8rem', color: '#ccc', margin: '4px 0 0 0' }}>{pedido.endereco}</p>
                                </div>
                                <div style={{ display: 'flex', gap: '5px' }}>
                                    <button onClick={() => navegar(pedido.endereco)} style={navBtn}>Navegar</button>
                                    <button onClick={() => setAssinando(true)} style={doneBtn}>Entregar</button>
                                </div>
                            </div>
                        </Reorder.Item>
                    ))}
                </Reorder.Group>
            </motion.div>

            {/* TELA DE ASSINATURA (MODAL) */}
            <AnimatePresence>
                {assinando && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={modalStyle}>
                        <div style={signatureBox}>
                            <h3>Assinatura do Cliente</h3>
                            <div style={{ background: '#fff', borderRadius: '10px', display: 'flex', justifyContent: 'center', padding: 10 }}>
                                <SignatureCanvas penColor='black' canvasProps={{ width: 300, height: 200, className: 'sigCanvas' }} />
                            </div>
                            <div style={{ marginTop: '20px', display: 'flex', gap: '10px', justifyContent: 'center' }}>
                                <button onClick={() => setAssinando(false)} style={cancelBtn}>Cancelar</button>
                                <button onClick={() => { setAssinando(false); alert('Assinatura salva (simulação)'); }} style={confirmBtn}>Finalizar e Salvar</button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

// --- ESTILOS (Design Moderno e Transparente) ---
const sheetStyle = {
    position: 'absolute', bottom: 0, width: '100%', height: '420px',
    background: 'rgba(30, 30, 30, 0.95)', backdropFilter: 'blur(10px)',
    borderTopLeftRadius: '25px', borderTopRightRadius: '25px', color: 'white',
    boxShadow: '0 -5px 15px rgba(0,0,0,0.3)', padding: '20px', zIndex: 1000
};

const handleStyle = { width: '40px', height: '6px', background: '#666', borderRadius: '3px', margin: '0 auto 15px', cursor: 'grab' };

const cardStyle = {
    background: 'rgba(255, 255, 255, 0.04)', padding: '15px', borderRadius: '15px',
    marginBottom: '10px', border: '1px solid rgba(255,255,255,0.06)', cursor: 'grab'
};

const modalStyle = {
    position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
    background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100
};

const signatureBox = { background: '#222', padding: '20px', borderRadius: '20px', textAlign: 'center' };

const navBtn = { background: '#007bff', color: 'white', border: 'none', padding: '8px', borderRadius: '5px' };
const doneBtn = { background: '#28a745', color: 'white', border: 'none', padding: '8px', borderRadius: '5px' };
const cancelBtn = { background: '#dc3545', color: 'white', border: 'none', padding: '10px', borderRadius: '10px' };
const confirmBtn = { background: '#28a745', color: 'white', border: 'none', padding: '10px', borderRadius: '10px' };

export default DeliveryApp;
