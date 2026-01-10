const url = process.argv[2] || 'https://logistica-v2.vercel.app';
const out = process.argv[3] || 'scripts/map_screenshot.png';

(async () => {
    try {
        const playwright = await import('playwright');
        const { chromium } = playwright;
        const browser = await chromium.launch({ args: ['--no-sandbox'] });
        const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
        console.log('Loading', url);
        await page.goto(url, { waitUntil: 'networkidle' });
        await page.waitForTimeout(3000);
        await page.screenshot({ path: out, fullPage: true });
        console.log('Screenshot saved to', out);
        await browser.close();
        process.exit(0);
    } catch (e) {
        console.error('Error taking screenshot:', e);
        process.exit(2);
    }
})();
