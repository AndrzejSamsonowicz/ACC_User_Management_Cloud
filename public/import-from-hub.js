// ============================================================================
// COPY PEOPLE FROM THE HUB (account) INTO THE PEOPLE TABLE
//
// Lists everyone in the selected hub (Account users), lets you tick people,
// and adds them to the "People to add" table with their email, company and
// default role. Hub members have no project product access, so the access
// columns are left for you to tick.
//
// Depends on: get_account_users.js (accountUsersManager), user-table-v2.js
// (userTableManager), shared/dom-utils.js. Styles: shared/forma-dialogs.css
// (.au-* table, .hi-*).
// ============================================================================

(function () {
    'use strict';

    let hubUsers = [];
    let lastClickedIndex = null;

    const el = (tag, className, text) => {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    };

    function closeDialog() {
        const overlay = document.getElementById('importHubOverlay');
        if (overlay) overlay.remove();
        document.removeEventListener('keydown', onKey);
    }

    function onKey(event) {
        if (event.key === 'Escape') closeDialog();
    }

    function hubName() {
        const label = document.getElementById('hubPickerLabel');
        return (label && label.textContent.trim()) || 'this hub';
    }

    // Account id for the HQ API: the hub id without its "b." prefix.
    const accountIdOf = (hubId) => String(hubId || '').replace(/^b\./, '');

    /** The BIM 360 / Forma hubs this Autodesk sign-in can see. */
    async function loadHubs() {
        const response = await fetch('https://developer.api.autodesk.com/project/v1/hubs', {
            headers: { 'Authorization': `Bearer ${window.currentAccessToken}` }
        });
        if (!response.ok) throw new Error(`hubs could not be listed (${response.status})`);
        const data = await response.json();
        return (data.data || [])
            .filter(h => h.attributes?.extension?.type === 'hubs:autodesk.bim360:Account')
            .map(h => ({ id: accountIdOf(h.id), name: h.attributes.name }))
            .sort((a, b) => a.name.localeCompare(b.name));
    }
    // ---------- dialog shell ----------

    function buildDialog() {
        closeDialog();
        const searchIcon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="1.8" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.3-4.3" stroke-linecap="round"/></svg>';
        const filter = (col, label, example) =>
            `<td><label class="au-filter">${searchIcon}<input type="text" class="fm-input" data-col="${col}" placeholder="Search, e.g. ${example}" title="Separate with &amp; to show several, e.g. ${example}" aria-label="Filter by ${label}" autocomplete="off"></label></td>`;

        // Fixed markup only; every hub value is added later with textContent.
        document.body.insertAdjacentHTML('beforeend', `
            <div id="importHubOverlay" class="fm-overlay is-open hi-overlay">
                <div class="fm-dialog au-dialog" role="dialog" aria-modal="true" aria-labelledby="importHubTitle">
                    <div class="fm-dialog-head">
                        <div class="hi-head">
                            <h2 class="fm-dialog-title" id="importHubTitle">Copy from the hub</h2>
                            <label class="hi-hub-field"><span>Hub</span><select class="fm-input hi-hub" id="importHubSelect" aria-label="Hub to copy people from"></select></label>
                        </div>
                        <button type="button" class="fm-dialog-close" data-hi-close aria-label="Close">&times;</button>
                    </div>
                    <div class="au-status">
                        <span id="importHubSummary" aria-live="polite"></span>
                        <button type="button" class="fm-btn fm-btn-text" id="importHubClearFilters" hidden>Clear filters</button>
                    </div>
                    <div class="au-loading" id="importHubLoading"><span class="fm-spinner fm-spinner-dark"></span><span id="importHubLoadingText">Loading the hub's people</span></div>
                    <div class="fm-alert fm-alert-warning hi-other-hub" id="importHubOtherNote"></div>
                    <div class="fm-alert fm-alert-error au-error" id="importHubError" role="alert"></div>
                    <div class="au-table-wrap" id="importHubTableWrap" hidden>
                        <table class="au-table hi-table">
                            <colgroup><col style="width: 44px"><col style="width: 40%"><col style="width: 30%"><col style="width: 30%"></colgroup>
                            <thead>
                                <tr>
                                    <th scope="col"><input type="checkbox" id="importHubSelectAll" aria-label="Select all shown people" title="Select all shown people"></th>
                                    <th scope="col">Email</th><th scope="col">Company</th><th scope="col">Default role</th>
                                </tr>
                                <tr class="au-filter-row">
                                    <td></td>
                                    ${filter(1, 'email', 'andrew &amp; bob')}
                                    ${filter(2, 'company', 'granite &amp; pinnacle')}
                                    ${filter(3, 'default role', 'architect &amp; engineer')}
                                </tr>
                            </thead>
                            <tbody id="importHubBody"></tbody>
                        </table>
                        <p class="au-empty" id="importHubNoMatch" hidden>No one matches these filters. Change or clear them to see more.</p>
                    </div>
                    <div class="fm-dialog-foot">
                        <span class="hi-foot-note">Access to products is left unticked. Tick it in the table.</span>
                        <button type="button" class="fm-btn" data-hi-close>Cancel</button>
                        <button type="button" class="fm-btn fm-btn-primary" id="importHubAdd" disabled>Add to the table</button>
                    </div>
                </div>
            </div>`);

        const overlay = document.getElementById('importHubOverlay');
        overlay.querySelectorAll('[data-hi-close]').forEach(b => b.addEventListener('click', closeDialog));
        overlay.addEventListener('click', (e) => { if (e.target === overlay) closeDialog(); });
        document.addEventListener('keydown', onKey);

        filterInputs().forEach(input => {
            input.addEventListener('input', applyFilters);
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && input.value) { e.stopPropagation(); input.value = ''; applyFilters(); }
            });
        });
        document.getElementById('importHubClearFilters').addEventListener('click', () => {
            filterInputs().forEach(i => { i.value = ''; });
            applyFilters();
        });
        document.getElementById('importHubSelectAll').addEventListener('change', (e) => {
            rows().forEach(r => { r.querySelector('input').checked = !r.hidden && e.target.checked; });
            updateSelection();
        });
        document.getElementById('importHubBody').addEventListener('click', onRowClick);
        document.getElementById('importHubAdd').addEventListener('click', addSelectedToTable);
    }

    const filterInputs = () => Array.from(document.querySelectorAll('#importHubOverlay .au-filter input'));
    const rows = () => Array.from(document.querySelectorAll('#importHubBody tr'));

    // ---------- table ----------

    function renderTable(users) {
        const body = document.getElementById('importHubBody');
        body.replaceChildren();
        const cell = (value) => {
            const td = el('td');
            if (value) { td.textContent = value; td.title = value; }
            else { td.textContent = 'Not set'; td.className = 'au-unset'; }
            return td;
        };
        users.forEach((u, i) => {
            const tr = el('tr');
            tr.dataset.index = String(i);
            const cbCell = el('td');
            const cb = el('input');
            cb.type = 'checkbox';
            cb.setAttribute('aria-label', `Select ${u.email}`);
            cbCell.appendChild(cb);
            tr.append(cbCell, cell(u.email), cell(u.company_name), cell(u.default_role || u.role));
            body.appendChild(tr);
        });
        applyFilters();
    }

    // Click anywhere on a row toggles it; Shift+click ticks a range of shown rows.
    function onRowClick(event) {
        const tr = event.target.closest('tr');
        if (!tr) return;
        const cb = tr.querySelector('input');
        if (event.target !== cb) cb.checked = !cb.checked;
        const shown = rows().filter(r => !r.hidden);
        const idx = shown.indexOf(tr);
        if (event.shiftKey && lastClickedIndex !== null && idx >= 0) {
            const [lo, hi] = lastClickedIndex < idx ? [lastClickedIndex, idx] : [idx, lastClickedIndex];
            shown.slice(lo, hi + 1).forEach(r => { r.querySelector('input').checked = cb.checked; });
        }
        lastClickedIndex = idx;
        updateSelection();
    }

    /** Same rules as the other filters: case-insensitive, "a & b" shows either, filters combine. */
    function applyFilters() {
        const terms = filterInputs()
            .map(input => ({
                col: Number(input.dataset.col),
                groups: input.value.toLowerCase().split('&')
                    .map(part => part.trim().split(/\s+/).filter(Boolean))
                    .filter(words => words.length > 0)
            }))
            .filter(t => t.groups.length > 0);
        let shown = 0;
        rows().forEach(tr => {
            const match = terms.every(t => {
                const text = (tr.cells[t.col]?.textContent || '').toLowerCase();
                return t.groups.some(words => words.every(w => text.includes(w)));
            });
            tr.hidden = !match;
            if (!match) tr.querySelector('input').checked = false; // never add someone you can't see
            if (match) shown++;
        });
        const total = rows().length;
        const people = n => `${n} ${n === 1 ? 'person' : 'people'}`;
        document.getElementById('importHubSummary').textContent =
            terms.length ? `Showing ${shown} of ${people(total)}` : `${people(total)} in the hub`;
        document.getElementById('importHubClearFilters').hidden = terms.length === 0;
        document.getElementById('importHubNoMatch').hidden = !(terms.length && shown === 0);
        lastClickedIndex = null;
        updateSelection();
    }

    function updateSelection() {
        const shownBoxes = rows().filter(r => !r.hidden).map(r => r.querySelector('input'));
        const ticked = rows().filter(r => r.querySelector('input').checked).length;
        const all = document.getElementById('importHubSelectAll');
        const shownTicked = shownBoxes.filter(b => b.checked).length;
        all.checked = shownBoxes.length > 0 && shownTicked === shownBoxes.length;
        all.indeterminate = shownTicked > 0 && shownTicked < shownBoxes.length;
        rows().forEach(r => r.classList.toggle('is-selected', r.querySelector('input').checked));
        const add = document.getElementById('importHubAdd');
        add.disabled = ticked === 0;
        add.textContent = ticked ? `Add ${ticked} to the table` : 'Add to the table';
    }

    // ---------- add to the people table ----------

    function addSelectedToTable() {
        const mgr = (typeof userTableManager !== 'undefined') ? userTableManager : null;
        if (!mgr) return;
        const tbody = document.getElementById('modalTableBody');
        const existing = new Set(Array.from(tbody.rows)
            .map(r => (r.cells[1]?.textContent || '').trim().toLowerCase())
            .filter(Boolean));

        const added = [];
        const skipped = [];
        rows().filter(r => r.querySelector('input').checked).forEach(tr => {
            const user = hubUsers[Number(tr.dataset.index)];
            const email = (user && user.email || '').trim();
            if (!email) return;
            if (existing.has(email.toLowerCase())) { skipped.push(email); return; }
            const row = mgr.createNewRow();
            row.cells[1].textContent = email;
            row.cells[2].textContent = user.company_name || '';
            row.cells[3].textContent = user.default_role || user.role || '';
            tbody.appendChild(row);
            existing.add(email.toLowerCase());
            added.push(email);
        });
        mgr.updateUserCount();
        if (typeof mgr.recheckDuplicates === 'function') mgr.recheckDuplicates();

        // Say what happened, then let the person close.
        const dialog = document.querySelector('#importHubOverlay .fm-dialog');
        dialog.classList.add('hi-done');
        document.getElementById('importHubTitle').textContent =
            added.length ? `Added ${added.length} ${added.length === 1 ? 'person' : 'people'} to the table` : 'No one was added';
        dialog.querySelector('.au-status').remove();
        document.getElementById('importHubTableWrap').remove();
        const body = el('div', 'hi-result');
        if (added.length) body.appendChild(el('p', null, 'Their email, company and role are filled in. Tick the products they should get, then sync.'));
        if (skipped.length) {
            const note = el('div', 'fm-alert fm-alert-info is-visible');
            note.appendChild(el('strong', null, `${skipped.length} already in the table, so not added again:`));
            const list = el('ul', 'hi-skipped');
            skipped.forEach(e => list.appendChild(el('li', null, e)));
            note.appendChild(list);
            body.appendChild(note);
        }
        dialog.insertBefore(body, dialog.querySelector('.fm-dialog-foot'));
        const foot = dialog.querySelector('.fm-dialog-foot');
        foot.replaceChildren();
        const done = el('button', 'fm-btn fm-btn-primary', 'Done');
        done.type = 'button';
        done.addEventListener('click', closeDialog);
        foot.appendChild(done);
        done.focus();
    }

    // ---------- open ----------

    /** Load and show the people of one hub. */
    async function loadHubPeople(accountId, name) {
        const loading = document.getElementById('importHubLoading');
        const error = document.getElementById('importHubError');
        const wrap = document.getElementById('importHubTableWrap');
        const other = document.getElementById('importHubOtherNote');
        const current = accountIdOf(window.selectedHubId);
        other.textContent = accountId !== current
            ? `Companies and roles come from ${name}. They must also exist in ${hubName()}, or the sync will flag them.`
            : '';
        other.classList.toggle('is-visible', accountId !== current);
        error.classList.remove('is-visible');
        wrap.hidden = true;
        loading.hidden = false;
        document.getElementById('importHubLoadingText').textContent = `Loading the people of ${name}`;
        document.getElementById('importHubSummary').textContent = '';
        filterInputs().forEach(i => { i.value = ''; });
        hubUsers = [];
        document.getElementById('importHubBody').replaceChildren();
        updateSelection();
        try {
            const users = await accountUsersManager.fetchAllAccountUsersWith2LeggedAuth(accountId);
            const select = document.getElementById('importHubSelect');
            if (!select || select.value !== accountId) return; // closed, or another hub picked meanwhile
            hubUsers = (users || [])
                .filter(u => u && u.email)
                .sort((a, b) => a.email.localeCompare(b.email));
            loading.hidden = true;
            wrap.hidden = false;
            renderTable(hubUsers);
            filterInputs()[0]?.focus();
        } catch (e) {
            const select = document.getElementById('importHubSelect');
            if (!select || select.value !== accountId) return;
            loading.hidden = true;
            error.textContent = `The people of ${name} could not be loaded (${e.message}). Check that this app is added under Custom Integrations in that hub's Account Admin, then try again.`;
            error.classList.add('is-visible');
        }
    }

    window.openImportFromHubModal = async function () {
        buildDialog();
        const select = document.getElementById('importHubSelect');
        const loading = document.getElementById('importHubLoading');
        const error = document.getElementById('importHubError');
        const current = accountIdOf(window.selectedHubId);
        if (!current || typeof accountUsersManager === 'undefined') {
            loading.hidden = true;
            error.textContent = 'Choose a hub first, then try again.';
            error.classList.add('is-visible');
            return;
        }
        // Start with the hub you're working in; the full list fills in when it arrives.
        select.appendChild(new Option(hubName(), current));
        select.value = current;
        select.addEventListener('change', () => {
            const opt = select.options[select.selectedIndex];
            loadHubPeople(select.value, opt ? opt.text : 'that hub');
        });
        loadHubs().then(hubs => {
            if (!document.getElementById('importHubSelect')) return;
            const chosen = select.value;
            const list = hubs.some(h => h.id === current) ? hubs : [{ id: current, name: hubName() }, ...hubs];
            select.replaceChildren(...list.map(h => new Option(h.name, h.id)));
            select.value = chosen;
        }).catch(e => console.warn('Copy from the hub: hub list unavailable,', e.message));
        await loadHubPeople(current, hubName());
    };
})();
