const fs = require('fs').promises;
const path = require('path');
const os = require('os');

const callWithTimeout = (promise, ms = 30000) => {
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));
    return Promise.race([promise, timeout]);
};

async function simulate({ failUpload = false, failUpdate = false } = {}) {
    console.log('\n=== Simulação de upload de assinatura ===');
    const tmpDir = os.tmpdir();
    const base64 = 'iVBORw0KGgoAAAANSUhEUgAAAAUA' +
        'AAAFCAYAAACNbyblAAAAHElEQVQI12P4' +
        '//8/w38GIAXDIBKE0DHxgljNBAAO' +
        '9TXL0Y4OHwAAAABJRU5ErkJggg==';

    const tmpPng = path.join(tmpDir, `entrega_sim_${Date.now()}.png`);
    const manipulatedJpg = path.join(tmpDir, `entrega_sim_${Date.now()}.jpg`);

    try {
        console.log('Escrevendo arquivo temporário PNG:', tmpPng);
        await fs.writeFile(tmpPng, base64, { encoding: 'base64' });

        // "Manipulate" -> copy to jpg (simulate compression)
        await fs.copyFile(tmpPng, manipulatedJpg);
        console.log('Criado mock JPEG:', manipulatedJpg);

        // Mock fetch(manipulated.uri) -> resp.blob()
        const resp = {
            blob: async () => {
                const buf = await fs.readFile(manipulatedJpg);
                return buf;
            }
        };

        const blob = await resp.blob();

        const filename = `entrega_${Date.now()}.jpg`;
        const bucketName = 'assinaturas';

        // Mock supabase
        const mockSupabase = {
            storage: {
                from: (bucket) => ({
                    upload: async (fn, b, opts) => {
                        console.log('MOCK upload called bucket=', bucket, 'filename=', fn, 'opts=', opts);
                        if (failUpload) return { data: null, error: { status: 403, message: 'permission denied' } };
                        return { data: { path: `${bucket}/${fn}` }, error: null };
                    }
                })
            },
            from: (table) => ({
                update: (obj) => ({
                    eq: (col, val) => ({
                        select: async () => {
                            console.log('MOCK db update called on table=', table, 'set=', obj, 'where=', col, val);
                            if (failUpdate) return { data: null, error: { message: 'db update failed' } };
                            return { data: [{ id: 123, ...obj }], error: null };
                        }
                    })
                })
            })
        };

        // UPLOAD
        console.log('Iniciando upload da assinatura para Storage:', filename, 'bucket:', bucketName);
        let uploadRes = null;
        let uploadError = null;
        try {
            uploadRes = await callWithTimeout(mockSupabase.storage.from(bucketName).upload(filename, blob, { contentType: 'image/jpeg', upsert: true }), 30000);
        } catch (e) { uploadError = e; }
        console.log('UPLOAD RESPONSE:', uploadRes, 'UPLOAD ERROR:', uploadError);

        if (uploadRes && uploadRes.error) uploadError = uploadRes.error;
        if (uploadError) {
            console.error('Erro no upload da assinatura:', uploadError);
            throw uploadError;
        }

        // DB update
        console.log('Atualizando registro de entrega com assinatura_url:', filename);
        let upRes = null;
        let dbError = null;
        try {
            upRes = await callWithTimeout(mockSupabase.from('entregas').update({ assinatura_url: filename, assinatura: null }).eq('id', 123).select(), 30000);
        } catch (e) { dbError = e; }
        console.log('UPDATE RESPONSE:', upRes, 'UPDATE ERROR:', dbError);

        if ((upRes && upRes.error) || dbError) {
            const err = (upRes && upRes.error) ? upRes.error : dbError;
            console.error('Erro ao atualizar entrega com assinatura_url:', err);
            throw err;
        }

        console.log('Simulação completada com sucesso. arquivo:', filename);
    } catch (err) {
        console.error('Simulação: erro detectado:', err);
    } finally {
        try { await fs.unlink(tmpPng); } catch (e) { }
        try { await fs.unlink(manipulatedJpg); } catch (e) { }
    }
}

(async () => {
    console.log('\n--- Simulação: caso de SUCESSO ---');
    await simulate({ failUpload: false, failUpdate: false });

    console.log('\n--- Simulação: caso de PERMISSÃO (upload falha) ---');
    await simulate({ failUpload: true, failUpdate: false });

    console.log('\n--- Simulação: caso de ERRO no DB (update falha) ---');
    await simulate({ failUpload: false, failUpdate: true });
})();