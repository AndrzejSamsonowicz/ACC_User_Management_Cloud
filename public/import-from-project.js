// ============================================================================
// IMPORT FROM OTHER PROJECT FUNCTIONALITY
//
// Depends on: user-table-v2.js (for `userTableManager`, `escapeHtml`, `log`)
// ============================================================================

let importProjectModal = null;
let selectedProjectUsers = [];
let importModalState = {
    selectedHubId: null,
    selectedHubName: null,
    selectedProjectId: null,
    selectedProjectName: null,
    allUsers: []
};

/**
 * Open the Import From Other Project modal.
 */
function openImportFromProjectModal() {
    log('📥 Opening Import From Other Project modal');

    if (!importProjectModal) {
        createImportProjectModal();
    }

    // Reset state completely
    selectedProjectUsers = [];
    importModalState = {
        selectedHubId: null,
        selectedHubName: null,
        selectedProjectId: null,
        selectedProjectName: null,
        allUsers: []
    };

    const projectsList = document.getElementById('importProjectsList');
    const usersList    = document.getElementById('importUsersList');
    const hubsFilter   = document.getElementById('importHubsFilter');
    const projectsFilter = document.getElementById('importProjectsFilter');

    if (projectsList) {
        projectsList.innerHTML = '<div style="text-align: center; padding: 20px; color: #999;">Select a hub first</div>';
    }

    if (usersList) {
        usersList.innerHTML = '<div style="text-align: center; padding: 40px; color: #999;">Select a project to view users</div>';
    }

    if (hubsFilter)     hubsFilter.value = '';
    if (projectsFilter) projectsFilter.value = '';

    importProjectModal.style.display = 'block';
    loadHubsForImport();
}

/**
 * Create the Import From Other Project modal DOM (HTML + CSS injected once).
 */
