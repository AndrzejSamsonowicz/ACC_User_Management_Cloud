// ============================================================================
// ACCOUNT USERS: ACCESS MATRIX
//
// Replaces the plain "Account users" list. Rows are the hub's people (grouped
// by company or role, or a flat list by email); columns are projects (chosen
// with the gear); each cell shows that person's highest folder access in the
// project. Selecting a cell opens the person's folders in that project with
// level and where the access comes from. Exports to Excel with formatting
// (ExcelJS, public/exceljs.min.js, loaded only when exporting).
//
// Data, per project, loaded lazily and cached for the session:
//   members   - construction/admin project users (company, roles, admin flag)
//   folders   - Data Management folder tree (topFolders + subfolders)
//   perms     - BIM 360 Docs folder permissions (incl. inherited actions)
//
// Depends on: get_account_users.js (accountUsersManager), index.html
// (fetchAllProjectUsers, apsFetch, window.originalProjectsData,
// window.currentHubId, window.currentAccessToken), folders_permissions.js
// (window.FolderPermissions), shared/dom-utils.js (escapeHtml).
// Styles: shared/forma-dialogs.css (.ad-*).
// ============================================================================

(function () {
    'use strict';

    const MAX_FOLDERS_PER_PROJECT = 600;   // safety cap for very large folder trees
    const MAX_FOLDER_DEPTH = 10;
    const ZOOM_MIN = 0.5, ZOOM_MAX = 1.5, ZOOM_STEP = 0.1;

    // Six folder levels -> Forma's four bars (see folders-indented-tree.js)
    const LEVELS = [null,
        { group: 'View', bars: 1, outlined: true, name: 'View only' },
        { group: 'View', bars: 1, outlined: false, name: 'View + Download' },
        { group: 'Create', bars: 2, outlined: true, name: 'View + Download + Publish markups' },
        { group: 'Create', bars: 2, outlined: false, name: 'View + Download + Publish markups + Upload' },
        { group: 'Edit', bars: 3, outlined: false, name: 'View + Download + Publish markups + Upload + Edit' },
        { group: 'Manage', bars: 4, outlined: false, name: 'Full administrative controls' }];
    const PRODUCT_LABELS = {
        docs: 'Docs', projectAdministration: 'Project Admin', designCollaboration: 'Design Collaboration',
        modelCoordination: 'Model Coordination', takeoff: 'Preconstruction', build: 'Build',
        cost: 'Cost Management', forma: 'Site & Building Design', insight: 'Insight'
    };
    const AVATAR_COLORS = ['#F9B8AE', '#A9C7EC', '#BCDB95', '#FDD8A3', '#C9A7F9', '#9FDCD6', '#F5B5D6', '#D8D0C2'];

    // ---------- session state ----------
    const S = {
        accountId: null, hubName: '', hubId: null,
        people: [],              // [{ key, email, name, company, role }]
        projects: [],            // [{ id, name }]
        shown: new Set(),        // project ids shown as columns
        view: 'company',         // 'company' | 'role' | 'email'
        sort: { col: 'email', asc: true },   // By email view
        expanded: new Set(),     // group keys opened in grouped views (all start folded)
        search: '',
        zoom: 1,
        selected: null,          // { email, projectId }
        data: new Map(),         // projectId -> project state (below)
        exportWhenReady: false
    };

    const limit = (n) => {
        let active = 0; const queue = [];
        const next = () => {
            if (active >= n || !queue.length) return;
            active++;
            const { fn, resolve, reject } = queue.shift();
            fn().then(resolve, reject).finally(() => { active--; next(); });
        };
        return (fn) => new Promise((resolve, reject) => { queue.push({ fn, resolve, reject }); next(); });
    };
    const runProject = limit(3);   // projects loaded at once
    const runRequest = limit(6);   // Autodesk requests at once

    const esc = (v) => escapeHtml(v == null ? '' : String(v));
    const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
    const lc = (v) => String(v || '').toLowerCase();

    // ---------- loading ----------

    function projectState(id) {
        if (!S.data.has(id)) S.data.set(id, { status: 'idle', members: null, folders: null, perms: null, error: null, capped: false, effective: new Map() });
        return S.data.get(id);
    }

    function token() { return window.currentAccessToken; }
    const hubIdForDM = () => { const h = String(S.hubId || ''); return h.startsWith('b.') ? h : `b.${h}`; };

    async function dmGet(url) {
        const res = await runRequest(() => (typeof apsFetch === 'function' ? apsFetch : fetch)(url, { headers: { Authorization: `Bearer ${token()}` } }));
        if (!res.ok) { const e = new Error(`HTTP ${res.status}`); e.status = res.status; throw e; }
        return res.json();
    }

    async function loadFolders(projectId, st) {
        const pid = projectId.startsWith('b.') ? projectId : `b.${projectId}`;
        const top = await dmGet(`https://developer.api.autodesk.com/project/v1/hubs/${hubIdForDM()}/projects/${pid}/topFolders`);
        const folders = [];
        const visit = async (list, parentPath, depth) => {
            for (const f of list) {
                if (folders.length >= MAX_FOLDERS_PER_PROJECT) { st.capped = true; return; }
                const name = f.attributes?.displayName || f.attributes?.name || 'Folder';
                const path = parentPath ? `${parentPath} / ${name}` : name;
                folders.push({ id: f.id, name, path, depth });
            }
            if (depth >= MAX_FOLDER_DEPTH) return;
            await Promise.all(list.map(async (f) => {
                if (folders.length >= MAX_FOLDERS_PER_PROJECT) { st.capped = true; return; }
                const name = f.attributes?.displayName || f.attributes?.name || 'Folder';
                const parent = folders.find(x => x.id === f.id);
                let children = [];
                try {
                    const data = await dmGet(`https://developer.api.autodesk.com/data/v1/projects/${pid}/folders/${encodeURIComponent(f.id)}/contents?filter[type]=folders`);
                    children = (data.data || []).filter(x => x.type === 'folders' && !x.attributes?.hidden);
                } catch (e) { children = []; }
                if (children.length) await visit(children, parent ? parent.path : name, depth + 1);
            }));
        };
        await visit((top.data || []).filter(x => x.type === 'folders' && !x.attributes?.hidden), '', 0);
        // Keep tree order: parents before children, siblings alphabetical by path.
        folders.sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: 'base' }));
        return folders;
    }

    /** Who is in a project (one quick request), shared by every caller. */
    function ensureMembers(projectId) {
        const st = projectState(projectId);
        if (st.membersPromise) return st.membersPromise;
        st.membersStatus = 'loading';
        st.membersPromise = runRequest(() => fetchAllProjectUsers(projectId, token())).then(users => {
            st.members = new Map();
            users.forEach(u => {
                if (!u.email) return;
                st.members.set(lc(u.email), {
                    companyId: u.companyId || null,
                    companyName: u.companyName || '',
                    roleIds: u.roleIds || (u.roles || []).map(r => r.id),
                    roleNames: Object.fromEntries((u.roles || []).map(r => [r.id, r.name])),
                    isAdmin: !!(u.accessLevels && u.accessLevels.projectAdmin), // account admins get no folder access by that alone
                    products: (u.products || []).filter(p => p.access && p.access !== 'none').map(p => PRODUCT_LABELS[p.key] || p.key)
                });
            });
            st.membersStatus = 'done';
        }).catch(e => {
            st.membersStatus = 'error';
            st.error = e.status === 403 ? 'You are not allowed to read this project.' : (e.message || 'Could not be read.');
        }).finally(scheduleRender);
        return st.membersPromise;
    }

    /** Member lists of every project in the hub: needed to know who is in at least one project. */
    function loadAllMembers() {
        S.projects.forEach(p => ensureMembers(p.id));
    }

    /** Folder tree and permissions of a shown project (the slow part). */
    async function loadProject(projectId) {
        const st = projectState(projectId);
        if (st.status !== 'idle') return;
        st.status = 'folders';
        scheduleRender();
        try {
            await ensureMembers(projectId);
            if (st.membersStatus !== 'done') throw new Error(st.error || 'Could not be read.');
            st.folders = await loadFolders(projectId, st);
            st.perms = new Map();
            let failed = 0;
            await Promise.all(st.folders.map(f => runRequest(async () => {
                const perms = await window.FolderPermissions.fetchFolderPermissions(projectId, f.id, token());
                if (perms === null) failed++;
                st.perms.set(f.id, perms || []);
            })));
            st.permFailures = failed;
            st.status = 'done';
        } catch (e) {
            st.status = 'error';
            st.error = st.error || (e.status === 403 ? 'You are not allowed to read this project.' : (e.message || 'Could not be read.'));
        }
        scheduleRender();
        if (S.exportWhenReady && allShownReady()) { S.exportWhenReady = false; exportExcel(); }
    }

    function loadShownProjects() {
        S.projects.filter(p => S.shown.has(p.id)).forEach(p => runProject(() => loadProject(p.id)));
    }

    const membersLoaded = () => S.projects.filter(p => { const st = S.data.get(p.id); return st && (st.membersStatus === 'done' || st.membersStatus === 'error'); }).length;

    /** People in at least one project of the hub whose member list is known. */
    function inAnyProject(person) {
        for (const p of S.projects) {
            const st = S.data.get(p.id);
            if (st && st.members && st.members.has(person.key)) return true;
        }
        return false;
    }
    const peopleInProjects = () => S.people.filter(inAnyProject);

    const allShownReady = () => S.projects.filter(p => S.shown.has(p.id))
        .every(p => { const st = S.data.get(p.id); return st && (st.status === 'done' || st.status === 'error'); });

    // ---------- access computation ----------

    /** Effective level of one person on one folder, and where it comes from. */
    function folderAccess(perms, email, member) {
        let best = null;
        for (const p of perms) {
            let source = null;
            if (p.subjectType === 'USER' && lc(p.email) === email) source = 'Directly';
            else if (p.subjectType === 'ROLE' && member.roleIds.includes(p.subjectId) && lc(p.name) !== 'administrator') source = `Role: ${p.name || member.roleNames[p.subjectId] || ''}`;
            else if (p.subjectType === 'COMPANY' && member.companyId && p.subjectId === member.companyId) source = `Company: ${p.name || member.companyName}`;
            if (!source) continue;
            const level = window.FolderPermissions.actionsToPermissionLevel(p.actions, p.inheritActions);
            const inherited = !(p.actions && p.actions.length) && !!(p.inheritActions && p.inheritActions.length);
            if (!best || level > best.level) best = { level, source: inherited ? `${source}, inherited` : source };
        }
        return best;
    }

    /** { kind: 'loading'|'out'|'admin'|'none'|'level'|'error', level, folders[] } for a person in a project. */
    function cellInfo(email, projectId) {
        const st = S.data.get(projectId);
        if (!st || !st.members) return { kind: st && st.membersStatus === 'error' ? 'error' : 'loading' };
        const member = st.members.get(email);
        if (!member) return { kind: 'out' };
        if (member.isAdmin) return { kind: 'admin', level: 6, member };
        if (st.status === 'error') return { kind: 'error', member };
        if (st.status !== 'done') return { kind: 'pending', member };
        if (!st.effective.has(email)) {
            const folders = [];
            let max = 0;
            st.folders.forEach(f => {
                const a = folderAccess(st.perms.get(f.id) || [], email, member);
                if (a && a.level) { folders.push({ folder: f, level: a.level, source: a.source }); max = Math.max(max, a.level); }
            });
            st.effective.set(email, { max, folders });
        }
        const eff = st.effective.get(email);
        return eff.max ? { kind: 'level', level: eff.max, member, folders: eff.folders } : { kind: 'none', member, folders: [] };
    }

    // ---------- rendering ----------

    function barsHtml(level, small) {
        const lv = LEVELS[level];
        let out = '';
        for (let i = 0; i < 4; i++) {
            const cls = lv && i < lv.bars ? ((i === lv.bars - 1 && lv.outlined) ? 'is-part' : 'is-on') : '';
            out += `<span class="ad-bar ${cls}"></span>`;
        }
        return `<span class="ad-bars${small ? ' is-small' : ''}" aria-hidden="true">${out}</span>`;
    }

    function cellHtml(info) {
        switch (info.kind) {
            case 'loading': return '<span class="ad-cell-note">Loading</span>';
            case 'error': return '<span class="ad-cell-note">Not readable</span>';
            case 'out': return '<span class="ad-cell-note is-out">Not in project</span>';
            case 'pending': return `${barsHtml(0)}<span class="ad-cell-note">Reading folders</span>`;
            case 'admin': return `${barsHtml(6)}<span class="ad-cell-label">Project admin</span>`;
            case 'none': return `${barsHtml(0)}<span class="ad-cell-note">No folders</span>`;
            default: return `${barsHtml(info.level)}<span class="ad-cell-label">${LEVELS[info.level].group}</span>`;
        }
    }

    function cellTitle(info, person, project) {
        const who = person.email;
        switch (info.kind) {
            case 'out': return `${who} is not in ${project.name}`;
            case 'admin': return `${who}: project admin in ${project.name}`;
            case 'none': return `${who} is in ${project.name} but has no folder access`;
            case 'level': return `${who} in ${project.name}: ${LEVELS[info.level].name}`;
            default: return `${project.name}: still loading`;
        }
    }

    const shownProjects = () => S.projects.filter(p => S.shown.has(p.id));

    /** Same rules as the other searches: "a & b" shows either; words of a part must all appear. */
    function matches(person) {
        const groups = lc(S.search).split('&').map(x => x.trim().split(/\s+/).filter(Boolean)).filter(g => g.length);
        if (!groups.length) return true;
        const hay = lc(`${person.email} ${person.name} ${person.company} ${person.role}`);
        return groups.some(words => words.every(w => hay.includes(w)));
    }

    // Companies and roles start folded; while searching, every matching group is open.
    function isFolded(key) {
        return !S.expanded.has(key) && !S.search.trim();
    }

    function groupKey(person) {
        if (S.view === 'company') return person.company || '';
        return person.role || '';
    }

    function avatarHtml(person, i) {
        const parts = (person.name && person.name !== person.email ? person.name : person.email.split('@')[0]).split(/[\s._-]+/).filter(Boolean);
        const initials = ((parts[0] || '?')[0] + (parts[1] ? parts[1][0] : (parts[0] || '?')[1] || '')).toUpperCase();
        let sum = 0; for (const ch of person.email) sum += ch.charCodeAt(0);
        return `<span class="ad-avatar" style="background:${AVATAR_COLORS[sum % AVATAR_COLORS.length]}" aria-hidden="true">${esc(initials)}</span>`;
    }

    function personRowHtml(person, projects, indent) {
        const cells = projects.map(p => {
            const info = cellInfo(person.key, p.id);
            const sel = S.selected && S.selected.email === person.key && S.selected.projectId === p.id;
            return `<td class="ad-cell${sel ? ' is-selected' : ''}" data-email="${esc(person.key)}" data-project="${esc(p.id)}" tabindex="${sel ? 0 : -1}" title="${esc(cellTitle(info, person, p))}">${cellHtml(info)}</td>`;
        }).join('');
        const company = person.company ? esc(person.company) : '<span class="ad-unset">No company</span>';
        const role = person.role ? esc(person.role) : '<span class="ad-unset">No role</span>';
        const lead = `<td class="ad-name${indent ? ' is-indented' : ''}"><span class="ad-who">${avatarHtml(person)}<span class="ad-ell" title="${esc(person.email)}">${esc(person.email)}</span></span></td>`;
        if (S.view === 'email') return `<tr>${lead}<td class="ad-text">${company}</td><td class="ad-text">${role}</td>${cells}<td class="ad-gear-col"></td></tr>`;
        return `<tr>${lead}<td class="ad-text">${S.view === 'company' ? role : company}</td>${cells}<td class="ad-gear-col"></td></tr>`;
    }

    function groupRowHtml(key, members, projects) {
        const none = !key;
        const label = none ? (S.view === 'company' ? 'No company' : 'No role') : key;
        const folded = isFolded(key);
        const reach = projects.map(p => {
            const st = S.data.get(p.id);
            if (!st || !st.members) return '<td class="ad-group-cell"></td>';
            const n = members.filter(m => st.members.has(m.key)).length;
            return `<td class="ad-group-cell">${n} of ${members.length}</td>`;
        }).join('');
        const icon = none ? '<span class="ad-group-icon is-none" aria-hidden="true"></span>'
            : `<span class="ad-group-icon" aria-hidden="true">${S.view === 'company'
                ? '<svg width="14" height="14" viewBox="0 0 16 16" fill="#999"><path d="M13.19 8.06h-1.84V4a.77.77 0 0 0-.29-.59l-2.59-2a.75.75 0 0 0-1 0L4.92 3.65a.77.77 0 0 0-.26.57v1.11H2.82a.74.74 0 0 0-.75.75V14a.75.75 0 0 0 .75.75h10.37a.75.75 0 0 0 .75-.75V8.81a.74.74 0 0 0-.75-.75Zm-7.13 4h-1.3V10.8h1.3Zm0-2.69h-1.3V8.11h1.3Zm2.59 2.73H7.36v-1.3h1.29Zm0-2.69H7.36v-1.3h1.29Zm0-2.68H7.36v-1.3h1.29Zm2.6 5.37H10v-1.3h1.3Z"/></svg>'
                : '<svg width="14" height="14" viewBox="0 0 24 24" fill="#999"><path d="M4.38,8.93A3.66,3.66,0,1,1,8,12.63,3.66,3.66,0,0,1,4.38,8.93Zm6,5.55H5.63A4.53,4.53,0,0,0,1.1,19a.75.75,0,0,0,.75.74H14.17a.75.75,0,0,0,.75-.74A4.54,4.54,0,0,0,10.39,14.48Zm6.46-1.85A3.66,3.66,0,0,0,20.51,9V9a3.66,3.66,0,1,0-3.66,3.66ZM18,14.47H16.17a.55.55,0,0,0-.62.49,1.44,1.44,0,0,0,.36.95,12.09,12.09,0,0,1,.7,1.2A12.53,12.53,0,0,1,17.42,19c.15.46.33.75.75.75h3.61a.74.74,0,0,0,.74-.74A4.53,4.53,0,0,0,18,14.47Z"/></svg>'}</span>`;
        return `<tr class="ad-group-row"><td colspan="2" class="ad-group-name"><button type="button" class="fm-plain ad-group-toggle" data-group="${esc(key)}" aria-expanded="${folded ? 'false' : 'true'}"><span class="ad-chev" aria-hidden="true"></span>${icon}<strong class="${none ? 'is-none' : ''}">${esc(label)}</strong><span class="ad-muted">${members.length} ${members.length === 1 ? 'person' : 'people'}</span></button></td>${reach}<td class="ad-gear-col"></td></tr>`;
    }

    function headerHtml(projects) {
        const sortInd = (col) => S.view === 'email' && S.sort.col === col ? `<span class="ad-sort" aria-hidden="true">${S.sort.asc ? '▲' : '▼'}</span>` : '';
        const ariaSort = (col) => S.view === 'email' ? ` aria-sort="${S.sort.col === col ? (S.sort.asc ? 'ascending' : 'descending') : 'none'}"` : '';
        let lead;
        if (S.view === 'email') {
            lead = `<th scope="col" class="ad-name ad-sortable" data-sort="email"${ariaSort('email')}>Email${sortInd('email')}</th>`
                + `<th scope="col" class="ad-text ad-sortable" data-sort="company"${ariaSort('company')}>Company${sortInd('company')}</th>`
                + `<th scope="col" class="ad-text ad-sortable" data-sort="role"${ariaSort('role')}>Role${sortInd('role')}</th>`;
        } else {
            lead = `<th scope="col" class="ad-name">${S.view === 'company' ? 'Company and people' : 'Role and people'}</th>`
                + `<th scope="col" class="ad-text">${S.view === 'company' ? 'Role' : 'Company'}</th>`;
        }
        const cols = projects.map(p => {
            const st = S.data.get(p.id);
            const sub = st && st.members ? `${st.members.size} members` : 'Loading';
            return `<th scope="col" class="ad-proj" title="${esc(p.name)}"><span class="ad-ell">${esc(p.name)}</span><span class="ad-proj-sub">${sub}</span></th>`;
        }).join('');
        const gear = `<th scope="col" class="ad-gear-col"><button type="button" class="fm-plain ad-gear" id="adGearBtn" aria-haspopup="true" aria-expanded="false" aria-label="Choose projects to show" title="Choose projects to show"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" stroke-linejoin="round"/></svg></button></th>`;
        return `<thead><tr>${lead}${cols}${gear}</tr></thead>`;
    }

    function colgroupHtml(projects) {
        const lead = S.view === 'email'
            ? '<col style="width:300px"><col style="width:180px"><col style="width:160px">'
            : '<col style="width:340px"><col style="width:170px">';
        return `<colgroup>${lead}${projects.map(() => '<col style="width:118px">').join('')}<col style="width:48px"></colgroup>`;
    }

    function visiblePeople() {
        return peopleInProjects().filter(matches);
    }

    function sortedForEmailView(list) {
        const key = S.sort.col;
        const dir = S.sort.asc ? 1 : -1;
        return list.slice().sort((a, b) => {
            const av = key === 'email' ? a.email : (a[key] || '￿');
            const bv = key === 'email' ? b.email : (b[key] || '￿');
            return dir * av.localeCompare(bv, undefined, { numeric: true, sensitivity: 'base' }) || a.email.localeCompare(b.email);
        });
    }

    function grouped(list) {
        const map = new Map();
        list.forEach(p => { const k = groupKey(p); if (!map.has(k)) map.set(k, []); map.get(k).push(p); });
        return [...map.entries()]
            .sort((a, b) => (!a[0]) - (!b[0]) || a[0].localeCompare(b[0], undefined, { sensitivity: 'base' }))
            .map(([k, members]) => [k, members.sort((a, b) => a.email.localeCompare(b.email))]);
    }

    let renderQueued = false;
    function scheduleRender() {
        if (renderQueued) return;
        renderQueued = true;
        // A timer, not requestAnimationFrame: it also runs while the tab is in the background.
        setTimeout(() => { renderQueued = false; render(); }, 16);
    }

    function render() {
        const root = document.getElementById('accessDashboard');
        if (!root) return;
        const projects = shownProjects();
        const people = visiblePeople();
        let body = '';
        let groupCount = 0;
        if (S.view === 'email') {
            body = sortedForEmailView(people).map(p => personRowHtml(p, projects, false)).join('');
        } else {
            const groups = grouped(people);
            groupCount = groups.length;
            body = groups.map(([k, members]) => groupRowHtml(k, members, projects)
                + (isFolded(k) ? '' : members.map(m => personRowHtml(m, projects, true)).join(''))).join('');
        }
        const table = root.querySelector('#adTable');
        table.innerHTML = colgroupHtml(projects) + headerHtml(projects) + `<tbody>${body}</tbody>`;
        table.style.zoom = String(S.zoom);
        if (!people.length) {
            table.querySelector('tbody').innerHTML = `<tr><td class="ad-empty" colspan="${projects.length + (S.view === 'email' ? 4 : 3)}">No one matches "${esc(S.search)}". Change or clear the search.</td></tr>`;
        }

        root.querySelector('#adCount').textContent = S.view === 'email'
            ? `${people.length} of ${plural(peopleInProjects().length, 'person', 'people')}. ${projects.length} of ${plural(S.projects.length, 'project', 'projects')} shown.`
            : `${plural(people.length, 'person', 'people')} in ${S.view === 'company' ? plural(groupCount, 'company', 'companies') : plural(groupCount, 'role', 'roles')}. ${projects.length} of ${plural(S.projects.length, 'project', 'projects')} shown.`;
        root.querySelector('#adZoomValue').textContent = `${Math.round(S.zoom * 100)}%`;
        root.querySelectorAll('[data-view]').forEach(b => {
            const on = b.dataset.view === S.view;
            b.setAttribute('aria-selected', String(on));
            b.classList.toggle('is-active', on);
        });

        // Progress: member lists of every project first, then folder access of the shown ones
        const prog = root.querySelector('#adProgress');
        const membersDone = membersLoaded();
        const loading = projects.filter(p => { const st = S.data.get(p.id); return !st || (st.status !== 'done' && st.status !== 'error'); }).length;
        let text = '', pct = 100;
        if (membersDone < S.projects.length) {
            text = `Reading who is in which project: ${membersDone} of ${plural(S.projects.length, 'project', 'projects')}. People appear as their projects are read.`;
            pct = Math.round(100 * membersDone / Math.max(1, S.projects.length));
        } else if (loading) {
            text = `Reading folder access: ${projects.length - loading} of ${plural(projects.length, 'project', 'projects')} done.`;
            pct = Math.round(100 * (projects.length - loading) / Math.max(1, projects.length));
        }
        if (text && S.exportWhenReady) text += ' The export starts when it finishes.';
        prog.hidden = !text;
        prog.querySelector('span').textContent = text;
        prog.querySelector('.ad-progress-bar').style.width = `${pct}%`;
        updateSubtitle();

        renderPanel();
    }

    // Deep folder trees: indent at most this many levels, then say where the folder is.
    const MAX_INDENT_LEVELS = 4;
    function shortParentPath(path) {
        const parts = String(path).split(' / ').slice(0, -1);
        return parts.length > 3 ? `${parts[0]} / \u2026 / ${parts.slice(-2).join(' / ')}` : parts.join(' / ');
    }

    function updateSubtitle() {
        const sub = document.getElementById('adSub');
        if (!sub || !S.projects.length) return;
        const inProjects = peopleInProjects().length;
        let text = `${S.hubName}: ${plural(inProjects, 'person', 'people')} in at least one of ${plural(S.projects.length, 'project', 'projects')}.`;
        const left = [];
        if (membersLoaded() === S.projects.length) {
            const none = S.people.length - inProjects;
            if (none) left.push(`${plural(none, 'person', 'people')} in no project`);
        }
        if (S.notInvited) left.push(`${S.notInvited} not invited`);
        if (left.length) text += ` Not shown: ${left.join(' and ')}.`;
        sub.textContent = text;
    }

    function renderPanel() {
        const panel = document.getElementById('adPanel');
        if (!panel) return;
        if (!S.selected) { panel.hidden = true; return; }
        panel.hidden = false;
        const person = S.people.find(p => p.key === S.selected.email);
        const project = S.projects.find(p => p.id === S.selected.projectId);
        if (!person || !project) { panel.hidden = true; return; }
        const info = cellInfo(person.key, project.id);
        const st = S.data.get(project.id);
        const meta = [];
        meta.push(person.company || 'No company', person.role || 'No role');
        let body;
        if (info.kind === 'loading' || info.kind === 'pending') body = '<p class="ad-panel-note">Still reading this project’s folders…</p>';
        else if (info.kind === 'error') body = `<p class="ad-panel-note">${esc(st && st.error || 'This project could not be read.')}</p>`;
        else if (info.kind === 'out') body = `<p class="ad-panel-note">Not a member of ${esc(project.name)}.</p>`;
        else if (info.kind === 'admin') body = '<p class="ad-panel-note">Project admin: full access to every folder.</p>';
        else if (!info.folders.length) body = '<p class="ad-panel-note">A member of the project, but no folder is shared with this person, their role or their company.</p>';
        else {
            body = '<div class="ad-panel-grid"><span class="ad-panel-h">Folder</span><span class="ad-panel-h">Access level</span><span class="ad-panel-h">Comes from</span>'
                + info.folders.map(f => `<span class="ad-panel-folder" style="padding-left:${Math.min(f.folder.depth, MAX_INDENT_LEVELS) * 16}px" title="${esc(f.folder.path)}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3C3C3C" stroke-width="1.5" aria-hidden="true"><path d="M3 6.5A1.5 1.5 0 014.5 5H9l2 2h8.5A1.5 1.5 0 0121 8.5v9a1.5 1.5 0 01-1.5 1.5h-15A1.5 1.5 0 013 17.5z" stroke-linejoin="round"/></svg><span class="ad-panel-fname"><span class="ad-ell">${esc(f.folder.name)}</span>${f.folder.depth > MAX_INDENT_LEVELS ? `<span class="ad-panel-parent ad-ell">in ${esc(shortParentPath(f.folder.path))}</span>` : ''}</span></span>`
                    + `<span class="ad-panel-level" title="${esc(LEVELS[f.level].name)}">${barsHtml(f.level)}<span>${LEVELS[f.level].group}</span></span>`
                    + `<span class="ad-panel-src">${esc(f.source)}</span>`).join('')
                + '</div>';
        }
        if (st && st.capped) body += `<p class="ad-panel-note">Only the first ${MAX_FOLDERS_PER_PROJECT} folders of this project were read.</p>`;
        const products = info.member && info.member.products && info.member.products.length ? ` Products: ${info.member.products.join(', ')}.` : '';
        panel.innerHTML = `<div class="ad-panel-head"><div><span class="ad-muted">Folder access in ${esc(project.name)}</span><strong>${esc(person.email)}</strong><span class="ad-muted">${esc(meta.join(', '))}.${esc(products)}</span></div><button type="button" class="fm-dialog-close" id="adPanelClose" aria-label="Close folder access">&times;</button></div><div class="ad-panel-body">${body}</div>`;
        panel.querySelector('#adPanelClose').addEventListener('click', () => { S.selected = null; render(); });
    }

    // ---------- gear (projects to show) ----------

    function storageKey() { return `fmAccessProjects:${S.accountId}`; }
    function saveShown() { try { localStorage.setItem(storageKey(), JSON.stringify([...S.shown])); } catch { /* ignore */ } }

    function openGear() {
        closeGear();
        const btn = document.getElementById('adGearBtn');
        if (!btn) return;
        btn.setAttribute('aria-expanded', 'true');
        const pop = document.createElement('div');
        pop.className = 'ad-gear-pop';
        pop.id = 'adGearPop';
        pop.setAttribute('role', 'dialog');
        pop.setAttribute('aria-label', 'Projects to show');
        pop.innerHTML = `<label class="ad-gear-search"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="1.8" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.3-4.3" stroke-linecap="round"/></svg><input type="text" class="fm-input" aria-label="Search projects" placeholder="Search projects" autocomplete="off"></label>
            <div class="ad-gear-list"></div>
            <div class="ad-gear-actions"><button type="button" class="fm-plain" data-g="all">Show all</button><button type="button" class="fm-plain" data-g="none">Hide all</button></div>
            <button type="button" class="fm-plain ad-gear-reset" data-g="reset">Reset</button>`;
        const list = pop.querySelector('.ad-gear-list');
        const fill = (q) => {
            list.replaceChildren(...S.projects.filter(p => !q || lc(p.name).includes(lc(q))).map(p => {
                const row = document.createElement('label');
                row.className = 'ad-gear-item';
                const cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.checked = S.shown.has(p.id);
                cb.addEventListener('change', () => {
                    if (cb.checked) S.shown.add(p.id); else S.shown.delete(p.id);
                    saveShown(); loadShownProjects(); scheduleRender();
                });
                const name = document.createElement('span');
                name.className = 'ad-ell';
                name.textContent = p.name;
                row.append(cb, name);
                return row;
            }));
        };
        fill('');
        pop.querySelector('input').addEventListener('input', (e) => fill(e.target.value));
        pop.addEventListener('click', (e) => {
            const g = e.target.closest('[data-g]');
            if (!g) return;
            if (g.dataset.g === 'all' || g.dataset.g === 'reset') S.projects.forEach(p => S.shown.add(p.id));
            if (g.dataset.g === 'none') S.shown.clear();
            if (g.dataset.g === 'reset') { try { localStorage.removeItem(storageKey()); } catch { /* ignore */ } }
            else saveShown();
            fill(pop.querySelector('input').value);
            loadShownProjects(); scheduleRender();
        });
        document.getElementById('accessDashboard').querySelector('.ad-matrix-wrap').appendChild(pop);
        pop.querySelector('input').focus();
    }

    function closeGear() {
        const pop = document.getElementById('adGearPop');
        if (pop) pop.remove();
        const btn = document.getElementById('adGearBtn');
        if (btn) btn.setAttribute('aria-expanded', 'false');
    }

    // ---------- dialog ----------

    function buildDialog() {
        document.getElementById('accessDashboardOverlay')?.remove();
        // Fixed markup; every Autodesk value is escaped where it is rendered.
        document.body.insertAdjacentHTML('beforeend', `
        <div id="accessDashboardOverlay" class="fm-overlay is-open ad-overlay">
          <div class="fm-dialog ad-dialog" id="accessDashboard" role="dialog" aria-modal="true" aria-labelledby="adTitle">
            <div class="ad-head">
              <div class="ad-head-text">
                <h2 class="fm-dialog-title" id="adTitle">Account users</h2>
                <span class="ad-muted" id="adSub"></span>
              </div>
              <div class="ad-head-actions">
                <button type="button" class="fm-btn" id="adRefresh">Refresh</button>
                <button type="button" class="fm-btn fm-btn-primary" id="adExport">Export to Excel</button>
                <button type="button" class="fm-dialog-close" id="adClose" aria-label="Close">&times;</button>
              </div>
            </div>
            <div class="ad-toolbar">
              <div class="ad-tabs" role="tablist" aria-label="Group people by">
                <button type="button" class="fm-plain" role="tab" data-view="company">By company</button>
                <button type="button" class="fm-plain" role="tab" data-view="role">By role</button>
                <button type="button" class="fm-plain" role="tab" data-view="email">By email</button>
              </div>
              <label class="ad-search"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="1.8" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.3-4.3" stroke-linecap="round"/></svg><input type="text" class="fm-input" id="adSearch" aria-label="Search people, companies or roles" placeholder="Search, e.g. andrew &amp; bob" title="Separate with &amp; to show several, e.g. andrew &amp; bob" autocomplete="off"></label>
              <span class="ad-muted" id="adCount" aria-live="polite"></span>
              <div class="ad-zoom" role="group" aria-label="Zoom">
                <button type="button" class="fm-plain" data-zoom="-1" aria-label="Zoom out">−</button><span id="adZoomValue">100%</span><button type="button" class="fm-plain" data-zoom="1" aria-label="Zoom in">+</button>
              </div>
              <span class="ad-muted ad-zoom-hint">or Ctrl + scroll</span>
              <div class="ad-legend"><strong>Highest folder access in the project:</strong>
                <span>${barsHtml(2, true)}View</span><span>${barsHtml(4, true)}Create</span><span>${barsHtml(5, true)}Edit</span><span>${barsHtml(6, true)}Manage</span>
              </div>
            </div>
            <div class="ad-progress" id="adProgress" hidden><span></span><div class="ad-progress-track"><div class="ad-progress-bar"></div></div></div>
            <div class="fm-alert fm-alert-error au-error" id="adError" role="alert"></div>
            <div class="ad-body">
              <div class="ad-matrix-wrap">
                <div class="ad-loading" id="adLoading"><span class="fm-spinner fm-spinner-dark"></span><span>Loading the hub’s people and projects</span></div>
                <div class="ad-matrix" id="adMatrix" hidden><table class="ad-table" id="adTable"></table></div>
              </div>
              <aside class="ad-panel" id="adPanel" aria-label="Folder access of the selected person" hidden></aside>
            </div>
          </div>
        </div>`);

        const root = document.getElementById('accessDashboard');
        const close = () => { document.getElementById('accessDashboardOverlay')?.remove(); document.removeEventListener('keydown', onKey); };
        const onKey = (e) => {
            if (e.key !== 'Escape') return;
            if (document.getElementById('adGearPop')) { closeGear(); return; }
            if (S.selected) { S.selected = null; render(); return; }
            close();
        };
        document.addEventListener('keydown', onKey);
        root.querySelector('#adClose').addEventListener('click', close);
        root.querySelector('#adRefresh').addEventListener('click', () => {
            S.data.clear();
            if (window.FolderPermissions?.resetPermissionsCache) window.FolderPermissions.resetPermissionsCache();
            loadAllMembers(); loadShownProjects(); render();
        });
        root.querySelector('#adExport').addEventListener('click', () => {
            if (allShownReady()) exportExcel();
            else { S.exportWhenReady = true; render(); }
        });
        root.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => { S.view = b.dataset.view; S.expanded.clear(); closeGear(); render(); }));
        const search = root.querySelector('#adSearch');
        search.addEventListener('input', () => { S.search = search.value; scheduleRender(); });
        search.addEventListener('keydown', (e) => { if (e.key === 'Escape' && search.value) { e.stopPropagation(); search.value = ''; S.search = ''; render(); } });
        root.querySelectorAll('[data-zoom]').forEach(b => b.addEventListener('click', () => setZoom(S.zoom + Number(b.dataset.zoom) * ZOOM_STEP)));

        const matrix = root.querySelector('#adMatrix');
        matrix.addEventListener('wheel', (e) => {
            if (!e.ctrlKey) return;
            e.preventDefault();
            setZoom(S.zoom + (e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP));
        }, { passive: false });
        matrix.addEventListener('click', (e) => {
            if (e.target.closest('#adGearBtn')) { document.getElementById('adGearPop') ? closeGear() : openGear(); return; }
            const toggle = e.target.closest('.ad-group-toggle');
            if (toggle) { const k = toggle.dataset.group; S.expanded.has(k) ? S.expanded.delete(k) : S.expanded.add(k); render(); return; }
            const sortTh = e.target.closest('.ad-sortable');
            if (sortTh) { const c = sortTh.dataset.sort; S.sort = S.sort.col === c ? { col: c, asc: !S.sort.asc } : { col: c, asc: true }; render(); return; }
            const cell = e.target.closest('td.ad-cell');
            if (cell) { S.selected = { email: cell.dataset.email, projectId: cell.dataset.project }; render(); focusSelected(); }
        });
        matrix.addEventListener('keydown', (e) => {
            const cell = e.target.closest && e.target.closest('td.ad-cell');
            if (!cell || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
            e.preventDefault();
            const row = cell.parentElement;
            let target = null;
            if (e.key === 'ArrowLeft') target = cell.previousElementSibling;
            if (e.key === 'ArrowRight') target = cell.nextElementSibling;
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                let r = e.key === 'ArrowUp' ? row.previousElementSibling : row.nextElementSibling;
                while (r && !r.querySelector('td.ad-cell')) r = e.key === 'ArrowUp' ? r.previousElementSibling : r.nextElementSibling;
                if (r) target = r.children[cell.cellIndex];
            }
            if (target && target.classList.contains('ad-cell')) {
                S.selected = { email: target.dataset.email, projectId: target.dataset.project };
                render(); focusSelected();
            }
        });
        if (!S.outsideClickWired) {
            S.outsideClickWired = true;
            document.addEventListener('click', (e) => {
                const pop = document.getElementById('adGearPop');
                if (pop && !pop.contains(e.target) && !e.target.closest('#adGearBtn')) closeGear();
            }, true);
        }
    }

    function focusSelected() {
        const cell = document.querySelector('#adTable td.ad-cell.is-selected');
        if (cell) cell.focus({ preventScroll: false });
    }

    function setZoom(z) {
        S.zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 10) / 10));
        const table = document.getElementById('adTable');
        if (table) table.style.zoom = String(S.zoom);
        const v = document.getElementById('adZoomValue');
        if (v) v.textContent = `${Math.round(S.zoom * 100)}%`;
    }

    // ---------- Excel export (ExcelJS) ----------

    function loadExcelJS() {
        if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
        return new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = 'exceljs.min.js?v=4.4.0';
            s.onload = () => (window.ExcelJS ? resolve(window.ExcelJS) : reject(new Error('Excel library did not load')));
            s.onerror = () => reject(new Error('Excel library could not be loaded'));
            document.head.appendChild(s);
        });
    }

    const XL_FILL = { View: 'FFDCEFF8', Create: 'FFA9D8EF', Edit: 'FF5DB6E2', Manage: 'FF0696D7' };
    const XL_BORDER = { top: { style: 'thin', color: { argb: 'FFDCDCDC' } }, bottom: { style: 'thin', color: { argb: 'FFDCDCDC' } }, left: { style: 'thin', color: { argb: 'FFDCDCDC' } }, right: { style: 'thin', color: { argb: 'FFDCDCDC' } } };

    function xlCellText(info) {
        switch (info.kind) {
            case 'out': return '';
            case 'admin': return 'Project admin';
            case 'none': return 'No folders';
            case 'level': return LEVELS[info.level].group;
            case 'error': return 'Not readable';
            default: return 'Not loaded';
        }
    }

    function styleLevelCell(cell, text) {
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = XL_BORDER;
        if (text === 'Project admin' || text === 'Manage') {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XL_FILL.Manage } };
            cell.font = { color: { argb: 'FFFFFFFF' }, bold: text === 'Project admin' };
        } else if (XL_FILL[text]) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XL_FILL[text] } };
            cell.font = { color: { argb: 'FF1F3B4D' } };
        } else if (text) {
            cell.font = { color: { argb: 'FF808080' }, italic: true };
        }
    }

    function headerRow(ws, values) {
        const row = ws.addRow(values);
        row.font = { bold: true };
        row.alignment = { vertical: 'middle', wrapText: true };
        row.height = 32;
        row.eachCell(c => { c.border = { bottom: { style: 'medium', color: { argb: 'FF3C3C3C' } } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } }; });
        return row;
    }

    function addGroupedSheet(wb, mode, projects) {
        const ws = wb.addWorksheet(mode === 'company' ? 'By company' : 'By role', { properties: { outlineLevelRow: 1 }, views: [{ state: 'frozen', xSplit: 2, ySplit: 1 }] });
        ws.properties.outlineProperties = { summaryBelow: false };
        ws.columns = [{ width: 44 }, { width: 24 }, ...projects.map(() => ({ width: 16 }))];
        headerRow(ws, [mode === 'company' ? 'Company / person' : 'Role / person', mode === 'company' ? 'Role' : 'Company', ...projects.map(p => p.name)]);
        const saveView = S.view; S.view = mode;
        const groups = grouped(peopleInProjects());
        S.view = saveView;
        groups.forEach(([k, members]) => {
            const label = k || (mode === 'company' ? 'No company' : 'No role');
            const g = ws.addRow([`${label} (${members.length})`, '', ...projects.map(p => {
                const st = S.data.get(p.id);
                return st && st.members ? `${members.filter(m => st.members.has(m.key)).length} of ${members.length}` : '';
            })]);
            g.font = { bold: true, color: { argb: k ? 'FF3C3C3C' : 'FF666666' } };
            g.eachCell({ includeEmpty: true }, c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFEF' } }; c.border = XL_BORDER; });
            members.forEach(m => {
                const other = mode === 'company' ? m.role : m.company;
                const r = ws.addRow([m.email, other || (mode === 'company' ? 'No role' : 'No company'), ...projects.map(p => xlCellText(cellInfo(m.key, p.id)))]);
                r.outlineLevel = 1;
                r.getCell(1).alignment = { indent: 2 };
                r.getCell(1).border = XL_BORDER;
                r.getCell(2).border = XL_BORDER;
                if (!other) r.getCell(2).font = { color: { argb: 'FF808080' }, italic: true };
                projects.forEach((p, i) => styleLevelCell(r.getCell(3 + i), r.getCell(3 + i).value));
            });
        });
    }

    function addEmailSheet(wb, projects) {
        const ws = wb.addWorksheet('By email', { views: [{ state: 'frozen', xSplit: 1, ySplit: 1 }] });
        ws.columns = [{ width: 40 }, { width: 28 }, { width: 24 }, ...projects.map(() => ({ width: 16 }))];
        headerRow(ws, ['Email', 'Company', 'Role', ...projects.map(p => p.name)]);
        peopleInProjects().sort((a, b) => a.email.localeCompare(b.email)).forEach(m => {
            const r = ws.addRow([m.email, m.company || 'No company', m.role || 'No role', ...projects.map(p => xlCellText(cellInfo(m.key, p.id)))]);
            [1, 2, 3].forEach(i => { r.getCell(i).border = XL_BORDER; });
            if (!m.company) r.getCell(2).font = { color: { argb: 'FF808080' }, italic: true };
            if (!m.role) r.getCell(3).font = { color: { argb: 'FF808080' }, italic: true };
            projects.forEach((p, i) => styleLevelCell(r.getCell(4 + i), r.getCell(4 + i).value));
        });
        ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 3 + projects.length } };
    }

    function addFolderSheet(wb, projects) {
        const ws = wb.addWorksheet('Folder access', { views: [{ state: 'frozen', ySplit: 1 }] });
        ws.columns = [{ width: 40 }, { width: 26 }, { width: 22 }, { width: 28 }, { width: 50 }, { width: 14 }, { width: 46 }, { width: 34 }];
        headerRow(ws, ['Email', 'Company', 'Role', 'Project', 'Folder', 'Access', 'Access level', 'Comes from']);
        peopleInProjects().sort((a, b) => a.email.localeCompare(b.email)).forEach(m => {
            projects.forEach(p => {
                const info = cellInfo(m.key, p.id);
                if (info.kind === 'admin') {
                    const r = ws.addRow([m.email, m.company || 'No company', m.role || 'No role', p.name, 'All folders', 'Manage', 'Project admin', 'Project admin']);
                    styleLevelCell(r.getCell(6), 'Manage');
                } else if (info.kind === 'level') {
                    info.folders.forEach(f => {
                        const r = ws.addRow([m.email, m.company || 'No company', m.role || 'No role', p.name, f.folder.path, LEVELS[f.level].group, LEVELS[f.level].name, f.source]);
                        styleLevelCell(r.getCell(6), LEVELS[f.level].group);
                    });
                }
            });
        });
        ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 8 } };
    }

    function addAboutSheet(wb, projects) {
        const ws = wb.addWorksheet('About this export');
        ws.columns = [{ width: 30 }, { width: 80 }];
        const add = (a, b, bold) => { const r = ws.addRow([a, b]); if (bold) r.font = { bold: true }; return r; };
        add('Account users: folder access', '', true).font = { bold: true, size: 14 };
        add('Hub', S.hubName);
        add('Exported', new Date().toLocaleString());
        add('People', `${peopleInProjects().length} in at least one project (not listed: people in no project${S.notInvited ? `, ${S.notInvited} not invited` : ''})`);
        add('Projects included', projects.map(p => p.name).join(', '));
        ws.addRow([]);
        add('Access levels', '', true);
        [['View', 'View only, or View + Download'], ['Create', 'Adds Publish markups, or Publish markups + Upload'], ['Edit', 'Adds Edit'], ['Manage', 'Full administrative controls'], ['Project admin', 'Full access to every folder of the project'], ['No folders', 'In the project, but no folder is shared with them, their role or their company']]
            .forEach(([a, b]) => { const r = add(a, b); styleLevelCell(r.getCell(1), a); r.getCell(1).alignment = { horizontal: 'left' }; });
        const failing = projects.filter(p => { const st = S.data.get(p.id); return st && (st.status === 'error' || st.permFailures || st.capped); });
        if (failing.length) {
            ws.addRow([]);
            add('Incomplete', '', true);
            failing.forEach(p => { const st = S.data.get(p.id); add(p.name, st.status === 'error' ? st.error : st.capped ? `Only the first ${MAX_FOLDERS_PER_PROJECT} folders were read.` : `${st.permFailures} folder(s) could not be read.`); });
        }
    }

    async function exportExcel() {
        const btn = document.getElementById('adExport');
        const label = btn ? btn.textContent : '';
        try {
            if (btn) { btn.disabled = true; btn.textContent = 'Preparing the file'; }
            const ExcelJS = await loadExcelJS();
            const projects = shownProjects();
            const wb = new ExcelJS.Workbook();
            wb.creator = 'Forma User Manager';
            wb.created = new Date();
            addGroupedSheet(wb, 'company', projects);
            addGroupedSheet(wb, 'role', projects);
            addEmailSheet(wb, projects);
            addFolderSheet(wb, projects);
            addAboutSheet(wb, projects);
            const buf = await wb.xlsx.writeBuffer();
            const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const a = document.createElement('a');
            const safeHub = String(S.hubName || 'hub').replace(/[\\/:*?"<>|]+/g, ' ').trim();
            a.href = URL.createObjectURL(blob);
            a.download = `Account access - ${safeHub} - ${new Date().toISOString().slice(0, 10)}.xlsx`;
            document.body.appendChild(a);
            a.click();
            setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
        } catch (e) {
            const err = document.getElementById('adError');
            if (err) { err.textContent = `The Excel file could not be made (${e.message}). Try again.`; err.classList.add('is-visible'); }
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = label || 'Export to Excel'; }
            render();
        }
    }

    // ---------- open ----------

    window.openAccessDashboard = async function (accountId, accountName) {
        S.accountId = accountId;
        S.hubName = accountName || '';
        S.hubId = window.currentHubId || accountId;
        S.selected = null; S.search = ''; S.expanded.clear(); S.exportWhenReady = false;
        if (S.loadedFor !== accountId) { S.data.clear(); S.loadedFor = accountId; }
        buildDialog();
        const root = document.getElementById('accessDashboard');
        root.querySelector('#adSub').textContent = S.hubName;
        try {
            const users = await accountUsersManager.fetchAllAccountUsersWith2LeggedAuth(accountId);
            if (!document.getElementById('accessDashboard')) return;
            const seen = new Set();
            const listed = (users || []).filter(u => u && u.email);
            S.notInvited = listed.filter(u => lc(u.status) === 'not_invited').length;
            S.people = listed.filter(u => lc(u.status) !== 'not_invited').map(u => ({
                key: lc(u.email), email: u.email, name: u.name || '',
                company: (u.company_name || '').trim(), role: (u.default_role || u.role || '').trim()
            })).filter(p => !seen.has(p.key) && seen.add(p.key));
            S.projects = (window.originalProjectsData || []).map(p => ({ id: p.id, name: p.name || p.id }))
                .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
            let saved = null;
            try { saved = JSON.parse(localStorage.getItem(storageKey()) || 'null'); } catch { saved = null; }
            S.shown = new Set(Array.isArray(saved) ? saved.filter(id => S.projects.some(p => p.id === id)) : S.projects.map(p => p.id));
            root.querySelector('#adLoading').hidden = true;
            root.querySelector('#adMatrix').hidden = false;
            render();
            loadAllMembers();
            loadShownProjects();
        } catch (e) {
            if (!document.getElementById('accessDashboard')) return;
            root.querySelector('#adLoading').hidden = true;
            const err = root.querySelector('#adError');
            err.textContent = `The hub's people could not be loaded (${e.message}). Close this dialog and try again.`;
            err.classList.add('is-visible');
        }
    };
})();
