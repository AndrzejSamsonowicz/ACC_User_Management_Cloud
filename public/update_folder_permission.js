/**
 * Update Folder Permissions Module
 * Handles syncing folder permissions to ACC
 */

(function() {
    'use strict';

    // (escapeHtml is defined in shared/dom-utils.js, loaded before this file)

    /**
     * Show folder sync modal with progress (Forma look: shared/forma-dialogs.css, .fs-*)
     */
    function showFolderSyncModal() {
        const existingModal = document.getElementById('folderSyncModal');
        if (existingModal) existingModal.remove();

        const modalHTML = `
            <div id="folderSyncModal" class="fm-overlay is-open fs-overlay">
                <div class="fm-dialog fs-dialog" role="dialog" aria-modal="true" aria-labelledby="folderSyncTitle">
                    <div class="fm-dialog-head">
                        <h2 class="fm-dialog-title" id="folderSyncTitle">Sync to Forma</h2>
                        <button type="button" class="fm-dialog-close folder-sync-modal-close" aria-label="Close">&times;</button>
                    </div>
                    <div class="fs-body">
                        <div id="folderSyncProgress" class="fs-progress">
                            <div id="folderSyncStatus" class="fs-status" aria-live="polite">Preparing the sync</div>
                            <div class="fs-track"><div id="folderSyncBar" class="fs-bar"></div></div>
                        </div>
                        <div id="folderSyncResults" hidden>
                            <div id="folderSyncResultsContent"></div>
                        </div>
                    </div>
                    <div class="fm-dialog-foot" id="folderSyncFoot" hidden>
                        <button type="button" class="fm-btn fm-btn-primary folder-sync-modal-close">Done</button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);

        document.querySelectorAll('#folderSyncModal .folder-sync-modal-close').forEach(btn => {
            btn.onclick = () => {
                const modal = document.getElementById('folderSyncModal');
                if (modal) modal.remove();
            };
        });
    }

    /** tone: undefined while working, 'error' when the sync stopped. */
    function updateFolderSyncProgress(message, percent = null, tone) {
        const statusEl = document.getElementById('folderSyncStatus');
        const barEl = document.getElementById('folderSyncBar');

        if (statusEl) {
            statusEl.textContent = message;
            statusEl.classList.toggle('is-error', tone === 'error');
        }
        if (barEl && percent !== null) {
            barEl.style.width = `${percent}%`;
        }
        if (tone === 'error') {
            const foot = document.getElementById('folderSyncFoot');
            if (foot) foot.hidden = false;
        }
    }

    /** "name (folder)" -> row with the name, and the folder on the right. Built with textContent. */
    function syncListRow(entry) {
        const m = /^(.*) \(([^()]*)\)$/.exec(String(entry));
        const row = document.createElement('li');
        const name = document.createElement('span');
        name.className = 'fs-name';
        name.textContent = m ? m[1] : String(entry);
        row.appendChild(name);
        if (m) {
            const folder = document.createElement('span');
            folder.className = 'fs-folder';
            folder.textContent = m[2];
            row.appendChild(folder);
        }
        return row;
    }

    function syncSection(title, entries, opts = {}) {
        const section = document.createElement('section');
        section.className = 'fs-section' + (opts.tone ? ` fm-alert fm-alert-${opts.tone} is-visible` : '');
        const h = document.createElement('h3');
        h.textContent = `${title} (${entries.length})`;
        section.appendChild(h);
        if (opts.hint) {
            const hint = document.createElement('p');
            hint.className = 'fs-hint';
            hint.textContent = opts.hint;
            section.appendChild(hint);
        }
        const list = document.createElement('ul');
        list.className = 'fs-list';
        entries.forEach(e => list.appendChild(opts.plain ? Object.assign(document.createElement('li'), { textContent: String(e) }) : syncListRow(e)));
        section.appendChild(list);
        return section;
    }

    function showFolderSyncResults(summary) {
        const resultsDiv = document.getElementById('folderSyncResults');
        const resultsContent = document.getElementById('folderSyncResultsContent');
        const progressDiv = document.getElementById('folderSyncProgress');
        const syncButton = document.getElementById('folderSyncButton');
        const foot = document.getElementById('folderSyncFoot');
        const title = document.getElementById('folderSyncTitle');

        if (progressDiv) progressDiv.hidden = true;
        if (syncButton) syncButton.style.display = 'none';
        if (!resultsContent) return;
        resultsContent.replaceChildren();

        const errors = summary.errors || [];
        const leftOut = (summary.notInDocsUsers || []).length + (summary.noDocsUsers || []).length;
        if (title) title.textContent = errors.length || leftOut ? 'Sync finished with problems' : 'Sync finished';

        // Counts, as one Forma strip (zero values muted)
        const counts = [
            ['Added', summary.created || 0],
            ['Updated', summary.updated || 0],
            ['Removed', summary.deleted || 0],
            ['Skipped: project admins', summary.skippedAdmins || 0]
        ];
        if (summary.skippedInherited) counts.push(['Skipped: inherited', summary.skippedInherited]);
        const strip = document.createElement('div');
        strip.className = 'fs-counts';
        counts.forEach(([label, n]) => {
            const cell = document.createElement('div');
            cell.className = 'fs-count' + (n ? '' : ' is-zero');
            const value = document.createElement('span');
            value.className = 'fs-count-value';
            value.textContent = String(n);
            const text = document.createElement('span');
            text.className = 'fs-count-label';
            text.textContent = label;
            cell.append(value, text);
            strip.appendChild(cell);
        });
        resultsContent.appendChild(strip);

        if (errors.length) {
            resultsContent.appendChild(syncSection('Not sent to Forma', errors, {
                tone: 'error', plain: true,
                hint: "These changes didn't reach Forma. Sync again to retry them."
            }));
        }
        const missing = [...(summary.nonExistentUsers || []), ...(summary.incompleteUsers || [])];
        if (missing.length) {
            resultsContent.appendChild(syncSection('Not in this project', missing, {
                tone: 'warning',
                hint: 'Add these people to the project first, then sync again.'
            }));
        }
        if ((summary.inactiveUsers || []).length) {
            resultsContent.appendChild(syncSection('Waiting for invitation', summary.inactiveUsers, {
                tone: 'warning',
                hint: "They haven't signed in to Autodesk yet. Add them again once they accept their invitation."
            }));
        }
        if ((summary.noDocsUsers || []).length) {
            resultsContent.appendChild(syncSection('No Docs access in this project', summary.noDocsUsers, {
                tone: 'warning',
                hint: 'Their Docs access is set to None in this project. Give them Docs access in Members, then sync again.'
            }));
        }
        if ((summary.notInDocsUsers || []).length) {
            resultsContent.appendChild(syncSection('Not in Docs for this project yet', summary.notInDocsUsers, {
                tone: 'warning',
                hint: "Forma's Docs doesn't list them in this project yet, so they were left out and everyone else was sent. If they were just added to the project, sync again in a few minutes; otherwise check their Docs access in Members."
            }));
        }
        if ((summary.inheritedConflicts || []).length) {
            resultsContent.appendChild(syncSection('Skipped: higher access inherited from the parent folder', summary.inheritedConflicts, { plain: true }));
        }
        if (summary.createdUsers.length) resultsContent.appendChild(syncSection('Added', summary.createdUsers));
        if (summary.updatedUsers.length) resultsContent.appendChild(syncSection('Updated', summary.updatedUsers));
        if (summary.deletedUsers.length) resultsContent.appendChild(syncSection('Removed', summary.deletedUsers));

        const nothing = !summary.createdUsers.length && !summary.updatedUsers.length && !summary.deletedUsers.length && !errors.length && !missing.length
            && !(summary.noDocsUsers || []).length && !(summary.notInDocsUsers || []).length;
        if (nothing) {
            const p = document.createElement('p');
            p.className = 'fs-hint';
            p.textContent = 'Forma already matched your changes, so nothing needed sending.';
            resultsContent.appendChild(p);
        }

        if (resultsDiv) resultsDiv.hidden = false;
        if (foot) foot.hidden = false;
    }

    /**
     * Convert permission level (1-6) to ACC actions array
     */
    function levelToActions(level) {
        const levelNum = parseInt(level);
        switch (levelNum) {
            case 1:
                return ["VIEW", "COLLABORATE"];
            case 2:
                return ["VIEW", "DOWNLOAD", "COLLABORATE"];
            case 3:
                return ["VIEW", "DOWNLOAD", "COLLABORATE", "PUBLISH_MARKUP"];
            case 4:
                return ["PUBLISH", "VIEW", "DOWNLOAD", "COLLABORATE", "PUBLISH_MARKUP"];
            case 5:
                return ["PUBLISH", "VIEW", "DOWNLOAD", "COLLABORATE", "PUBLISH_MARKUP", "EDIT"];
            case 6:
                return ["PUBLISH", "VIEW", "DOWNLOAD", "COLLABORATE", "PUBLISH_MARKUP", "EDIT", "CONTROL"];
            default:
                console.error(`Invalid permission level: ${level}`);
                return ["VIEW", "COLLABORATE"]; // Default to level 1
        }
    }

    /**
     * Convert ACC actions array to numeric permission level (1-6)
     */
    function actionsToLevel(actions) {
        if (!actions || actions.length === 0) return 0;
        const s = new Set(actions.map(a => a.toUpperCase()));
        if (s.has('CONTROL')) return 6;
        if (s.has('EDIT')) return 5;
        if (s.has('PUBLISH')) return 4;
        if (s.has('PUBLISH_MARKUP')) return 3;
        if (s.has('DOWNLOAD')) return 2;
        if (s.has('VIEW') || s.has('COLLABORATE')) return 1;
        return 0;
    }

    function levelName(level) {
        const names = { 1: 'View Only', 2: 'View+Download', 3: 'View+Download+Markup', 4: 'Upload', 5: 'Edit', 6: 'Full Control' };
        return names[level] || `Level ${level}`;
    }

    // Activity log: the same level names the Folder access page shows (Forma's)
    function formaLevelName(actions) {
        const names = {
            1: 'View only', 2: 'View + Download', 3: 'View + Download + Publish markups',
            4: 'View + Download + Publish markups + Upload', 5: 'View + Download + Publish markups + Upload + Edit',
            6: 'Full administrative controls'
        };
        return names[actionsToLevel(actions)] || '';
    }

    function recordFolderActivity(type, projectId, folderName, permissions) {
        if (!window.ActivityLog) return;
        const kinds = { USER: 'member', COMPANY: 'company', ROLE: 'role' };
        permissions.forEach(p => ActivityLog.record({
            tool: 'Folder access', type, projectId, folder: folderName,
            member: p.user || p.subjectId,
            memberType: kinds[String(p.subjectType).toUpperCase()] || 'member',
            details: p.actions ? formaLevelName(p.actions) : ''
        }));
    }

    /**
     * Fetch current folder permissions from ACC
     */
    async function fetchFolderPermissions(projectId, folderId, accessToken) {
        const formattedProjectId = projectId.startsWith('b.') ? projectId.substring(2) : projectId;
        const folderUrn = encodeURIComponent(folderId);
        const apiUrl = `https://developer.api.autodesk.com/bim360/docs/v1/projects/${formattedProjectId}/folders/${folderUrn}/permissions`;

        log(`📥 Fetching permissions for folder: ${folderId}`);

        const response = await apsFetch(apiUrl, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        });

        // Throw rather than return [] - an empty list means "no explicit permissions",
        // so diffing against it would CREATE for subjects that already have access and
        // silently skip every DELETE. The caller records the folder as an error instead.
        if (!response.ok) {
            const errorText = await response.text().catch(() => '');
            throw new Error(`Could not read current permissions (HTTP ${response.status}${errorText ? `: ${errorText.slice(0, 200)}` : ''})`);
        }

        const data = await response.json();
        log(`📥 Raw API response:`, data);

        const results = Array.isArray(data) ? data : (data.results || []);
        log(`📥 Processing ${results.length} permission entries`);

        const permissions = results.map(perm => ({
            subjectId: perm.subjectId,
            subjectType: perm.subjectType,
            actions: perm.actions || [],
            inheritActions: perm.inheritActions || [],
            name: perm.name,
            email: perm.email
        }));

        log(`📥 Returning ${permissions.length} permissions`);
        return permissions;
    }

    /**
     * Check if a user exists in the project
     */
    // The helpers below take `usersById` (Map projectUserId -> project user), built
    // once per sync - they run for every permission entry in every folder, and a
    // linear find() over all project users each time made the diff O(entries x users).
    function userExistsInProject(subjectId, subjectType, usersById) {
        if (subjectType !== 'USER') {
            return true; // Companies and roles are not checked
        }

        if (!usersById) {
            console.warn('No raw user data available to check user existence');
            return false;
        }

        return usersById.has(subjectId);
    }

    /**
     * Check if a user has accepted their project invite (status "active").
     * A newly-added project user starts as "pending" until they log in at
     * least once - ACC's folder-permissions API rejects granting access to
     * a pending user with ERR_PERMISSION_RESOURCE_NOT_EXIST_OR_NOT_ACTIVE.
     * Only meaningful once the user's existence has already been confirmed.
     */
    function isUserActiveInProject(subjectId, subjectType, usersById) {
        if (subjectType !== 'USER') {
            return true; // Companies and roles have no "pending" state here
        }

        const user = usersById && usersById.get(subjectId);
        // If status isn't present in the data we have, don't block on it.
        if (!user || !user.status) {
            return true;
        }

        return user.status === 'active';
    }

    /**
     * A project member whose Docs access is "None" isn't in the project's Docs,
     * so folder permissions for them are rejected (and used to take the whole
     * batch down with them). Only blocks when the data clearly says so.
     */
    function hasNoDocsAccess(subjectId, subjectType, usersById) {
        if (subjectType !== 'USER') return false;
        const user = usersById && usersById.get(subjectId);
        const docs = user && Array.isArray(user.products) && user.products.find(p => p.key === 'docs');
        return !!docs && docs.access === 'none';
    }

    /**
     * Check if a user is a project admin
     */
    function isProjectAdmin(subjectId, subjectType, usersById) {
        if (subjectType !== 'USER') {
            return false;
        }

        if (!usersById) {
            console.warn('No raw user data available to check admin status');
            return false;
        }

        const user = usersById.get(subjectId);
        if (!user) {
            return false;
        }

        if (user.products && Array.isArray(user.products)) {
            const adminProduct = user.products.find(p => 
                p.key === 'projectAdministration' && p.access === 'administrator'
            );
            if (adminProduct) {
                return true;
            }
        }

        return false;
    }

    /**
     * Autodesk rejects a whole permissions batch with
     * ERR_PERMISSION_RESOURCE_NOT_EXIST_OR_NOT_ACTIVE when *some* of its users
     * aren't in the project's Docs (yet) - e.g. their Docs access is "None", or
     * they were added to the project minutes ago and Docs hasn't caught up. The
     * error lists those users ("error ids: a,b,c"). Returns them as a Set of
     * lower-cased subject ids, or an empty Set for any other error.
     */
    function notActiveSubjectIds(status, errorText) {
        if (status !== 400 || !String(errorText).includes('ERR_PERMISSION_RESOURCE_NOT_EXIST_OR_NOT_ACTIVE')) return new Set();
        let detail = String(errorText);
        try {
            const parsed = JSON.parse(errorText);
            detail = parsed.detail || parsed.title || detail;
        } catch (e) { /* not JSON */ }
        const m = /error ids:\s*([0-9a-zA-Z,\s-]+)/i.exec(detail);
        return new Set(m ? m[1].split(',').map(id => id.trim().toLowerCase()).filter(Boolean) : []);
    }

    /**
     * Send one permissions batch (create/update/delete share the request shape).
     * If Autodesk names users who aren't in the project's Docs, drop exactly
     * those and resend the rest, so a few people can't block everyone else.
     * Returns { sent, rejected, data }; throws on any other error.
     */
    async function postPermissionBatch(apiUrl, chunk, accessToken, includeActions) {
        let pending = chunk;
        const rejected = [];
        for (let attempt = 0; attempt < 3 && pending.length > 0; attempt++) {
            const response = await apsFetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                // Strip non-API fields before sending
                body: JSON.stringify(pending.map(p => includeActions
                    ? { subjectId: p.subjectId, subjectType: p.subjectType, actions: p.actions }
                    : { subjectId: p.subjectId, subjectType: p.subjectType }))
            });

            const text = await response.text().catch(() => '');
            if (response.ok) {
                let data = {};
                try { data = text ? JSON.parse(text) : {}; } catch (e) { /* empty or non-JSON body */ }
                return { sent: pending, rejected, data };
            }

            const badIds = notActiveSubjectIds(response.status, text);
            const dropped = pending.filter(p => badIds.has(String(p.subjectId).toLowerCase()));
            if (dropped.length === 0) throw new Error(`HTTP ${response.status}: ${text}`);
            console.warn(`⚠️ Not in this project's Docs, left out of the batch: ${dropped.map(p => p.user).join(', ')}`);
            rejected.push(...dropped);
            pending = pending.filter(p => !badIds.has(String(p.subjectId).toLowerCase()));
        }
        if (pending.length > 0) throw new Error('Autodesk kept rejecting this batch');
        return { sent: [], rejected, data: {} };
    }

    /**
     * Create/update/delete folder permissions in batches of 50 (Autodesk's hard
     * limit per request). Returns { success, sent, rejected, results, error }:
     * `sent` are the permissions Forma accepted (even if a later batch failed),
     * `rejected` the users Autodesk said aren't in the project's Docs.
     */
    async function runPermissionBatches(kind, projectId, folderId, folderName, permissions, accessToken) {
        const result = { success: true, sent: [], rejected: [], results: [] };
        if (permissions.length === 0) return result;

        const BATCH_SIZE = 50;
        const formattedProjectId = projectId.startsWith('b.') ? projectId.substring(2) : projectId;
        const folderUrn = encodeURIComponent(folderId);
        const apiUrl = `https://developer.api.autodesk.com/bim360/docs/v1/projects/${formattedProjectId}/folders/${folderUrn}/permissions:batch-${kind}`;
        const verb = { create: 'Creating', update: 'Updating', delete: 'Removing' }[kind];
        const activityType = { create: 'Folder permission given', update: 'Folder permission changed', delete: 'Folder permission removed' }[kind];

        const totalChunks = Math.ceil(permissions.length / BATCH_SIZE);
        for (let i = 0; i < permissions.length; i += BATCH_SIZE) {
            const chunk = permissions.slice(i, i + BATCH_SIZE);
            const chunkNum = Math.floor(i / BATCH_SIZE) + 1;
            const preview = chunk.length > 1 ? `${chunk[0].user} and ${chunk.length - 1} more` : chunk[0].user;
            updateFolderSyncProgress(`${verb} access for ${preview} in "${folderName}"${totalChunks > 1 ? ` (batch ${chunkNum}/${totalChunks})` : ''}...`);
            log(`📤 ${verb} ${chunk.length} permissions (batch ${chunkNum}/${totalChunks})...`);

            try {
                const { sent, rejected, data } = await postPermissionBatch(apiUrl, chunk, accessToken, kind !== 'delete');
                result.sent.push(...sent);
                result.rejected.push(...rejected);
                result.results.push(...((data && data.results) || []));
                if (sent.length) recordFolderActivity(activityType, projectId, folderName, sent);
            } catch (error) {
                console.error(`Error ${verb.toLowerCase()} permissions:`, error);
                return { ...result, success: false, error: error.message };
            }
        }
        return result;
    }

    const batchCreatePermissions = (...args) => runPermissionBatches('create', ...args);
    const batchUpdatePermissions = (...args) => runPermissionBatches('update', ...args);
    const batchDeletePermissions = (...args) => runPermissionBatches('delete', ...args);

    // Flag to prevent multiple simultaneous syncs
    let isSyncing = false;

    /**
     * Sync permissions to ACC - Modal-based approach
     */
    async function syncPermissionsToACC(currentProjectData, currentProjectUsersRaw) {
        if (isSyncing) {
            log('⚠️ Sync already in progress, ignoring request');
            return;
        }

        if (!currentProjectData) {
            alert('No project data available');
            return;
        }

        // Show modal and auto-start sync
        showFolderSyncModal();
        
        isSyncing = true;
        log('🔒 Sync started - button locked');

        updateFolderSyncProgress('Reading your changes', 0);

        // Start sync immediately — returned (not fire-and-forget) so callers
        // that await syncPermissionsToACC() actually wait for the real work
        // to finish, not just for this IIFE to be scheduled.
        return (async () => {

            // Read permissions data directly from the shared model
            // (folderUserAssignments + currentHierarchy) rather than scraping
            // a rendered table's DOM — the indented tree is the only view now
            // and doesn't render an HTML table, so the model is the single
            // source of truth regardless of what's currently on screen.
            try {
                if (typeof currentHierarchy === 'undefined' || !currentHierarchy || currentHierarchy.length === 0) {
                    updateFolderSyncProgress('No folders are loaded. Close Folder access, open it again, then sync.', 0, 'error');
                    isSyncing = false;
                    log('🔓 Sync failed (no folder data) - button unlocked');
                    alert('No folders are loaded. Close Folder access, open it again, then sync.');
                    return;
                }

                // Refresh project membership right before syncing - this modal's
                // cached list is a snapshot from when it opened, and goes stale if
                // users were removed from the project via a different flow while
                // it stayed open. Without this, userExistsInProject() below would
                // still say a just-deleted user "exists", and ACC's own API would
                // reject the whole batch with ERR_PERMISSION_RESOURCE_NOT_EXIST_OR_NOT_ACTIVE.
                try {
                    updateFolderSyncProgress('Checking who is in the project', 2);
                    currentProjectUsersRaw = await fetchAllProjectUsers(currentProjectData.projectId, currentProjectData.accessToken);
                } catch (refreshError) {
                    console.warn('⚠️ Failed to refresh project users before sync, using cached list:', refreshError.message);
                }
                const usersById = currentProjectUsersRaw
                    ? new Map(currentProjectUsersRaw.map(u => [u.id, u]))
                    : null;

                log('\n🔄 ========== READING FROM MODEL ==========');

                // Extract folders and permissions from folderUserAssignments,
                // using currentHierarchy only to find each folder's depth
                // (to skip root containers) and its own display name.
                const folders = [];

                const folderMeta = new Map(); // folderId -> { depth, level1Name, name }
                currentHierarchy.forEach(row => {
                    for (let d = 0; d < 20; d++) {
                        const f = row[levelKeyForDepth(d)];
                        if (!f || folderMeta.has(f.id)) continue;
                        folderMeta.set(f.id, {
                            depth: d,
                            level1Name: row[levelKeyForDepth(0)]?.name || null,
                            name: f.name
                        });
                    }
                });

                folderMeta.forEach((meta, folderId) => {
                    // "Project Files" (depth 0) is a real folder returned by
                    // the same topFolders API as everything under it, with
                    // its own folderId — the tree lets you drop permissions
                    // on it same as any subfolder, and ACC's permissions API
                    // accepts it the same way. It used to be skipped here on
                    // the assumption it couldn't carry permissions, which is
                    // exactly why edits made there never made it into Sync
                    // while every subfolder synced fine.

                    // Direct (non-inherited) entries only.
                    const entries = (folderUserAssignments.get(folderId) || []).filter(e => !e.isInherited);
                    const permissions = {};
                    let colIdx = 1;

                    entries.forEach(entry => {
                        if (entry.user && entry.subjectId && entry.subjectType && entry.level) {
                            permissions[`column${colIdx}`] = {
                                subjectId: entry.subjectId,
                                subjectType: entry.subjectType,
                                user: entry.displayName || entry.user,
                                level: entry.level
                            };
                            colIdx++;
                        }
                    });

                    // Include every folder (even empty) so deletions are sent to ACC
                    folders.push({
                        folderId: folderId,
                        level1: meta.level1Name,
                        level2: meta.name,
                        level3: null,
                        permissions: permissions
                    });
                });

                log(`📊 Extracted ${folders.length} folders from model`);
                
                const jsonData = {
                    projectName: currentProjectData.projectName,
                    projectId: currentProjectData.projectId,
                    hubId: currentProjectData.hubId,
                    folders: folders
                };
            log('\n🔄 ========== STARTING SYNC TO ACC ==========');
            log(`📁 Project: ${currentProjectData.projectName}`);
            log(`📊 Total folders in JSON: ${jsonData.folders.length}`);
            log(`\n========== END TEST ==========\n\n`);

            const syncSummary = {
                totalFolders: jsonData.folders.length,
                processedFolders: 0,
                created: 0,
                updated: 0,
                deleted: 0,
                skippedAdmins: 0,
                skippedNonExistent: 0,
                skippedInactive: 0,
                skippedIncomplete: 0,
                skippedInherited: 0,
                errors: [],
                createdUsers: [],
                updatedUsers: [],
                deletedUsers: [],
                nonExistentUsers: [],
                inactiveUsers: [],
                noDocsUsers: [],
                notInDocsUsers: [],
                incompleteUsers: [],
                inheritedConflicts: []
            };

            // Process folders through a worker pool: up to FOLDER_CONCURRENCY in
            // flight at all times (fixed Promise.all batches stalled every batch on
            // its slowest folder). Rate limiting is absorbed by apsFetch.
            const FOLDER_CONCURRENCY = 5;

            log(`📦 Processing ${jsonData.folders.length} folders with concurrency=${FOLDER_CONCURRENCY}`);

                const processFolder = async (folder) => {
                    const folderName = `${folder.level2}${folder.level3 ? ' > ' + folder.level3 : ''}`;
                    log(`\n📂 Processing: ${folderName}`);
                    updateFolderSyncProgress(`Reading current permissions for "${folderName}"...`);

                    try {
                        // Fetch current permissions from ACC
                        const currentPermissions = await fetchFolderPermissions(
                            currentProjectData.projectId,
                            folder.folderId,
                            currentProjectData.accessToken
                        );

                        // Build permission maps
                        const jsonPermMap = new Map();
                        const accPermMap = new Map();

                        // Parse JSON permissions
                        log(`  📋 JSON permissions for ${folderName}:`, Object.keys(folder.permissions).length);
                        Object.values(folder.permissions).forEach(perm => {
                            if (perm.subjectId && perm.subjectType && perm.level) {
                                const key = `${perm.subjectId}_${perm.subjectType}`;
                                jsonPermMap.set(key, {
                                    subjectId: perm.subjectId,
                                    subjectType: perm.subjectType,
                                    actions: levelToActions(perm.level),
                                    user: perm.user
                                });
                                log(`    📄 JSON: ${perm.user} | Key: ${key}`);
                            } else {
                                // Permission is missing required fields (subjectId, subjectType, or level)
                                console.warn(`  ⚠️ SKIP: Incomplete permission data for ${perm.user} (missing subjectId, subjectType, or level)`);
                                syncSummary.skippedIncomplete++;
                                syncSummary.incompleteUsers.push(perm.user || 'Unknown User');
                            }
                        });

                        // Parse ACC permissions - only explicit permissions
                        log(`  📋 ACC permissions for ${folderName}:`, currentPermissions.length);
                        currentPermissions.forEach(perm => {
                            const key = `${perm.subjectId}_${perm.subjectType}`;
                            const userName = perm.name || perm.email || perm.subjectId;
                            const hasExplicitPermissions = perm.actions && perm.actions.length > 0;
                            
                            log(`    📄 ACC: ${userName} | Key: ${key} | Explicit: ${hasExplicitPermissions} | Actions: ${perm.actions?.length || 0} | InheritActions: ${perm.inheritActions?.length || 0}`);
                            
                            if (hasExplicitPermissions) {
                                accPermMap.set(key, {
                                    subjectId: perm.subjectId,
                                    subjectType: perm.subjectType,
                                    actions: perm.actions,
                                    user: userName
                                });
                            }
                        });

                        // Build inherited permissions map (subjects that have inherited access)
                        const inheritedLevelMap = new Map();
                        currentPermissions.forEach(perm => {
                            if (perm.inheritActions && perm.inheritActions.length > 0) {
                                const key = `${perm.subjectId}_${perm.subjectType}`;
                                const inheritedLevel = actionsToLevel(perm.inheritActions);
                                const userName = perm.name || perm.email || perm.subjectId;
                                inheritedLevelMap.set(key, { level: inheritedLevel, user: userName });
                            }
                        });

                        // Determine operations
                        const toCreate = [];
                        const toUpdate = [];
                        const toDelete = [];

                        // Check for CREATE and UPDATE
                        jsonPermMap.forEach((jsonPerm, key) => {
                            const requestedLevel = actionsToLevel(jsonPerm.actions);
                            const inherited = inheritedLevelMap.get(key);
                            
                            if (!accPermMap.has(key)) {
                                // Check if user exists in project
                                if (!userExistsInProject(jsonPerm.subjectId, jsonPerm.subjectType, usersById)) {
                                    log(`  ⚠️ SKIP CREATE: User doesn't exist in project (${jsonPerm.user})`);
                                    syncSummary.skippedNonExistent++;
                                    // Always add to show every occurrence across folders
                                    syncSummary.nonExistentUsers.push(jsonPerm.user);
                                } else if (!isUserActiveInProject(jsonPerm.subjectId, jsonPerm.subjectType, usersById)) {
                                    log(`  ⚠️ SKIP CREATE: User is inactive/pending (${jsonPerm.user})`);
                                    syncSummary.skippedInactive++;
                                    syncSummary.inactiveUsers.push(jsonPerm.user);
                                } else if (hasNoDocsAccess(jsonPerm.subjectId, jsonPerm.subjectType, usersById)) {
                                    log(`  ⚠️ SKIP CREATE: No Docs access in this project (${jsonPerm.user})`);
                                    syncSummary.noDocsUsers.push(`${jsonPerm.user} (${folderName})`);
                                } else if (isProjectAdmin(jsonPerm.subjectId, jsonPerm.subjectType, usersById)) {
                                    log(`  ⚠️ SKIP CREATE: Project admin (${jsonPerm.user})`);
                                    syncSummary.skippedAdmins++;
                                } else if (inherited && inherited.level >= requestedLevel) {
                                    log(`  ⚠️ SKIP CREATE: ${jsonPerm.user} (${jsonPerm.subjectType}) already has inherited level ${inherited.level} >= requested level ${requestedLevel} in ${folderName}`);
                                    syncSummary.skippedInherited++;
                                    syncSummary.inheritedConflicts.push(`${jsonPerm.user} in ${folderName}: already has "${levelName(inherited.level)}" from parent folder (requested "${levelName(requestedLevel)}")`);
                                } else {
                                    toCreate.push({
                                        subjectId: jsonPerm.subjectId,
                                        subjectType: jsonPerm.subjectType,
                                        actions: jsonPerm.actions,
                                        user: jsonPerm.user
                                    });
                                    log(`  ➕ CREATE: ${jsonPerm.user} (${jsonPerm.subjectType})`);
                                }
                            } else {
                                const accPerm = accPermMap.get(key);
                                const actionsMatch = JSON.stringify(jsonPerm.actions.sort()) === JSON.stringify(accPerm.actions.sort());
                                
                                if (!actionsMatch) {
                                    // Check if user exists in project
                                    if (!userExistsInProject(jsonPerm.subjectId, jsonPerm.subjectType, usersById)) {
                                        log(`  ⚠️ SKIP UPDATE: User doesn't exist in project (${jsonPerm.user})`);
                                        syncSummary.skippedNonExistent++;
                                        // Always add to show every occurrence across folders
                                        syncSummary.nonExistentUsers.push(jsonPerm.user);
                                    } else if (!isUserActiveInProject(jsonPerm.subjectId, jsonPerm.subjectType, usersById)) {
                                        log(`  ⚠️ SKIP UPDATE: User is inactive/pending (${jsonPerm.user})`);
                                        syncSummary.skippedInactive++;
                                        syncSummary.inactiveUsers.push(jsonPerm.user);
                                    } else if (hasNoDocsAccess(jsonPerm.subjectId, jsonPerm.subjectType, usersById)) {
                                        log(`  ⚠️ SKIP UPDATE: No Docs access in this project (${jsonPerm.user})`);
                                        syncSummary.noDocsUsers.push(`${jsonPerm.user} (${folderName})`);
                                    } else if (isProjectAdmin(jsonPerm.subjectId, jsonPerm.subjectType, usersById)) {
                                        log(`  ⚠️ SKIP UPDATE: Project admin (${jsonPerm.user})`);
                                        syncSummary.skippedAdmins++;
                                    } else if (inherited && inherited.level >= requestedLevel) {
                                        log(`  ⚠️ SKIP UPDATE: ${jsonPerm.user} (${jsonPerm.subjectType}) already has inherited level ${inherited.level} >= requested level ${requestedLevel} in ${folderName}`);
                                        syncSummary.skippedInherited++;
                                        syncSummary.inheritedConflicts.push(`${jsonPerm.user} in ${folderName}: already has "${levelName(inherited.level)}" from parent folder (requested "${levelName(requestedLevel)}")`);
                                    } else {
                                        toUpdate.push({
                                            subjectId: jsonPerm.subjectId,
                                            subjectType: jsonPerm.subjectType,
                                            actions: jsonPerm.actions,
                                            user: jsonPerm.user
                                        });
                                        log(`  🔄 UPDATE: ${jsonPerm.user} (${jsonPerm.subjectType})`);
                                    }
                                }
                            }
                        });

                        // Check for DELETE: only where this folder's permissions were loaded
                        // into the model (or after "Remove all access"). Anywhere else the
                        // model doesn't know what exists, and deleting could remove real access.
                        const deletesAllowed = (typeof permissionsLoadedFolderIds !== 'undefined' && permissionsLoadedFolderIds.has(folder.folderId))
                            || (typeof itCleaned !== 'undefined' && itCleaned);
                        if (!deletesAllowed) log(`  🛡 Not loaded in this session, deletes skipped: ${folderName}`);
                        accPermMap.forEach((accPerm, key) => {
                            if (deletesAllowed && !jsonPermMap.has(key)) {
                                if (isProjectAdmin(accPerm.subjectId, accPerm.subjectType, usersById)) {
                                    log(`  ⚠️ SKIP DELETE: Project admin (${accPerm.user})`);
                                    syncSummary.skippedAdmins++;
                                } else {
                                    toDelete.push({
                                        subjectId: accPerm.subjectId,
                                        subjectType: accPerm.subjectType,
                                        user: accPerm.user
                                    });
                                    log(`  ➖ DELETE: ${accPerm.user} (${accPerm.subjectType})`);
                                }
                            }
                        });

                        // Execute operations
                        const results = { 
                            created: 0, 
                            updated: 0, 
                            deleted: 0, 
                            errors: [],
                            createdUsers: [],
                            updatedUsers: [],
                            deletedUsers: [],
                            notInDocs: []
                        };

                        // CREATE
                        if (toCreate.length > 0) {
                            const createByType = {
                                USER: toCreate.filter(p => p.subjectType === 'USER'),
                                COMPANY: toCreate.filter(p => p.subjectType === 'COMPANY'),
                                ROLE: toCreate.filter(p => p.subjectType === 'ROLE')
                            };

                            for (const [type, permissions] of Object.entries(createByType)) {
                                if (permissions.length > 0) {
                                    const result = await batchCreatePermissions(
                                        currentProjectData.projectId,
                                        folder.folderId,
                                        folderName,
                                        permissions,
                                        currentProjectData.accessToken
                                    );
                                    results.created += result.sent.length;
                                    results.createdUsers.push(...result.sent.map(p => `${p.user} (${folderName})`));
                                    results.notInDocs.push(...result.rejected.map(p => `${p.user} (${folderName})`));
                                    if (!result.success) {
                                        console.error(`Create ${type} failed for ${folderName}:`, result.error);
                                        results.errors.push(`${folderName}: Create ${type} failed - ${result.error}`);
                                    }
                                }
                            }
                        }

                        // UPDATE
                        if (toUpdate.length > 0) {
                            const updateByType = {
                                USER: toUpdate.filter(p => p.subjectType === 'USER'),
                                COMPANY: toUpdate.filter(p => p.subjectType === 'COMPANY'),
                                ROLE: toUpdate.filter(p => p.subjectType === 'ROLE')
                            };

                            for (const [type, permissions] of Object.entries(updateByType)) {
                                if (permissions.length > 0) {
                                    const result = await batchUpdatePermissions(
                                        currentProjectData.projectId,
                                        folder.folderId,
                                        folderName,
                                        permissions,
                                        currentProjectData.accessToken
                                    );
                                    results.updated += result.sent.length;
                                    results.updatedUsers.push(...result.sent.map(p => `${p.user} (${folderName})`));
                                    results.notInDocs.push(...result.rejected.map(p => `${p.user} (${folderName})`));
                                    if (!result.success) {
                                        console.error(`Update ${type} failed for ${folderName}:`, result.error);
                                        results.errors.push(`${folderName}: Update ${type} failed - ${result.error}`);
                                    }
                                }
                            }
                        }

                        // DELETE
                        if (toDelete.length > 0) {
                            const deleteByType = {
                                USER: toDelete.filter(p => p.subjectType === 'USER'),
                                COMPANY: toDelete.filter(p => p.subjectType === 'COMPANY'),
                                ROLE: toDelete.filter(p => p.subjectType === 'ROLE')
                            };

                            for (const [type, permissions] of Object.entries(deleteByType)) {
                                if (permissions.length > 0) {
                                    const result = await batchDeletePermissions(
                                        currentProjectData.projectId,
                                        folder.folderId,
                                        folderName,
                                        permissions,
                                        currentProjectData.accessToken
                                    );
                                    results.deleted += result.sent.length;
                                    results.deletedUsers.push(...result.sent.map(p => `${p.user} (${folderName})`));
                                    results.notInDocs.push(...result.rejected.map(p => `${p.user} (${folderName})`));
                                    if (!result.success) {
                                        console.error(`Delete ${type} failed for ${folderName}:`, result.error);
                                        results.errors.push(`${folderName}: Delete ${type} failed - ${result.error}`);
                                    }
                                }
                            }
                        }

                        return { folderName, results };

                    } catch (error) {
                        console.error(`❌ Error processing folder ${folderName}:`, error);
                        return {
                            folderName,
                            results: {
                                created: 0,
                                updated: 0,
                                deleted: 0,
                                errors: [`${folderName}: ${error.message}`],
                                createdUsers: [],
                                updatedUsers: [],
                                deletedUsers: []
                            }
                        };
                    }
                };

            await runWithConcurrency(jsonData.folders, FOLDER_CONCURRENCY, async (folder) => {
                const { folderName, results } = await processFolder(folder);

                // Update summary and progress as each folder finishes
                log(`📦 Folder result for ${folderName}:`, results);
                syncSummary.processedFolders++;
                syncSummary.created += results.created;
                syncSummary.updated += results.updated;
                syncSummary.deleted += results.deleted;
                syncSummary.errors.push(...results.errors);
                if (results.createdUsers) {
                    log(`  Adding ${results.createdUsers.length} created users`);
                    syncSummary.createdUsers.push(...results.createdUsers);
                }
                if (results.updatedUsers) {
                    log(`  Adding ${results.updatedUsers.length} updated users`);
                    syncSummary.updatedUsers.push(...results.updatedUsers);
                }
                if (results.deletedUsers) {
                    log(`  Adding ${results.deletedUsers.length} deleted users`);
                    syncSummary.deletedUsers.push(...results.deletedUsers);
                }
                if (results.notInDocs) syncSummary.notInDocsUsers.push(...results.notInDocs);

                const progressPercent = (syncSummary.processedFolders / syncSummary.totalFolders) * 100;
                updateFolderSyncProgress(`Sending changes to Forma: ${syncSummary.processedFolders} of ${syncSummary.totalFolders} folders`, progressPercent);
                log(`📊 Progress: ${Math.round(progressPercent)}% (${syncSummary.processedFolders}/${syncSummary.totalFolders} folders)`);
                
                log(`📊 Current summary:`, {
                    created: syncSummary.created,
                    updated: syncSummary.updated,
                    deleted: syncSummary.deleted,
                    createdUsers: syncSummary.createdUsers.length,
                    updatedUsers: syncSummary.updatedUsers.length,
                    deletedUsers: syncSummary.deletedUsers.length
                });
            });

            // Remove test code section
            log('\n🔄 ========== SYNC COMPLETE ==========');
            log(`📊 Summary:`);
            log(`  Folders processed: ${syncSummary.processedFolders}/${syncSummary.totalFolders}`);
            log(`  ➕ Created: ${syncSummary.created}`);
            log(`  🔄 Updated: ${syncSummary.updated}`);
            log(`  ➖ Deleted: ${syncSummary.deleted}`);
            log(`  ⚠️ Skipped (admins): ${syncSummary.skippedAdmins}`);
            log(`  🔒 Skipped (inherited): ${syncSummary.skippedInherited}`);
            log(`  ❌ Errors: ${syncSummary.errors.length}`);
            
            if (syncSummary.errors.length > 0) {
                log(`\nErrors:`);
                syncSummary.errors.forEach(err => log(`  - ${err}`));
            }

                window.ActivityLog?.flush();

                // Show results in modal
                showFolderSyncResults(syncSummary);
                
                // Unlock sync button
                isSyncing = false;
                log('🔓 Sync completed - button unlocked');

            } catch (error) {
                console.error('❌ Sync error:', error);
                updateFolderSyncProgress(`The sync stopped: ${error.message}. Changes sent before this point are already in Forma; sync again to send the rest.`, 0, 'error');
                isSyncing = false;
                window.ActivityLog?.flush();
                log('🔓 Sync failed - button unlocked');
                alert(`Sync failed: ${error.message}`);
            }
        })();
    }

    // Expose the sync function globally
    window.syncPermissionsToACC = syncPermissionsToACC;

})();
