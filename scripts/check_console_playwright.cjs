const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const messages = [];

    page.on('console', msg => {
        const text = msg.text();
        const type = msg.type();
        messages.push({ type, text });
        console.log(`CONSOLE ${type}: ${text}`);
    });

    page.on('pageerror', err => {
        console.log('PAGE ERROR:', err.message);
        messages.push({ type: 'pageerror', text: err.message });
    });

    try {
        await page.goto('http://localhost:5173/', { waitUntil: 'load', timeout: 30000 });
        // Espera um pouco para o mapa e HMR carregarem e emitirem mensagens
        await page.waitForTimeout(4000);
    } catch (e) {
        console.error('NAV_ERROR', e.message || e);
        await browser.close();
        process.exit(2);
    }

    await browser.close();

    const warnings = messages.filter(m => /warning|deprecated|download the react devtools|Performance warning/i.test(m.text));

    console.log('\n=== SUMMARY ===');
    if (warnings.length === 0) {
        console.log('NO_WARNINGS_FOUND');
        process.exit(0);
    } else {
        console.log('WARNINGS_FOUND:', JSON.stringify(warnings, null, 2));
        process.exit(1);
    }
})();
