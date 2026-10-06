/*
 * Activity log: records every change this app makes in Forma, and shows them on
 * the Activity page (like Forma's own Project Admin > Activity log).
 *
 * Recording: call ActivityLog.record({ tool, type, member, ... }) right after a
 * change succeeds. Entries are queued and sent to POST /api/activity in batches
 * (the server encrypts and stores them), so a sync of hundreds of members costs
 * a handful of requests. Call ActivityLog.flush() when a sync finishes.
 *
 * Everything shown here comes from Autodesk data or other users' input, so the
 * page is built with DOM APIs / textContent only - never innerHTML.
 */
(function () {
    'use strict';

    const MAX_BATCH = 200;        // server limit per request
    // Every /api request counts against the server's 100-per-15-minutes limit
    // (shared with Autodesk token requests), so save after a quiet moment, at
    // most once a minute during a long sync, or as soon as a full batch is ready.
    const QUIET_MS = 5000;
    const MAX_WAIT_MS = 60000;
    const MAX_QUEUE = 2000;       // drop oldest beyond this if the server is unreachable
    const PAGE_SIZE = 200;

    const queue = [];
    let flushTimer = null;
    let firstQueuedAt = 0;
    let flushing = null;

    function authHeaders() {
        const token = window.getAuthToken && window.getAuthToken();
        return token ? { 'Authorization': `Bearer ${token}` } : null;
    }

    async function apiFetch(path, options = {}) {
        let headers = authHeaders();
        if (!headers) throw new Error('Not signed in');
        let res = await fetch(`${window.location.origin}${path}`, { ...options, headers: { ...headers, ...(options.headers || {}) } });
        if (res.status === 401 && window.refreshAuthToken) {
            await window.refreshAuthToken();
            headers = authHeaders();
            if (headers) res = await fetch(`${window.location.origin}${path}`, { ...options, headers: { ...headers, ...(options.headers || {}) } });
        }
        return res;
    }

    // Project names come from the hub's project list (Admin API ids, no "b." prefix)
    function projectNameFor(projectId) {
        if (!projectId) return '';
        const id = String(projectId).replace(/^b\./, '');
        const list = window.originalProjectsData || [];
        const project = list.find(p => p.id === id);
        return project ? project.name : '';
    }

    /**
     * Queue one activity entry.
     * @param {object} e
     *   tool:       'Project users' | 'Account users' | 'Folder access'
     *   type:       e.g. 'Member added' (see ACTIVITY_TYPES in server.js)
     *   member:     who/what was changed (email, company or role name)
     *   memberType: 'member' | 'company' | 'role'  (folder access only)
     *   projectId / project, folder, details (free text, e.g. "Edit")
     */
    function record(e) {
        try {
            queue.push({
                at: Date.now(),
                tool: e.tool,
                type: e.type,
                actorName: window.currentAutodeskUserName || '',
                hub: e.hub || window.currentHubName || '',
                project: e.project || projectNameFor(e.projectId),
                member: e.member || '',
                memberType: e.memberType || '',
                folder: e.folder || '',
                details: e.details || ''
            });
            if (queue.length > MAX_QUEUE) queue.splice(0, queue.length - MAX_QUEUE);
            if (queue.length >= MAX_BATCH) { flush(); return; }
            if (!firstQueuedAt) firstQueuedAt = Date.now();
            clearTimeout(flushTimer);
            flushTimer = setTimeout(flush, Math.min(QUIET_MS, Math.max(0, firstQueuedAt + MAX_WAIT_MS - Date.now())));
        } catch (err) {
            console.warn('Activity log: could not queue entry', err);
        }
    }

    // Send everything queued. Never throws - logging must not break a sync.
    function flush() {
        clearTimeout(flushTimer);
        flushTimer = null;
        firstQueuedAt = 0;
        if (flushing) return flushing.then(() => (queue.length ? flush() : undefined));
        if (queue.length === 0) return Promise.resolve();
        flushing = (async () => {
            while (queue.length > 0) {
                const batch = queue.slice(0, MAX_BATCH);
                try {
                    const res = await apiFetch('/api/activity', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ entries: batch })
                    });
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    queue.splice(0, batch.length);
                } catch (err) {
                    console.warn('Activity log: could not save entries, will retry', err.message);
                    flushTimer = setTimeout(flush, 30000);
                    break;
                }
            }
        })().finally(() => { flushing = null; });
        return flushing;
    }

    // Last chance when the tab closes: send what's left without waiting
    window.addEventListener('pagehide', () => {
        const headers = authHeaders();
        if (!headers || queue.length === 0) return;
        try {
            fetch(`${window.location.origin}/api/activity`, {
                method: 'POST',
                keepalive: true,
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({ entries: queue.splice(0, MAX_BATCH) })
            });
        } catch (err) { /* nothing more we can do */ }
    });

    // ------------------------------------------------------------------
    // Activity page
    // ------------------------------------------------------------------

    const state = { entries: [], next: null, loading: false, loaded: false };

    const el = (tag, className, text) => {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined && text !== null) node.textContent = text;
        return node;
    };

    const dateFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

    // Forma-style sentence: bold names, blue object names
    function describe(entry) {
        const frag = document.createDocumentFragment();
        const text = (t) => frag.appendChild(document.createTextNode(t));
        const strong = (t) => frag.appendChild(el('strong', null, t || 'Someone'));
        const obj = (t) => frag.appendChild(el('span', 'fm-act-obj', t || 'unknown'));
        const kind = entry.memberType && entry.memberType !== 'member' ? entry.memberType : 'member';

        if (entry.unreadable) {
            text('This entry could not be decrypted.');
            return frag;
        }
        strong(entry.actorName || entry.actorEmail);
        switch (entry.type) {
            case 'Member added':
                text(' added member '); strong(entry.member); text(' to project '); obj(entry.project); break;
            case 'Member updated':
                text(' updated member '); strong(entry.member); text(' in project '); obj(entry.project); break;
            case 'Member removed':
                text(' removed member '); strong(entry.member); text(' from project '); obj(entry.project); break;
            case 'Account member added':
                text(' added member '); strong(entry.member); text(' to account '); obj(entry.hub); break;
            case 'Account member updated':
                text(' updated member '); strong(entry.member); text(' in account '); obj(entry.hub); break;
            case 'Company created':
                text(' created company '); strong(entry.member); text(' in account '); obj(entry.hub); break;
            case 'Folder permission given':
                text(` gave ${kind} `); strong(entry.member); text(' permission to folder '); obj(entry.folder);
                text(' in project '); obj(entry.project); break;
            case 'Folder permission changed':
                text(` changed ${kind} `); strong(entry.member); text('’s permission to folder '); obj(entry.folder);
                text(' in project '); obj(entry.project); break;
            case 'Folder permission removed':
                text(` removed ${kind} `); strong(entry.member); text('’s permission to folder '); obj(entry.folder);
                text(' in project '); obj(entry.project); break;
            default:
                text(` ${entry.type}`);
        }
        text('.');
        if (entry.details) frag.appendChild(el('span', 'fm-act-extra', ` ${entry.details}`));
        return frag;
    }

    function detailsText(entry) {
        const span = document.createElement('span');
        span.appendChild(describe(entry));
        return span.textContent;
    }

    function filtered() {
        const q = (document.getElementById('activitySearch')?.value || '').trim().toLowerCase();
        const type = document.getElementById('activityTypeFilter')?.value || '';
        const actor = document.getElementById('activityActorFilter')?.value || '';
        return state.entries.filter(e =>
            (!type || e.type === type) &&
            (!actor || (e.actorName || e.actorEmail) === actor) &&
            (!q || detailsText(e).toLowerCase().includes(q))
        );
    }

    function fillSelect(id, values, allLabel) {
        const select = document.getElementById(id);
        if (!select) return;
        const current = select.value;
        select.replaceChildren(new Option(allLabel, ''));
        [...values].sort((a, b) => a.localeCompare(b)).forEach(v => select.appendChild(new Option(v, v)));
        select.value = values.has(current) ? current : '';
    }

    function render() {
        const list = document.getElementById('activityList');
        if (!list) return;
        fillSelect('activityTypeFilter', new Set(state.entries.map(e => e.type)), 'All activity types');
        fillSelect('activityActorFilter', new Set(state.entries.map(e => e.actorName || e.actorEmail).filter(Boolean)), 'All members');

        const rows = filtered();
        const head = el('div', 'fm-trow fm-trow-head fm-act-row');
        ['Date', 'Tool', 'Activity type', 'Member', 'Activity details'].forEach(h => head.appendChild(el('div', null, h)));
        list.replaceChildren(head);

        if (!state.loaded && state.loading) {
            list.appendChild(el('div', 'fm-empty', 'Loading activity…'));
        } else if (state.entries.length === 0) {
            const empty = el('div', 'fm-empty');
            empty.appendChild(el('h2', null, 'No activity yet'));
            empty.appendChild(el('span', null, 'Changes you make in Forma from this app show up here: people added, updated or removed, and folder access.'));
            list.appendChild(empty);
        } else if (rows.length === 0) {
            list.appendChild(el('div', 'fm-empty', 'No activity matches these filters.'));
        } else {
            rows.forEach(e => {
                const row = el('div', 'fm-trow fm-act-row');
                row.appendChild(el('div', 'fm-act-date num', dateFmt.format(new Date(e.at))));
                row.appendChild(el('div', 'fm-ell', e.tool));
                row.appendChild(el('div', 'fm-ell', e.type));
                const who = el('div', 'fm-ell', e.actorName || e.actorEmail || '');
                if (e.actorEmail) who.title = e.actorEmail;
                row.appendChild(who);
                const details = el('div', 'fm-act-details');
                details.appendChild(describe(e));
                row.appendChild(details);
                list.appendChild(row);
            });
        }

        const count = document.getElementById('activityCount');
        if (count) {
            count.textContent = state.entries.length === 0 ? '' :
                (rows.length === state.entries.length ? `${rows.length} entries` : `${rows.length} of ${state.entries.length} entries`)
                + (state.next ? ' loaded' : '');
        }
        const more = document.getElementById('activityLoadMore');
        if (more) {
            more.hidden = !state.next;
            more.disabled = state.loading;
            more.textContent = state.loading ? 'Loading…' : 'Load older activity';
        }
    }

    async function loadPage() {
        if (state.loading) return;
        state.loading = true;
        render();
        try {
            const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
            if (state.next) params.set('after', state.next);
            const res = await apiFetch(`/api/activity?${params}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            state.entries = state.entries.concat(data.entries || []);
            state.next = data.next;
            state.loaded = true;
            showError('');
        } catch (err) {
            showError(`Activity couldn't be loaded (${err.message}). Try again in a moment.`);
        } finally {
            state.loading = false;
            render();
        }
    }

    function showError(message) {
        const box = document.getElementById('activityError');
        if (!box) return;
        box.textContent = message;
        box.hidden = !message;
    }

    async function refresh() {
        await flush(); // include anything this tab just did
        state.entries = [];
        state.next = null;
        state.loaded = false;
        await loadPage();
    }

    function csvCell(v) {
        const s = String(v ?? '');
        // Leading = + - @ would run as a formula in Excel
        const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
        return `"${safe.replace(/"/g, '""')}"`;
    }

    async function exportAll() {
        const btn = document.getElementById('activityExportBtn');
        if (btn) { btn.disabled = true; btn.lastChild.textContent = 'Exporting…'; }
        try {
            while (state.next) await loadPage();
            const rows = filtered();
            const lines = [['Date', 'Tool', 'Activity type', 'Member', 'Member email', 'Activity details'].map(csvCell).join(',')];
            rows.forEach(e => lines.push([
                new Date(e.at).toISOString(), e.tool, e.type, e.actorName || '', e.actorEmail || '', detailsText(e)
            ].map(csvCell).join(',')));
            const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `activity-log-${new Date().toISOString().slice(0, 10)}.csv`;
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        } finally {
            if (btn) { btn.disabled = false; btn.lastChild.textContent = 'Export'; }
        }
    }

    let wired = false;
    function show() {
        if (!wired) {
            wired = true;
            document.getElementById('activitySearch')?.addEventListener('input', render);
            document.getElementById('activityTypeFilter')?.addEventListener('change', render);
            document.getElementById('activityActorFilter')?.addEventListener('change', render);
            document.getElementById('activityLoadMore')?.addEventListener('click', loadPage);
            document.getElementById('activityRefreshBtn')?.addEventListener('click', refresh);
            document.getElementById('activityExportBtn')?.addEventListener('click', exportAll);
        }
        refresh();
    }

    window.ActivityLog = { record, flush, show };
})();
