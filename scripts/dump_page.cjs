const { chromium } = require('playwright');
(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    await page.goto('http://localhost:5173/?tab=visao-geral', { waitUntil: 'load', timeout: 30000 });
    const html = await page.content();
    console.log('LENGTH', html.length);
    console.log(html.slice(0, 1200));
    await page.screenshot({ path: 'tmp/dump.png', fullPage: true });
    console.log('screenshot saved');
    await browser.close();
})();