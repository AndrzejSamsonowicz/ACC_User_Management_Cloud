/**
 * Review before sync.
 *
 * Wraps the existing Sync buttons (syncModalUsers / syncOnly): before anything is
 * sent to Forma, it compares the table with each project's current members and
 * shows what will change (added, product changes, already set up, removed).
 * Only after the user confirms does the original sync run, unchanged.
 *
 * Everything shown here (emails, project names) comes from the table or from
 * Autodesk, so it is rendered with DOM APIs (textContent), never as HTML.
 */
(function () {
    'use strict';

    const originalSyncModalUsers = window.syncModalUsers;
    const originalSyncOnly = window.syncOnly;
    if (typeof originalSyncModalUsers !== 'function' || typeof originalSyncOnly !== 'function') {
        console.warn('review-sync.js: sync functions not found, review step disabled');
        return;
    }

    const PRODUCT_LABELS = {
        designCollaboration: 'Design Collaboration',
        modelCoordination: 'Model Coordination',
        takeoff: 'Preconstruction',
        build: 'Build',
        cost: 'Cost Management',
        forma: 'Site & Building Design'
    };
    const AVATAR_COLORS = ['#F9B8AE', '#A9C7EC', '#BCDB95', '#FDD8A3', '#C9A7F9', '#9FDCD6', '#F5B5D6', '#D8D0C2'];

    // ---------- small DOM helpers ----------
    const el = (tag, className, text) => {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    };
    const initials = (email) => {
        const parts = String(email || '').split('@')[0].split(/[._-]+/).filter(Boolean);
        if (!parts.length) return '?';
        return (parts[0][0] + (parts[1] ? parts[1][0] : (parts[0][1] || ''))).toUpperCase();
    };
    const avatar = (email) => {
        const a = el('span', 'fm-avatar', initials(email));
        let sum = 0;
        for (const ch of String(email)) sum += ch.charCodeAt(0);
        a.style.background = AVATAR_COLORS[sum % AVATAR_COLORS.length];
        return a;
    };

    // ---------- comparing the table with a project ----------
    const accessOf = (products, key) => {
        const p = (products || []).find(x => x.key === key);
        return (p && p.access) || 'none';
    };
    // Same source the table and the sync use: the projectAdministration product.
    const isAdmin = (products) => accessOf(products, 'projectAdministration') === 'administrator';

    // Role: when the Role cell was not edited the table keeps the original role IDs
    // (language-proof, same rule the sync itself uses); otherwise compare names.
    function roleChange(tableUser, projectUser) {
        const meta = tableUser.metadata || {};
        const currentRoles = Array.isArray(projectUser.roles) ? projectUser.roles.filter(r => r && r.name) : [];
        const currentIds = (projectUser.roleIds && projectUser.roleIds.length ? projectUser.roleIds : currentRoles.map(r => r.id)).filter(Boolean);
        const currentNames = currentRoles.map(r => r.name);
        if (Array.isArray(meta.roleIds) && meta.roleIds.length) {
            const a = [...new Set(meta.roleIds)].sort().join(',');
            const b = [...new Set(currentIds)].sort().join(',');
            return a === b ? null : `Role: ${currentNames.join(', ') || 'none'} → ${meta.allRoles || 'none'}`;
        }
        const wanted = String(meta.allRoles || meta.role || '').split(',').map(s => s.trim()).filter(Boolean);
        const norm = (list) => [...new Set(list.map(s => s.toLowerCase()))].sort().join(',');
        if (!wanted.length || norm(wanted) === norm(currentNames)) return null;
        return `Role: ${currentNames.join(', ') || 'none'} → ${wanted.join(', ')}`;
    }

    // Company: only a non-empty company in the table is sent, so only that can change it.
    function companyChange(tableUser, projectUser) {
        const wanted = String((tableUser.metadata && tableUser.metadata.company) || '').trim();
        const current = String(projectUser.companyName || '').trim();
        if (!wanted || wanted.toLowerCase() === current.toLowerCase()) return null;
        return `Company: ${current || 'none'} → ${wanted}`;
    }

    function describeChange(tableUser, projectUser) {
        const notes = [];
        const role = roleChange(tableUser, projectUser);
        const company = companyChange(tableUser, projectUser);
        if (role) notes.push(role);
        if (company) notes.push(company);
        const wasAdmin = isAdmin(projectUser.products);
        const willBeAdmin = isAdmin(tableUser.products);
        if (willBeAdmin && !wasAdmin) notes.push('Becomes project admin');
        if (!willBeAdmin && wasAdmin) notes.push('No longer project admin');
        if (!willBeAdmin) {
            const gains = [];
            const losses = [];
            Object.entries(PRODUCT_LABELS).forEach(([key, label]) => {
                const now = accessOf(projectUser.products, key) !== 'none';
                const next = accessOf(tableUser.products, key) !== 'none';
                if (next && !now) gains.push(label);
                if (!next && now) losses.push(label);
            });
            if (gains.length) notes.push('Gets ' + gains.join(', '));
            if (losses.length) notes.push('Loses ' + losses.join(', '));
        }
        return notes;
    }

    function diffProject(tableUsers, projectUsers, manageMode) {
        const byEmail = new Map(projectUsers.filter(u => u.email).map(u => [u.email.toLowerCase(), u]));
        const inTable = new Set();
        const added = [], changed = [], same = [], removed = [];
        tableUsers.forEach(user => {
            const email = user.email.toLowerCase();
            inTable.add(email);
            const existing = byEmail.get(email);
            if (!existing) {
                const products = isAdmin(user.products)
                    ? ['Project admin']
                    : Object.entries(PRODUCT_LABELS).filter(([key]) => accessOf(user.products, key) !== 'none').map(([, label]) => label);
                added.push({ email: user.email, note: products.length ? 'Joins with ' + products.join(', ') : 'Joins with Docs and Insight only' });
            } else {
                const notes = describeChange(user, existing);
                (notes.length ? changed : same).push({ email: user.email, note: notes.length ? notes.join('. ') : 'Already set up' });
            }
        });
        if (manageMode) {
            projectUsers.forEach(u => {
                if (u.email && !inTable.has(u.email.toLowerCase())) removed.push({ email: u.email, note: 'Removed from the project' });
            });
        }
        return { added, changed, same, removed };
    }

    async function runLimited(items, limit, fn) {
        const results = new Array(items.length);
        let next = 0;
        const worker = async () => {
            while (next < items.length) {
                const i = next++;
                results[i] = await fn(items[i], i);
            }
        };
        await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
        return results;
    }

    // ---------- the dialog ----------
    function openDialog(title) {
        document.getElementById('fmReviewOverlay')?.remove();
        const overlay = el('div', 'fm-overlay is-open');
        overlay.id = 'fmReviewOverlay';
        overlay.style.zIndex = '15000';
        const dialog = el('div', 'fm-dialog fm-review');
        dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('aria-modal', 'true');
        dialog.setAttribute('aria-labelledby', 'fmReviewTitle');
        const head = el('div', 'fm-dialog-head');
        const h = el('h2', 'fm-dialog-title', title);
        h.id = 'fmReviewTitle';
        const close = el('button', 'fm-dialog-close', '×');
        close.type = 'button';
        close.setAttribute('aria-label', 'Close');
        head.append(h, close);
        const body = el('div', 'fm-dialog-body fm-review-body');
        const foot = el('div', 'fm-dialog-foot');
        dialog.append(head, body, foot);
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
        const remove = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
        const onKey = (e) => { if (e.key === 'Escape') remove(); };
        document.addEventListener('keydown', onKey);
        close.addEventListener('click', remove);
        return { overlay, body, foot, remove, title: h };
    }

    function marker(kind) {
        const m = el('span', `fm-mark fm-mark-${kind}`);
        m.setAttribute('aria-hidden', 'true');
        m.textContent = { added: '+', changed: '', same: '=', removed: '−' }[kind];
        return m;
    }

    function renderProjectBlock(project, diff, open) {
        const block = el('div', 'fm-review-project');
        const toggle = el('button', 'fm-review-project-head');
        toggle.type = 'button';
        toggle.setAttribute('aria-expanded', String(open));
        const chev = el('span', 'fm-chev');
        const name = el('span', 'fm-review-project-name', project.name);
        const parts = [];
        if (diff.added.length) parts.push(`${diff.added.length} added`);
        if (diff.changed.length) parts.push(`${diff.changed.length} changed`);
        if (diff.same.length) parts.push(`${diff.same.length} already set up`);
        if (diff.removed.length) parts.push(`${diff.removed.length} removed`);
        const counts = el('span', 'fm-muted num', parts.join(', ') || 'No changes');
        toggle.append(chev, name, counts);
        const list = el('div', 'fm-review-list');
        list.hidden = !open;
        const addRow = (parent, kind, row) => {
            const r = el('div', `fm-review-row is-${kind}`);
            const who = el('span', 'fm-review-who');
            who.append(avatar(row.email), el('span', 'fm-ell', row.email));
            // Unchanged people sit under the expandable line: no marker, just the indent.
            r.append(kind === 'same' ? el('span') : marker(kind), who, el('span', 'fm-review-note', row.note));
            parent.appendChild(r);
        };
        [['removed', diff.removed], ['added', diff.added], ['changed', diff.changed]].forEach(([kind, rows]) => {
            rows.forEach(row => addRow(list, kind, row));
        });
        // People without changes: one line, expandable, so real changes stay visible.
        if (diff.same.length) {
            const sameToggle = el('button', 'fm-review-row is-same fm-review-same-toggle');
            sameToggle.type = 'button';
            sameToggle.setAttribute('aria-expanded', 'false');
            const sameChev = el('span', 'fm-review-chev-cell');
            sameChev.appendChild(el('span', 'fm-chev'));
            sameToggle.append(sameChev, el('span', 'fm-review-who', `${diff.same.length} ${diff.same.length === 1 ? 'person' : 'people'} with no changes`));
            const sameList = el('div');
            sameList.hidden = true;
            sameToggle.addEventListener('click', () => {
                if (!sameList.childElementCount) diff.same.forEach(row => addRow(sameList, 'same', row));
                sameList.hidden = !sameList.hidden;
                sameToggle.setAttribute('aria-expanded', String(!sameList.hidden));
            });
            list.append(sameToggle, sameList);
        }
        toggle.addEventListener('click', () => {
            list.hidden = !list.hidden;
            toggle.setAttribute('aria-expanded', String(!list.hidden));
        });
        block.append(toggle, list);
        return block;
    }

    async function reviewThen(runSync) {
        // userTableManager is a top-level `let` in user-table-v2.js: a shared global
        // binding, but not a property of window.
        const mgr = (typeof userTableManager !== 'undefined') ? userTableManager : null;
        if (!mgr || typeof mgr.collectTableUsers !== 'function') return runSync();
        if (typeof mgr.checkForDuplicateEmails === 'function' && !mgr.checkForDuplicateEmails()) return;

        const tableUsers = mgr.collectTableUsers();
        const manageMode = mgr.modalMode === 'manage';
        const projects = (mgr.modalProjectIds && mgr.modalProjectIds.length > 1)
            ? mgr.modalProjectIds.map(p => ({ id: p.id, name: p.name }))
            : [{ id: mgr.modalProjectId, name: mgr.modalProjectName || 'This project' }];

        if (!manageMode && tableUsers.length === 0) {
            const d = openDialog('Nothing to sync yet');
            d.body.appendChild(el('p', null, 'Add at least one person to the table, by typing an email or importing them, then sync again.'));
            const ok = el('button', 'fm-btn fm-btn-primary', 'OK');
            ok.type = 'button';
            ok.addEventListener('click', d.remove);
            d.foot.appendChild(ok);
            return;
        }

        const d = openDialog('What will change in Forma');
        const loading = el('p', 'fm-muted', `Comparing your table with the current members of ${projects.length === 1 ? projects[0].name : projects.length + ' projects'}…`);
        d.body.appendChild(loading);

        let diffs;
        try {
            const token = window.currentAccessToken;
            diffs = await runLimited(projects, 3, async (project) => {
                const members = await fetchAllProjectUsers(project.id, token);
                return diffProject(tableUsers, members, manageMode);
            });
        } catch (error) {
            loading.remove();
            const alert = el('div', 'fm-alert fm-alert-error is-visible');
            alert.setAttribute('role', 'alert');
            alert.textContent = `The current members could not be loaded: ${error.message}. Check your connection and try again.`;
            d.body.appendChild(alert);
            const closeBtn = el('button', 'fm-btn', 'Close');
            closeBtn.type = 'button';
            closeBtn.addEventListener('click', d.remove);
            d.foot.appendChild(closeBtn);
            return;
        }
        if (!document.getElementById('fmReviewOverlay')) return; // closed while loading
        loading.remove();

        const total = { added: 0, changed: 0, same: 0, removed: 0 };
        diffs.forEach(x => Object.keys(total).forEach(k => { total[k] += x[k].length; }));
        const changes = total.added + total.changed + total.removed;

        const summary = el('div', 'fm-review-summary');
        [['added', 'people added'], ['changed', 'members changed'], ['same', 'already set up'], ['removed', 'people removed']].forEach(([kind, label]) => {
            if (kind === 'removed' && !manageMode) return;
            const item = el('div', `fm-review-stat is-${kind}`);
            const value = el('span', 'fm-review-stat-value num', String(total[kind]));
            item.append(marker(kind), value, el('span', 'fm-muted', label));
            summary.appendChild(item);
        });
        d.body.appendChild(summary);

        if (total.removed > 0) {
            const warn = el('div', 'fm-alert fm-alert-error is-visible');
            warn.setAttribute('role', 'alert');
            warn.textContent = `${total.removed} ${total.removed === 1 ? 'person is' : 'people are'} not in your table, so the sync removes them from the project. Add them back to the table if they should stay.`;
            d.body.appendChild(warn);
        }

        const listWrap = el('div', 'fm-review-projects');
        projects.forEach((project, i) => listWrap.appendChild(renderProjectBlock(project, diffs[i], projects.length <= 3 || i === 0)));
        d.body.appendChild(listWrap);
        d.body.appendChild(el('p', 'fm-muted fm-review-foot-note', 'Nothing has been sent to Forma yet. Docs and Insight access is added automatically.'));

        const back = el('button', 'fm-btn', 'Back to the table');
        back.type = 'button';
        back.addEventListener('click', d.remove);
        const go = el('button', 'fm-btn fm-btn-primary');
        go.type = 'button';
        // Never block the sync: this preview may not see every kind of edit.
        go.textContent = changes === 0 ? 'Sync anyway' : `Sync ${changes} ${changes === 1 ? 'change' : 'changes'}`;
        if (changes === 0) {
            d.body.insertBefore(el('p', 'fm-muted fm-review-foot-note', 'No differences found between the table and Forma. You can still sync to re-apply the table.'), summary.nextSibling);
        }
        go.addEventListener('click', () => { d.remove(); runSync(); });
        d.foot.append(back, go);
        go.focus();
    }

    window.syncModalUsers = () => reviewThen(originalSyncModalUsers);
    window.syncOnly = () => reviewThen(originalSyncOnly);
})();
