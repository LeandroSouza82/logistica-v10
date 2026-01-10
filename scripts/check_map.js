const url = process.argv[2] || 'https://logistica-v2.vercel.app';

(async () => {
    try {
        const playwright = await import('playwright');
        const { chromium } = playwright;
        const browser = await chromium.launch({ args: ['--no-sandbox'] });
        const page = await browser.newPage();
        console.log('Loading', url);
        await page.goto(url, { waitUntil: 'networkidle' });
        // wait a bit for scripts to run
        await page.waitForTimeout(3000);
        const googlePresent = await page.evaluate(() => {
            return !!(window.google && window.google.maps);
        });
        console.log('window.google.maps present:', googlePresent);
        await browser.close();
        process.exit(googlePresent ? 0 : 2);
    } catch (e) {
        console.error('Error running headless check:', e);
        process.exit(3);
    }
})();
