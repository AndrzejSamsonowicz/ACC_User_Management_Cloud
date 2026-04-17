/**
 * Folder Permissions Management Module
 * Handles folder hierarchy retrieval and display for ACC projects
 */

(function() {
    'use strict';

    // Module state
    let foldersModal = null;
    let currentProjectData = null;
    let currentHierarchy = null;
    let currentProjectUsers = null;
    let currentProjectUsersRaw = null; // Store raw API data for subjectId lookup
    let currentUserDisplayMode = 'email'; // Track current display mode (email or name)
    let currentFolderDisplayDepth = 2; // Tracks max loaded API depth (level1 containers + level2 folders)
    let folderChildrenCache = {}; // parentId -> [{id, name, ...}] â€” cache fetched children
    let expandedFolderIds = new Set(); // Per-node tree expansion state

    /**
     * Data model â€” the single source of truth for user-permission assignments.
     * Map<folderId, Array<{ user, displayName, level, subjectType, subjectId, isInherited }>>
     */
    let folderUserAssignments = new Map();

    /**
     * Progress modal functions
     */
    function showLoadingProgress(message, percent) {
        let progressModal = document.getElementById('folderLoadingProgress');
        if (!progressModal) {
            progressModal = document.createElement('div');
            progressModal.id = 'folderLoadingProgress';
            progressModal.innerHTML = `
                <div style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 10000; display: flex; align-items: center; justify-content: center;">
                    <div style="background: white; padding: 30px; border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.3); min-width: 400px;">
                        <h4 id="folderLoadingMessage" style="margin: 0 0 20px 0; color: #333; font-size: 16px; text-align: center;"></h4>
                        <div style="background: #e9ecef; border-radius: 4px; height: 30px; overflow: hidden;">
                            <div id="folderLoadingBar" style="background: rgb(6, 150, 215); height: 100%; width: 0%; transition: width 0.3s; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 14px;"></div>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(progressModal);
        }
        progressModal.style.display = 'block';
        updateLoadingProgress(message, percent);
    }

    function updateLoadingProgress(message, percent) {
        const messageEl = document.getElementById('folderLoadingMessage');
        const barEl = document.getElementById('folderLoadingBar');
        if (messageEl) messageEl.textContent = message;
        if (barEl) {
            barEl.style.width = `${percent}%`;
        }
    }

    function hideLoadingProgress() {
        const progressModal = document.getElementById('folderLoadingProgress');
        if (progressModal) {
            progressModal.style.display = 'none';
        }
    }



    /**
     * Initialize the folders permissions module
     */
    window.initFoldersPermissions = function() {
        // log('&#128194; Folders Permissions module initialized');
    };

    /**
     * Show the folders management modal for a project
     */
    window.showFoldersModal = async function(projectId, projectName, hubId, accessToken) {
        // log('&#128194; Opening folders modal for project:', projectName);
        // log('&#128194; Project ID:', projectId);
        // log('&#128194; Hub ID:', hubId);

        // Store current project data
        currentProjectData = {
            projectId,
            projectName,
            hubId,
            accessToken
        };

        // Reset lazy-load state for each modal open
        currentFolderDisplayDepth = 2;
        folderChildrenCache = {};
        expandedFolderIds = new Set();
        folderUserAssignments = new Map();

        // Create modal if it doesn't exist
        createFoldersModal();

        // Show modal
        const modalTitle = document.getElementById('foldersModalTitle');
        const loadingMessage = document.getElementById('foldersLoadingMessage');
        const tableContainer = document.getElementById('foldersTableContainer');
        const userListContainer = document.getElementById('foldersUserList');
        const errorMessage = document.getElementById('foldersErrorMessage');

        modalTitle.textContent = `Folder Structure: ${projectName}`;
        foldersModal.style.display = 'block';
        loadingMessage.style.display = 'none'; // Hidden - using progress overlay instead
        tableContainer.style.display = 'none';
        userListContainer.style.display = 'none';
        errorMessage.style.display = 'none';

        try {
            // Fetch folder hierarchy and project users in parallel
            const [folderHierarchy, usersData] = await Promise.all([
                fetchFolderHierarchy(hubId, projectId, accessToken),
                fetchProjectUsers(hubId, projectId, accessToken)
            ]);
            
            // Store hierarchy and users for re-rendering when adding columns
            currentHierarchy = folderHierarchy;
            currentProjectUsers = usersData.displayUsers;
            currentProjectUsersRaw = usersData.rawUsers; // Store raw data for ID lookup
            
            // Auto-expand level1 container folders (e.g. "Project Files") so children are visible
            const level1Ids = new Set(folderHierarchy.map(r => r.level1?.id).filter(Boolean));
            for (const id of level1Ids) expandedFolderIds.add(id);
            
            // Display in table and user list
            displayFolderHierarchy(folderHierarchy);
            displayUserList(usersData.displayUsers);
            
            // Fetch and pre-populate with existing ACC folder permissions
            // Continue with unified progress (50-100%)
            updateLoadingProgress('Loading folder structure...', 50);
            // log('ðŸ” Fetching existing ACC folder permissions...');
            await loadExistingACCPermissions(projectId, folderHierarchy, usersData.displayUsers, accessToken);

            // Propagate any inherited permissions that the ACC load may have missed
            propagatePermissionsToEmptyRows();
            
            // DON'T auto-load saved JSON - it would override our fresh ACC data
            // User can manually load saved data if needed
            // await loadFolderPermissions(projectName);
            
            // Final progress update
            updateLoadingProgress('Loading folder structure...', 100);
            
            // Show the table and user list FIRST (while progress is still visible)
            loadingMessage.style.display = 'none';
            tableContainer.style.display = 'block';
            userListContainer.style.display = 'block';
            
            // Wait for browser to actually render and paint the table
            // Use double requestAnimationFrame to ensure painting is complete
            await new Promise(resolve => {
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        // Add extra delay to ensure large tables are fully rendered
                        setTimeout(resolve, 300);
                    });
                });
            });
            
            hideLoadingProgress();
        } catch (error) {
            // console.error('âŒ Error loading folders:', error);
            
            // Complete progress to 100% before hiding (even on error)
            updateLoadingProgress('Loading folder structure...', 100);
            
            // Show error state
            loadingMessage.style.display = 'none';
            
            // Wait for browser to render error state, then hide progress
            await new Promise(resolve => {
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        setTimeout(resolve, 300);
                    });
                });
            });
            
            hideLoadingProgress();
            
            loadingMessage.style.display = 'none';
            
            // Provide user-friendly error message based on error type
            let errorHtml = '';
            if (error.message.includes('404')) {
                errorHtml = `
                    <div style="font-size: 48px; margin-bottom: 20px;">âš ï¸</div>
                    <h3 style="margin: 0 0 15px 0; color: #856404;">Unable to Load Folders</h3>
                    <p style="margin: 10px 0; text-align: left; display: inline-block;">This may occur if:</p>
                    <ul style="text-align: left; display: inline-block; margin: 10px 0;">
                        <li>You don't have access to the Docs service in this project</li>
                        <li>No folders exist in this project yet</li>
                        <li>Your account lacks the necessary permissions</li>
                    </ul>
                    <p style="margin: 20px 0 10px 0; font-weight: bold;">Please contact your project administrator to grant you access.</p>
                    <p style="margin: 10px 0; color: #666; font-size: 13px;">You can close this window using the <strong>Ã—</strong> button in the top-right corner or by pressing <strong>ESC</strong>.</p>
                `;
            } else if (error.message.includes('403')) {
                errorHtml = `
                    <div style="font-size: 48px; margin-bottom: 20px;">&#128683;</div>
                    <h3 style="margin: 0 0 15px 0; color: #856404;">Access Denied</h3>
                    <p style="margin: 10px 0;">You don't have permission to view folders in this project.</p>
                    <p style="margin: 20px 0 10px 0; font-weight: bold;">Please contact your project administrator.</p>
                    <p style="margin: 10px 0; color: #666; font-size: 13px;">You can close this window using the <strong>Ã—</strong> button in the top-right corner or by pressing <strong>ESC</strong>.</p>
                `;
            } else {
                errorHtml = `
                    <div style="font-size: 48px; margin-bottom: 20px;">âŒ</div>
                    <h3 style="margin: 0 0 15px 0; color: #856404;">Error Loading Folders</h3>
                    <p style="margin: 10px 0;">${error.message}</p>
                    <p style="margin: 10px 0; color: #666; font-size: 13px;">You can close this window using the <strong>Ã—</strong> button in the top-right corner or by pressing <strong>ESC</strong>.</p>
                `;
            }
            
            errorMessage.innerHTML = errorHtml;
            errorMessage.style.display = 'block';
        }
    };

    /**
     * Fetch folder hierarchy â€” loads only level1 (container) + level2 (first displayed level).
     * Deeper levels are loaded lazily via expandFolderDepth().
     */
    async function fetchFolderHierarchy(hubId, projectId, accessToken) {
        try {
            showLoadingProgress('Loading folder structure...', 0);

            // Step 1: Get top-level (container) folders
            const topFolders = await fetchTopFolders(hubId, projectId, accessToken);
            updateLoadingProgress('Loading folder structure...', 10);

            const hierarchy = [];
            let processed = 0;

            // Step 2: Fetch first displayed level (level2) in parallel
            const level2Results = await Promise.all(
                topFolders.map(async level1Folder => {
                    const level2Folders = await fetchFolderContents(projectId, level1Folder.id, accessToken);
                    processed++;
                    updateLoadingProgress('Loading folder structure...', 10 + (processed / topFolders.length) * 40);
                    return { level1Folder, level2Folders };
                })
            );

            // Build hierarchy rows â€” each row has level1 (container) + level2 (displayed)
            for (const { level1Folder, level2Folders } of level2Results) {
                for (const level2Folder of level2Folders) {
                    // Cache children as unknown (will be fetched lazily on expand)
                    hierarchy.push({
                        level1: level1Folder,
                        level2: level2Folder
                        // level3, level4, ... added lazily by expandFolderDepth()
                    });
                }
            }

            updateLoadingProgress('Loading folder structure...', 50);
            return hierarchy;

        } catch (error) {
            hideLoadingProgress();
            throw error;
        }
    }

    /**
     * Fetch top-level folders using Project API
     */
    async function fetchTopFolders(hubId, projectId, accessToken) {
        // Ensure project ID has "b." prefix for Data Management API
        const formattedProjectId = projectId.startsWith('b.') ? projectId : `b.${projectId}`;
        const url = `https://developer.api.autodesk.com/project/v1/hubs/${hubId}/projects/${formattedProjectId}/topFolders`;
        
        // log('ðŸ“¡ Fetching top folders from:', url);

        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch top folders: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        
        // Extract folder information
        const folders = data.data
            .filter(item => item.type === 'folders')
            .map(folder => ({
                id: folder.id,
                name: folder.attributes.displayName || folder.attributes.name,
                objectCount: folder.attributes.objectCount || 0,
                hidden: folder.attributes.hidden || false
            }));

        return folders;
    }

    /**
     * Fetch folder contents (children) using Data Management API
     */
    async function fetchFolderContents(projectId, folderId, accessToken) {
        // Ensure project ID has "b." prefix for Data Management API
        const formattedProjectId = projectId.startsWith('b.') ? projectId : `b.${projectId}`;
        const encodedFolderId = encodeURIComponent(folderId);
        const url = `https://developer.api.autodesk.com/data/v1/projects/${formattedProjectId}/folders/${encodedFolderId}/contents?filter[type]=folders`;
        
        // log('ðŸ“¡ Fetching folder contents from:', url);

        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            // console.warn(`âš ï¸ Failed to fetch contents for folder ${folderId}: ${response.status}`);
            return []; // Return empty array if folder has no accessible contents
        }

        const data = await response.json();
        
        // Extract only folders (not items/files)
        const folders = data.data
            .filter(item => item.type === 'folders')
            .map(folder => ({
                id: folder.id,
                name: folder.attributes.displayName || folder.attributes.name,
                objectCount: folder.attributes.objectCount || 0,
                hidden: folder.attributes.hidden || false,
                parentId: folder.relationships?.parent?.data?.id || null
            }));

        return folders;
    }

    /**
     * Fetch project users
     */
    async function fetchProjectUsers(hubId, projectId, accessToken) {
        // log('&#128101; Fetching project users...');
        
        let allUsers = [];
        let offset = 0;
        const limit = 100;
        let hasMoreData = true;

        while (hasMoreData) {
            const queryParams = new URLSearchParams({
                'limit': limit.toString(),
                'offset': offset.toString()
            });

            const url = `https://developer.api.autodesk.com/construction/admin/v1/projects/${projectId}/users?${queryParams}`;
            
            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`Failed to fetch project users: ${response.status}`);
            }

            const usersData = await response.json();
            
            // Log first response to see structure
            if (offset === 0 && usersData.results && usersData.results.length > 0) {
                // log('Sample API user response:', usersData.results[0]);
                // log('Available keys:', Object.keys(usersData.results[0]));
                // log('Role field check:', {
                //     default_role: usersData.results[0].default_role,
                //     role: usersData.results[0].role,
                //     role_name: usersData.results[0].role_name,
                //     roleName: usersData.results[0].roleName
                // });
            }
            
            if (usersData.results && usersData.results.length > 0) {
                allUsers = allUsers.concat(usersData.results);
                offset += limit;
                
                // Check if there's more data
                hasMoreData = usersData.pagination && 
                             usersData.pagination.offset + usersData.results.length < usersData.pagination.totalResults;
            } else {
                hasMoreData = false;
            }
        }
        
        // Store raw user data for ID lookup (including products for admin detection)
        const rawUsers = allUsers.map(user => ({
            id: user.id,
            email: user.email,
            name: user.name, // Store actual name (can be undefined if user has no name)
            companyId: user.companyId,
            companyName: user.companyName || user.company || user.company_name,
            roleIds: user.roleIds || [],
            roles: user.roles || [],
            autodeskId: user.autodeskId,
            products: user.products || [] // For admin detection
        }));
        
        // Extract display user data
        const displayUsers = allUsers.map(user => {
            // Extract role name from roles array
            let roleName = 'No Role';
            if (user.roles && user.roles.length > 0) {
                roleName = user.roles[0].name || user.roles[0];
            }
            
            const userData = {
                id: user.id,
                email: user.email,
                name: user.name || user.email,
                autodeskId: user.autodeskId,
                company_name: user.companyName || user.company || user.company_name || 'No Company',
                default_role: roleName
            };
            
            // Debug: log if role is missing
            if (userData.default_role === 'No Role') {
                // log('User without role:', user);
            }
            
            return userData;
        });
        
        // log(`âœ… Fetched ${displayUsers.length} project users`);
        // log('Sample display user:', displayUsers[0]);
        // log('Sample raw user:', rawUsers[0]);
        
        return {
            displayUsers: displayUsers,
            rawUsers: rawUsers
        };
    }

    /**
     * Natural sort comparator for alphanumeric sorting
     * Handles numbers correctly (Folder 2 comes before Folder 10)
     */
    function naturalSort(a, b) {
        const ax = [];
        const bx = [];
        
        a.replace(/(\d+)|(\D+)/g, (_, num, str) => {
            ax.push([num || Infinity, str || '']);
        });
        b.replace(/(\d+)|(\D+)/g, (_, num, str) => {
            bx.push([num || Infinity, str || '']);
        });
        
        while (ax.length && bx.length) {
            const an = ax.shift();
            const bn = bx.shift();
            const nn = (an[0] - bn[0]) || an[1].localeCompare(bn[1]);
            if (nn) return nn;
        }
        
        return ax.length - bx.length;
    }

    /**
     * Returns the hierarchy key for display-depth d (0-indexed).
     * depth 0 â†’ 'level2' (first displayed level = children of top-folders)
     * depth 1 â†’ 'level3', depth 2 â†’ 'level4', etc.
     */
    function levelKeyForDepth(d) {
        return `level${d + 1}`;
    }

    /**
     * Build a flat, sorted list of folder rows to render, up to maxDepth columns.
     * Returns [{folder, depth, row}] where `row` is the originating hierarchy row.
     */
    function buildFolderRows(hierarchy, maxDepth) {
        const result = [];

        function processGroup(subHierarchy, depth) {
            const key = levelKeyForDepth(depth);
            const groups = new Map();
            for (const row of subHierarchy) {
                const folder = row[key];
                if (!folder) continue;
                if (!groups.has(folder.id)) groups.set(folder.id, { folder, rows: [] });
                groups.get(folder.id).rows.push(row);
            }
            const sorted = [...groups.values()].sort((a, b) => naturalSort(a.folder.name, b.folder.name));
            for (const { folder, rows } of sorted) {
                result.push({ folder, depth, row: rows[0] });
                if (depth + 1 < maxDepth) processGroup(rows, depth + 1);
            }
        }

        processGroup(hierarchy, 0);
        return result;
    }

    /**
     * Build a sorted list of VISIBLE folder rows (respecting per-node expand state).
     * Returns [{folder, depth, row, hasLoadedChildren, mightHaveChildren}].
     */
    function buildVisibleFolderRows(hierarchy) {
        const result = [];

        function processGroup(subHierarchy, depth) {
            const key = levelKeyForDepth(depth);
            const nextKey = levelKeyForDepth(depth + 1);
            const groups = new Map();
            for (const row of subHierarchy) {
                const folder = row[key];
                if (!folder) continue;
                if (!groups.has(folder.id)) groups.set(folder.id, { folder, rows: [] });
                groups.get(folder.id).rows.push(row);
            }
            const sorted = [...groups.values()].sort((a, b) => naturalSort(a.folder.name, b.folder.name));
            for (const { folder, rows } of sorted) {
                const hasLoadedChildren = rows.some(r => r[nextKey]);
                const mightHaveChildren = !hasLoadedChildren && folderChildrenCache[folder.id] === undefined;
                result.push({ folder, depth, row: rows[0], hasLoadedChildren, mightHaveChildren });
                // Recurse into children only if this node is expanded AND children exist
                if (expandedFolderIds.has(folder.id) && hasLoadedChildren) {
                    processGroup(rows, depth + 1);
                }
            }
        }

        processGroup(hierarchy, 0);
        return result;
    }

    /**
     * Display folder hierarchy as a single-column indented tree table.
     * Display folder hierarchy as a single-column tree with user sub-rows.
     * Folders are tree nodes; users appear as indented sub-rows beneath each folder.
     */
    function displayFolderHierarchy(hierarchy) {
        const tableContainer = document.getElementById('foldersTableContainer');

        // --- Build thead: single column ---
        const theadHTML = '';

        // --- Build tbody: folder rows + user sub-rows ---
        const folderRows = buildVisibleFolderRows(hierarchy);

        let tbodyHTML = '';
        for (const { folder, depth, row: hRow, hasLoadedChildren, mightHaveChildren } of folderRows) {
            const level1Id   = hRow.level1?.id   || '';
            const level1Name = (hRow.level1?.name || '').replace(/'/g, "\\'");
            const parentKey  = depth > 0 ? levelKeyForDepth(depth - 1) : null;
            const parentId   = parentKey ? (hRow[parentKey]?.id   || '') : '';
            const parentName = parentKey ? (hRow[parentKey]?.name || '').replace(/'/g, "\\'") : '';
            const folderName = folder.name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

            let attrs = `data-folder-id="${folder.id}" data-folder-depth="${depth}" data-level1-id="${level1Id}" data-level1-name="${level1Name}"`;
            if (depth > 0) {
                attrs += ` data-level2-id="${parentId}" data-level2-name="${parentName}" data-parent-id="${parentId}"`;
            }

            const isExpanded = expandedFolderIds.has(folder.id);
            const showToggle = hasLoadedChildren || mightHaveChildren;
            const indent = depth * 48 + 10;

            // SVG folder icon (outline style)
            const folderSVG = '<svg class="folder-svg-icon" viewBox="0 0 24 24" width="27" height="27" fill="none" stroke="#888" stroke-width="1.5"><path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6.5l-2-2H5a2 2 0 00-2 2z"/></svg>';

            // --- Folder row ---
            tbodyHTML += `<tr class="folder-row" ${attrs}>`;
            tbodyHTML += `<td class="folder-name-cell" style="padding-left: ${indent}px;">`;
            if (showToggle) {
                const escapedId = folder.id.replace(/'/g, "\\'");
                tbodyHTML += `<span class="tree-toggle ${isExpanded ? 'expanded' : ''}" onclick="window.toggleFolderExpand('${escapedId}')">&#x276F;</span> `;
            } else {
                tbodyHTML += '<span class="tree-toggle-spacer"></span> ';
            }
            tbodyHTML += `<span class="folder-label">${folderSVG} ${folderName}</span></td></tr>`;

            // --- User sub-rows for this folder ---
            const users = folderUserAssignments.get(folder.id);
            if (users && users.length > 0) {
                const userIndent = indent + 28; // deeper than folder
                for (const u of users) {
                    const colors = u.subjectType
                        ? getSubjectColor(u.subjectType, u.level)
                        : getPermissionLevelColor(u.level);

                    const safeDisplay = (u.displayName || u.user).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                    const safeUser = (u.user || '').replace(/"/g, '&quot;');
                    const readonlyAttr = u.isInherited ? ' readonly title="Inherited from parent folder (read-only)"' : '';
                    const inheritedLabel = u.isInherited ? '<span class="inherited-label">inherited</span>' : '';
                    const inheritedClass = u.isInherited ? ' inherited-permission' : '';
                    const inheritedData = u.isInherited ? ' data-is-inherited="true"' : '';

                    tbodyHTML += `<tr class="user-sub-row${inheritedClass}" data-folder-parent-id="${folder.id}" data-user="${safeUser}" data-display-name="${safeDisplay}" data-permission-level="${u.level}" data-subject-type="${u.subjectType || ''}" data-subject-id="${u.subjectId || ''}"${inheritedData}>`;
                    tbodyHTML += `<td class="user-entry-cell">`;
                    tbodyHTML += `<div class="user-entry-content" style="margin-left: ${userIndent}px; background-color: ${colors.background}; color: ${colors.color};">`;
                    tbodyHTML += `<span class="user-entry-icon">${u.subjectType === 'COMPANY' ? '&#127970;' : u.subjectType === 'ROLE' ? '&#128101;' : '&#128100;'}</span> `;
                    tbodyHTML += `<span class="cell-username" title="${safeDisplay}">${safeDisplay}</span> `;
                    tbodyHTML += inheritedLabel;
                    tbodyHTML += `<input type="text" class="cell-permission-level" value="${u.level}" maxlength="1"${readonlyAttr} /> `;
                    tbodyHTML += `</div></td></tr>`;
                }
            }
        }

        tableContainer.innerHTML = `<table class="folders-table">${theadHTML}<tbody>${tbodyHTML}</tbody></table>`;

        setupTableInteractions();
        setupTableZoom();
    }

    // =========================================================================
    // Lazy folder expansion / collapse
    // =========================================================================

    /**
     * Sync current permission-input values from the DOM back into folderUserAssignments.
     * Call before any re-render to capture in-flight edits.
     */
    function syncDomToModel() {
        const table = document.querySelector('.folders-table');
        if (!table) return;
        table.querySelectorAll('tr.user-sub-row').forEach(row => {
            const folderId = row.getAttribute('data-folder-parent-id');
            const user = row.getAttribute('data-user');
            if (!folderId || !user) return;
            const input = row.querySelector('.cell-permission-level');
            if (!input) return;
            const entries = folderUserAssignments.get(folderId);
            if (!entries) return;
            const entry = entries.find(e => e.user === user);
            if (entry) entry.level = input.value || entry.level;
        });
    }

    /**
     * Re-render the table from the data model. Replaces save/restore pattern.
     */
    function reRenderFromModel() {
        syncDomToModel();
        displayFolderHierarchy(currentHierarchy);
    }

    /**
     * Expand to the next folder level.
     * Fetches children of all currently visible leaf-level folders, updates the
     * hierarchy, increments currentFolderDisplayDepth, and re-renders the table.
     */

    function showPermissionsBanner() {
        const container = document.getElementById('foldersTableContainer');
        if (!container || container.querySelector('.perms-loading-banner')) return;
        const banner = document.createElement('div');
        banner.className = 'perms-loading-banner';
        banner.textContent = 'Loading permissions in background...';
        container.prepend(banner);
    }

    function hidePermissionsBanner() {
        const banner = document.querySelector('.perms-loading-banner');
        if (banner) banner.remove();
    }

    /**
     * Toggle expand/collapse for a single folder node in the tree.
     */
    window.toggleFolderExpand = async function(folderId) {
        if (expandedFolderIds.has(folderId)) {
            // Collapse this folder and all descendants
            expandedFolderIds.delete(folderId);
            collapseDescendantFolders(folderId);
            reRenderFromModel();
        } else {
            // Expand â€” load children from API if needed
            await loadChildrenForFolder(folderId);
            expandedFolderIds.add(folderId);
            reRenderFromModel();

            // Load ACC permissions for newly visible child folders in background
            const childKey = getChildKeyForFolder(folderId);
            if (childKey) {
                const newFolderIds = new Set();
                currentHierarchy.forEach(r => {
                    if (r[childKey] && isFolderAncestor(r, folderId)) {
                        newFolderIds.add(r[childKey].id);
                    }
                });
                if (newFolderIds.size > 0 && window.FolderPermissions?.fetchAllFolderPermissions) {
                    showPermissionsBanner();
                    loadExistingACCPermissions(
                        currentProjectData.projectId, currentHierarchy,
                        currentProjectUsers, currentProjectData.accessToken,
                        { onlyFolderIds: newFolderIds }
                    ).then(() => {
                        propagatePermissionsToEmptyRows();
                        hidePermissionsBanner();
                    }).catch(err => {
                        console.error('âŒ Background permission load error:', err);
                        hidePermissionsBanner();
                    });
                }
            }
        }
    };

    /**
     * Collapse all descendant folders of a given folder (remove from expandedFolderIds).
     */
    function collapseDescendantFolders(parentFolderId) {
        const descendants = new Set();
        function findDescendants(fid) {
            for (const row of currentHierarchy) {
                for (let d = 0; d < 20; d++) {
                    const key = levelKeyForDepth(d);
                    const nextKey = levelKeyForDepth(d + 1);
                    if (row[key]?.id === fid && row[nextKey]) {
                        if (!descendants.has(row[nextKey].id)) {
                            descendants.add(row[nextKey].id);
                            findDescendants(row[nextKey].id);
                        }
                    }
                }
            }
        }
        findDescendants(parentFolderId);
        descendants.forEach(id => expandedFolderIds.delete(id));
    }

    /**
     * Load children for a specific folder from the API if not already loaded.
     * Updates currentHierarchy in place.
     */
    async function loadChildrenForFolder(folderId) {
        if (!currentProjectData) return;
        const { projectId, accessToken } = currentProjectData;

        // Find what depth this folder is at in the hierarchy
        let folderDepth = -1;
        for (const row of currentHierarchy) {
            for (let d = 0; d < 20; d++) {
                const key = levelKeyForDepth(d);
                if (row[key]?.id === folderId) {
                    folderDepth = d;
                    break;
                }
            }
            if (folderDepth >= 0) break;
        }
        if (folderDepth < 0) return;

        const currentKey = levelKeyForDepth(folderDepth);
        const nextKey = levelKeyForDepth(folderDepth + 1);

        // Already loaded?
        const alreadyLoaded = currentHierarchy.some(r => r[currentKey]?.id === folderId && r[nextKey]);
        if (alreadyLoaded) return;

        // Fetch children from API (use cache)
        if (!folderChildrenCache[folderId]) {
            folderChildrenCache[folderId] = await fetchFolderContents(projectId, folderId, accessToken);
        }

        const children = folderChildrenCache[folderId];
        if (!children || children.length === 0) {
            folderChildrenCache[folderId] = [];
            return;
        }

        // Expand hierarchy: for each row containing this folder, create child rows
        const newHierarchy = [];
        for (const row of currentHierarchy) {
            if (row[currentKey]?.id === folderId) {
                for (const child of children) {
                    newHierarchy.push({ ...row, [nextKey]: child });
                }
            } else {
                newHierarchy.push(row);
            }
        }
        currentHierarchy = newHierarchy;

        // Update max loaded depth tracking
        if (folderDepth + 2 > currentFolderDisplayDepth) {
            currentFolderDisplayDepth = folderDepth + 2;
        }
    }

    /**
     * Get the hierarchy key for children of a given folder.
     */
    function getChildKeyForFolder(folderId) {
        for (const row of currentHierarchy) {
            for (let d = 0; d < 20; d++) {
                const key = levelKeyForDepth(d);
                if (row[key]?.id === folderId) {
                    return levelKeyForDepth(d + 1);
                }
            }
        }
        return null;
    }

    /**
     * Check if a hierarchy row contains a given folder as an ancestor.
     */
    function isFolderAncestor(row, folderId) {
        for (let d = 0; d < 20; d++) {
            const key = levelKeyForDepth(d);
            if (row[key]?.id === folderId) return true;
        }
        return false;
    }

    /**
     * Expand ALL subfolders recursively until no more expandable leaves remain.
     */
    window.expandFolderDepth = async function() {
        if (!currentProjectData || !currentHierarchy) return;

        showLoadingProgress('Loading all subfolders...', 0);
        const allNewFolderIds = new Set();

        try {
            // Keep expanding until there are no more unexpanded leaves
            let round = 0;
            while (true) {
                round++;
                const visibleRows = buildVisibleFolderRows(currentHierarchy);
                const leafFolders = visibleRows.filter(r =>
                    !expandedFolderIds.has(r.folder.id) && (r.hasLoadedChildren || r.mightHaveChildren)
                );

                if (leafFolders.length === 0) break;

                let done = 0;
                for (const { folder } of leafFolders) {
                    await loadChildrenForFolder(folder.id);
                    done++;
                    updateLoadingProgress(`Loading subfolders (round ${round})...`, (done / leafFolders.length) * 90);
                }

                let anyExpanded = false;
                for (const { folder } of leafFolders) {
                    const children = folderChildrenCache[folder.id];
                    if (children && children.length > 0) {
                        expandedFolderIds.add(folder.id);
                        anyExpanded = true;

                        // Collect new child folder IDs for permission loading
                        const childKey = getChildKeyForFolder(folder.id);
                        if (childKey) {
                            currentHierarchy.forEach(r => {
                                if (r[childKey] && isFolderAncestor(r, folder.id)) {
                                    allNewFolderIds.add(r[childKey].id);
                                }
                            });
                        }
                    }
                }

                if (!anyExpanded) break;
            }

            reRenderFromModel();

            hideLoadingProgress();

            // Load ACC permissions for all newly visible folders in background
            if (allNewFolderIds.size > 0 && window.FolderPermissions?.fetchAllFolderPermissions) {
                showPermissionsBanner();
                loadExistingACCPermissions(
                    currentProjectData.projectId, currentHierarchy,
                    currentProjectUsers, currentProjectData.accessToken,
                    { onlyFolderIds: allNewFolderIds }
                ).then(() => {
                    propagatePermissionsToEmptyRows();
                    hidePermissionsBanner();
                }).catch(err => {
                    console.error('âŒ Background permission load error:', err);
                    hidePermissionsBanner();
                });
            }
        } catch (err) {
            console.error('âŒ expandFolderDepth error:', err);
        } finally {
            hideLoadingProgress();
        }
    };

    /**
     * Collapse all folders back to root level.
     */
    window.collapseFolderDepth = function() {
        syncDomToModel();
        expandedFolderIds.clear();
        displayFolderHierarchy(currentHierarchy);
    };

    // =========================================================================
    // End of lazy folder expansion
    // =========================================================================

    // Flags to prevent duplicate event handlers
    let deleteKeyHandlerAdded = false;
    let clickHandlerAdded = false;

    /**
     * Get background color for permission level (1-6)
     * Level 1: rgb(228, 243, 251) - lightest
     * Level 6: rgb(6, 150, 215) - darkest
     */
    function getPermissionLevelColor(level) {
        const levelNum = parseInt(level);
        if (isNaN(levelNum) || levelNum < 1 || levelNum > 6) {
            return { background: 'rgb(228, 243, 251)', color: 'black' }; // Default to level 1 color
        }
        
        // Define color range
        const colorStart = { r: 228, g: 243, b: 251 }; // Level 1
        const colorEnd = { r: 6, g: 150, b: 215 };     // Level 6
        
        // Calculate interpolation (0 to 1, where 0 is level 1 and 1 is level 6)
        const t = (levelNum - 1) / 5;
        
        // Interpolate RGB values
        const r = Math.round(colorStart.r + (colorEnd.r - colorStart.r) * t);
        const g = Math.round(colorStart.g + (colorEnd.g - colorStart.g) * t);
        const b = Math.round(colorStart.b + (colorEnd.b - colorStart.b) * t);
        
        // Use white text for levels 4, 5 and 6 (darker backgrounds)
        const textColor = levelNum >= 4 ? 'white' : 'black';
        
        return { background: `rgb(${r}, ${g}, ${b})`, color: textColor };
    }

    /**
     * Get color based on subject type and permission level
     * Applies gradient from light (level 1) to dark (level 6) for each subject type
     */
    function getSubjectColor(subjectType, level) {
        const levelNum = parseInt(level);
        if (isNaN(levelNum) || levelNum < 1 || levelNum > 6) {
            return { background: '#e3f2fd', color: 'black' }; // Default to USER level 1
        }
        
        let colorStart, colorEnd;
        
        if (subjectType === 'ROLE') {
            // Green gradient for roles
            const colors = [
                { r: 232, g: 245, b: 233 }, // Level 1: #e8f5e9
                { r: 200, g: 230, b: 201 }, // Level 2: #c8e6c9
                { r: 165, g: 214, b: 167 }, // Level 3: #a5d6a7
                { r: 129, g: 199, b: 132 }, // Level 4: #81c784
                { r: 102, g: 187, b: 106 }, // Level 5: #66bb6a
                { r: 76, g: 175, b: 80 }    // Level 6: #4caf50
            ];
            const color = colors[levelNum - 1];
            const textColor = levelNum >= 5 ? 'white' : 'black';
            return { background: `rgb(${color.r}, ${color.g}, ${color.b})`, color: textColor };
        } else if (subjectType === 'COMPANY') {
            // Orange gradient for companies
            const colors = [
                { r: 255, g: 243, b: 224 }, // Level 1: #fff3e0
                { r: 255, g: 224, b: 178 }, // Level 2: #ffe0b2
                { r: 255, g: 204, b: 128 }, // Level 3: #ffcc80
                { r: 255, g: 183, b: 77 },  // Level 4: #ffb74d
                { r: 255, g: 167, b: 38 },  // Level 5: #ffa726
                { r: 255, g: 152, b: 0 }    // Level 6: #ff9800
            ];
            const color = colors[levelNum - 1];
            const textColor = levelNum >= 5 ? 'white' : 'black';
            return { background: `rgb(${color.r}, ${color.g}, ${color.b})`, color: textColor };
        } else {
            // Blue gradient for users (default)
            const colors = [
                { r: 227, g: 242, b: 253 }, // Level 1: #e3f2fd
                { r: 187, g: 222, b: 251 }, // Level 2: #bbdefb
                { r: 144, g: 202, b: 249 }, // Level 3: #90caf9
                { r: 100, g: 181, b: 246 }, // Level 4: #64b5f6
                { r: 66, g: 165, b: 245 },  // Level 5: #42a5f5
                { r: 33, g: 150, b: 243 }   // Level 6: #2196f3
            ];
            const color = colors[levelNum - 1];
            const textColor = levelNum >= 4 ? 'white' : 'black';
            return { background: `rgb(${color.r}, ${color.g}, ${color.b})`, color: textColor };
        }
    }

    /**
     * Setup tooltip for permission level input
     */
    function setupPermissionTooltip(inputElement) {
        let tooltipTimeout = null;
        let tooltip = null;

        const tooltipText = `1 - View Only
2 - View/Download
3 - View/Download+PublishMarkups
4 - View/Download+PublishMarkups+Upload
5 - View/Download+PublishMarkups+Upload+Edit
6 - Full controll`;

        inputElement.addEventListener('mouseenter', (e) => {
            // Set timeout for 1 second
            tooltipTimeout = setTimeout(() => {
                // Create tooltip
                tooltip = document.createElement('div');
                tooltip.className = 'permission-tooltip';
                tooltip.textContent = tooltipText;
                document.body.appendChild(tooltip);

                // Position tooltip near the input
                const rect = inputElement.getBoundingClientRect();
                tooltip.style.left = `${rect.left}px`;
                tooltip.style.top = `${rect.bottom + 5}px`;
            }, 1000);
        });

        inputElement.addEventListener('mouseleave', () => {
            // Clear timeout if mouse leaves before 1 second
            if (tooltipTimeout) {
                clearTimeout(tooltipTimeout);
                tooltipTimeout = null;
            }
            // Remove tooltip if it exists
            if (tooltip) {
                tooltip.remove();
                tooltip = null;
            }
        });

        // Also remove tooltip on input focus (when user starts typing)
        inputElement.addEventListener('focus', () => {
            if (tooltipTimeout) {
                clearTimeout(tooltipTimeout);
                tooltipTimeout = null;
            }
            if (tooltip) {
                tooltip.remove();
                tooltip = null;
            }
        });
    }

    /**
     * Handle arrow key navigation for permission level inputs
     * Left arrow decreases level, right arrow increases level (1-6)
     */
    function handlePermissionArrowKeys(event, input, callback) {
        // Arrow Left (37) or Arrow Right (39)
        if (event.keyCode === 37 || event.keyCode === 39) {
            event.preventDefault();
            
            let currentLevel = parseInt(input.value) || 1;
            
            if (event.keyCode === 37) {
                // Left arrow - decrease
                currentLevel = Math.max(1, currentLevel - 1);
            } else if (event.keyCode === 39) {
                // Right arrow - increase
                currentLevel = Math.min(6, currentLevel + 1);
            }
            
            input.value = currentLevel;
            
            // Trigger the callback to update colors and attributes
            if (callback) {
                callback(currentLevel);
            }
            
            return true; // Arrow key was handled
        }
        return false; // Not an arrow key
    }

    /**
     * Attach arrow key navigation to all permission level inputs in the table
     * This ensures all inputs (including pre-populated ones) have arrow key support
     */
    function attachArrowKeyNavigationToAllInputs() {
        const table = document.querySelector('.folders-table');
        if (!table) return;

        // In vertical layout, editable inputs are in tr.user-sub-row (non-inherited)
        const allInputs = table.querySelectorAll('tr.user-sub-row:not([data-is-inherited="true"]) .cell-permission-level');

        allInputs.forEach(input => {
            const cell = input.closest('td');
            if (!cell) return;
            const row = input.closest('tr.user-sub-row');
            if (!row) return;

            // Remove existing listeners by cloning
            const newInput = input.cloneNode(true);
            input.parentNode.replaceChild(newInput, input);

            const folderId = row.getAttribute('data-folder-parent-id');
            const userIdentifier = row.getAttribute('data-user');

            function updateColors(level) {
                row.setAttribute('data-permission-level', level);
                const subjectType = row.getAttribute('data-subject-type');
                const colors = subjectType ? getSubjectColor(subjectType, level) : getPermissionLevelColor(level);
                const contentDiv = cell.querySelector('.user-entry-content');
                if (contentDiv) { contentDiv.style.backgroundColor = colors.background; contentDiv.style.color = colors.color; }
                // Update model
                const entries = folderUserAssignments.get(folderId);
                if (entries) {
                    const entry = entries.find(e => e.user === userIdentifier);
                    if (entry) entry.level = level;
                }
                // Propagate to inherited children
                if (folderId && userIdentifier) {
                    updateInheritedPermissions(folderId, userIdentifier, level.toString());
                }
            }

            newInput.addEventListener('keydown', (event) => {
                if (handlePermissionArrowKeys(event, newInput, updateColors)) return;
            });

            newInput.addEventListener('input', (event) => {
                const value = event.target.value;
                if (value && (value < '1' || value > '6' || isNaN(value))) {
                    event.target.value = value.slice(0, -1);
                } else if (value && value >= '1' && value <= '6') {
                    updateColors(value);
                }
            });

            newInput.addEventListener('change', (event) => {
                const level = event.target.value || '6';
                updateColors(level);
            });
        });
    }

    /**
     * Setup all table interactions for the vertical layout:
     * - Drag-and-drop users onto folder rows
     * - Click selection of user sub-rows
     * - Delete key to remove selected users
     * - Permission input events (managed via attachArrowKeyNavigationToAllInputs)
     */
    function setupTableInteractions() {
        const table = document.querySelector('.folders-table');
        if (!table) return;

        // --- Drag-and-drop on folder rows ---
        table.querySelectorAll('tr.folder-row').forEach(folderRow => {
            const td = folderRow.querySelector('td');
            if (!td) return;

            td.addEventListener('dragover', (e) => {
                e.preventDefault();
                folderRow.classList.add('drag-over');
            });
            td.addEventListener('dragleave', () => {
                folderRow.classList.remove('drag-over');
            });
            td.addEventListener('drop', (e) => {
                e.preventDefault();
                folderRow.classList.remove('drag-over');

                const folderId = folderRow.getAttribute('data-folder-id');
                if (!folderId) return;

                // Parse dropped users
                let usersToAssign = [];
                const multiData = e.dataTransfer.getData('application/json');
                if (multiData) {
                    try { usersToAssign = JSON.parse(multiData); } catch (_) {}
                }
                if (usersToAssign.length === 0) {
                    const single = e.dataTransfer.getData('text/plain');
                    if (single) usersToAssign = [single];
                }
                if (usersToAssign.length === 0) return;

                // Add each user to this folder (and inherit to descendants)
                usersToAssign.forEach(userName => {
                    addUserToFolder(folderId, userName, '1', false);
                });

                reRenderFromModel();

                // Clear user selection
                selectedUsers = [];
                document.querySelectorAll('.user-list-item').forEach(item => item.classList.remove('user-selected'));
            });
        });

        // --- Drag-and-drop on header row for BULK ASSIGN ---
        const headerTh = table.querySelector('thead th');
        if (headerTh) {
            headerTh.addEventListener('dragover', (e) => {
                e.preventDefault();
                headerTh.classList.add('drag-over');
            });
            headerTh.addEventListener('dragleave', () => {
                headerTh.classList.remove('drag-over');
            });
            headerTh.addEventListener('drop', (e) => {
                e.preventDefault();
                headerTh.classList.remove('drag-over');

                let usersToAssign = [];
                const multiData = e.dataTransfer.getData('application/json');
                if (multiData) {
                    try { usersToAssign = JSON.parse(multiData); } catch (_) {}
                }
                if (usersToAssign.length === 0) {
                    const single = e.dataTransfer.getData('text/plain');
                    if (single) usersToAssign = [single];
                }
                if (usersToAssign.length === 0) return;

                // Assign to ALL depth-0 (root) folders
                table.querySelectorAll('tr.folder-row[data-folder-depth="0"]').forEach(row => {
                    const folderId = row.getAttribute('data-folder-id');
                    if (!folderId) return;
                    usersToAssign.forEach(userName => {
                        addUserToFolder(folderId, userName, '1', false);
                    });
                });

                reRenderFromModel();

                selectedUsers = [];
                document.querySelectorAll('.user-list-item').forEach(item => item.classList.remove('user-selected'));
            });
        }

        // --- Click selection on user sub-rows ---
        table.querySelectorAll('tr.user-sub-row').forEach(userRow => {
            userRow.addEventListener('click', (e) => {
                // Don't interfere with permission input focus
                if (e.target.closest('.cell-permission-level')) return;
                handleUserRowSelection(userRow, e.shiftKey, e.ctrlKey);
            });
        });

        // --- Keyboard handlers (attach once) ---
        if (!deleteKeyHandlerAdded) {
            document.addEventListener('keydown', handleDeleteKey);
            deleteKeyHandlerAdded = true;
        }
        if (!clickHandlerAdded) {
            document.addEventListener('click', (e) => {
                const clickedRow = e.target.closest('.folders-table tr.user-sub-row');
                const clickedInput = e.target.closest('.cell-permission-level');
                if (!clickedRow && !clickedInput && selectedCells.length > 0) {
                    selectedCells.forEach(r => r.classList.remove('selected'));
                    selectedCells = [];
                    lastSelectedCell = null;
                }
            });
            clickHandlerAdded = true;
        }

        // --- Setup permission input events ---
        attachArrowKeyNavigationToAllInputs();
    }

    /**
     * Add a user to a folder in the data model, with inheritance propagation.
     */
    function addUserToFolder(folderId, userName, level, isInherited) {
        const subjectInfo = lookupSubjectInfo(userName);
        let displayName = userName;
        if (subjectInfo?.subjectType === 'USER' && currentProjectUsersRaw) {
            const userObj = currentProjectUsersRaw.find(u => u.email === userName);
            if (userObj) {
                displayName = currentUserDisplayMode === 'name'
                    ? (userObj.name || userObj.email)
                    : userObj.email;
            }
        }

        const entry = {
            user: userName,
            displayName: displayName,
            level: level,
            subjectType: subjectInfo?.subjectType || '',
            subjectId: subjectInfo?.subjectId || '',
            isInherited: isInherited
        };

        // Add to this folder (skip if user already exists)
        if (!folderUserAssignments.has(folderId)) {
            folderUserAssignments.set(folderId, []);
        }
        const existing = folderUserAssignments.get(folderId);
        if (existing.some(e => e.user === userName)) return; // already assigned
        existing.push(entry);

        // Propagate as inherited to all descendant folders in the model
        propagateInheritedToDescendants(folderId, userName, level, subjectInfo);
    }

    /**
     * Propagate an inherited user assignment to all descendant folders in the data model.
     */
    function propagateInheritedToDescendants(parentFolderId, userName, level, subjectInfo) {
        // Find all currently visible descendant folder IDs via the hierarchy
        const descendantIds = getDescendantFolderIds(parentFolderId);

        let displayName = userName;
        if (subjectInfo?.subjectType === 'USER' && currentProjectUsersRaw) {
            const userObj = currentProjectUsersRaw.find(u => u.email === userName);
            if (userObj) {
                displayName = currentUserDisplayMode === 'name'
                    ? (userObj.name || userObj.email)
                    : userObj.email;
            }
        }

        for (const descId of descendantIds) {
            if (!folderUserAssignments.has(descId)) {
                folderUserAssignments.set(descId, []);
            }
            const entries = folderUserAssignments.get(descId);
            const existingIdx = entries.findIndex(e => e.user === userName);
            if (existingIdx >= 0) {
                // Already exists - if it was inherited, update the level
                if (entries[existingIdx].isInherited) {
                    entries[existingIdx].level = level;
                }
                // If it's a direct (non-inherited) entry, leave it alone
            } else {
                entries.push({
                    user: userName,
                    displayName: displayName,
                    level: level,
                    subjectType: subjectInfo?.subjectType || '',
                    subjectId: subjectInfo?.subjectId || '',
                    isInherited: true
                });
            }
        }
    }

    /**
     * Get all descendant folder IDs for a given folder using the DOM-rendered table.
     */
    function getDescendantFolderIds(parentFolderId) {
        const table = document.querySelector('.folders-table');
        const ids = [];
        if (!table) return ids;
        table.querySelectorAll('tr.folder-row').forEach(row => {
            let ancestor = row.getAttribute('data-parent-id');
            const visited = new Set();
            while (ancestor && !visited.has(ancestor)) {
                visited.add(ancestor);
                if (ancestor === parentFolderId) { ids.push(row.getAttribute('data-folder-id')); break; }
                const aRow = table.querySelector(`tr.folder-row[data-folder-id="${ancestor}"]`);
                ancestor = aRow ? aRow.getAttribute('data-parent-id') : null;
            }
        });
        return ids;
    }

    /**
     * Handle user sub-row selection (replaces handleCellSelection).
     */
    function handleUserRowSelection(row, shiftPressed, ctrlPressed) {
        if (ctrlPressed) {
            // Toggle selection
            if (row.classList.contains('selected')) {
                row.classList.remove('selected');
                selectedCells = selectedCells.filter(r => r !== row);
            } else {
                row.classList.add('selected');
                selectedCells.push(row);
            }
        } else if (shiftPressed && lastSelectedCell) {
            // Shift+Click: propagate permission level to all rows in range
            const sourceLevel = lastSelectedCell.getAttribute('data-permission-level');
            if (sourceLevel) {
                const allUserRows = Array.from(document.querySelectorAll('.folders-table tr.user-sub-row'));
                const lastIdx = allUserRows.indexOf(lastSelectedCell);
                const currentIdx = allUserRows.indexOf(row);
                if (lastIdx >= 0 && currentIdx >= 0) {
                    const start = Math.min(lastIdx, currentIdx);
                    const end = Math.max(lastIdx, currentIdx);
                    for (let i = start; i <= end; i++) {
                        const r = allUserRows[i];
                        const isInherited = r.getAttribute('data-is-inherited') === 'true';
                        if (isInherited) continue;
                        const fId = r.getAttribute('data-folder-parent-id');
                        const uId = r.getAttribute('data-user');
                        if (!fId || !uId) continue;
                        // Update model
                        const entries = folderUserAssignments.get(fId);
                        if (entries) {
                            const entry = entries.find(e => e.user === uId);
                            if (entry) entry.level = sourceLevel;
                        }
                        // Update DOM in-place
                        r.setAttribute('data-permission-level', sourceLevel);
                        const input = r.querySelector('.cell-permission-level');
                        if (input) input.value = sourceLevel;
                        const contentDiv = r.querySelector('.user-entry-content');
                        const subjectType = r.getAttribute('data-subject-type');
                        const colors = subjectType ? getSubjectColor(subjectType, sourceLevel) : getPermissionLevelColor(sourceLevel);
                        if (contentDiv) { contentDiv.style.backgroundColor = colors.background; contentDiv.style.color = colors.color; }
                        // Propagate to inherited children
                        updateInheritedPermissions(fId, uId, sourceLevel);
                        // Select the row
                        if (!r.classList.contains('selected')) {
                            r.classList.add('selected');
                            selectedCells.push(r);
                        }
                    }
                }
            }
        } else {
            // Single select
            selectedCells.forEach(r => r.classList.remove('selected'));
            selectedCells = [row];
            row.classList.add('selected');
        }
        lastSelectedCell = row;
    }
    /**
     * Setup zoom functionality for table using Ctrl+Scroll
     */
    function setupTableZoom() {
        const tableContainer = document.getElementById('foldersTableContainer');
        if (!tableContainer) return;

        let currentZoom = 1.0;
        const minZoom = 0.5;
        const maxZoom = 2.0;
        const zoomStep = 0.1;

        tableContainer.addEventListener('wheel', (e) => {
            // Check if Ctrl key is pressed
            if (e.ctrlKey) {
                e.preventDefault();
                
                // Determine zoom direction
                if (e.deltaY < 0) {
                    // Scroll up - zoom in
                    currentZoom = Math.min(currentZoom + zoomStep, maxZoom);
                } else {
                    // Scroll down - zoom out
                    currentZoom = Math.max(currentZoom - zoomStep, minZoom);
                }
                
                // Apply zoom transform
                const table = tableContainer.querySelector('.folders-table');
                if (table) {
                    table.style.transform = `scale(${currentZoom})`;
                    table.style.transformOrigin = 'top left';
                    
                    // Adjust container to prevent clipping
                    tableContainer.style.width = `${100 / currentZoom}%`;
                }
                
                // log(`ðŸ” Table zoom: ${Math.round(currentZoom * 100)}%`);
            }
        }, { passive: false });
    }

    // Track selected cells
    let selectedCells = [];
    let lastSelectedCell = null;
    let copiedCells = []; // Store copied cell data
    
    // Track selected users for multi-drag
    let selectedUsers = [];
    let lastSelectedUser = null; // Track last selected user for range selection

    /**
     * Handle cell selection — LEGACY, no longer used in vertical layout.
     * Selection now handled by handleUserRowSelection in setupTableInteractions.
     */
    function handleCellSelection(cell, shiftPressed, ctrlPressed) {
        // Noop — kept for backward compatibility
    }

    /**
     * Handle delete key press — works with selected user sub-rows.
     */
    function handleDeleteKey(e) {
        // Don't intercept Delete when typing in an input
        const active = document.activeElement;
        if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;

        if (e.key === 'Delete' && selectedCells.length > 0) {
            selectedCells.forEach(row => {
                if (!row.classList.contains('user-sub-row')) return;
                const folderId = row.getAttribute('data-folder-parent-id');
                const userIdentifier = row.getAttribute('data-user');
                const isInherited = row.getAttribute('data-is-inherited') === 'true';

                if (!folderId || !userIdentifier) return;

                // Remove from data model
                const entries = folderUserAssignments.get(folderId);
                if (entries) {
                    const idx = entries.findIndex(e => e.user === userIdentifier);
                    if (idx >= 0) entries.splice(idx, 1);
                }

                // If direct (non-inherited), also remove inherited copies from descendants
                if (!isInherited) {
                    removeUserFromDescendants(folderId, userIdentifier);
                }
            });

            selectedCells = [];
            lastSelectedCell = null;
            reRenderFromModel();
        }

        // Handle Ctrl+C (Copy user rows)
        if ((e.ctrlKey || e.metaKey) && e.key === 'c' && selectedCells.length > 0) {
            e.preventDefault();
            copiedCells = selectedCells.filter(r => r.classList.contains('user-sub-row')).map(row => ({
                userName: row.getAttribute('data-user'),
                permissionLevel: row.getAttribute('data-permission-level'),
                subjectType: row.getAttribute('data-subject-type'),
                subjectId: row.getAttribute('data-subject-id')
            }));
        }

        // Handle Ctrl+V (Paste users into the folder of the first selected row)
        if ((e.ctrlKey || e.metaKey) && e.key === 'v' && copiedCells.length > 0 && selectedCells.length > 0) {
            e.preventDefault();
            // Find target folder — use the folder of the first selected row
            const firstSelected = selectedCells[0];
            let targetFolderId = firstSelected.getAttribute('data-folder-parent-id') || firstSelected.getAttribute('data-folder-id');
            if (!targetFolderId) return;

            copiedCells.forEach(data => {
                if (data.userName && data.permissionLevel) {
                    addUserToFolder(targetFolderId, data.userName, data.permissionLevel, false);
                }
            });
            reRenderFromModel();
        }
    }

    /**
     * Remove a user from all descendant folders in the data model.
     */
    function removeUserFromDescendants(parentFolderId, userIdentifier) {
        const descendantIds = getDescendantFolderIds(parentFolderId);
        for (const descId of descendantIds) {
            const entries = folderUserAssignments.get(descId);
            if (entries) {
                const idx = entries.findIndex(e => e.user === userIdentifier && e.isInherited);
                if (idx >= 0) entries.splice(idx, 1);
            }
        }
    }

    /**
     * Update display mode (email/name) in the data model, then re-render.
     */
    function updateTableUserDisplay(displayMode) {
        if (displayMode !== 'email' && displayMode !== 'name') return;
        if (!currentProjectUsersRaw) return;

        // Update display names in the model
        for (const [folderId, entries] of folderUserAssignments) {
            for (const entry of entries) {
                if (entry.subjectType === 'USER') {
                    const user = currentProjectUsersRaw.find(u => u.email === entry.user);
                    if (user) {
                        entry.displayName = displayMode === 'name'
                            ? (user.name || user.email)
                            : user.email;
                    }
                }
            }
        }

        // Re-render to reflect changes
        if (currentHierarchy) displayFolderHierarchy(currentHierarchy);
    }

    /**
     * Display the user list in the right panel
     */
    function displayUserList(users, sortOrder = 'asc', displayMode = 'email') {
        const userListContainer = document.getElementById('foldersUserList');
        
        let itemsToDisplay = [];
        
        // Determine what to display based on mode
        if (displayMode === 'email') {
            // Show all users with their emails
            itemsToDisplay = users.map(user => user.email);
        } else if (displayMode === 'name') {
            // Show all users with their names
            itemsToDisplay = users.map(user => user.name || user.email);
        } else if (displayMode === 'company') {
            // Show unique companies
            const companies = [...new Set(users.map(user => user.company_name))];
            itemsToDisplay = companies;
        } else if (displayMode === 'role') {
            // Show unique roles
            const roles = [...new Set(users.map(user => user.default_role))];
            itemsToDisplay = roles;
        }
        
        // Sort items based on selected order
        if (sortOrder === 'desc') {
            itemsToDisplay.sort((a, b) => b.localeCompare(a));
        } else {
            itemsToDisplay.sort((a, b) => a.localeCompare(b));
        }
        
        let userHTML = `
            <div class="user-list-header">
                <div>Project Users</div>
                <select id="userSortSelect" class="user-sort-select">
                    <option value="asc" ${sortOrder === 'asc' ? 'selected' : ''}>A-Z</option>
                    <option value="desc" ${sortOrder === 'desc' ? 'selected' : ''}>Z-A</option>
                </select>
                <div class="user-display-options">
                    <label class="user-display-option">
                        <input type="radio" name="userDisplay" value="email" ${displayMode === 'email' ? 'checked' : ''}>
                        <span>Email</span>
                    </label>
                    <label class="user-display-option">
                        <input type="radio" name="userDisplay" value="name" ${displayMode === 'name' ? 'checked' : ''}>
                        <span>Name</span>
                    </label>
                    <label class="user-display-option">
                        <input type="radio" name="userDisplay" value="company" ${displayMode === 'company' ? 'checked' : ''}>
                        <span>Company</span>
                    </label>
                    <label class="user-display-option">
                        <input type="radio" name="userDisplay" value="role" ${displayMode === 'role' ? 'checked' : ''}>
                        <span>Role</span>
                    </label>
                </div>
            </div>
            <div class="user-list-instructions">
                <strong>&#128161; Tip:</strong> Drag and drop a user, a company, or a role to add them to a folder.<br>
                <strong>&#128161; Tip:</strong> Press <strong>Shift</strong> to select a range of users and apply the same access level.<br>
                <strong>&#128161; Tip:</strong> Press <strong>Ctrl</strong> to toggle individual user selection.<br>
                <strong>&#128161; Tip:</strong> Press <strong>Ctrl</strong> and <strong>scroll</strong> the mouse wheel to zoom in and out.<br>
                <br>
                Access levels:<br>
                1 - View Only<br>
                2 - View/Download<br>
                3 - View/Download+PublishMarkups<br>
                4 - View/Download+PublishMarkups+Upload<br>
                5 - View/Download+PublishMarkups+Upload+Edit<br>
                6 - Full control<br>
                <br>
                <div style="display: flex; gap: 8px; align-items: center;">
                    <strong style="font-size: 11px; margin-right: 4px;">Color Legend:</strong>
                    <span style="display: inline-block; width: 60px; height: 18px; background-color: #90caf9; border-radius: 3px; text-align: center; font-size: 11px; line-height: 18px;">User</span>
                    <span style="display: inline-block; width: 60px; height: 18px; background-color: #ffcc80; border-radius: 3px; text-align: center; font-size: 11px; line-height: 18px;">Company</span>
                    <span style="display: inline-block; width: 60px; height: 18px; background-color: #a5d6a7; border-radius: 3px; text-align: center; font-size: 11px; line-height: 18px;">Role</span>
                </div>
            </div>
        `;
        userHTML += '<div class="user-list-items">';
        
        itemsToDisplay.forEach(item => {
            userHTML += `<div class="user-list-item" draggable="true">${item}</div>`;
        });
        
        userHTML += '</div>';
        userListContainer.innerHTML = userHTML;
        
        // Setup drag functionality for user list items
        setupUserListDrag();
        
        // Add event listener for sort change
        const sortSelect = document.getElementById('userSortSelect');
        if (sortSelect) {
            sortSelect.addEventListener('change', (e) => {
                displayUserList(currentProjectUsers, e.target.value, displayMode);
            });
        }
        
        // Add event listeners for radio buttons
        const radioButtons = document.querySelectorAll('input[name="userDisplay"]');
        radioButtons.forEach(radio => {
            radio.addEventListener('change', (e) => {
                const newMode = e.target.value;
                
                // Remember email/name choice
                if (newMode === 'email' || newMode === 'name') {
                    currentUserDisplayMode = newMode;
                    // Update the table to show users in the selected format
                    updateTableUserDisplay(newMode);
                }
                // For company/role, don't update table but remember last email/name choice
                
                // Update the user list display
                displayUserList(currentProjectUsers, sortOrder, newMode);
            });
        });
    }

    /**
     * Setup drag functionality for user list items
     */
    function setupUserListDrag() {
        const userItems = document.querySelectorAll('.user-list-item');
        const userItemsArray = Array.from(userItems);
        
        userItems.forEach((item, index) => {
            // Handle click for selection (with Shift for range selection)
            item.addEventListener('click', (e) => {
                const userName = item.textContent;
                
                if (e.shiftKey && lastSelectedUser !== null) {
                    // Range selection mode
                    const lastIndex = userItemsArray.findIndex(i => i.textContent === lastSelectedUser);
                    const currentIndex = index;
                    
                    if (lastIndex !== -1) {
                        const startIndex = Math.min(lastIndex, currentIndex);
                        const endIndex = Math.max(lastIndex, currentIndex);
                        
                        // Select all users in the range
                        for (let i = startIndex; i <= endIndex; i++) {
                            const rangeItem = userItemsArray[i];
                            const rangeUserName = rangeItem.textContent;
                            
                            if (!selectedUsers.includes(rangeUserName)) {
                                selectedUsers.push(rangeUserName);
                                rangeItem.classList.add('user-selected');
                            }
                        }
                    }
                } else if (e.ctrlKey || e.metaKey) {
                    // Toggle individual selection (Ctrl/Cmd+Click)
                    if (selectedUsers.includes(userName)) {
                        // Deselect
                        selectedUsers = selectedUsers.filter(u => u !== userName);
                        item.classList.remove('user-selected');
                    } else {
                        // Add to selection
                        selectedUsers.push(userName);
                        item.classList.add('user-selected');
                        lastSelectedUser = userName;
                    }
                } else {
                    // Single select - clear previous selection
                    document.querySelectorAll('.user-list-item').forEach(i => {
                        i.classList.remove('user-selected');
                    });
                    selectedUsers = [userName];
                    item.classList.add('user-selected');
                    lastSelectedUser = userName;
                }
            });
            
            item.addEventListener('dragstart', (e) => {
                e.dataTransfer.effectAllowed = 'copy';
                const userName = item.textContent;
                
                // If this item is part of a multi-selection, drag all selected users
                if (selectedUsers.length > 1 && selectedUsers.includes(userName)) {
                    // Transfer multiple users as JSON
                    e.dataTransfer.setData('application/json', JSON.stringify(selectedUsers));
                    e.dataTransfer.setData('text/plain', selectedUsers[0]); // Fallback
                } else {
                    // Single user drag
                    e.dataTransfer.setData('text/plain', userName);
                }
                
                item.classList.add('dragging');
            });
            
            item.addEventListener('dragend', (e) => {
                item.classList.remove('dragging');
            });
        });
    }

    // Clean Table function - removes all users from the data model
    function cleanTable() {
        folderUserAssignments.clear();
        if (currentHierarchy) {
            displayFolderHierarchy(currentHierarchy);
        }
    }

    /**
     * Lookup subjectId and subjectType for a user/company/role name
     */
    function lookupSubjectInfo(userName) {
        // log(`ðŸ” Looking up subject info for: "${userName}"`);
        
        if (!currentProjectUsersRaw || currentProjectUsersRaw.length === 0) {
            // console.error('âŒ No raw user data available for lookup!');
            // log('currentProjectUsersRaw:', currentProjectUsersRaw);
            return null;
        }

        // log(`ðŸ“Š Raw user data available: ${currentProjectUsersRaw.length} users`);

        // Check if it's a prefixed company or role name
        let actualName = userName;
        let forcedType = null;
        
        if (userName.startsWith('Company: ')) {
            actualName = userName.substring('Company: '.length);
            forcedType = 'COMPANY';
            // log(`&#127970; Detected prefixed COMPANY: "${actualName}"`);
        } else if (userName.startsWith('Role: ')) {
            actualName = userName.substring('Role: '.length);
            forcedType = 'ROLE';
            // log(`&#128100; Detected prefixed ROLE: "${actualName}"`);
        }

        // Check if it's an email (USER)
        if (actualName.includes('@') && !forcedType) {
            // log('âœ‰ï¸ Detected as EMAIL');
            const user = currentProjectUsersRaw.find(u => u.email === actualName);
            if (user) {
                // log(`âœ… Found USER - ID: ${user.id}, Name: ${user.name || 'No name'}`);
                const result = {
                    subjectId: user.id,
                    subjectType: 'USER'
                };
                
                // Only add name if it exists and is different from email
                if (user.name && user.name !== user.email) {
                    result.name = user.name;
                }
                
                return result;
            }
            // console.warn(`âš ï¸ Email not found: ${actualName}`);
        }

        // Check if it's a name (USER by name) - only if not forced as COMPANY or ROLE
        if (!forcedType) {
            const userByName = currentProjectUsersRaw.find(u => u.name === actualName);
            if (userByName) {
                // log(`âœ… Found USER by name - ID: ${userByName.id}, Email: ${userByName.email}`);
                const result = {
                    subjectId: userByName.id,
                    subjectType: 'USER',
                    email: userByName.email
                };
                
                // Only add name if it exists and is different from email
                if (userByName.name && userByName.name !== userByName.email) {
                    result.name = userByName.name;
                }
                
                return result;
            }
        }

        // Check if it's a company name (COMPANY)
        if (forcedType === 'COMPANY' || !forcedType) {
            // log('&#127970; Checking as COMPANY');
            const companyUser = currentProjectUsersRaw.find(u => u.companyName === actualName);
            if (companyUser && companyUser.companyId) {
                // log(`âœ… Found COMPANY - ID: ${companyUser.companyId}`);
                return {
                    subjectId: companyUser.companyId,
                    subjectType: 'COMPANY'
                };
            }
        }

        // Check if it's a role name (ROLE)
        if (forcedType === 'ROLE' || !forcedType) {
            // log('&#128100; Checking as ROLE');
            for (const user of currentProjectUsersRaw) {
                if (user.roles && Array.isArray(user.roles)) {
                    const matchingRole = user.roles.find(r => r.name === actualName);
                    if (matchingRole && user.roleIds && user.roleIds.length > 0) {
                        // log(`âœ… Found ROLE - ID: ${user.roleIds[0]}`);
                        return {
                            subjectId: user.roleIds[0],
                            subjectType: 'ROLE'
                        };
                    }
                }
            }
        }

        // console.error(`âŒ Could not find subject info for: "${userName}" (searching for: "${actualName}")`);
        // log('Available companies:', currentProjectUsersRaw.map(u => u.companyName).filter((v, i, a) => a.indexOf(v) === i));
        // log('Available roles:', currentProjectUsersRaw.flatMap(u => u.roles ? u.roles.map(r => r.name) : []).filter((v, i, a) => a.indexOf(v) === i));
        return null;
    }

    /**
     * Convert permission level (1-6) to ACC actions array
     */
    
    /**
     * Show tooltip message near a button
     */
    let activeTooltip = null;
    
    function showTooltip(element, message) {
        removeTooltip();

        const tooltip = document.createElement('div');
        tooltip.className = 'modal-tooltip';
        tooltip.textContent = message;
        document.body.appendChild(tooltip);

        const rect = element.getBoundingClientRect();
        tooltip.style.top = rect.bottom + window.scrollY + 5 + 'px';
        tooltip.style.left = rect.left + window.scrollX + 'px';

        activeTooltip = tooltip;
        setTimeout(() => removeTooltip(), 3000);
    }

    /**
     * Remove active tooltip
     */
    function removeTooltip() {
        if (activeTooltip) {
            activeTooltip.remove();
            activeTooltip = null;
        }
    }
    
    /**
     * Sync permissions to ACC - delegated to update_folder_permission.js
     */
    async function handleSyncPermissions() {
        // Call the sync function from the external module
        // Pass the required context data
        if (typeof window.syncPermissionsToACC === 'function') {
            await window.syncPermissionsToACC(currentProjectData, currentProjectUsersRaw);
        } else {
            // console.error('âŒ Sync module not loaded!');
            alert('Sync module not loaded. Please refresh the page.');
        }
    }

    /**
    /**
     * Save folder permissions to JSON file (reads from folderUserAssignments model)
     */
    async function saveFolderPermissions() {
        if (!currentProjectData) {
            alert('No project data available');
            return;
        }

        // Sync any in-flight DOM edits back to the model
        syncDomToModel();

        // Check if file already exists
        try {
            const token = window.getAuthToken && window.getAuthToken();
            const checkResponse = await fetch(`${window.location.origin}/check-folder-permissions/${encodeURIComponent(currentProjectData.hubId)}/${encodeURIComponent(currentProjectData.projectId)}`, {
                headers: token ? { 'Authorization': `Bearer ${token}` } : {}
            });
            const checkData = await checkResponse.json();

            if (checkData.exists) {
                const confirmed = await showConfirmDialog(
                    'Update Folder Permissions?',
                    'Do you want to update the folder permissions?'
                );
                if (!confirmed) return;
            }
        } catch (error) {
            // ignore check errors
        }

        // Build folders array from model
        const folders = [];
        const table = document.querySelector('.folders-table');

        for (const [folderId, entries] of folderUserAssignments) {
            // Get folder metadata from DOM row
            const row = table ? table.querySelector(`tr.folder-row[data-folder-id="${CSS.escape(folderId)}"]`) : null;
            const level1 = row ? row.getAttribute('data-level1-name') : '';
            const folderName = row ? (row.querySelector('.folder-label')?.textContent || '').trim() : '';

            const permissions = {};
            let colIdx = 1;
            for (const entry of entries) {
                if (entry.isInherited) continue; // Only save direct (non-inherited) permissions

                const permissionData = {
                    subjectId: entry.subjectId || '',
                    subjectType: entry.subjectType || '',
                    user: entry.user,
                    level: entry.level
                };

                // Add name field for USER type
                if (entry.subjectType === 'USER') {
                    const subjectInfo = lookupSubjectInfo(entry.user);
                    if (subjectInfo?.name) permissionData.name = subjectInfo.name;
                }

                permissions[`column${colIdx}`] = permissionData;
                colIdx++;
            }

            if (Object.keys(permissions).length > 0) {
                folders.push({
                    folderId: folderId,
                    level1: level1 || null,
                    level2: folderName || null,
                    level3: null,
                    permissions: permissions
                });
            }
        }

        const jsonData = {
            projectName: currentProjectData.projectName,
            projectId: currentProjectData.projectId,
            hubId: currentProjectData.hubId,
            exportDate: new Date().toISOString(),
            folders: folders
        };

        // Save to server
        try {
            const headers = { 'Content-Type': 'application/json' };
            const token = window.getAuthToken && window.getAuthToken();
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            } else {
                const saveBtn = document.getElementById('saveFolderPermissionsBtn');
                showTooltip(saveBtn, '\u2717 Authentication required. Please log in again.');
                return;
            }

            const response = await fetch(`${window.location.origin}/save-folder-permissions`, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({
                    projectName: currentProjectData.projectName,
                    hubId: currentProjectData.hubId,
                    projectId: currentProjectData.projectId,
                    data: jsonData
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                const errorMessage = errorData.error || errorData.message || `Server error: ${response.status}`;
                const saveBtn = document.getElementById('saveFolderPermissionsBtn');
                if (response.status === 401) {
                    showTooltip(saveBtn, '\u2717 Authentication failed. Please log in again.');
                } else if (response.status === 403) {
                    showTooltip(saveBtn, '\u2717 Permission denied.');
                } else {
                    showTooltip(saveBtn, `\u2717 Error: ${errorMessage}`);
                }
                return;
            }

            const result = await response.json();
            if (result.success) {
                const saveBtn = document.getElementById('saveFolderPermissionsBtn');
                showTooltip(saveBtn, '\u2713 Saved successfully');
            } else {
                const errorMessage = result.message || 'Unknown error';
                const saveBtn = document.getElementById('saveFolderPermissionsBtn');
                showTooltip(saveBtn, `\u2717 Error: ${errorMessage}`);
            }
        } catch (error) {
            const saveBtn = document.getElementById('saveFolderPermissionsBtn');
            showTooltip(saveBtn, `\u2717 Network error: ${error.message}`);
        }
    }

    /**
     * Check for users in saved data that no longer exist in the project
     */
    async function checkForDeletedUsers(savedData) {
        const deletedUsers = [];
        
        // Create a set of current user emails from the display users
        const currentUserEmails = new Set(currentProjectUsers.map(u => u.email));
        
        // log('ðŸ” Current project user emails:', Array.from(currentUserEmails));
        
        // Extract all unique users from saved permissions
        const savedUsers = new Set();
        savedData.folders.forEach(folder => {
            if (folder.permissions) {
                Object.values(folder.permissions).forEach(permission => {
                    if (typeof permission === 'object' && permission.user) {
                        savedUsers.add(permission.user);
                    } else if (typeof permission === 'string') {
                        savedUsers.add(permission);
                    }
                });
            }
        });

        // log('ðŸ” Saved users from JSON:', Array.from(savedUsers));

        // Check which saved users don't exist in current project users
        // Only include regular user emails (skip companies and roles)
        savedUsers.forEach(user => {
            // Skip if not an email (companies and roles don't have @)
            if (!user.includes('@')) {
                // log(`  â­ï¸ Skipping non-email: ${user}`);
                return;
            }
            
            // Only add if user email doesn't exist in current project
            if (!currentUserEmails.has(user)) {
                // log(`  âŒ Deleted user found: ${user}`);
                deletedUsers.push(user);
            } else {
                // log(`  âœ… User still exists: ${user}`);
            }
        });

        // log('ðŸ” Deleted users (emails only) found:', deletedUsers);
        return deletedUsers;
    }

    /**
     * Show warning modal for deleted users
     */
    async function showDeletedUsersWarning(deletedUsers) {
        return new Promise((resolve) => {
            // Create modal overlay
            const overlay = document.createElement('div');
            overlay.className = 'confirm-modal-overlay';
            overlay.style.zIndex = '10001'; // Above the folders modal
            
            // Create user list HTML
            const userListHTML = deletedUsers.map(user => `<li style="margin: 5px 0;">${user}</li>`).join('');
            
            // Create modal content
            const modal = document.createElement('div');
            modal.className = 'confirm-modal';
            modal.style.maxWidth = '600px';
            modal.innerHTML = `
                <div class="confirm-modal-header" style="background: #ff9800; color: white;">
                    <span>âš ï¸ Users Deleted from Project</span>
                    <span class="confirm-modal-close">&times;</span>
                </div>
                <div class="confirm-modal-body">
                    <p style="margin-bottom: 15px;">These users have been deleted from the project but still exist in the saved folder permissions:</p>
                    <ul style="max-height: 200px; overflow-y: auto; background: #f5f5f5; padding: 15px; border-radius: 4px; margin: 10px 0;">
                        ${userListHTML}
                    </ul>
                    <p style="margin-top: 15px; color: #666;">Would you like to remove them from the table?</p>
                </div>
                <div class="confirm-modal-footer">
                    <button class="confirm-btn confirm-delete" style="background: #d32f2f; margin-right: 10px;">Delete Users</button>
                    <button class="confirm-btn confirm-continue" style="background: #666;">Continue</button>
                </div>
            `;
            
            overlay.appendChild(modal);
            document.body.appendChild(overlay);
            
            // Add event listeners
            const closeBtn = modal.querySelector('.confirm-modal-close');
            const deleteBtn = modal.querySelector('.confirm-delete');
            const continueBtn = modal.querySelector('.confirm-continue');
            
            const cleanup = () => {
                document.body.removeChild(overlay);
            };
            
            closeBtn.addEventListener('click', () => {
                cleanup();
                resolve(false);
            });
            
            deleteBtn.addEventListener('click', () => {
                cleanup();
                resolve(true);
            });
            
            continueBtn.addEventListener('click', () => {
                cleanup();
                resolve(false);
            });
            
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    cleanup();
                    resolve(false);
                }
            });
        });
    }

    /**
     * Remove deleted users from saved data
     */
    function removeDeletedUsersFromData(data, deletedUsers) {
        const deletedSet = new Set(deletedUsers);
        
        data.folders.forEach(folder => {
            if (folder.permissions) {
                Object.keys(folder.permissions).forEach(columnKey => {
                    const permission = folder.permissions[columnKey];
                    const userName = typeof permission === 'object' ? permission.user : permission;
                    
                    if (deletedSet.has(userName)) {
                        delete folder.permissions[columnKey];
                        // log(`ðŸ—‘ï¸ Removed ${userName} from folder ${folder.level1}`);
                    }
                });
            }
        });
    }

    /**
     * Auto-update inherited permissions in child folders when parent permission changes.
     * Works with folderUserAssignments model and updates DOM in-place for performance.
     */
    function updateInheritedPermissions(parentFolderId, userIdentifier, newLevel) {
        const descendantIds = getDescendantFolderIds(parentFolderId);
        for (const descId of descendantIds) {
            const entries = folderUserAssignments.get(descId);
            if (!entries) continue;
            const entry = entries.find(e => e.user === userIdentifier && e.isInherited);
            if (entry) entry.level = newLevel;
        }
        // Update DOM in-place (avoid full re-render for responsiveness)
        const table = document.querySelector('.folders-table');
        if (!table) return;
        table.querySelectorAll('tr.user-sub-row[data-is-inherited="true"]').forEach(row => {
            if (row.getAttribute('data-user') !== userIdentifier) return;
            const folderId = row.getAttribute('data-folder-parent-id');
            if (!descendantIds.includes(folderId)) return;
            row.setAttribute('data-permission-level', newLevel);
            const input = row.querySelector('.cell-permission-level');
            if (input) input.value = newLevel;
            const contentDiv = row.querySelector('.user-entry-content');
            if (contentDiv) {
                const subjectType = row.getAttribute('data-subject-type');
                const colors = subjectType ? getSubjectColor(subjectType, newLevel) : getPermissionLevelColor(newLevel);
                contentDiv.style.backgroundColor = colors.background;
                contentDiv.style.color = colors.color;
            }
        });
    }

    /**
     * Auto-remove user from child folders when deleted from parent folder.
     * Delegates to model-based removeUserFromDescendants, then re-renders.
     */
    function removeUserFromChildren(parentFolderId, userIdentifier) {
        removeUserFromDescendants(parentFolderId, userIdentifier);
        reRenderFromModel();
    }

    /**
     * Auto-add user to child folders when added to parent folder.
     * Delegates to model-based propagateInheritedToDescendants, then re-renders.
     */
    function addUserToChildren(parentFolderId, userIdentifier, level) {
        const entries = folderUserAssignments.get(parentFolderId);
        if (!entries) return;
        const entry = entries.find(e => e.user === userIdentifier);
        const subjectInfo = entry
            ? { subjectType: entry.subjectType, subjectId: entry.subjectId }
            : lookupSubjectInfo(userIdentifier);
        propagateInheritedToDescendants(parentFolderId, userIdentifier, level, subjectInfo);
        reRenderFromModel();
    }

    /**
     * Load existing ACC folder permissions and populate folderUserAssignments model.
     * Then re-renders the table from the model.
     */
    async function loadExistingACCPermissions(projectId, hierarchy, projectUsers, accessToken, options = {}) {
        const onlyFolderIds = options.onlyFolderIds || null;
        try {
            if (!window.FolderPermissions || !window.FolderPermissions.fetchAllFolderPermissions) {
                updateLoadingProgress('Loading folder structure...', 98);
                return;
            }

            updateLoadingProgress('Loading folder structure...', 55);
            const permissionsMap = await window.FolderPermissions.fetchAllFolderPermissions(
                projectId, hierarchy, accessToken
            );

            updateLoadingProgress('Loading folder structure...', 65);
            const userPermissionsMap = window.FolderPermissions.matchPermissionsToUsers(
                permissionsMap, projectUsers
            );

            // Deduplication: keep highest level per identifier per folder
            updateLoadingProgress('Loading folder structure...', 70);
            for (const folderId in userPermissionsMap) {
                const perms = userPermissionsMap[folderId];
                const deduplicated = {};
                for (const [key, perm] of Object.entries(perms)) {
                    const id = perm.identifier;
                    if (!deduplicated[id] || perm.level > deduplicated[id].level) {
                        deduplicated[id] = perm;
                    }
                }
                if (Object.keys(deduplicated).length > 0) {
                    userPermissionsMap[folderId] = deduplicated;
                }
            }

            // Two-pass transitive ancestor dedup:
            // Pass 1: collect transitive ancestor identifiers for each folder
            const transitiveAncestorIds = new Map();
            hierarchy.forEach(row => {
                const accumulated = new Set();
                for (let d = 0; d < currentFolderDisplayDepth; d++) {
                    const folder = row[levelKeyForDepth(d)];
                    if (!folder?.id) continue;
                    if (d > 0) {
                        if (!transitiveAncestorIds.has(folder.id)) {
                            transitiveAncestorIds.set(folder.id, new Set(accumulated));
                        } else {
                            const existing = transitiveAncestorIds.get(folder.id);
                            accumulated.forEach(id => existing.add(id));
                        }
                    }
                    if (userPermissionsMap[folder.id]) {
                        Object.keys(userPermissionsMap[folder.id]).forEach(uid => accumulated.add(uid));
                    }
                }
            });

            // Pass 2: delete inherited identifiers from each child's direct perms
            transitiveAncestorIds.forEach((ancestorIds, childId) => {
                if (!userPermissionsMap[childId]) return;
                const childPerms = userPermissionsMap[childId];
                Object.keys(childPerms).forEach(uid => {
                    if (ancestorIds.has(uid)) delete childPerms[uid];
                });
                if (Object.keys(childPerms).length === 0) delete userPermissionsMap[childId];
            });

            updateLoadingProgress('Loading folder structure...', 75);

            // Build ancestor lookup for transitive inheritance
            const ancestryMap = new Map();
            hierarchy.forEach(hRow => {
                for (let d = 0; d < currentFolderDisplayDepth; d++) {
                    const k = levelKeyForDepth(d);
                    if (hRow[k]?.id) ancestryMap.set(hRow[k].id, hRow);
                }
            });

            // Build visible folder list to process
            const visibleFolders = buildVisibleFolderRows(hierarchy);
            let totalPermissionsLoaded = 0;
            let processedCount = 0;
            const totalCount = visibleFolders.length;

            for (const { folder, depth } of visibleFolders) {
                processedCount++;
                if (processedCount % 10 === 0 || processedCount === totalCount) {
                    const progress = 75 + (processedCount / totalCount) * 20;
                    updateLoadingProgress('Loading folder structure...', progress);
                }

                const folderId = folder.id;
                if (!folderId) continue;
                if (onlyFolderIds && !onlyFolderIds.has(folderId)) continue;

                // Skip folders that already have model entries (don't overwrite user edits)
                const existingEntries = folderUserAssignments.get(folderId);
                if (existingEntries && existingEntries.length > 0) continue;

                const isRootLevel = depth === 0;
                const isChildLevel = depth > 0;

                // Build effective permissions with inheritance
                const effectivePermissions = new Map();

                if (isChildLevel) {
                    // Inherit from ALL ancestors
                    const ancestorHRow = ancestryMap.get(folderId);
                    if (ancestorHRow) {
                        for (let ad = 0; ad <= depth - 1; ad++) {
                            const akey = levelKeyForDepth(ad);
                            const aid = ancestorHRow[akey]?.id;
                            if (aid && userPermissionsMap[aid]) {
                                Object.values(userPermissionsMap[aid]).forEach(perm => {
                                    effectivePermissions.set(perm.identifier, {
                                        ...perm,
                                        isInherited: true,
                                        inheritedFrom: aid
                                    });
                                });
                            }
                        }
                    }
                    // Add orphan users (unique to this folder)
                    if (userPermissionsMap[folderId]) {
                        Object.values(userPermissionsMap[folderId]).forEach(perm => {
                            if (!effectivePermissions.has(perm.identifier)) {
                                effectivePermissions.set(perm.identifier, {
                                    ...perm,
                                    isInherited: false,
                                    inheritedFrom: null
                                });
                            }
                        });
                    }
                } else if (isRootLevel) {
                    // Root-level: use own direct permissions (editable)
                    if (userPermissionsMap[folderId]) {
                        Object.values(userPermissionsMap[folderId]).forEach(perm => {
                            effectivePermissions.set(perm.identifier, {
                                ...perm,
                                isInherited: false,
                                inheritedFrom: null
                            });
                        });
                    }
                }

                const permissionEntries = Array.from(effectivePermissions.values());
                permissionEntries.sort((a, b) => {
                    const nameA = (a.displayName || '').toLowerCase();
                    const nameB = (b.displayName || '').toLowerCase();
                    return nameA.localeCompare(nameB);
                });

                if (permissionEntries.length === 0) continue;

                // Populate folderUserAssignments model
                const modelEntries = permissionEntries.map(perm => ({
                    user: perm.identifier,
                    displayName: perm.displayName || perm.identifier,
                    level: String(perm.level),
                    subjectType: perm.type || '',
                    subjectId: perm.subjectId || '',
                    isInherited: !!perm.isInherited
                }));

                folderUserAssignments.set(folderId, modelEntries);
                totalPermissionsLoaded += modelEntries.length;
            }

            // Re-render the table from the updated model
            reRenderFromModel();

            // Attach arrow key navigation to all existing permission inputs
            attachArrowKeyNavigationToAllInputs();

            updateLoadingProgress('Loading folder structure...', 98);

        } catch (error) {
            // console.error('Error loading existing ACC permissions:', error);
            updateLoadingProgress('Loading folder structure...', 98);
        }
    }

    /**
     * Model-based propagation pass: any subfolder that has no user assignments in
     * folderUserAssignments after the ACC load step inherits them from its nearest
     * ancestor that DOES have assignments. Uses the data-parent-id chain.
     *
     * Called after loadExistingACCPermissions during lazy expansion so that folders
     * at depth >= 2 get their inherited content filled in.
     */
    function propagatePermissionsToEmptyRows() {
        const table = document.querySelector('.folders-table');
        if (!table) return;

        // Build lookup: folderId -> parent-id from DOM folder rows
        const parentMap = new Map();
        table.querySelectorAll('tr.folder-row').forEach(r => {
            const id = r.getAttribute('data-folder-id');
            const pid = r.getAttribute('data-parent-id');
            if (id) parentMap.set(id, pid || null);
        });

        // Process each folder that has no model entries yet
        for (const [folderId, parentId] of parentMap) {
            if (!parentId) continue; // root-level folders manage their own perms
            const existing = folderUserAssignments.get(folderId);
            if (existing && existing.length > 0) continue; // already populated

            // Walk ancestor chain, collect all inherited users (nearest ancestor wins)
            const merged = new Map(); // user -> entry data
            let pid = parentId;
            const visited = new Set();
            while (pid && !visited.has(pid)) {
                visited.add(pid);
                const ancestorEntries = folderUserAssignments.get(pid);
                if (ancestorEntries) {
                    for (const e of ancestorEntries) {
                        if (!merged.has(e.user)) {
                            merged.set(e.user, {
                                user: e.user,
                                displayName: e.displayName,
                                level: e.level,
                                subjectType: e.subjectType || '',
                                subjectId: e.subjectId || '',
                                isInherited: true
                            });
                        }
                    }
                }
                pid = parentMap.get(pid) || null;
            }
            if (merged.size === 0) continue;

            folderUserAssignments.set(folderId, Array.from(merged.values()));
        }

        // Re-render to show the propagated data
        reRenderFromModel();
    }

    /**
     * Load folder permissions from JSON file into folderUserAssignments model, then re-render.
     */
    async function loadFolderPermissions(projectName) {
        try {
            if (!currentProjectData || !currentProjectData.hubId || !currentProjectData.projectId) return;

            const headers = {};
            const token = window.getAuthToken && window.getAuthToken();
            if (token) headers['Authorization'] = `Bearer ${token}`;

            const response = await fetch(`${window.location.origin}/load-folder-permissions/${encodeURIComponent(currentProjectData.hubId)}/${encodeURIComponent(currentProjectData.projectId)}`, {
                headers: headers
            });
            const result = await response.json();

            if (!result.success || !result.exists || !result.data) return;

            const data = result.data;

            // Check for deleted users
            const deletedUsers = await checkForDeletedUsers(data);
            if (deletedUsers.length > 0) {
                const shouldDelete = await showDeletedUsersWarning(deletedUsers);
                if (shouldDelete) removeDeletedUsersFromData(data, deletedUsers);
            }

            // Populate folderUserAssignments from saved data
            data.folders.forEach(folder => {
                if (!folder.folderId || !folder.permissions) return;
                const entries = [];
                Object.values(folder.permissions).forEach(perm => {
                    if (typeof perm === 'object' && perm.user && perm.level) {
                        const subjectInfo = lookupSubjectInfo(perm.user);
                        let displayName = perm.user;
                        if ((perm.subjectType === 'USER' || subjectInfo?.subjectType === 'USER') && currentProjectUsersRaw) {
                            const userObj = currentProjectUsersRaw.find(u => u.email === perm.user);
                            if (userObj) {
                                displayName = currentUserDisplayMode === 'name'
                                    ? (userObj.name || userObj.email) : userObj.email;
                            }
                        }
                        entries.push({
                            user: perm.user,
                            displayName: displayName,
                            level: String(perm.level),
                            subjectType: perm.subjectType || subjectInfo?.subjectType || '',
                            subjectId: perm.subjectId || subjectInfo?.subjectId || '',
                            isInherited: false
                        });
                    }
                });
                if (entries.length > 0) {
                    folderUserAssignments.set(folder.folderId, entries);
                    // Propagate inherited entries to descendants
                    entries.forEach(entry => {
                        propagateInheritedToDescendants(folder.folderId, entry.user, entry.level, {
                            subjectType: entry.subjectType,
                            subjectId: entry.subjectId
                        });
                    });
                }
            });

            reRenderFromModel();
            attachArrowKeyNavigationToAllInputs();
        } catch (error) {
            // console.error('Error loading folder permissions:', error);
        }
    }

    /**
     * Show confirmation dialog
     */
    function showConfirmDialog(title, message) {
        return new Promise((resolve) => {
            // Create modal overlay
            const overlay = document.createElement('div');
            overlay.className = 'confirm-modal-overlay';
            
            // Create modal content
            const modal = document.createElement('div');
            modal.className = 'confirm-modal';
            modal.innerHTML = `
                <div class="confirm-modal-header">
                    <span>${title}</span>
                    <span class="confirm-modal-close">&times;</span>
                </div>
                <div class="confirm-modal-body">${message}</div>
                <div class="confirm-modal-footer">
                    <button class="confirm-btn confirm-ok">Update</button>
                </div>
            `;
            
            overlay.appendChild(modal);
            document.body.appendChild(overlay);
            
            // Add event listeners
            const closeBtn = modal.querySelector('.confirm-modal-close');
            const okBtn = modal.querySelector('.confirm-ok');
            
            const cleanup = () => {
                document.body.removeChild(overlay);
            };
            
            closeBtn.addEventListener('click', () => {
                cleanup();
                resolve(false);
            });
            
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    cleanup();
                    resolve(false);
                }
            });
            
            okBtn.addEventListener('click', () => {
                cleanup();
                resolve(true);
            });
            
            // Close on escape
            const escHandler = (e) => {
                if (e.key === 'Escape') {
                    cleanup();
                    resolve(false);
                    document.removeEventListener('keydown', escHandler);
                }
            };
            document.addEventListener('keydown', escHandler);
            
            // Focus OK button
            setTimeout(() => okBtn.focus(), 100);
        });
    }

    /**
     * Search for users in the table and highlight matching cells
     */
    function searchAndHighlightUsers(searchTerm) {
        const table = document.querySelector('.folders-table');
        if (!table) return;

        // Remove all existing highlights
        const allCells = table.querySelectorAll('td');
        allCells.forEach(cell => {
            cell.classList.remove('search-highlight');
        });

        // If search term is empty, just clear highlights and return
        if (!searchTerm || searchTerm.trim() === '') {
            return;
        }

        const searchLower = searchTerm.toLowerCase().trim();
        let matchCount = 0;

        // Search through all cells with user data
        allCells.forEach(cell => {
            const usernameSpan = cell.querySelector('.cell-username');
            if (usernameSpan) {
                const username = usernameSpan.textContent.toLowerCase();
                if (username.includes(searchLower)) {
                    cell.classList.add('search-highlight');
                    matchCount++;
                }
            }
        });

        // log(`ðŸ” Search for "${searchTerm}": ${matchCount} matches found`);
    }

    /**
     * Create the folders modal
     */
    function createFoldersModal() {
        if (foldersModal) return; // Already created

        const modalHTML = `
            <div id="foldersModal" class="folders-modal">
                <div class="folders-modal-content">
                    <div class="folders-modal-header">
                        <h3 id="foldersModalTitle">Folder Structure</h3>
                        <input type="text" id="userSearchInput" class="user-search-input" placeholder="Search users..." />
                        <button id="cleanTableBtn" class="clean-table-btn">Clean Table</button>
                        <button id="expandAllBtn" class="expand-all-btn" title="Expand all folders one level deeper">Expand All</button>
                        <button id="collapseAllBtn" class="collapse-all-btn" title="Collapse all folders to root level">Collapse All</button>
                        <!-- <button id="saveFolderPermissionsBtn" class="save-btn">Save folders permissions</button> -->
                        <button id="syncToACCBtn" class="sync-btn">Sync with the project</button>
                        <span class="folders-modal-close">&times;</span>
                    </div>
                    <div class="folders-modal-body">
                        <div id="foldersLoadingMessage" style="text-align: center; padding: 40px; color: #666;">
                            Loading folder structure...
                        </div>
                        <div id="foldersErrorMessage" style="display: none; padding: 30px; background-color: #fff3cd; color: #856404; border: 2px solid #ffc107; border-radius: 8px; margin: 20px; text-align: center; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                        </div>
                        <div id="syncProgressContainer" style="display: none; padding: 20px; background-color: #f8f9fa; border-radius: 4px; margin: 20px;">
                            <h4 id="syncProgressTitle" style="margin: 0 0 15px 0; color: #333;">Syncing to ACC...</h4>
                            <div style="background-color: #e9ecef; border-radius: 4px; height: 30px; overflow: hidden; margin-bottom: 15px;">
                                <div id="syncProgressBar" style="background-color: #ff6b00; height: 100%; width: 0%; transition: width 0.3s; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 14px;"></div>
                            </div>
                            <div id="syncProgressDetails" style="font-size: 13px; color: #666; line-height: 1.6;"></div>
                            <div id="syncProgressSummary" style="display: none; margin-top: 15px; padding: 15px; background-color: white; border-radius: 4px; border: 1px solid #ddd;">
                                <h5 style="margin: 0 0 10px 0; color: #28a745;">âœ… Sync Complete!</h5>
                                <div id="syncProgressStats" style="font-size: 13px; line-height: 1.8;"></div>
                                <button id="closeSyncProgress" style="margin-top: 15px; padding: 8px 20px; background-color: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">Close</button>
                            </div>
                        </div>
                        <div class="folders-content-wrapper">
                            <div id="foldersTableContainer" style="display: none; overflow-x: auto;">
                                <!-- Table will be inserted here -->
                            </div>
                            <div id="foldersUserList" class="folders-user-list" style="display: none;">
                                <!-- User list will be inserted here -->
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const styles = `
            <style>
                .folders-modal {
                    position: fixed;
                    z-index: 3000;
                    left: 0;
                    top: 0;
                    width: 100%;
                    height: 100%;
                    background-color: rgba(0,0,0,0.5);
                    display: none;
                }

                .folders-modal-content {
                    background-color: #fefefe;
                    margin: 0;
                    padding: 0;
                    border: none;
                    width: 100%;
                    max-width: none;
                    height: 100vh;
                    border-radius: 0;
                    box-shadow: none;
                    font-family: 'Artifact Elements', Arial, sans-serif;
                    display: flex;
                    flex-direction: column;
                }

                .folders-modal-header {
                    padding: 15px 20px;
                    background-color: #f8f9fa;
                    border-bottom: 1px solid #ddd;
                    border-radius: 0;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    gap: 15px;
                    flex-shrink: 0;
                }

                .folders-modal-header h3 {
                    margin: 0;
                    color: #333;
                    font-family: 'Artifact Elements', Arial, sans-serif;
                    flex: 1;
                }

                .user-search-input {
                    padding: 8px 12px;
                    border: 2px solid #ccc;
                    border-radius: 4px;
                    font-family: 'Artifact Elements', Arial, sans-serif;
                    font-size: 14px;
                    min-width: 200px;
                    transition: border-color 0.2s;
                }

                .user-search-input:focus {
                    outline: none;
                    border-color: #007bff;
                }

                .search-highlight .user-entry-content {
                    background-color: #ff4444 !important;
                    color: white !important;
                }

                .clean-table-btn {
                    padding: 8px 16px;
                    background-color: #dc3545;
                    color: white;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    font-family: 'Artifact Elements', Arial, sans-serif;
                    font-size: 14px;
                    font-weight: bold;
                    transition: background-color 0.2s;
                }

                .clean-table-btn:hover {
                    background-color: #c82333;
                }

                .clean-table-btn:active {
                    background-color: #bd2130;
                }

                .add-columns-btn {
                    padding: 8px 16px;
                    background-color: #007bff;
                    color: white;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    font-family: 'Artifact Elements', Arial, sans-serif;
                    font-size: 14px;
                    transition: background-color 0.2s;
                }

                .add-columns-btn:hover {
                    background-color: #0056b3;
                }

                .add-columns-btn:active {
                    background-color: #004085;
                }

                .expand-all-btn, .collapse-all-btn {
                    padding: 8px 16px;
                    background-color: #17a2b8;
                    color: white;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    font-family: 'Artifact Elements', Arial, sans-serif;
                    font-size: 14px;
                    transition: background-color 0.2s;
                }

                .expand-all-btn:hover, .collapse-all-btn:hover {
                    background-color: #138496;
                }

                .expand-all-btn:active, .collapse-all-btn:active {
                    background-color: #117a8b;
                }

                .save-btn {
                    padding: 8px 16px;
                    background-color: #28a745;
                    color: white;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    font-family: 'Artifact Elements', Arial, sans-serif;
                    font-size: 14px;
                    font-weight: bold;
                    transition: background-color 0.2s;
                }

                .save-btn:hover {
                    background-color: #218838;
                }

                .save-btn:active {
                    background-color: #1e7e34;
                }

                .sync-btn {
                    padding: 10px 24px;
                    background-color: #ff6b00;
                    color: white;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    font-family: 'Artifact Elements', Arial, sans-serif;
                    font-size: 15px;
                    font-weight: bold;
                    transition: background-color 0.2s;
                }

                .sync-btn:hover {
                    background-color: #e55d00;
                }

                .sync-btn:active {
                    background-color: #cc5200;
                }

                .folders-modal-close {
                    color: #666;
                    font-size: 32px;
                    font-weight: bold;
                    cursor: pointer;
                    line-height: 1;
                    padding: 5px 10px;
                    transition: all 0.2s ease;
                }

                .folders-modal-close:hover,
                .folders-modal-close:focus {
                    color: #ff6b00;
                    transform: scale(1.2);
                }

                .folders-modal-body {
                    padding: 0;
                    font-family: 'Artifact Elements', Arial, sans-serif;
                    flex: 1;
                    overflow: hidden;
                    display: flex;
                    flex-direction: column;
                }

                .folders-content-wrapper {
                    display: flex;
                    flex: 1;
                    overflow: hidden;
                }

                #foldersTableContainer {
                    flex: 1;
                    overflow-x: auto;
                    overflow-y: auto;
                    padding: 20px;
                    position: relative;
                }

                .folders-user-list {
                    width: 352px;
                    border-left: 2px solid #ddd;
                    background-color: #f8f9fa;
                    overflow-y: auto;
                    flex-shrink: 0;
                    display: flex;
                    flex-direction: column;
                }

                .user-list-header {
                    padding: 15px 20px;
                    background-color: #e9ecef;
                    font-weight: bold;
                    font-size: 16px;
                    color: #333;
                    border-bottom: 2px solid #ddd;
                    position: sticky;
                    top: 0;
                    z-index: 10;
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                }

                .user-list-header > div:first-child {
                    font-size: 16px;
                }

                .user-sort-select {
                    padding: 6px 10px;
                    border: 1px solid #ccc;
                    border-radius: 4px;
                    background-color: white;
                    font-family: 'Artifact Elements', Arial, sans-serif;
                    font-size: 13px;
                    cursor: pointer;
                    width: 100%;
                }

                .user-sort-select:focus {
                    outline: 2px solid #007bff;
                    outline-offset: 1px;
                }

                .user-display-options {
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                }

                .user-display-option {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    cursor: pointer;
                    font-size: 14px;
                    font-weight: normal;
                }

                .user-display-option input[type="radio"] {
                    cursor: pointer;
                    width: 16px;
                    height: 16px;
                }

                .user-display-option:hover {
                    color: #007bff;
                }

                .user-list-instructions {
                    padding: 12px 20px;
                    background-color: #f8f9fa;
                    border-bottom: 1px solid #ddd;
                    font-size: 12px;
                    line-height: 1.6;
                    color: #555;
                }

                .user-list-items {
                    padding: 10px;
                }

                .user-list-item-wrapper {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    margin-bottom: 5px;
                }

                .user-list-item {
                    flex: 1;
                    padding: 8px 10px;
                    background-color: white;
                    border: 1px solid #ddd;
                    border-radius: 4px;
                    font-size: 13px;
                    color: #333;
                    word-break: break-all;
                    cursor: grab;
                    transition: all 0.2s;
                }

                .user-list-item:hover {
                    background-color: #e3f2fd;
                    border-color: #007bff;
                    transform: translateX(-2px);
                }
                
                .user-list-item.user-selected {
                    background-color: #1976d2;
                    color: white;
                    border-color: #0d47a1;
                    font-weight: bold;
                }

                .user-list-item.dragging {
                    opacity: 0.5;
                    cursor: grabbing;
                }

                /* Cell content styles */
                .folders-table td {
                    position: relative;
                }

                .cell-username {
                    display: block;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }

                .cell-permission-level {
                    position: absolute;
                    right: 6px;
                    top: 50%;
                    transform: translateY(-50%);
                    width: 30px;
                    padding: 2px 4px;
                    border: 1px solid #007bff;
                    border-radius: 3px;
                    text-align: center;
                    font-size: 12px;
                    font-family: 'Artifact Elements', Arial, sans-serif;
                    font-weight: bold;
                    color: #007bff;
                    background-color: #e3f2fd;
                }

                .cell-permission-level:focus {
                    outline: none;
                    border-color: #0056b3;
                    background-color: #bbdefb;
                }

                .cell-permission-level[readonly] {
                    cursor: not-allowed;
                    opacity: 0.7;
                    border-color: #999;
                    background-color: #f5f5f5;
                }

                .inherited-indicator {
                    position: absolute;
                    right: 52px;
                    top: 50%;
                    transform: translateY(-50%);
                    color: #444;
                    font-size: 14px;
                    font-weight: bold;
                    cursor: help;
                }

                .inherited-permission {
                    background-color: #f0f0f0 !important;
                    color: #555 !important;
                    opacity: 1;
                }

                .permission-tooltip {
                    position: absolute;
                    background-color: #333;
                    color: white;
                    padding: 8px 12px;
                    border-radius: 4px;
                    font-size: 12px;
                    font-family: 'Artifact Elements', Arial, sans-serif;
                    white-space: pre-line;
                    z-index: 10000;
                    pointer-events: none;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                    line-height: 1.6;
                }

                .folder-col-header {
                    text-align: center;
                    padding: 2px 4px;
                    background-color: #f2f2f2;
                }
                .folder-col-header {
                    text-align: center;
                    vertical-align: middle;
                    padding: 12px 10px;
                }

                .folder-col-inner {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    gap: 6px;
                    width: 100%;
                }

                .perms-loading-banner {
                    position: sticky;
                    top: 0;
                    z-index: 20;
                    background: #fff8e1;
                    color: #795548;
                    font-size: 12px;
                    padding: 6px 14px;
                    border-bottom: 1px solid #ffe082;
                    font-family: 'Artifact Elements', Arial, sans-serif;
                }

                .folder-col-label {
                    font-size: 11px;
                    font-weight: 400;
                    color: rgba(255,255,255,0.75);
                    letter-spacing: 0.05em;
                    text-transform: uppercase;
                    margin-bottom: 4px;
                    font-family: 'Artifact Elements', Arial, sans-serif;
                    text-align: center;
                    width: 100%;
                }

                .folder-level-btn {
                    font-size: 42px !important;
                    font-weight: bold;
                    width: 78px;
                    height: 78px;
                    border-radius: 4px;
                    cursor: pointer;
                    padding: 0;
                    line-height: 78px;
                    border: none;
                    font-family: monospace;
                    background: transparent;
                    color: white;
                    display: block;
                    text-align: center;
                    flex-shrink: 0;
                }
                .folder-expand-btn {
                    background: transparent;
                    color: white;
                    border-color: transparent;
                }
                .folder-expand-btn:hover:not(:disabled) { background: rgba(255,255,255,0.15); }
                .folder-expand-btn:disabled { opacity: 0.4; cursor: default; }
                .folder-collapse-btn {
                    background: transparent;
                    color: white;
                    border-color: transparent;
                }
                .folder-collapse-btn:hover { background: rgba(255,255,255,0.15); }

                .folders-table {
                    width: auto;
                    border-collapse: separate;
                    border-spacing: 0;
                    font-family: 'Artifact Elements', Arial, sans-serif;
                }

                .folders-table th,
                .folders-table td {
                    border-right: 1px solid #ddd;
                    border-bottom: 1px solid #ddd;
                    border-top: none;
                    border-left: none;
                    padding: 10px;
                    text-align: left;
                    font-family: 'Artifact Elements', Arial, sans-serif;
                    white-space: nowrap;
                    user-select: none;
                    -webkit-user-select: none;
                    -moz-user-select: none;
                    -ms-user-select: none;
                }

                .folders-table tbody tr:first-child td {
                    border-top: 1px solid #ddd;
                }
                
                .folders-table td.folder-name-cell {
                    /* Single folder column with indentation â€” sticky left */
                    position: sticky;
                    left: 0;
                    z-index: 5;
                    min-width: 210px;
                    max-width: 630px;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    border: none !important;
                    background-color: #ffffff;
                    font-weight: 600;
                    font-size: 13px;
                    line-height: 1.6;
                }

                .folder-svg-icon {
                    vertical-align: middle;
                    margin-right: 4px;
                    position: relative;
                    top: -1px;
                }

                .folders-table td.folder-col-cell {
                    /* Legacy: no longer used in tree layout */
                    display: none;
                }

                /* ===== Vertical layout: user sub-rows ===== */
                .folders-table tr.user-sub-row td.user-entry-cell {
                    padding: 4px 0;
                    font-size: 13px;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    border: none;
                    line-height: 1.6;
                    background-color: transparent;
                }

                .folders-table tr.user-sub-row td.user-entry-cell .user-entry-content {
                    display: flex;
                    align-items: center;
                    padding: 4px 10px;
                    border-radius: 3px;
                    overflow: hidden;
                }

                .folders-table tr.user-sub-row td.user-entry-cell .cell-username {
                    flex-shrink: 1;
                    min-width: 0;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }

                .folders-table tr.user-sub-row {
                    cursor: pointer;
                    transition: opacity 0.15s;
                    background-color: transparent !important;
                }

                .folders-table tr.user-sub-row.selected {
                    outline: 2px solid #0d47a1;
                    outline-offset: -2px;
                }

                .folders-table tr.user-sub-row.inherited-permission {
                    opacity: 0.55;
                }

                .user-entry-icon {
                    display: inline-block;
                    width: 18px;
                    text-align: center;
                    font-size: 13px;
                    vertical-align: middle;
                }

                .inherited-label {
                    font-size: 10px;
                    color: #999;
                    font-style: italic;
                    margin-left: 6px;
                    overflow: hidden;
                    text-overflow: clip;
                    white-space: nowrap;
                    flex-shrink: 1;
                    min-width: 0;
                }

                /* Folder row drag-over highlight */
                .folders-table tr.folder-row.drag-over td.folder-name-cell {
                    background-color: #bbdefb !important;
                    border: 2px dashed #007bff !important;
                    box-shadow: inset 0 0 8px rgba(0, 123, 255, 0.3);
                }

                /* Permission input in user sub-rows */
                .folders-table tr.user-sub-row .cell-permission-level {
                    position: static;
                    transform: none;
                    width: 24px;
                    min-width: 24px;
                    flex-shrink: 0;
                    margin-left: auto;
                    text-align: center;
                    border: 1px solid #ccc;
                    border-radius: 3px;
                    padding: 1px 4px;
                    font-size: 12px;
                    background-color: #fff;
                }

                .tree-header {
                    position: sticky;
                    left: 0;
                    z-index: 15;
                }

                .tree-toggle {
                    cursor: pointer;
                    user-select: none;
                    display: inline-block;
                    width: 20px;
                    text-align: center;
                    font-size: 15px;
                    color: #888;
                    transition: transform 0.15s, color 0.15s;
                    transform: rotate(0deg);
                }

                .tree-toggle.expanded {
                    transform: rotate(90deg);
                }

                .tree-toggle:hover {
                    color: #0696D7;
                }

                .tree-toggle-spacer {
                    display: inline-block;
                    width: 16px;
                }

                .folders-table td.has-content,
                .folders-table th:not(.folder-col-header) {
                    /* User permission columns */
                    min-width: 100px;
                    max-width: 400px;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }

                .folders-table th {
                    background-color: #0696D7;
                    color: white;
                    position: sticky;
                    top: 0;
                    font-weight: 700;
                    z-index: 10;
                    border-top: 1px solid #0696D7;
                    border-left: 1px solid #0696D7;
                }

                .folders-table th:not(.folder-col-header) {
                    background-color: white;
                    color: inherit;
                    border-top: none !important;
                    border-left: none !important;
                    border-right: none !important;
                    border-bottom: none !important;
                }

                .folders-table tr:nth-child(even) {
                    background-color: #f9f9f9;
                }

                .folders-table tr:hover {
                    background-color: #e3f2fd;
                }

                .folders-table td {
                    font-size: 14px;
                }

                /* Drag and drop styles */
                .folders-table td.drag-over {
                    background-color: #bbdefb !important;
                    border: 2px dashed #007bff !important;
                    box-shadow: inset 0 0 8px rgba(0, 123, 255, 0.3);
                }

                .folders-table td.has-content {
                    font-weight: 500;
                    position: relative;
                    padding-right: 70px;
                }

                .folders-table td.selected {
                    background-color: #1976d2 !important;
                    color: white !important;
                    outline: 2px solid #0d47a1;
                    outline-offset: -2px;
                }

                .folders-table td:nth-child(n+3) {
                    cursor: cell;
                }

                .folders-table td:nth-child(n+3):hover:not(.has-content) {
                    background-color: #f5f5f5;
                }

                /* First column (parent folders) - bulk assignment drop zone */
                .folders-table td:first-child {
                    cursor: copy;
                    position: relative;
                    transition: background-color 0.2s, border 0.2s;
                }

                .folders-table td:first-child.drag-over {
                    /* No individual cell styling - column-wide effect handles the visual feedback */
                    background-color: transparent !important;
                    border: none !important;
                    box-shadow: none !important;
                }

                /* CRITICAL: Column-wide hover effect - MUST come last to override all row states */
                /* All cells in column: left and right borders */
                .folders-table tbody tr td:first-child.column-hover,
                .folders-table tbody tr:hover td:first-child.column-hover,
                .folders-table tbody tr:nth-child(even) td:first-child.column-hover,
                .folders-table tbody tr:nth-child(odd) td:first-child.column-hover,
                .folders-table tbody tr:nth-child(even):hover td:first-child.column-hover,
                .folders-table tbody tr:nth-child(odd):hover td:first-child.column-hover {
                    background-color: #fff3cd !important;
                    border-left: 3px solid #ffc107 !important;
                    border-right: 3px solid #ffc107 !important;
                }
                
                /* First cell in column: add top border */
                .folders-table tbody tr:first-child td:first-child.column-hover {
                    border-top: 3px solid #ffc107 !important;
                }
                
                /* Last cell in column: add bottom border */
                .folders-table tbody tr:last-child td:first-child.column-hover {
                    border-bottom: 3px solid #ffc107 !important;
                }

                /* Confirmation Modal Styles */
                .confirm-modal-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background-color: rgba(0, 0, 0, 0.6);
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    z-index: 10000;
                }

                .confirm-modal {
                    background-color: white;
                    border-radius: 8px;
                    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
                    max-width: 450px;
                    width: 90%;
                    overflow: hidden;
                    animation: confirmModalSlideIn 0.2s ease-out;
                }

                @keyframes confirmModalSlideIn {
                    from {
                        transform: translateY(-50px);
                        opacity: 0;
                    }
                    to {
                        transform: translateY(0);
                        opacity: 1;
                    }
                }

                .confirm-modal-header {
                    padding: 20px 24px;
                    background-color: #f8f9fa;
                    border-bottom: 1px solid #dee2e6;
                    font-size: 18px;
                    font-weight: bold;
                    color: #333;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }

                .confirm-modal-close {
                    color: #aaa;
                    font-size: 28px;
                    font-weight: bold;
                    cursor: pointer;
                    line-height: 1;
                }

                .confirm-modal-close:hover {
                    color: #000;
                }

                .confirm-modal-body {
                    padding: 24px;
                    font-size: 15px;
                    color: #555;
                    line-height: 1.6;
                    font-family: 'Artifact Elements', Arial, sans-serif;
                }

                .confirm-modal-footer {
                    padding: 16px 24px;
                    background-color: #f8f9fa;
                    border-top: 1px solid #dee2e6;
                    display: flex;
                    justify-content: center;
                    gap: 12px;
                }

                .confirm-btn {
                    padding: 10px 24px;
                    border: none;
                    border-radius: 4px;
                    font-size: 14px;
                    font-weight: 500;
                    cursor: pointer;
                    transition: all 0.2s;
                    font-family: 'Artifact Elements', Arial, sans-serif;
                }

                .confirm-cancel {
                    background-color: #6c757d;
                    color: white;
                }

                .confirm-cancel:hover {
                    background-color: #5a6268;
                }

                .confirm-ok {
                    background-color: #28a745;
                    color: white;
                }

                .confirm-ok:hover {
                    background-color: #218838;
                }

                .confirm-btn:active {
                    transform: scale(0.97);
                }
            </style>
        `;

        document.head.insertAdjacentHTML('beforeend', styles);
        document.body.insertAdjacentHTML('beforeend', modalHTML);

        foldersModal = document.getElementById('foldersModal');
        setupFoldersModalEvents();
    }

    /**
     * Setup modal event listeners
     */
    function setupFoldersModalEvents() {
        const closeBtn = document.querySelector('.folders-modal-close');
        const cleanTableBtn = document.getElementById('cleanTableBtn');
        const searchInput = document.getElementById('userSearchInput');
        // const saveBtn = document.getElementById('saveFolderPermissionsBtn'); // Removed - no longer saving to Firebase
        const syncBtn = document.getElementById('syncToACCBtn');

        closeBtn.addEventListener('click', () => {
            closeFoldersModal();
        });

        cleanTableBtn.addEventListener('click', () => {
            cleanTable();
        });

        // Expand All / Collapse All buttons
        const expandAllBtn = document.getElementById('expandAllBtn');
        const collapseAllBtn = document.getElementById('collapseAllBtn');
        if (expandAllBtn) {
            expandAllBtn.addEventListener('click', () => {
                window.expandFolderDepth();
            });
        }
        if (collapseAllBtn) {
            collapseAllBtn.addEventListener('click', () => {
                window.collapseFolderDepth();
            });
        }

        // Search functionality
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                searchAndHighlightUsers(e.target.value);
            });
        }

        // saveBtn.addEventListener('click', () => {
        //     saveFolderPermissions();
        // }); // Removed - no longer saving to Firebase

        syncBtn.addEventListener('click', () => {
            handleSyncPermissions();
        });

        // Close on Escape key
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && foldersModal && foldersModal.style.display === 'block') {
                closeFoldersModal();
            }
        });
    }

    /**
     * Close the folders modal
     */
    function closeFoldersModal() {
        if (foldersModal) {
            foldersModal.style.display = 'none';
        }
    }

    // Initialize on load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', window.initFoldersPermissions);
    } else {
        window.initFoldersPermissions();
    }

})();


