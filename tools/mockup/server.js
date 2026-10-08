// Local mockup of the app: serves the real public/ frontend with Firebase and
// every Autodesk API replaced by fake data (tools/mockup/fake-data.js), so the
// UI can be clicked through and screenshotted without credentials, the VM or
// a live ACC account. Dev-only; never deployed. No npm dependencies.
//
// Usage: node tools/mockup/server.js [port]   (default 4300)
//        then open http://localhost:4300/ and click "Connect" — the Autodesk
//        sign-in is simulated and lands straight back in the app.
const http = require('http');
const fs = require('fs');
const path = require('path');
const data = require('./fake-data');

const PORT = Number(process.argv[2]) || 4300;
const PUBLIC_DIR = path.join(__dirname, '..', '..', 'public');
const MIME = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp4': 'video/mp4', '.json': 'application/json',
    '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2',
};

// Point the frontend at this server instead of Firebase and Autodesk.
function rewrite(text, ext) {
    if (ext === '.html') {
        let stubbed = false;
        text = text.replace(/<script\s+src="https:\/\/www\.gstatic\.com\/firebasejs\/[^"]+"[^>]*><\/script>/g, () => {
            if (stubbed) return '';
            stubbed = true;
            return '<script src="/__mock/firebase-stub.js"></script>';
        });
    }
    return text
        .replace(/https:\/\/developer\.api\.autodesk\.com/g, '/__mock/aps')
        .replace(/https:\/\/api\.userprofile\.autodesk\.com/g, '/__mock/profile');
}