function createImportProjectModal() {
    const modalHTML = `
        <div id="importProjectModal" class="import-project-modal" style="display: none;">
            <div class="import-project-modal-content">
                <div class="import-project-modal-header">
                    <h3>Import Users From Other Project</h3>
                    <span class="import-project-modal-close" onclick="closeImportProjectModal()">&times;</span>
                </div>
                <div class="import-project-modal-body">
                    <div class="import-project-split">
                        <!-- Left Column: Hubs and Projects -->
                        <div class="import-project-left">
                            <!-- Hubs Section (1/3 height) -->
                            <div class="import-hubs-section">
                                <h4>Select Hub</h4>
                                <input type="text" id="importHubsFilter" placeholder="Filter hubs..." class="import-filter-input" oninput="filterImportHubs()" />
                                <div id="importHubsList" class="import-list">
                                    <div style="text-align: center; padding: 20px; color: #666;">Loading hubs...</div>
                                </div>
                            </div>

                            <!-- Projects Section (2/3 height) -->
                            <div class="import-projects-section">
                                <h4>Select Project</h4>
                                <input type="text" id="importProjectsFilter" placeholder="Filter projects..." class="import-filter-input" oninput="filterImportProjects()" />
                                <div id="importProjectsList" class="import-list">
                                    <div style="text-align: center; padding: 20px; color: #999;">Select a hub first</div>
                                </div>
                            </div>
                        </div>

                        <!-- Right Column: Project Users -->
                        <div class="import-project-right">
                            <div class="import-users-header">
                                <h4>Project Users</h4>
                                <div class="import-users-actions">
                                    <span style="font-size: 12px; color: #666; margin-right: 10px; font-style: italic;">💡 Press Shift to select multiple users</span>
                                    <button onclick="checkAllImportUsers()" class="import-btn-small">Check All</button>
                                    <button onclick="uncheckAllImportUsers()" class="import-btn-small">Uncheck All</button>
                                    <button onclick="importSelectedUsers()" class="import-btn-primary">Import Selected</button>
                                </div>
                            </div>
                            <div id="importUsersList" class="import-users-table-container">
                                <div style="text-align: center; padding: 40px; color: #999;">Select a project to view users</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    const styles = `
        <style>
            /* Visual language matched to #userManagementModal / the folder
               modal: full-viewport shell, tight sticky-uppercase table
               header, compact blue buttons, quieter hover states. Visual
               only — every id/onclick/selection behavior below is
               untouched. */
            .import-project-modal {
                position: fixed;
                z-index: 4000;
                left: 0;
                top: 0;
                width: 100%;
                height: 100%;
                background-color: rgba(0,0,0,0.5);
                font-family: 'Artifact Elements', Arial, sans-serif;
            }

            .import-project-modal-content {
                background-color: #fefefe;
                margin: 0;
                border: none;
                width: 100%;
                height: 100%;
                border-radius: 0;
                box-shadow: none;
                display: flex;
                flex-direction: column;
            }

            .import-project-modal-header {
                padding: 15px 20px;
                background-color: #f8f9fa;
                border-bottom: 1px solid #ddd;
                display: flex;
                justify-content: space-between;
                align-items: center;
                flex-shrink: 0;
            }

            .import-project-modal-header h3 {
                margin: 0;
                color: #333;
                font-size: 17px;
            }

            .import-project-modal-close {
                color: #aaa;
                font-size: 28px;
                font-weight: bold;
                cursor: pointer;
                line-height: 1;
            }

            .import-project-modal-close:hover,
            .import-project-modal-close:focus {
                color: #000;
            }

            .import-project-modal-body {
                flex: 1;
                overflow: hidden;
                padding: 20px;
            }

            .import-project-split {
                display: flex;
                gap: 20px;
                height: 100%;
            }

            .import-project-left {
                width: 30%;
                display: flex;
                flex-direction: column;
                gap: 15px;
            }

            .import-hubs-section {
                height: 33%;
                display: flex;
                flex-direction: column;
            }

            .import-projects-section {
                height: 67%;
                display: flex;
                flex-direction: column;
            }

            .import-hubs-section h4,
            .import-projects-section h4 {
                margin: 0 0 8px 0;
                font-size: 12px;
                text-transform: uppercase;
                letter-spacing: .04em;
                color: #888;
                font-weight: 700;
            }

            .import-filter-input {
                width: 100%;
                padding: 6px 10px;
                margin-bottom: 8px;
                border: 1px solid #ccc;
                border-radius: 4px;
                font-size: 12.5px;
                box-sizing: border-box;
                transition: border-color .2s, box-shadow .2s;
            }

            .import-filter-input:focus {
                outline: none;
                border-color: #0696D7;
                box-shadow: 0 0 0 3px rgba(6, 150, 215, 0.14);
            }

            .import-list {
                flex: 1;
                overflow-y: auto;
                border: 1px solid #ddd;
                border-radius: 4px;
                background: white;
            }

            .import-list-item {
                padding: 8px 10px;
                border-bottom: 1px solid #eee;
                cursor: pointer;
                transition: background-color 0.2s;
                font-size: 12.5px;
            }

            .import-list-item:hover {
                background-color: #f5fbff;
            }

            .import-list-item.selected {
                background-color: #0696D7;
                color: white;
            }

            .import-list-item:last-child {
                border-bottom: none;
            }

            .import-project-right {
                width: 70%;
                display: flex;
                flex-direction: column;
            }

            .import-users-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 10px;
            }

            .import-users-header h4 {
                margin: 0;
                font-size: 12px;
                text-transform: uppercase;
                letter-spacing: .04em;
                color: #888;
                font-weight: 700;
            }

            .import-users-actions {
                display: flex;
                gap: 8px;
                align-items: center;
            }

            /* !important throughout — index.html's site-wide "button, .btn"
               rule (200px min-width, 44px height, its own colors) is also
               !important and otherwise wins over these, same issue already
               fixed for .project-btn / #hubsPanel button / etc. Without it
               these rendered as the old giant blue pills regardless of the
               values below. */
            .import-btn-small,
            .import-btn-primary {
                padding: 7px 14px !important;
                font-size: 12.5px !important;
                font-weight: 700 !important;
                background-color: #0696D7 !important;
                color: #fff !important;
                border: 1px solid #0696D7 !important;
                border-radius: 4px !important;
                cursor: pointer;
                min-width: 0 !important;
                width: auto !important;
                height: auto !important;
                margin: 0 !important;
                transition: background-color 0.2s, border-color 0.2s;
            }

            .import-btn-small:hover,
            .import-btn-primary:hover {
                background-color: #0057A0 !important;
                border-color: #0057A0 !important;
            }

            .import-users-table-container {
                flex: 1;
                overflow-y: auto;
                overflow-x: hidden;
                border: 1px solid #ddd;
                border-radius: 4px;
                background: white;
            }

            .import-users-table {
                width: 100%;
                table-layout: fixed;
                border-collapse: collapse;
                font-size: 12px;
            }

            .import-users-table th {
                position: sticky;
                top: 0;
                background-color: #f0f0f0;
                padding: 9px 6px;
                text-align: left;
                border-bottom: 2px solid #ccc;
                font-weight: 700;
                font-size: 10px;
                text-transform: uppercase;
                letter-spacing: .02em;
                color: #666;
                z-index: 10;
                white-space: normal;
                line-height: 1.2;
                vertical-align: middle;
                /* Long single words ("Preconstruction", "Collaboration") have
                   no space to wrap at, so at ~6.71% column width they'd
                   otherwise overflow the cell horizontally and visually
                   spill into the next column's header instead of wrapping
                   onto a second line within their own column. */
                overflow-wrap: break-word;
                word-break: break-word;
            }

            /* Left-align service column data cells (toggle switches) */
            .import-users-table td:nth-child(5),
            .import-users-table td:nth-child(6),
            .import-users-table td:nth-child(7),
            .import-users-table td:nth-child(8),
            .import-users-table td:nth-child(9),
            .import-users-table td:nth-child(10),
            .import-users-table td:nth-child(11) {
                text-align: left;
            }

            .import-users-table td {
                padding: 8px;
                border-bottom: 1px solid #eee;
            }

            /* Long unbreakable values (an email has no spaces to wrap at)
               get cut with an ellipsis instead of overflowing into the next
               column — same treatment as the Existing Users table. Scoped
               to the text columns (2nd-4th) so the toggle-switch cells
               aren't affected. */
            .import-users-table td:nth-child(2),
            .import-users-table td:nth-child(3),
            .import-users-table td:nth-child(4) {
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }

            /* Per-column drag-to-resize, identical scheme to
               #userManagementModal's table: percentage widths that always
               sum to exactly 100%, so the table can never need horizontal
               scroll. See setupImportColumnResize(). */
            .import-resizable-th {
                position: relative;
            }
            .import-col-resizer {
                position: absolute;
                top: 0;
                right: -4px;
                width: 8px;
                height: 100%;
                cursor: col-resize;
                z-index: 2;
            }
            .import-col-resizer:hover,
            .import-col-resizer.resizing {
                background: rgba(6, 150, 215, 0.35);
            }

            .import-users-table tr:hover td {
                background-color: #f5fbff;
            }

            .import-users-table tbody tr:last-child td {
                border-bottom: none;
            }

            .import-user-checkbox {
                cursor: pointer;
                width: 16px;
                height: 16px;
            }

            /* Style for disabled toggles in import modal — 50% smaller */
            .import-users-table .toggle-switch {
                transform: scale(0.5);
                display: inline-block;
            }

            .import-users-table .toggle-switch input[type="checkbox"]:disabled + .toggle-slider {
                opacity: 0.7;
                cursor: not-allowed;
            }
        </style>
    `;

    document.head.insertAdjacentHTML('beforeend', styles);
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    importProjectModal = document.getElementById('importProjectModal');

    // Close on Escape key
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && importProjectModal && importProjectModal.style.display === 'block') {
            closeImportProjectModal();
        }
    });
}

/**
 * Close and reset the Import From Other Project modal.
 */
function closeImportProjectModal() {
    if (importProjectModal) {
        importProjectModal.style.display = 'none';

        selectedProjectUsers = [];
        importModalState = {
            selectedHubId: null,
            selectedHubName: null,
            selectedProjectId: null,
            selectedProjectName: null,
            allUsers: []
        };

        const hubsList      = document.getElementById('importHubsList');
        const projectsList  = document.getElementById('importProjectsList');
        const usersList     = document.getElementById('importUsersList');
        const hubsFilter    = document.getElementById('importHubsFilter');
        const projectsFilter = document.getElementById('importProjectsFilter');

        if (hubsList) {
            hubsList.innerHTML = '<div style="text-align: center; padding: 20px; color: #666;">Loading hubs...</div>';
        }
        if (projectsList) {
            projectsList.innerHTML = '<div style="text-align: center; padding: 20px; color: #999;">Select a hub first</div>';
        }
        if (usersList) {
            usersList.innerHTML = '<div style="text-align: center; padding: 40px; color: #999;">Select a project to view users</div>';
        }
        if (hubsFilter)     hubsFilter.value = '';
        if (projectsFilter) projectsFilter.value = '';

        const checkAllCheckbox = document.getElementById('checkAllImportCheckbox');
        if (checkAllCheckbox) {
            checkAllCheckbox.checked = false;
        }

        log('✅ Import modal closed and reset');
    }
}

// ============================================================================
// Hub / Project / User loading
// ============================================================================

/**
 * Load the list of BIM 360 hubs into the import modal.
 */
async function loadHubsForImport() {
    log('📋 Loading hubs for import');
    const hubsList = document.getElementById('importHubsList');
    hubsList.innerHTML = '<div style="text-align: center; padding: 20px; color: #666;">Loading hubs...</div>';

    try {
        const accessToken = window.currentAccessToken;
        if (!accessToken) {
            hubsList.innerHTML = '<div style="text-align: center; padding: 20px; color: #dc3545;">No access token available</div>';
            return;
        }

        const response = await fetch('https://developer.api.autodesk.com/project/v1/hubs', {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });

        if (!response.ok) {
            throw new Error(`Failed to load hubs: ${response.statusText}`);
        }

        const hubsData = await response.json();
        const bim360Hubs = hubsData.data.filter(hub => {
            const extensionType = hub.attributes?.extension?.type;
            return extensionType === 'hubs:autodesk.bim360:Account';
        });

        if (bim360Hubs.length === 0) {
            hubsList.innerHTML = '<div style="text-align: center; padding: 20px; color: #999;">No BIM 360 hubs found</div>';
            return;
        }

        let hubsHTML = '';
        bim360Hubs.forEach(hub => {
            const hubId   = hub.id.replace('b.', '');
            const hubName = escapeHtml(hub.attributes.name);
            hubsHTML += `
                <div class="import-list-item" onclick="selectHubForImport('${hubId}', '${hubName.replace(/'/g, "\\'")}', this)">
                    ${hubName}
                </div>
            `;
        });

        hubsList.innerHTML = hubsHTML;
        log(`✅ Loaded ${bim360Hubs.length} hubs`);

    } catch (error) {
        console.error('Error loading hubs:', error);
        hubsList.innerHTML = `<div style="text-align: center; padding: 20px; color: #dc3545;">Error: ${escapeHtml(error.message)}</div>`;
    }
}

/**
 * Handle hub selection: highlight the item and load its projects.
 */
async function selectHubForImport(hubId, hubName, element) {
    log('🏢 Hub selected:', hubId, hubName);

    importModalState.selectedHubId   = hubId;
    importModalState.selectedHubName  = hubName;
    importModalState.selectedProjectId   = null;
    importModalState.selectedProjectName = null;

    document.querySelectorAll('#importHubsList .import-list-item').forEach(item => {
        item.classList.remove('selected');
    });
    element.classList.add('selected');

    document.getElementById('importUsersList').innerHTML =
        '<div style="text-align: center; padding: 40px; color: #999;">Select a project to view users</div>';

    const projectsFilter = document.getElementById('importProjectsFilter');
    if (projectsFilter) projectsFilter.value = '';

    await loadProjectsForImport(hubId);
}

/**
 * Fetch all projects for the given hub (paginated, with rate-limit delay).
 */
async function loadProjectsForImport(hubId) {
    log('📋 Loading projects for hub:', hubId);
    const projectsList = document.getElementById('importProjectsList');
    projectsList.innerHTML = '<div style="text-align: center; padding: 20px; color: #666;">Loading projects...</div>';

    try {
        const accessToken = window.currentAccessToken;
        if (!accessToken) {
            projectsList.innerHTML = '<div style="text-align: center; padding: 20px; color: #dc3545;">No access token available</div>';
            return;
        }

        let allProjects = [];
        let offset      = 0;
        const limit     = 100;
        let hasMoreData = true;

        while (hasMoreData) {
            if (offset > 0) {
                await new Promise(resolve => setTimeout(resolve, 300));
            }

            const url = `https://developer.api.autodesk.com/project/v1/hubs/b.${hubId}/projects?page[limit]=${limit}&page[offset]=${offset}`;
            const response = await fetch(url, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });

            if (!response.ok) {
                throw new Error(`Failed to load projects: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            allProjects = allProjects.concat(data.data);

            if (data.data.length < limit) {
                hasMoreData = false;
            } else {
                offset += limit;
            }
        }

        if (allProjects.length === 0) {
            projectsList.innerHTML = '<div style="text-align: center; padding: 20px; color: #999;">No projects found</div>';
            return;
        }

        allProjects.sort((a, b) => a.attributes.name.localeCompare(b.attributes.name));

        let projectsHTML = '';
        allProjects.forEach(project => {
            const projectId   = project.id.replace('b.', '');
            const projectName = escapeHtml(project.attributes.name);
            projectsHTML += `
                <div class="import-list-item" onclick="selectProjectForImport('${projectId}', '${projectName.replace(/'/g, "\\'")}', this)">
                    ${projectName}
                </div>
            `;
        });

        projectsList.innerHTML = projectsHTML;
        log(`✅ Loaded ${allProjects.length} projects`);

    } catch (error) {
        console.error('Error loading projects:', error);
        projectsList.innerHTML = `<div style="text-align: center; padding: 20px; color: #dc3545;">Error: ${escapeHtml(error.message)}</div>`;
    }
}

/**
 * Handle project selection: highlight the item and load its users.
 */
async function selectProjectForImport(projectId, projectName, element) {
    log('📁 Project selected:', projectId, projectName);

    importModalState.selectedProjectId   = projectId;
    importModalState.selectedProjectName = projectName;

    document.querySelectorAll('#importProjectsList .import-list-item').forEach(item => {
        item.classList.remove('selected');
    });
    element.classList.add('selected');

    await loadUsersForImport(projectId);
}

/**
 * Fetch all users for the given project (paginated, with retry + exponential back-off).
 */
async function loadUsersForImport(projectId) {
    log('👥 Loading users for project:', projectId);
    const usersList = document.getElementById('importUsersList');
    usersList.innerHTML = '<div style="text-align: center; padding: 40px; color: #666;">Loading users...</div>';

    try {
        const accessToken = window.currentAccessToken;
        if (!accessToken) {
            usersList.innerHTML = '<div style="text-align: center; padding: 40px; color: #dc3545;">No access token available</div>';
            return;
        }

        let allUsers    = [];
        let offset      = 0;
        const limit     = 100;
        let hasMoreData = true;
        let pageCount   = 0;

        while (hasMoreData) {
            pageCount++;
            const queryParams = new URLSearchParams({
                limit: limit.toString(),
                offset: offset.toString()
            });
            const url = `https://developer.api.autodesk.com/construction/admin/v1/projects/${projectId}/users?${queryParams}`;

            let retryCount = 0;
            const maxRetries = 3;
            let success = false;
            let data = null;

            while (!success && retryCount < maxRetries) {
                try {
                    if (offset > 0 || retryCount > 0) {
                        const delay = retryCount > 0 ? Math.pow(2, retryCount) * 1000 : 500;
                        log(`⏳ Waiting ${delay}ms before request (page ${pageCount}, retry ${retryCount})...`);
                        await new Promise(resolve => setTimeout(resolve, delay));
                    }

                    const response = await fetch(url, {
                        headers: { 'Authorization': `Bearer ${accessToken}` }
                    });

                    if (response.status === 429) {
                        const retryAfter = response.headers.get('Retry-After');
                        const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : Math.pow(2, retryCount + 1) * 1000;
                        log(`⚠️ Rate limited (429). Retrying after ${waitTime}ms...`);
                        retryCount++;
                        continue;
                    }

                    if (!response.ok) {
                        throw new Error(`Failed to load users: ${response.status} ${response.statusText}`);
                    }

                    data = await response.json();
                    success = true;

                } catch (error) {
                    retryCount++;
                    if (retryCount >= maxRetries) throw error;
                    log(`⚠️ Request failed, retry ${retryCount}/${maxRetries}: ${error.message}`);
                }
            }

            if (!success || !data) {
                throw new Error('Failed to load users after multiple retries');
            }

            if (data.results && data.results.length > 0) {
                allUsers = allUsers.concat(data.results);
                log(`📊 Loaded page ${pageCount}: ${data.results.length} users (total: ${allUsers.length})`);

                usersList.innerHTML = `<div style="text-align: center; padding: 40px; color: #666;">Loading users... (${allUsers.length} loaded)</div>`;

                if (data.pagination && data.pagination.totalResults) {
                    const totalResults = data.pagination.totalResults;
                    if (allUsers.length >= totalResults) {
                        hasMoreData = false;
                        log(`✅ Reached total results: ${totalResults}`);
                    } else {
                        offset += limit;
                    }
                } else {
                    if (data.results.length < limit) {
                        hasMoreData = false;
                        log(`✅ Got fewer results than limit (${data.results.length} < ${limit}), stopping`);
                    } else {
                        offset += limit;
                    }
                }
            } else {
                hasMoreData = false;
                log('✅ No more results, stopping pagination');
            }
        }

        if (allUsers.length === 0) {
            usersList.innerHTML = '<div style="text-align: center; padding: 40px; color: #999;">No users found in this project</div>';
            return;
        }

        allUsers.sort((a, b) => (a.email || '').localeCompare(b.email || ''));

        importModalState.allUsers = allUsers;
        renderImportUsersTable(allUsers);
        log(`✅ Successfully loaded ${allUsers.length} users from ${pageCount} page(s)`);

    } catch (error) {
        console.error('Error loading users:', error);
        usersList.innerHTML = `<div style="text-align: center; padding: 40px; color: #dc3545;">Error loading users: ${escapeHtml(error.message)}<br><br>Try selecting the project again.</div>`;
    }
}

