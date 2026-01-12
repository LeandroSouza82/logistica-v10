const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  try {
    const port = process.env.PORT || process.env.VITE_PORT || process.env.DEV_PORT || 5173;
    const base = `http://localhost:${port}/?tab=equipe`;
    console.log('CONNECTING_TO', base);
    await page.goto(base, { waitUntil: 'load', timeout: 30000 });
    // wait for motorista cards to appear
    try {
      await page.waitForSelector('.motoristas-list .motorista-card', { timeout: 20000 });
    } catch (e) {
      console.log('No motorista-card found (wait timeout)');
      await page.screenshot({ path: 'tmp/persistence-no-driver.png', fullPage: true });
      await browser.close();
      process.exit(2);
    }

    const motorista = await page.locator('.motoristas-list .motorista-card').first();

    console.log('Clicking motorista to open driver');
    await motorista.click();
    await page.waitForTimeout(800);

    console.log('Switching to NOVA CARGA tab');
    await page.click('text=NOVA CARGA');
    await page.waitForTimeout(600);

    console.log('Switching back to VISÃO GERAL');
    await page.click('text=VISÃO GERAL');
    await page.waitForTimeout(1200);

    const path = 'tmp/persistence.png';
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