function send(res, status, body, type = 'application/json') {
    res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function paginate(list, url) {
    const limit = Number(url.searchParams.get('limit')) || 100;
    const offset = Number(url.searchParams.get('offset')) || 0;
    return { slice: list.slice(offset, offset + limit), limit, offset };
}

const stripB = (id) => decodeURIComponent(id).replace(/^b\./, '');
const activity = [];

function handleApi(req, res, url, body) {
    const p = url.pathname;
    if (p === '/api/validate-login') {
        return send(res, 200, { success: true, termsAccepted: true, isAdmin: false, isTrial: true,
            trialEndDate: new Date(Date.now() + 9 * 864e5).toISOString() });
    }
    if (p === '/api/aps-client-id') return send(res, 200, { clientId: 'mock-client-id' });
    if (p === '/api/aps/token') return send(res, 200, { access_token: 'mock-access-token', refresh_token: 'mock-refresh', expires_in: 3600 });
    if (p === '/api/activity' && req.method === 'POST') {
        try { activity.unshift(...(JSON.parse(body).entries || []).reverse()); } catch { /* ignore */ }
        return send(res, 200, { success: true });
    }
    if (p === '/api/activity') {
        const entries = activity.length ? activity : [
            { id: 'a1', at: new Date(Date.now() - 36e5).toISOString(), actor: data.ME.name, action: 'Added 3 users to Atlantic' },
            { id: 'a2', at: new Date(Date.now() - 864e5).toISOString(), actor: data.ME.name, action: 'Changed folder access on Harbor Tower' },
        ];
        return send(res, 200, { entries, next: null });
    }
    if (p === '/load') return send(res, 200, { success: true, data: null });
    return send(res, 200, { success: true });
}

function handleAps(req, res, url) {
    const p = url.pathname.replace(/^\/__mock\/aps/, '');
    let m;

    if (p === '/authentication/v2/authorize') {
        const back = new URL(url.searchParams.get('redirect_uri'));
        back.searchParams.set('code', `mock-code-${Date.now()}`);
        back.searchParams.set('state', url.searchParams.get('state'));
        res.writeHead(302, { Location: back.toString() });
        return res.end();
    }
    if (req.method !== 'GET') {
        // Writes (add/update/remove users, permission changes): accept and echo.
        if (/permissions:batch-/.test(p)) return send(res, 200, { results: [], errors: [] });
        if (/users:import|users\/import/.test(p)) return send(res, 202, { success: 1, failure: 0, success_items: [], failure_items: [] });
        return send(res, 200, { success: true });
    }

    if (p === '/project/v1/hubs') {
        return send(res, 200, { data: [{ type: 'hubs', id: data.HUB_ID,
            attributes: { name: 'SevenSeas', region: 'EMEA', extension: { type: 'hubs:autodesk.bim360:Account', version: '1.0' } } }] });
    }
    if ((m = p.match(/^\/construction\/admin\/v1\/accounts\/[^/]+\/projects$/))) {
        const { slice, limit, offset } = paginate(data.projects, url);
        return send(res, 200, { results: slice, pagination: { limit, offset, totalResults: data.projects.length } });
    }
    if ((m = p.match(/^\/project\/v1\/hubs\/[^/]+\/projects$/))) {
        return send(res, 200, { data: data.projects.map(pr => ({ type: 'projects', id: `b.${pr.id}`, attributes: { name: pr.name } })) });
    }
    if ((m = p.match(/^\/construction\/admin\/v1\/projects\/([^/]+)\/users$/))) {
        const list = data.projectUsers.get(stripB(m[1])) || [];
        const { slice, limit, offset } = paginate(list, url);
        return send(res, 200, { results: slice, pagination: { limit, offset, totalResults: list.length } });
    }
    if ((m = p.match(/^\/construction\/admin\/v1\/projects\/([^/]+)\/users\/([^/]+)$/))) {
        const u = (data.projectUsers.get(stripB(m[1])) || []).find(x => x.id === m[2]);
        return u ? send(res, 200, u) : send(res, 404, { message: 'User not found' });
    }
    if ((m = p.match(/^\/(construction\/admin|bim360\/admin)\/v1\/projects\/[^/]+\/roles$/))) {
        return send(res, 200, { results: data.roles, pagination: { limit: 100, offset: 0, totalResults: data.roles.length } });
    }
    if ((m = p.match(/^\/hq\/v1\/accounts\/[^/]+\/users$/))) {
        return send(res, 200, paginate(data.accountUsers, url).slice);
    }
    if ((m = p.match(/^\/hq\/v1\/accounts\/[^/]+\/users\/([^/]+)$/))) {
        const u = data.accountUsers.find(x => x.id === m[1]);
        return u ? send(res, 200, u) : send(res, 404, { message: 'User not found' });
    }
    if ((m = p.match(/^\/hq\/v1\/accounts\/[^/]+\/companies$/))) return send(res, 200, data.companies);
    if ((m = p.match(/^\/construction\/admin\/v1\/accounts\/[^/]+\/companies$/))) {
        const { slice, limit, offset } = paginate(data.companies, url);
        return send(res, 200, { results: slice, pagination: { limit, offset, totalResults: data.companies.length } });
    }
    if ((m = p.match(/^\/project\/v1\/hubs\/[^/]+\/projects\/[^/]+\/topFolders$/))) {
        return send(res, 200, { data: data.topFolderIds.map(data.folderJson) });
    }
    if ((m = p.match(/^\/data\/v1\/projects\/[^/]+\/folders\/([^/]+)\/contents$/))) {
        const f = data.folderIndex.get(decodeURIComponent(m[1]));
        return send(res, 200, { data: f ? f.children.map(data.folderJson) : [] });
    }
    if ((m = p.match(/^\/bim360\/docs\/v1\/projects\/([^/]+)\/folders\/([^/]+)\/permissions$/))) {
        return send(res, 200, data.folderPermissions(stripB(m[1]), decodeURIComponent(m[2])));
    }
    console.warn(`[mockup] no fake data for GET ${p}`);
    return send(res, 404, { message: `Mockup has no fake data for ${p}` });
}

function serveStatic(req, res, url) {
    let rel = decodeURIComponent(url.pathname);
    if (rel === '/') rel = '/index.html';
    const file = path.normalize(path.join(PUBLIC_DIR, rel));
    if (!file.startsWith(PUBLIC_DIR)) return send(res, 403, 'Forbidden', 'text/plain');
    fs.readFile(file, (err, buf) => {
        if (err) return send(res, 404, 'Not found', 'text/plain');
        const ext = path.extname(file).toLowerCase();
        const body = (ext === '.html' || ext === '.js') && !/\.min\.js$/.test(file) ? rewrite(buf.toString('utf8'), ext) : buf;
        send(res, 200, body, MIME[ext] || 'application/octet-stream');
    });
}

http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
        // Small delay so loading states are visible, like the real APIs.
        setTimeout(() => {
            if (url.pathname === '/__mock/firebase-stub.js') {
                return send(res, 200, fs.readFileSync(path.join(__dirname, 'firebase-stub.js')), MIME['.js']);
            }
            if (url.pathname.startsWith('/__mock/profile')) {
                return send(res, 200, { email: data.ME.email, name: data.ME.name, given_name: 'Anna', family_name: 'Keller' });
            }
            if (url.pathname.startsWith('/__mock/aps')) return handleAps(req, res, url);
            if (url.pathname.startsWith('/api/') || url.pathname === '/load' || url.pathname === '/save') return handleApi(req, res, url, body);
            serveStatic(req, res, url);
        }, url.pathname.startsWith('/__mock/aps') ? 120 : 0);
    });
}).listen(PORT, () => console.log(`Mockup running at http://localhost:${PORT}/ (fake data, no Firebase/Autodesk)`));