// ============================================================================
// Users table rendering
// ============================================================================

/**
 * Render the read-only users table in the import modal.
 * @param {Array} users
 */
function renderImportUsersTable(users) {
    const usersList = document.getElementById('importUsersList');

    let tableHTML = `
        <table class="import-users-table">
            <thead>
                <tr>
                    <th style="width: 3%; text-align: center;"><input type="checkbox" id="checkAllImportCheckbox" onchange="toggleAllImportUsers(this)"></th>
                    <th class="import-resizable-th" style="width: 19%;">Email<span class="import-col-resizer" title="Drag to resize this column"></span></th>
                    <th class="import-resizable-th" style="width: 16%;">Company<span class="import-col-resizer" title="Drag to resize this column"></span></th>
                    <th class="import-resizable-th" style="width: 15%;">Role<span class="import-col-resizer" title="Drag to resize this column"></span></th>
                    <th class="import-resizable-th" style="width: 6.71%;" title="Project Administration">Project Admin<span class="import-col-resizer" title="Drag to resize this column"></span></th>
                    <th class="import-resizable-th" style="width: 6.71%;" title="Design Collaboration">Design Collaboration<span class="import-col-resizer" title="Drag to resize this column"></span></th>
                    <th class="import-resizable-th" style="width: 6.71%;" title="Model Coordination">Model Coordination<span class="import-col-resizer" title="Drag to resize this column"></span></th>
                    <th class="import-resizable-th" style="width: 6.71%;" title="Preconstruction">Preconstruction<span class="import-col-resizer" title="Drag to resize this column"></span></th>
                    <th class="import-resizable-th" style="width: 6.71%;" title="Build">Build<span class="import-col-resizer" title="Drag to resize this column"></span></th>
                    <th class="import-resizable-th" style="width: 6.71%;" title="Cost Management">Cost Management<span class="import-col-resizer" title="Drag to resize this column"></span></th>
                    <th class="import-resizable-th" style="width: 6.72%;" title="Site & Building Design">Site &amp; Building Design<span class="import-col-resizer" title="Drag to resize this column"></span></th>
                </tr>
            </thead>
            <tbody>
    `;

    users.forEach((user, index) => {
        const email   = escapeHtml(user.email || '');
        const company = escapeHtml(user.companyName || '');

        let role = 'N/A';
        if (user.roles && Array.isArray(user.roles) && user.roles.length > 0) {
            role = user.roles.map(r => r.name).join(', ');
        }
        role = escapeHtml(role);

        const products     = user.products || [];
        const projectAdmin = getServiceAccess(products, 'project_administration');
        const design       = getServiceAccess(products, 'design_collaboration');
        const model        = getServiceAccess(products, 'model_coordination');
        const precon       = getServiceAccess(products, 'preconstruction');
        const build        = getServiceAccess(products, 'build');
        const cost         = getServiceAccess(products, 'cost_management');
        const forma        = getServiceAccess(products, 'forma');

        tableHTML += `
            <tr data-user-index="${index}">
                <td style="text-align: center;">
                    <input type="checkbox" class="import-user-checkbox" data-user-index="${index}" onchange="toggleImportUser(${index}, this)">
                </td>
                <td>${email}</td>
                <td>${company}</td>
                <td>${role}</td>
                <td style="text-align: left;">${renderServiceIndicator(projectAdmin)}</td>
                <td style="text-align: left;">${renderServiceIndicator(design)}</td>
                <td style="text-align: left;">${renderServiceIndicator(model)}</td>
                <td style="text-align: left;">${renderServiceIndicator(precon)}</td>
                <td style="text-align: left;">${renderServiceIndicator(build)}</td>
                <td style="text-align: left;">${renderServiceIndicator(cost)}</td>
                <td style="text-align: left;">${renderServiceIndicator(forma)}</td>
            </tr>
        `;
    });

    tableHTML += `
            </tbody>
        </table>
    `;

    usersList.innerHTML = tableHTML;
    setupImportCheckboxShiftClick();
    setupImportColumnResize();
}

