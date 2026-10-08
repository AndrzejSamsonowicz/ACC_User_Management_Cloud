// Screenshots the mockup (tools/mockup/server.js must be running) at desktop
// and phone sizes, after simulating the Autodesk sign-in and opening the
// first project. Images go to tools/mockup/output/ (gitignored).
//
// Usage: node tools/mockup/screenshot.js [baseUrl]   (default http://localhost:4300)
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const BASE = process.argv[2] || 'http://localhost:4300';
const OUT = path.join(__dirname, 'output');
const VIEWPORTS = {
    desktop: { width: 1440, height: 900 },
    tablet: { width: 820, height: 1180 },
    phone: { width: 390, height: 844 },
};

async function shoot(browser, name, viewport) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 2, isMobile: name !== 'desktop', hasTouch: name !== 'desktop' });
    const page = await context.newPage();
    page.on('pageerror', (err) => console.error(`[${name}] page error:`, err.message));
    page.on('console', (msg) => { if (msg.type() === 'error') console.error(`[${name}] console:`, msg.text()); });

    const snap = async (step) => {
        await page.waitForTimeout(400);
        const file = path.join(OUT, `${name}-${step}.png`);
        await page.screenshot({ path: file, fullPage: false });
        console.log('saved', path.relative(process.cwd(), file));
    };

    await page.goto(`${BASE}/index.html`);
    await page.waitForSelector('body.auth-verified');
    await snap('1-connect');

    await page.click('button[onclick="login()"]');
    await page.waitForSelector('.project-item, [id^="projectMembers-"], .fm-empty', { timeout: 15000 });
    await page.waitForTimeout(1500);
    await snap('2-projects');

    const hasScroll = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    console.log(`[${name}] horizontal page overflow: ${hasScroll}`);
    await context.close();
}

(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    const browser = await chromium.launch();
    const only = process.argv[3];
    for (const [name, vp] of Object.entries(VIEWPORTS)) {
        if (!only || only === name) await shoot(browser, name, vp);
    }
    await browser.close();
})();
