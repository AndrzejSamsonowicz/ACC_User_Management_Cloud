// Records a short, scripted walkthrough of selecting the "SevenSeas" hub and
// the "Atlantic" project. Drives the real public/index.html in demo mode
// (?demo=true, which skips Firebase auth) and mocks the Autodesk hub/project
// API calls (and this app's own /api/aps/token proxy) with local fixtures, so
// no live ACC credentials or Firebase Admin setup are needed to record it.
//
// Usage: node tools/demo-recorder/record-hub-project-demo.js
const path = require('path');
const fs = require('fs');
const express = require('express');
const { chromium } = require('playwright');

const PORT = 4173;
const PUBLIC_DIR = path.join(__dirname, '..', '..', 'public');
const OUTPUT_DIR = path.join(__dirname, 'output');
const hubsFixture = require('./fixtures/hubs.json');
const projectsFixture = require('./fixtures/projects.json');

function startStaticServer() {
    const app = express();
    app.use(express.static(PUBLIC_DIR));
    return new Promise((resolve) => {
        const server = app.listen(PORT, () => resolve(server));
    });
}

// Draws an animated highlight ring + label around an element, purely via
// injected CSS/JS — the "editing" happens here in code, not in Camtasia.
async function spotlight(page, selector, label, { pause = 1400 } = {}) {
    await page.evaluate(({ selector, label }) => {
        const el = document.querySelector(selector);
        if (!el) return;
        const rect = el.getBoundingClientRect();
        document.querySelectorAll('.__demo_spotlight, .__demo_callout').forEach((n) => n.remove());

        const ring = document.createElement('div');
        ring.className = '__demo_spotlight';
        Object.assign(ring.style, {
            position: 'fixed',
            left: `${rect.left - 6}px`,
            top: `${rect.top - 6}px`,
            width: `${rect.width + 12}px`,
            height: `${rect.height + 12}px`,
            border: '3px solid #0696D7',
            borderRadius: '8px',
            boxShadow: '0 0 0 4000px rgba(0,0,0,0.35)',
            zIndex: 99998,
            pointerEvents: 'none',
        });
        document.body.appendChild(ring);

        const callout = document.createElement('div');
        callout.className = '__demo_callout';
        callout.textContent = label;
        Object.assign(callout.style, {
            position: 'fixed',
            left: `${rect.left}px`,
            top: `${rect.bottom + 14}px`,
            background: '#0696D7',
            color: '#fff',
            padding: '8px 14px',
            borderRadius: '6px',
            fontFamily: 'Arial, sans-serif',
            fontSize: '14px',
            fontWeight: '600',
            zIndex: 99999,
            boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
            opacity: '0',
            transition: 'opacity 0.3s ease',
            maxWidth: '360px',
        });
        document.body.appendChild(callout);
        requestAnimationFrame(() => {
            callout.style.opacity = '1';
        });
    }, { selector, label });
    await page.waitForTimeout(pause);
}

async function clearSpotlight(page) {
    await page.evaluate(() => {
        document.querySelectorAll('.__demo_spotlight, .__demo_callout').forEach((n) => n.remove());
    });
}

async function main() {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    const server = await startStaticServer();

    const browser = await chromium.launch();
    const context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        recordVideo: { dir: OUTPUT_DIR, size: { width: 1280, height: 800 } },
    });
    const page = await context.newPage();
    page.on('pageerror', (err) => console.error('[page error]', err));
    page.on('console', (msg) => {
        if (msg.type() === 'error') console.error('[console]', msg.text());
    });

    // Mock the live Autodesk endpoints and this app's own token proxy so the
    // walkthrough is fully self-contained and repeatable.
    await page.route('https://developer.api.autodesk.com/project/v1/hubs**', (route) =>
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(hubsFixture) }));
    await page.route('https://developer.api.autodesk.com/construction/admin/v1/accounts/**/projects**', (route) =>
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(projectsFixture) }));
    await page.route('**/api/aps/token', (route) =>
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ access_token: 'demo-2legged-token', expires_in: 3600 }),
        }));

    await page.goto(`http://localhost:${PORT}/index.html?demo=true`);
    await page.waitForTimeout(1200); // matches the app's own onload settle delay

    // Skip the real Autodesk OAuth redirect and jump straight to "connected"
    // state with a fake token, the same way the app would after a real callback.
    // Demo mode (?demo=true) never runs the real auth flow that normally adds
    // 'auth-verified' to <body> to dismiss #authLoadingOverlay, so do it here.
    await page.evaluate(() => {
        document.body.classList.add('auth-verified');
        window.currentAccessToken = 'demo-access-token';
        return window.getHubs('demo-access-token');
    });
    await page.waitForSelector('.hub-item');

    await spotlight(page, '#hubFilter', 'Hubs you have access to are listed on the left');
    await clearSpotlight(page);

    await spotlight(page, '.hub-item', 'Selecting the "SevenSeas" hub');
    await page.click('.hub-item');
    await page.waitForSelector('.project-item');
    await clearSpotlight(page);

    await spotlight(page, '.project-item', 'Projects in SevenSeas — here is "Atlantic"');
    await page.click('.project-item .project-select-cb');
    await page.waitForTimeout(600);
    await clearSpotlight(page);

    await spotlight(page, '.project-btn-update', 'From here you can manage users or folder access', { pause: 1800 });
    await clearSpotlight(page);

    await page.waitForTimeout(800);
    await context.close();
    await browser.close();
    await new Promise((resolve) => server.close(resolve));

    const files = fs.readdirSync(OUTPUT_DIR).filter((f) => f.endsWith('.webm'));
    const latest = files
        .map((f) => ({ f, t: fs.statSync(path.join(OUTPUT_DIR, f)).mtimeMs }))
        .sort((a, b) => b.t - a.t)[0];
    if (latest) {
        const finalPath = path.join(OUTPUT_DIR, 'hub-project-selection.webm');
        fs.renameSync(path.join(OUTPUT_DIR, latest.f), finalPath);
        console.log(`Recording saved to ${finalPath}`);
    } else {
        console.warn('No recording file was produced.');
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