// ============================================================================
// Column resize — identical scheme to #userManagementModal's table:
// percentage widths that always sum to exactly 100%, so the table can
// never need horizontal scroll. Dragging one column's handle takes width
// from the others, proportionally to their current share.
//
// The table is rebuilt from scratch on every renderImportUsersTable() call,
// so the mousedown listeners on .import-col-resizer are (re)attached each
// time here; the shared drag state and the document-level mousemove/mouseup
// listeners are set up exactly once (importColumnResizeInitialized guard).
// ============================================================================
let importColumnResizeInitialized = false;
let importDragTh = null;
let importDragStartX = 0;
let importTableWidthAtStart = 0;
let importStartPercents = new Map();
let importOtherThs = [];

function setupImportColumnResize() {
    const IMPORT_MIN_PERCENT = 3;

    const currentPercent = (th) => parseFloat(th.style.width) || 0;

    document.querySelectorAll('#importUsersList .import-col-resizer').forEach(handle => {
        handle.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            importDragTh = handle.closest('th');
            if (!importDragTh) return;

            const table = document.querySelector('#importUsersList .import-users-table');
            importTableWidthAtStart = table.getBoundingClientRect().width;

            importOtherThs = Array.from(document.querySelectorAll('#importUsersList .import-resizable-th')).filter(th => th !== importDragTh);
            importStartPercents = new Map();
            importStartPercents.set(importDragTh, currentPercent(importDragTh));
            importOtherThs.forEach(th => importStartPercents.set(th, currentPercent(th)));

            importDragStartX = e.clientX;
            handle.classList.add('resizing');
            document.body.style.cursor = 'col-resize';
        });
    });

    if (importColumnResizeInitialized) return;
    importColumnResizeInitialized = true;

    document.addEventListener('mousemove', (e) => {
        if (!importDragTh) return;

        const deltaPercent = ((e.clientX - importDragStartX) / importTableWidthAtStart) * 100;
        const dragStart = importStartPercents.get(importDragTh);
        const othersStartSum = importOtherThs.reduce((sum, th) => sum + importStartPercents.get(th), 0);

        const maxDragPercent = dragStart + othersStartSum - (IMPORT_MIN_PERCENT * importOtherThs.length);
        const newDragPercent = Math.min(maxDragPercent, Math.max(IMPORT_MIN_PERCENT, dragStart + deltaPercent));
        const actualDelta = newDragPercent - dragStart;

        importDragTh.style.width = newDragPercent + '%';

        importOtherThs.forEach(th => {
            const start = importStartPercents.get(th);
            const share = othersStartSum > 0 ? start / othersStartSum : 1 / importOtherThs.length;
            const newPercent = Math.max(IMPORT_MIN_PERCENT, start - actualDelta * share);
            th.style.width = newPercent + '%';
        });
    });

    document.addEventListener('mouseup', () => {
        if (!importDragTh) return;
        const handle = importDragTh.querySelector('.import-col-resizer.resizing');
        if (handle) handle.classList.remove('resizing');
        importDragTh = null;
        document.body.style.cursor = '';
    });
}

