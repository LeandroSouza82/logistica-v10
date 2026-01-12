import React, { useState } from 'react';
import { supabase } from '../supabase';

const NovaCarga = ({ setAbaAtiva, prefill }) => {
    const [novoNome, setNovoNome] = useState('');
    const [novoEndereco, setNovoEndereco] = useState('');
    const [novoTipo, setNovoTipo] = useState('Entrega');
    const [novoObservacoes, setNovoObservacoes] = useState('');
    const [carregando, setCarregando] = useState(false);
    const [copiedMsg, setCopiedMsg] = useState('');

    // Quando receber prefill, atualiza campos e mostra feedback breve
    React.useEffect(() => {
        if (!prefill) return;
        if (prefill.cliente) setNovoNome(prefill.cliente);
        if (prefill.endereco) setNovoEndereco(prefill.endereco);
        setCopiedMsg('Dados copiados para o formulário');
        const tid = setTimeout(() => setCopiedMsg(''), 2600);
        return () => clearTimeout(tid);
    }, [prefill]);

    const adicionarParada = async (e) => {
        if (e) e.preventDefault();
        if (!novoEndereco) return alert('Por favor, preencha o endereço.');

        setCarregando(true);
        try {
            const { error } = await supabase.from('entregas').insert([{
                cliente: novoNome || 'Cliente a definir',
                endereco: novoEndereco,
                tipo: novoTipo,
                observacoes: novoObservacoes,
                status: 'em_preparacao'
            }]);
            if (error) throw error;

            // Limpa os campos após sucesso
            setNovoNome(''); setNovoEndereco(''); setNovoObservacoes('');
            alert('Parada adicionada com sucesso!');
        } catch (err) {
            alert('Erro ao salvar: ' + err.message);
        } finally {
            setCarregando(false);
        }
    };

    return (
        <div className="flex flex-col items-center w-full min-h-screen bg-[#0B1F3A] py-10 px-4">
            {/* CONTAINER QUE CENTRALIZA TUDO */}
            <div className="nova-carga-container w-full">

                {/* CARD DE REGISTRO (estilo imagem 2) */}
                <div className="nova-carga-card">
                    <h2>Registrar Encomenda</h2>

                    {copiedMsg && (
                        <div className="copied-feedback">
                            <span className="check">✓</span>
                            <span className="copied-text">{copiedMsg}</span>
                        </div>
                    )}

                    <form className="nova-carga-form" onSubmit={adicionarParada}>
                        <div className="flex items-center gap-3 mb-2">
                            <label className="text-slate-300 text-sm font-semibold uppercase">Tipo:</label>
                            <select
                                value={novoTipo}
                                onChange={(e) => setNovoTipo(e.target.value)}
                                className="type-select"
                            >
                                <option>Entrega</option>
                                <option>Recolha</option>
                                <option>Outros</option>
                            </select>
                        </div>

                        <input
                            value={novoNome}
                            onChange={(e) => setNovoNome(e.target.value)}
                            className="form-input"
                            placeholder="Nome do Cliente"
                            aria-label="Nome do Cliente"
                        />

                        <input
                            value={novoEndereco}
                            onChange={(e) => setNovoEndereco(e.target.value)}
                            className="form-input"
                            placeholder="Endereço de Entrega"
                            aria-label="Endereço de Entrega"
                        />

                        <textarea
                            value={novoObservacoes}
                            onChange={(e) => setNovoObservacoes(e.target.value)}
                            className="form-input"
                            placeholder="Observações..."
                            rows={4}
                        />

                        <button
                            type="submit"
                            disabled={carregando}
                            className="btn-add-lista"
                        >
                            {carregando ? 'SALVANDO...' : 'ADICIONAR À LISTA'}
                        </button>
                    </form>
                </div>



            </div>
        </div>
    );
};

export default NovaCarga;