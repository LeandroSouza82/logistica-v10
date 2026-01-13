const { chromium } = require('playwright');
let fetch = global.fetch;
try { fetch = fetch || require('node-fetch'); } catch (e) { /* use global fetch when available */ }

(async () => {
    const base = process.env.BASE_URL || `http://${process.env.HOST || '127.0.0.1'}:${process.env.PORT || 5173}/?tab=visao-geral`;
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
        console.error('VITE_SUPABASE_URL ou VITE_SUPABASE_ANON_KEY não definidos; abortando.');
        process.exit(1);
    }

    const browser = await chromium.launch();
    const page = await browser.newPage();
    // Debug: forward page console to Node output to inspect realtime logs
    page.on('console', msg => {
        try { console.log('PAGELOG:', msg.text()); } catch (e) { /* ignore */ }
    });
    try {
        await page.goto(base, { waitUntil: 'load', timeout: 30000 });

        // Lê valor atual de ASSINATURAS (formato: 'N / M')
        const cardText = await page.evaluate(() => {
            const nodes = Array.from(document.querySelectorAll('.summary-card'));
            for (const n of nodes) {
                if (/ASSINATURAS/i.test(n.innerText)) {
                    const val = n.querySelector('.value');
                    return val ? val.innerText.trim() : null;
                }
            }
            return null;
        });

        if (!cardText) {
            console.error('Card ASSINATURAS não encontrado na página.');
            await browser.close();
            process.exit(2);
        }

        const parts = cardText.split('/').map(s => Number((s || '').replace(/[^0-9]/g, '')));
        const beforeAssin = Number(parts[0] || 0);
        console.log('Assinaturas antes:', beforeAssin);

        // Insere uma entrega com assinatura (campo `assinatura`) não nula (today)
        const now = new Date().toISOString();
        const newEntrega = {
            cliente: 'Teste Playwright',
            endereco: 'Rua do Teste, 123',
            status: 'concluido',
            assinatura: 'data:image/png;base64,TEST',
            criado_em: now
        };

        const insertRes = await fetch(`${supabaseUrl}/rest/v1/entregas`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`,
                'Prefer': 'return=representation'
            },
            body: JSON.stringify(newEntrega)
        });

        if (!insertRes.ok) {
            const txt = await insertRes.text();
            console.error('Falha ao inserir entrega no Supabase REST:', insertRes.status, txt);
            await browser.close();
            process.exit(3);
        }

        const inserted = await insertRes.json();
        const insertedId = inserted && inserted[0] && inserted[0].id;
        console.log('Inserted entrega id', insertedId);

        // aguarda up to 10s pelo incremento via realtime
        let afterAssin = beforeAssin;
        const start = Date.now();
        while (Date.now() - start < 10000) {
            await new Promise(r => setTimeout(r, 1000));
            const newCardText = await page.evaluate(() => {
                const nodes = Array.from(document.querySelectorAll('.summary-card'));
                for (const n of nodes) {
                    if (/ASSINATURAS/i.test(n.innerText)) {
                        const val = n.querySelector('.value');
                        return val ? val.innerText.trim() : null;
                    }
                }
                return null;
            });
            const p = newCardText ? newCardText.split('/').map(s => Number((s || '').replace(/[^0-9]/g, ''))) : [0, 0];
            afterAssin = Number(p[0] || 0);
            if (afterAssin >= beforeAssin + 1) break;
        }

        console.log('Assinaturas depois:', afterAssin);

        // cleanup: delete the inserted row
        if (insertedId) {
            await fetch(`${supabaseUrl}/rest/v1/entregas?id=eq.${insertedId}`, {
                method: 'DELETE',
                headers: {
                    'apikey': supabaseKey,
                    'Authorization': `Bearer ${supabaseKey}`
                }
            });
        }

        await browser.close();

        if (afterAssin >= beforeAssin + 1) {
            console.log('✅ ASSINATURAS incrementou como esperado.');
            process.exit(0);
        } else {
            console.error('❌ ASSINATURAS não incrementou.');
            process.exit(4);
        }
    } catch (e) {
        console.error('ERROR', e.message || e);
        await browser.close();
        process.exit(1);
    }
})();