/**
 * Resolve the access level for a given service key from a products array.
 * The API returns products as: [{key: "projectAdministration", access: "administrator"}, ...]
 *
 * @param {Array|Object} products
 * @param {string} serviceKey  e.g. 'project_administration', 'document_management'
 * @param {Object|null} userObject  (unused, kept for backward compatibility)
 * @returns {string} e.g. 'administrator', 'member', 'none'
 */
function getServiceAccess(products, serviceKey, userObject = null) {
    if (!products) return 'none';

    const keyMapping = {
        'project_administration': 'projectAdministration',
        'document_management':    'docs',
        'design_collaboration':   'designCollaboration',
        'model_coordination':     'modelCoordination',
        'preconstruction':        'preconstruction',
        'build':                  'build',
        'cost_management':        'cost',
        'forma':                  'forma'
    };

    if (Array.isArray(products)) {
        const apiKey  = keyMapping[serviceKey] || serviceKey;
        const product = products.find(p => p.key === apiKey);
        return (product && product.access) ? product.access : 'none';
    }

    // Legacy: object structure
    let service = products[serviceKey];

    if (!service) {
        const camelKey = serviceKey.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
        service = products[camelKey];
    }

    if (!service) return 'none';
    if (service.access) return service.access;
    if (typeof service === 'string') return service;
    if (service.accessLevel) return service.accessLevel;

    return 'none';
}

