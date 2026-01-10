const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
    const url = process.argv[2] || 'http://localhost:5173/';
    const browser = await chromium.launch();
    const context = await browser.newContext();
    const page = await context.newPage();

    const consoleMessages = [];
    page.on('console', msg => {
        consoleMessages.push({ type: 'console', text: msg.text(), location: msg.location(), level: msg.type() });
        console.log(`[console:${msg.type()}] ${msg.text()}`);
    });
    page.on('pageerror', err => {
        consoleMessages.push({ type: 'pageerror', text: err.message, stack: err.stack });
        console.log(`[pageerror] ${err.message}`);
    });
    page.on('requestfailed', req => {
        consoleMessages.push({ type: 'requestfailed', url: req.url(), failure: req.failure()?.errorText });
        console.log(`[requestfailed] ${req.url()} - ${req.failure()?.errorText}`);
    });

    try {
        console.log(`Opening ${url}`);
        const resp = await page.goto(url, { waitUntil: 'load', timeout: 15000 });
        console.log(`HTTP ${resp ? resp.status() : 'no response'}`);
    } catch (e) {
        console.log('Error loading page:', e.message);
    }

    // wait a bit for any async console messages
    await page.waitForTimeout(4000);

    const screenshotPath = 'scripts/page_check.png';
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`Screenshot saved to ${screenshotPath}`);

    // Save logs
    const outPath = 'scripts/page_console_log.json';
    fs.writeFileSync(outPath, JSON.stringify(consoleMessages, null, 2));
    console.log(`Console log saved to ${outPath}`);

    await browser.close();
})();