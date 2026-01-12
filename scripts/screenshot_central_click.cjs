const { chromium } = require('playwright');
(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    try {
        const port = process.env.PORT || process.env.VITE_PORT || process.env.DEV_PORT || 5173;
        const host = process.env.HOST || 'localhost';
        const base = `http://${host}:${port}/?tab=central-despacho`;
        console.log('CONNECTING_TO', base);
        await page.goto(base, { waitUntil: 'load', timeout: 30000 });
        // Tentar clicar na aba Central de Despacho (usamos ?tab para garantir que a view já esteja ativa)
        const nav = page.locator('text=/Central de Despacho/i').first();
        if (await nav.count() > 0) {
            await nav.click().catch(() => { });
        }
        // esperar um pouco para a view mudar e diagnosticar
        await page.waitForTimeout(3000);

        // log a parte inicial do body para ajudar diagnóstico
        const bodyText = await page.locator('body').innerText().catch(() => '');
        console.log('BODY_TEXT_SNIPPET', bodyText.slice(0, 800));

        const found = await page.locator('text=Fila de Preparação').first().waitFor({ timeout: 5000 }).then(() => true).catch(() => false);
        const path = 'tmp/central_click.png';
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