/**
 * Render a small read-only toggle switch illustrating an access level.
 * @param {string} access  'administrator', 'member', or 'none'
 * @returns {string} HTML string
 */
function renderServiceIndicator(access) {
    const isChecked = (access === 'administrator' || access === 'member');
    return `
        <label class="toggle-switch">
            <input type="checkbox" ${isChecked ? 'checked' : ''} disabled style="cursor: not-allowed;">
            <span class="toggle-slider"></span>
        </label>
    `;
}

// ============================================================================
// Checkbox selection helpers
// ============================================================================

/**
 * Attach Shift+click range selection to the import user checkboxes.
 */
function setupImportCheckboxShiftClick() {
    const checkboxes = document.querySelectorAll('.import-user-checkbox');
    let lastCheckedIndex = null;

    checkboxes.forEach((checkbox, currentIndex) => {
        checkbox.addEventListener('click', (e) => {
            if (e.shiftKey && lastCheckedIndex !== null && lastCheckedIndex !== currentIndex) {
                const start = Math.min(lastCheckedIndex, currentIndex);
                const end   = Math.max(lastCheckedIndex, currentIndex);
                const checkState = checkbox.checked;

                for (let i = start; i <= end; i++) {
                    const targetCheckbox = checkboxes[i];
                    targetCheckbox.checked = checkState;

                    const userIndex = parseInt(targetCheckbox.dataset.userIndex);
                    if (checkState) {
                        if (!selectedProjectUsers.includes(userIndex)) {
                            selectedProjectUsers.push(userIndex);
                        }
                    } else {
                        const idx = selectedProjectUsers.indexOf(userIndex);
                        if (idx > -1) selectedProjectUsers.splice(idx, 1);
                    }
                }
            }
            lastCheckedIndex = currentIndex;
        });
    });
}

