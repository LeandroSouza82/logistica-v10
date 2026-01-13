const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const PNG = require('pngjs').PNG;
const pixelmatch = require('pixelmatch');

(async () => {
    const useFile = !!process.env.USE_FILE;
    const fileBase = `file://${path.resolve(process.cwd(), 'dist', 'index.html')}?tab=visao-geral`;
    const base = process.env.BASE_URL || (useFile ? fileBase : `http://${process.env.HOST || 'localhost'}:${process.env.PORT || 5173}/?tab=visao-geral`);

    // quick connectivity check before launching browser (skip for file://)
    if (!useFile) {
        try {
            const http = require('http');
            const url = new URL(base);
            const opts = { hostname: url.hostname, port: url.port || 80, path: url.pathname + url.search, timeout: 3000 };
            await new Promise((resolve, reject) => {
                const req = http.request(opts, (res) => { res.resume(); resolve(); });
                req.on('error', (e) => reject(e));
                req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
                req.end();
            });
        } catch (e) {
            console.error('ERROR: could not reach dev server at', base, '-', e.message || e);
            process.exit(1);
        }
    }
    const outDir = path.resolve(process.cwd(), 'tmp');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    const browser = await chromium.launch();
    const page = await browser.newPage();
    try {
        console.log('CONNECTING_TO', base);
        const resp = await page.goto(base, { waitUntil: 'load', timeout: 30000 });
        if (!resp || resp.status() >= 400) {
            console.error('Erro ao carregar página, status:', resp && resp.status());
            await browser.close();
            process.exit(1);
        }

        // Debug: report how many motorista-card exist in the rendered DOM
        const found = await page.evaluate(() => {
            try { return document.querySelectorAll('.motorista-card').length; } catch (e) { return 'ERROR'; }
        });
        console.log('DOM motorista-card count:', found);

        // Espera lista de motoristas
        await page.waitForSelector('.motorista-card', { timeout: 30000 });
        console.log('Motorista card encontrado, clicando no primeiro...');
        await page.click('.motorista-card');
        await page.waitForTimeout(900);

        // Captura posições de imgs com data:image/svg+xml (icons do mapa)
        const before = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('img')).filter(i => i.src && i.src.startsWith('data:image/svg+xml')).map(i => {
                const r = i.getBoundingClientRect();
                return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
            });
        });
        console.log('before positions:', before);

        const beforePath = path.join(outDir, 'motorista_before.png');
        await page.screenshot({ path: beforePath, fullPage: true });
        console.log('Screenshot before saved:', beforePath);

        // Aguarda movimento (simulador) e tira nova screenshot
        await page.waitForTimeout(4000);
        const after = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('img')).filter(i => i.src && i.src.startsWith('data:image/svg+xml')).map(i => {
                const r = i.getBoundingClientRect();
                return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
            });
        });
        console.log('after positions:', after);

        const afterPath = path.join(outDir, 'motorista_after.png');
        await page.screenshot({ path: afterPath, fullPage: true });
        console.log('Screenshot after saved:', afterPath);

        // Heurística: se uma das imagens teve mudança de posição significativa (>5px), considera movimento
        let moved = false;
        if (before.length > 0 && after.length > 0) {
            for (let i = 0; i < Math.min(before.length, after.length); i++) {
                const dx = Math.abs(before[i].x - after[i].x);
                const dy = Math.abs(before[i].y - after[i].y);
                if ((dx + dy) > 5) {
                    moved = true;
                    break;
                }
            }
        }

        // Fallback: comparar pixels com pixelmatch
        if (!moved) {
            const img1 = PNG.sync.read(fs.readFileSync(beforePath));
            const img2 = PNG.sync.read(fs.readFileSync(afterPath));
            const { width, height } = img1;
            if (width !== img2.width || height !== img2.height) {
                console.error('Dimensões diferentes entre screenshots; considerando movimento.');
                moved = true;
            } else {
                const diff = new PNG({ width, height });
                const diffPixels = pixelmatch(img1.data, img2.data, diff.data, width, height, { threshold: 0.12 });
                fs.writeFileSync(path.join(outDir, 'motorista_diff.png'), PNG.sync.write(diff));
                console.log('diffPixels:', diffPixels);
                if (diffPixels > 120) moved = true; // heurística
            }
        }

        if (moved) {
            console.log('✅ Movimento detectado (marker se moveu).');
            await browser.close();
            process.exit(0);
        } else {
            console.error('❌ Movimento NÃO detectado.');
            await browser.close();
            process.exit(2);
        }
    } catch (e) {
        console.error('ERROR', e.message || e);
        await browser.close();
        process.exit(1);
    }
})();