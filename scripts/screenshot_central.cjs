const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    try {
        const port = process.env.PORT || process.env.VITE_PORT || process.env.DEV_PORT || 5173;
        const host = process.env.HOST || 'localhost';
        const useFile = !!process.env.USE_FILE;
        const pathModule = require('path');
        const tab = process.env.TAB || 'central-despacho';
    const selectorByTab = tab === 'nova-carga' ? 'text=Registrar Encomenda' : 'text=Fila de Preparação';
    const base = useFile ? `file://${pathModule.resolve(process.cwd(), 'dist', 'index.html')}?tab=${tab}` : `http://${host}:${port}/?tab=${tab}`;
        console.log('CONNECTING_TO', base);
        await page.goto(base, { waitUntil: 'load', timeout: 30000 });
        // esperar por título ou elemento da aba
        await page.waitForTimeout(1200);
        const bodySnippet = await page.locator('body').innerText().catch(() => '');
        console.log('BODY_TEXT_SNIPPET', bodySnippet.slice(0, 600));
        const found = await page.locator(selectorByTab).first().waitFor({ timeout: 5000 }).then(() => true).catch(() => false);
        const path = `tmp/${tab}.png`;
        await page.screenshot({ path, fullPage: true });
        console.log('SCREENSHOT_SAVED', path);
        console.log('CENTRAL_PRESENT', found);
        await browser.close();
        process.exit(found ? 0 : 2);
    } catch (e) {
        console.error('ERROR', e.message || e);
        await browser.close();
        process.exit(1);
    }
})();