function toggleImportUser(index, checkbox) {
    if (checkbox.checked) {
        if (!selectedProjectUsers.includes(index)) {
            selectedProjectUsers.push(index);
        }
    } else {
        const idx = selectedProjectUsers.indexOf(index);
        if (idx > -1) selectedProjectUsers.splice(idx, 1);
    }
    log(`User ${index} toggled, selected count: ${selectedProjectUsers.length}`);
}

function toggleAllImportUsers(checkbox) {
    const allCheckboxes = document.querySelectorAll('.import-user-checkbox');
    selectedProjectUsers = [];

    allCheckboxes.forEach((cb, index) => {
        cb.checked = checkbox.checked;
        if (checkbox.checked) {
            selectedProjectUsers.push(index);
        }
    });

    log(`All users toggled: ${checkbox.checked ? 'checked' : 'unchecked'}, count: ${selectedProjectUsers.length}`);
}

function checkAllImportUsers() {
    const checkAllCheckbox = document.getElementById('checkAllImportCheckbox');
    if (checkAllCheckbox) {
        checkAllCheckbox.checked = true;
        toggleAllImportUsers(checkAllCheckbox);
    }
}

function uncheckAllImportUsers() {
    const checkAllCheckbox = document.getElementById('checkAllImportCheckbox');
    if (checkAllCheckbox) {
        checkAllCheckbox.checked = false;
        toggleAllImportUsers(checkAllCheckbox);
    }
}

// ============================================================================
// Filter helpers
// ============================================================================

