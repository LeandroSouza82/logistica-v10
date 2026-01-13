const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    try {
        const port = process.env.PORT || process.env.VITE_PORT || process.env.DEV_PORT || 5173;
        const host = process.env.HOST || 'localhost';
        const tab = process.env.TAB || 'visao-geral';
        const base = `http://${host}:${port}/?tab=${tab}`;
        console.log('CONNECTING_TO', base);
        await page.goto(base, { waitUntil: 'load', timeout: 30000 });
        await page.waitForTimeout(1000);
        // Escolhe seletor correto dependendo da aba (Equipe usa .motoristas-list .motorista-card)
        const motoristaSelector = tab === 'equipe' ? '.motoristas-list .motorista-card' : '.motorista-card';
        const motorista = await page.locator(motoristaSelector).first();
        const exists = await motorista.count().then(c => c > 0).catch(() => false);
        if (!exists) {
            console.log('No motorista-card found for selector', motoristaSelector);
            await page.screenshot({ path: `tmp/${tab}-no-motorista.png`, fullPage: true });
            await browser.close();
            process.exit(2);
        }
        console.log('Clicking first motorista-card using selector', motoristaSelector);
        await motorista.click({ timeout: 5000 });
        // wait for any map pan or marker render
        await page.waitForTimeout(1200);
        const path = 'tmp/visao-geral-click.png';
        await page.screenshot({ path, fullPage: true });
        console.log('SCREENSHOT_SAVED', path);
        await browser.close();
        process.exit(0);
    } catch (e) {
        console.error('ERROR', e.message || e);
        await browser.close();
        process.exit(1);
    }
})();