function filterImportHubs() {
    const filterInput = document.getElementById('importHubsFilter');
    const filterText  = filterInput ? filterInput.value.toLowerCase() : '';
    const items       = document.getElementById('importHubsList').querySelectorAll('.import-list-item');

    items.forEach(item => {
        item.style.display = item.textContent.toLowerCase().includes(filterText) ? '' : 'none';
    });
}

function filterImportProjects() {
    const filterInput = document.getElementById('importProjectsFilter');
    const filterText  = filterInput ? filterInput.value.toLowerCase() : '';
    const items       = document.getElementById('importProjectsList').querySelectorAll('.import-list-item');

    items.forEach(item => {
        item.style.display = item.textContent.toLowerCase().includes(filterText) ? '' : 'none';
    });
}

// ============================================================================
// Import action
// ============================================================================

/**
 * Import the currently selected users from the import modal into the main user table.
 */
function importSelectedUsers() {
    if (selectedProjectUsers.length === 0) {
        alert('Please select at least one user to import.');
        return;
    }

    if (!userTableManager) {
        alert('User table manager not initialized.');
        return;
    }

    log(`🚀 Importing ${selectedProjectUsers.length} users`);

    const tbody = document.getElementById('modalTableBody');
    const existingEmails = new Set();
    Array.from(tbody.rows).forEach(row => {
        const emailCell = row.cells[1];
        if (emailCell && emailCell.textContent) {
            existingEmails.add(emailCell.textContent.trim().toLowerCase());
        }
    });

    let importedCount = 0;
    let skippedCount  = 0;
    const skippedEmails = [];

    selectedProjectUsers.forEach(index => {
        const user = importModalState.allUsers[index];
        if (!user) return;

        const email = (user.email || '').trim();
        if (!email) return;

        if (existingEmails.has(email.toLowerCase())) {
            skippedCount++;
            skippedEmails.push(email);
            log(`⚠️ Skipping duplicate email: ${email}`);
            return;
        }

        const row = userTableManager.createNewRow();

        row.cells[1].textContent = email;
        row.cells[2].textContent = user.companyName || '';

        let role = '';
        if (user.roles && Array.isArray(user.roles) && user.roles.length > 0) {
            role = user.roles.map(r => r.name).join(', ');
        }
        row.cells[3].textContent = role;

        const products = user.products || [];

        // Column indices here must match userTableManager.createNewRow()'s
        // actual layout (checkbox, Email, Company, Role, then the 7 access
        // columns starting at index 4 — no Docs column; see accessColumns in
        // user-table-v2.js). This previously assumed an 8th "Docs" column
        // that doesn't exist in the destination row, which silently shifted
        // every access level into the wrong cell and dropped Site & Building
        // Design (Forma) access entirely, since row.cells[11] never existed.
        setImportedServiceAccess(row.cells[4],  'Project Admin',        getServiceAccess(products, 'project_administration'), 4);
        setImportedServiceAccess(row.cells[5],  'Design Collaboration', getServiceAccess(products, 'design_collaboration'),   5);
        setImportedServiceAccess(row.cells[6],  'Model Coordination',   getServiceAccess(products, 'model_coordination'),     6);
        setImportedServiceAccess(row.cells[7],  'Preconstruction',      getServiceAccess(products, 'preconstruction'),        7);
        setImportedServiceAccess(row.cells[8],  'Build',                getServiceAccess(products, 'build'),                  8);
        setImportedServiceAccess(row.cells[9],  'Cost Management',      getServiceAccess(products, 'cost_management'),        9);
        setImportedServiceAccess(row.cells[10], 'Design',               getServiceAccess(products, 'forma'),                  10);

        tbody.appendChild(row);
        existingEmails.add(email.toLowerCase());
        importedCount++;
    });

    userTableManager.updateUserCount();
    userTableManager.recheckDuplicates();

    let message = `✅ Successfully imported ${importedCount} user(s).`;
    if (skippedCount > 0) {
        message += `\n\n⚠️ Skipped ${skippedCount} duplicate email(s):\n${skippedEmails.join('\n')}`;
    }
    alert(message);

    closeImportProjectModal();
    log(`✅ Import complete: ${importedCount} imported, ${skippedCount} skipped`);
}

/**
 * Apply a computed service access level to an already-created access cell.
 * @param {HTMLTableCellElement} cell
 * @param {string} columnName
 * @param {string} access  'administrator', 'member', or 'none'
 * @param {number} columnIndex
 */
function setImportedServiceAccess(cell, columnName, access, columnIndex) {
    if (!cell) return;

    cell.setAttribute('data-value', access);
    cell.setAttribute('data-column-name', columnName);

    const checkbox = cell.querySelector('input[type="checkbox"]');
    if (checkbox) {
        if (columnName === 'Project Admin') {
            checkbox.checked = (access === 'administrator');
        } else {
            checkbox.checked = (access === 'member' || access === 'administrator');
        }

        if (access === 'administrator') {
            cell.classList.add('administrator');
        } else {
            cell.classList.remove('administrator');
        }
    }
}
