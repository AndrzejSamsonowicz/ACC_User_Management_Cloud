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
    let additionalColumnsCount = 10; // Start with 10 additional columns
    let currentUserDisplayMode = 'email'; // Track current display mode (email or name)
    let currentFolderDisplayDepth = 1; // 1=only col0(level2), 2=col0+col1(level2+level3), etc.
    let folderChildrenCache = {}; // parentId -> [{id, name, ...}] — cache fetched children

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
        // log('📁 Folders Permissions module initialized');
    };

    /**
     * Show the folders management modal for a project
     */
    window.showFoldersModal = async function(projectId, projectName, hubId, accessToken) {
        // log('📁 Opening folders modal for project:', projectName);
        // log('📁 Project ID:', projectId);
        // log('📁 Hub ID:', hubId);

        // Store current project data
        currentProjectData = {
            projectId,
            projectName,
            hubId,
            accessToken
        };

        // Reset lazy-load state for each modal open
        currentFolderDisplayDepth = 1;
        folderChildrenCache = {};

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
            
            // Display in table and user list
            displayFolderHierarchy(folderHierarchy);
            displayUserList(usersData.displayUsers);
            
            // Fetch and pre-populate with existing ACC folder permissions
            // Continue with unified progress (50-100%)
            updateLoadingProgress('Loading folder structure...', 50);
            // log('🔐 Fetching existing ACC folder permissions...');
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
            // console.error('❌ Error loading folders:', error);
            
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
                    <div style="font-size: 48px; margin-bottom: 20px;">⚠️</div>
                    <h3 style="margin: 0 0 15px 0; color: #856404;">Unable to Load Folders</h3>
                    <p style="margin: 10px 0; text-align: left; display: inline-block;">This may occur if:</p>
                    <ul style="text-align: left; display: inline-block; margin: 10px 0;">
                        <li>You don't have access to the Docs service in this project</li>
                        <li>No folders exist in this project yet</li>
                        <li>Your account lacks the necessary permissions</li>
                    </ul>
                    <p style="margin: 20px 0 10px 0; font-weight: bold;">Please contact your project administrator to grant you access.</p>
                    <p style="margin: 10px 0; color: #666; font-size: 13px;">You can close this window using the <strong>×</strong> button in the top-right corner or by pressing <strong>ESC</strong>.</p>
                `;
            } else if (error.message.includes('403')) {
                errorHtml = `
                    <div style="font-size: 48px; margin-bottom: 20px;">🚫</div>
                    <h3 style="margin: 0 0 15px 0; color: #856404;">Access Denied</h3>
                    <p style="margin: 10px 0;">You don't have permission to view folders in this project.</p>
                    <p style="margin: 20px 0 10px 0; font-weight: bold;">Please contact your project administrator.</p>
                    <p style="margin: 10px 0; color: #666; font-size: 13px;">You can close this window using the <strong>×</strong> button in the top-right corner or by pressing <strong>ESC</strong>.</p>
                `;
            } else {
                errorHtml = `
                    <div style="font-size: 48px; margin-bottom: 20px;">❌</div>
                    <h3 style="margin: 0 0 15px 0; color: #856404;">Error Loading Folders</h3>
                    <p style="margin: 10px 0;">${error.message}</p>
                    <p style="margin: 10px 0; color: #666; font-size: 13px;">You can close this window using the <strong>×</strong> button in the top-right corner or by pressing <strong>ESC</strong>.</p>
                `;
            }
            
            errorMessage.innerHTML = errorHtml;
            errorMessage.style.display = 'block';
        }
    };

    /**
     * Fetch folder hierarchy — loads only level1 (container) + level2 (first displayed level).
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

            // Build hierarchy rows — each row has level1 (container) + level2 (displayed)
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
        
        // log('📡 Fetching top folders from:', url);

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
        
        // log('📡 Fetching folder contents from:', url);

        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            // console.warn(`⚠️ Failed to fetch contents for folder ${folderId}: ${response.status}`);
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
        // log('👥 Fetching project users...');
        
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
        
        // log(`✅ Fetched ${displayUsers.length} project users`);
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
     * depth 0 → 'level2' (first displayed level = children of top-folders)
     * depth 1 → 'level3', depth 2 → 'level4', etc.
     */
    function levelKeyForDepth(d) {
        return `level${d + 2}`;
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
     * Display folder hierarchy in table.
     * Renders currentFolderDisplayDepth folder columns plus a "+" expand column.
     * User permission columns follow after the folder columns.
     */
    function displayFolderHierarchy(hierarchy) {
        const tableContainer = document.getElementById('foldersTableContainer');

        // --- Build thead ---
        // Folder columns 0..(depth-1): col0 has no button; deeper have "×" to collapse
        // Column depth: "+" expand button (always present)
        // Then additionalColumnsCount user columns
        let theadHTML = '<thead><tr>';
        for (let d = 0; d < currentFolderDisplayDepth; d++) {
            const isLast = (d === currentFolderDisplayDepth - 1);
            if (isLast) {
                theadHTML += `<th class="folder-col-header"><div class="folder-col-inner"><div class="folder-col-label">expand subfolders</div><button class="folder-level-btn folder-expand-btn" id="folderExpandBtn" onclick="window.expandFolderDepth()" title="Expand to next level">+</button></div></th>`;
            } else if (d === 0) {
                // First column: show × to collapse all subfolders back to root level
                theadHTML += `<th class="folder-col-header"><div class="folder-col-inner"><div class="folder-col-label">collapse all</div><button class="folder-level-btn folder-collapse-btn" onclick="window.collapseFolderDepth(1)" title="Collapse all subfolders">×</button></div></th>`;
            } else {
                theadHTML += `<th class="folder-col-header"><div class="folder-col-inner"><div class="folder-col-label">collapse level ${d + 1}</div><button class="folder-level-btn folder-collapse-btn" onclick="window.collapseFolderDepth(${d})" title="Collapse this level">×</button></div></th>`;
            }
        }
        for (let i = 0; i < additionalColumnsCount; i++) theadHTML += '<th></th>';
        theadHTML += '</tr></thead>';

        // --- Build tbody ---
        const folderRows = buildFolderRows(hierarchy, currentFolderDisplayDepth);
        // Total td count per row = depth cols + user cols
        const totalCols = currentFolderDisplayDepth + additionalColumnsCount;

        let tbodyHTML = '';
        for (const { folder, depth, row: hRow } of folderRows) {
            const level1Id   = hRow.level1?.id   || '';
            const level1Name = (hRow.level1?.name || '').replace(/'/g, "\\'");
            // direct parent = folder at depth-1
            const parentKey  = depth > 0 ? levelKeyForDepth(depth - 1) : null;
            const parentId   = parentKey ? (hRow[parentKey]?.id   || '') : '';
            const parentName = parentKey ? (hRow[parentKey]?.name || '').replace(/'/g, "\\'") : '';
            const folderName = folder.name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

            // data-level1-id = top container (for backwards compat)
            // data-level2-id = direct parent folder id (drives inheritance lookups)
            let attrs = `data-folder-id="${folder.id}" data-folder-depth="${depth}" data-level1-id="${level1Id}" data-level1-name="${level1Name}"`;
            if (depth > 0) {
                attrs += ` data-level2-id="${parentId}" data-level2-name="${parentName}" data-parent-id="${parentId}"`;
            }

            tbodyHTML += `<tr ${attrs}>`;
            for (let col = 0; col < currentFolderDisplayDepth; col++) {
                tbodyHTML += col === depth ? `<td class="folder-name-cell">${folderName}</td>` : '<td class="folder-col-cell"></td>';
            }
            // user permission cells
            for (let i = 0; i < additionalColumnsCount; i++) tbodyHTML += '<td></td>';
            tbodyHTML += '</tr>';
        }

        tableContainer.innerHTML = `<table class="folders-table">${theadHTML}<tbody>${tbodyHTML}</tbody></table>`;

        // Pin each folder column width to the longest folder name in that column.
        // After the table is in the DOM we measure real text width via a hidden span.
        const renderedTable = tableContainer.querySelector('.folders-table');
        if (renderedTable) {
            // Build per-depth max char count from the hierarchy
            const maxChars = new Array(currentFolderDisplayDepth).fill(0);
            for (const { folder, depth } of buildFolderRows(hierarchy, currentFolderDisplayDepth)) {
                if (folder.name.length > maxChars[depth]) maxChars[depth] = folder.name.length;
            }
            // Apply as min-width on the TH (capped at 250px, min 60px)
            const ths = renderedTable.querySelectorAll('thead th.folder-col-header');
            ths.forEach((th, d) => {
                if (d < currentFolderDisplayDepth) {
                    const px = Math.min(250, Math.max(60, maxChars[d] * 8 + 24));
                    th.style.minWidth = px + 'px';
                    th.style.width    = px + 'px';
                }
            });
        }

        setupTableDragAndDrop();
        setupTableZoom();
    }

    // =========================================================================
    // Lazy folder expansion / collapse
    // =========================================================================

    /**
     * Save all user-permission cell data (relative column indices) so they can
     * be restored after the table is re-rendered with a different folder depth.
     */
    function saveFolderCellData() {
        const saved = {};
        const table = document.querySelector('.folders-table');
        if (!table) return saved;
        const userColStart = currentFolderDisplayDepth; // first user-permission column
        table.querySelectorAll('tbody tr').forEach(row => {
            const folderId = row.getAttribute('data-folder-id');
            if (!folderId) return;
            saved[folderId] = {};
            row.querySelectorAll('td').forEach((cell, idx) => {
                if (idx >= userColStart && cell.classList.contains('has-content')) {
                    saved[folderId][idx - userColStart] = {
                        user:        cell.getAttribute('data-user'),
                        displayName: cell.getAttribute('data-display-name') || cell.querySelector('.cell-username')?.textContent || cell.getAttribute('data-user'),
                        level:       cell.getAttribute('data-permission-level'),
                        subjectType: cell.getAttribute('data-subject-type'),
                        subjectId:   cell.getAttribute('data-subject-id'),
                        isInherited: cell.getAttribute('data-is-inherited') === 'true'
                    };
                }
            });
        });
        return saved;
    }

    /**
     * Restore user-permission cell data after a re-render.
     * newUserColStart = the index where user columns begin in the newly rendered table.
     */
    function restoreFolderCellData(saved, newUserColStart) {
        if (!saved || !Object.keys(saved).length) return;
        const table = document.querySelector('.folders-table');
        if (!table) return;

        table.querySelectorAll('tbody tr').forEach(row => {
            const folderId = row.getAttribute('data-folder-id');
            if (!folderId || !saved[folderId]) return;
            const cells = row.querySelectorAll('td');

            for (const [relIdx, data] of Object.entries(saved[folderId])) {
                const absIdx = parseInt(relIdx) + newUserColStart;
                const cell = cells[absIdx];
                if (!cell || !data.user || !data.level) continue;

                const colors = data.subjectType
                    ? getSubjectColor(data.subjectType, data.level)
                    : getPermissionLevelColor(data.level);

                const displayName = data.displayName || data.user;
                const inheritedAttr = data.isInherited ? ' readonly title="Inherited from parent folder (read-only)"' : '';
                const inheritedIndicator = data.isInherited ? '<span class="inherited-indicator" title="Inherited from parent folder">↓</span>' : '';
                cell.innerHTML = `<span class="cell-username" title="${displayName}">${displayName}</span><input type="text" class="cell-permission-level" value="${data.level}" maxlength="1"${inheritedAttr} />${inheritedIndicator}`;
                cell.setAttribute('data-user', data.user);
                cell.setAttribute('data-display-name', displayName);
                cell.setAttribute('data-permission-level', data.level);
                if (data.subjectType) cell.setAttribute('data-subject-type', data.subjectType);
                if (data.subjectId)   cell.setAttribute('data-subject-id',   data.subjectId);
                if (data.isInherited) cell.setAttribute('data-is-inherited', 'true');
                cell.classList.add('has-content');
                if (data.isInherited) cell.classList.add('inherited-permission');
                cell.style.backgroundColor = colors.background;
                cell.style.color = colors.color;

                const permInput = cell.querySelector('.cell-permission-level');
                if (permInput) setupPermissionTooltip(permInput);
            }
        });

        setupTableDragAndDrop();
        attachArrowKeyNavigationToAllInputs();
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
        banner.textContent = '⏳ Loading permissions in background…';
        container.prepend(banner);
    }

    function hidePermissionsBanner() {
        const banner = document.querySelector('.perms-loading-banner');
        if (banner) banner.remove();
    }

    window.expandFolderDepth = async function() {
        if (!currentProjectData || !currentHierarchy) return;
        const { projectId, accessToken } = currentProjectData;

        // The level we are ADDING (0-indexed display depth)
        const nextDepth    = currentFolderDisplayDepth;       // e.g. 1 when adding level3
        const nextKey      = levelKeyForDepth(nextDepth);     // e.g. 'level3'
        const parentKey    = levelKeyForDepth(nextDepth - 1); // e.g. 'level2'

        // Disable button while loading
        const expandBtn = document.getElementById('folderExpandBtn');
        if (expandBtn) { expandBtn.disabled = true; expandBtn.textContent = '…'; }

        showLoadingProgress('Loading subfolders…', 0);

        try {
            // Collect unique parent IDs at the current deepest level
            const uniqueParentIds = new Set();
            currentHierarchy.forEach(row => {
                const parent = row[parentKey];
                if (parent) uniqueParentIds.add(parent.id);
            });

            // Fetch children in parallel (use cache to avoid duplicate calls)
            let done = 0;
            await Promise.all([...uniqueParentIds].map(async parentId => {
                if (!folderChildrenCache[parentId]) {
                    folderChildrenCache[parentId] = await fetchFolderContents(projectId, parentId, accessToken);
                }
                updateLoadingProgress('Loading subfolders…', (++done / uniqueParentIds.size) * 80);
            }));

            // Check if any parent has children
            const anyHasChildren = [...uniqueParentIds].some(id => folderChildrenCache[id]?.length > 0);
            if (!anyHasChildren) {
                if (expandBtn) {
                    expandBtn.disabled = false;
                    expandBtn.textContent = '×';
                    expandBtn.title = 'Collapse this level';
                    expandBtn.classList.remove('folder-expand-btn');
                    expandBtn.classList.add('folder-collapse-btn');
                    expandBtn.onclick = () => window.collapseFolderDepth(currentFolderDisplayDepth - 1);
                    const label = expandBtn.closest('th')?.querySelector('.folder-col-label');
                    if (label) label.textContent = `collapse level ${currentFolderDisplayDepth}`;
                }
                hideLoadingProgress();
                return;
            }

            // Save current permission cell data before re-render
            const savedCells = saveFolderCellData();
            const oldUserColStart = currentFolderDisplayDepth;

            // Expand hierarchy: split rows that have children
            const newHierarchy = [];
            for (const row of currentHierarchy) {
                const parent = row[parentKey];
                if (!parent) { newHierarchy.push({ ...row, [nextKey]: null }); continue; }
                const children = folderChildrenCache[parent.id] || [];
                if (children.length === 0) {
                    newHierarchy.push({ ...row, [nextKey]: null });
                } else {
                    for (const child of children) {
                        newHierarchy.push({ ...row, [nextKey]: child });
                    }
                }
            }
            currentHierarchy = newHierarchy;
            currentFolderDisplayDepth++;

            // Re-render
            displayFolderHierarchy(currentHierarchy);

            // Restore saved permissions at their new column positions
            const newUserColStart = currentFolderDisplayDepth;
            restoreFolderCellData(savedCells, newUserColStart);

            // ── Folder names are now visible — hide the overlay and unlock the UI ──
            hideLoadingProgress();

            // Load ACC permissions in the background (non-blocking).
            // A subtle banner is shown while loading; it disappears when done.
            const newFolderIds = new Set(
                currentHierarchy.filter(r => r[nextKey]).map(r => r[nextKey].id)
            );
            if (newFolderIds.size > 0 && window.FolderPermissions?.fetchAllFolderPermissions) {
                showPermissionsBanner();
                loadExistingACCPermissions(
                    projectId, currentHierarchy, currentProjectUsers, accessToken,
                    { onlyFolderIds: newFolderIds }
                ).then(() => {
                    propagatePermissionsToEmptyRows();
                    hidePermissionsBanner();
                }).catch(err => {
                    console.error('❌ Background permission load error:', err);
                    hidePermissionsBanner();
                });
            } else {
                propagatePermissionsToEmptyRows();
            }

        } catch (err) {
            console.error('❌ expandFolderDepth error:', err);
        } finally {
            hideLoadingProgress();
        }
    };

    /**
     * Collapse all folder levels deeper than targetDepth (1-indexed display depth).
     * e.g. collapseFolderDepth(1) collapses back to showing only the first level column.
     */
    window.collapseFolderDepth = function(targetDepth) {
        if (targetDepth < 1 || targetDepth >= currentFolderDisplayDepth) return;

        // Save current cell data
        const savedCells = saveFolderCellData();

        // Remove levels deeper than targetDepth from all hierarchy rows
        const keysToRemove = [];
        for (let d = targetDepth; d < currentFolderDisplayDepth; d++) {
            keysToRemove.push(levelKeyForDepth(d));
        }
        currentHierarchy = currentHierarchy
            .map(row => {
                const newRow = { ...row };
                keysToRemove.forEach(k => delete newRow[k]);
                return newRow;
            })
            // Deduplicate: after removing deeper levels, rows may be identical
            .filter((row, idx, arr) => {
                const topKey = levelKeyForDepth(targetDepth - 1);
                if (!row[topKey]) return true;
                return arr.findIndex(r => r[topKey]?.id === row[topKey]?.id) === idx;
            });

        currentFolderDisplayDepth = targetDepth;

        displayFolderHierarchy(currentHierarchy);
        restoreFolderCellData(savedCells, currentFolderDisplayDepth);
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
        
        const allInputs = table.querySelectorAll('.cell-permission-level:not([readonly])');
        
        allInputs.forEach(input => {
            const cell = input.closest('td');
            if (!cell) return;
            
            const row = cell.closest('tr');
            if (!row) return;
            
            // Remove existing keydown listeners by cloning (prevents duplicates)
            const newInput = input.cloneNode(true);
            input.parentNode.replaceChild(newInput, input);
            
            // Attach arrow key handler
            newInput.addEventListener('keydown', (event) => {
                // Handle arrow key navigation
                if (handlePermissionArrowKeys(event, newInput, (level) => {
                    cell.setAttribute('data-permission-level', level);
                    const subjectType = cell.getAttribute('data-subject-type');
                    const colors = subjectType ? getSubjectColor(subjectType, level) : getPermissionLevelColor(level);
                    cell.style.backgroundColor = colors.background;
                    cell.style.color = colors.color;
                    
                    // Propagate to inherited children if this cell is a direct permission
                    if (cell.getAttribute('data-is-inherited') !== 'true') {
                        const parentFolderId = row.getAttribute('data-folder-id');
                        const userIdentifier = cell.getAttribute('data-user');
                        if (parentFolderId && userIdentifier) {
                            updateInheritedPermissions(parentFolderId, userIdentifier, level.toString());
                        }
                    }
                })) {
                    return; // Arrow key was handled
                }
            });
            
            // Re-attach other event listeners that might have been lost
            newInput.addEventListener('input', (event) => {
                const value = event.target.value;
                if (value && (value < '1' || value > '6' || isNaN(value))) {
                    event.target.value = value.slice(0, -1);
                } else if (value && value >= '1' && value <= '6') {
                    const subjectType = cell.getAttribute('data-subject-type');
                    const colors = subjectType ? getSubjectColor(subjectType, value) : getPermissionLevelColor(value);
                    cell.style.backgroundColor = colors.background;
                    cell.style.color = colors.color;
                    // Propagate live while typing
                    if (cell.getAttribute('data-is-inherited') !== 'true') {
                        const parentFolderId = row.getAttribute('data-folder-id');
                        const userIdentifier = cell.getAttribute('data-user');
                        if (parentFolderId && userIdentifier) {
                            updateInheritedPermissions(parentFolderId, userIdentifier, value);
                        }
                    }
                }
            });
            
            newInput.addEventListener('change', (event) => {
                const level = event.target.value || '6';
                cell.setAttribute('data-permission-level', level);
                const subjectType = cell.getAttribute('data-subject-type');
                const colors = subjectType ? getSubjectColor(subjectType, level) : getPermissionLevelColor(level);
                cell.style.backgroundColor = colors.background;
                cell.style.color = colors.color;
                // Propagate to inherited children if this cell is a direct permission
                if (cell.getAttribute('data-is-inherited') !== 'true') {
                    const parentFolderId = row.getAttribute('data-folder-id');
                    const userIdentifier = cell.getAttribute('data-user');
                    if (parentFolderId && userIdentifier) {
                        updateInheritedPermissions(parentFolderId, userIdentifier, level);
                    }
                }
            });
        });
        
        // console.log(`⌨️ Attached arrow key navigation to ${allInputs.length} permission inputs`);
    }

    /**
     * Setup drag-and-drop functionality for table cells
     */
    function setupTableDragAndDrop() {
        const table = document.querySelector('.folders-table');
        if (!table) return;

        // Get all table cells (td elements)
        const cells = table.querySelectorAll('td');
        
        cells.forEach((cell, index) => {
            const cellIndex = Array.from(cell.parentElement.children).indexOf(cell);
            
            // Skip all folder-name / folder-indent columns — drops only allowed on user columns.
            // Folder columns are 0 .. currentFolderDisplayDepth-1.
            // Column 0 is the bulk-assign target so it keeps drag events but is handled specially.
            if (cellIndex > 0 && cellIndex < currentFolderDisplayDepth) {
                return;
            }
            
            // Remove existing event listeners by cloning and replacing the node
            // This prevents duplicate event listeners from being attached
            const newCell = cell.cloneNode(true);
            cell.parentNode.replaceChild(newCell, cell);
            
            // Now attach event listeners to the new cell
            
            // Make cells valid drop targets
            newCell.addEventListener('dragover', (e) => {
                e.preventDefault();
                newCell.classList.add('drag-over');
                
                // If dragging over first column, highlight entire column
                const dragCellIndex = Array.from(newCell.parentElement.children).indexOf(newCell);
                if (dragCellIndex === 0) {
                    const allFirstColumnCells = table.querySelectorAll('td:first-child');
                    allFirstColumnCells.forEach(c => c.classList.add('column-hover'));
                }
            });
            
            newCell.addEventListener('dragleave', () => {
                newCell.classList.remove('drag-over');
                
                // If leaving first column, remove column-wide highlight
                const dragCellIndex = Array.from(newCell.parentElement.children).indexOf(newCell);
                if (dragCellIndex === 0) {
                    const allFirstColumnCells = table.querySelectorAll('td:first-child');
                    allFirstColumnCells.forEach(c => c.classList.remove('column-hover'));
                }
            });
            
            newCell.addEventListener('drop', (e) => {
                e.preventDefault();
                newCell.classList.remove('drag-over');
                
                // Remove column-wide highlight on drop
                const allFirstColumnCells = table.querySelectorAll('td:first-child');
                allFirstColumnCells.forEach(c => c.classList.remove('column-hover'));
                
                // SPECIAL HANDLING: If dropped on first column, assign to ALL parent folders
                const row = newCell.parentElement;
                const dropCellIndex = Array.from(row.children).indexOf(newCell);
                
                if (dropCellIndex === 0) {
                    // Dropped on first column (parent folder names) -> assign to ALL depth-0 folders
                    const multiUserData = e.dataTransfer.getData('application/json');
                    let usersToAssign = [];
                    
                    if (multiUserData) {
                        try {
                            usersToAssign = JSON.parse(multiUserData);
                        } catch (err) {
                            usersToAssign = [e.dataTransfer.getData('text/plain')];
                        }
                    } else {
                        const userName = e.dataTransfer.getData('text/plain');
                        if (userName) {
                            usersToAssign = [userName];
                        }
                    }
                    
                    if (usersToAssign.length === 0) return;
                    
                    // Get all parent folder rows (rows where first column has text)
                    const allRows = table.querySelectorAll('tbody tr');
                    const parentRows = Array.from(allRows).filter(r => {
                        const level1Id = r.getAttribute('data-level1-id');
                        const level2Id = r.getAttribute('data-level2-id');
                        return level1Id && !level2Id; // Parent folders have level1 but no level2
                    });
                    
                    // console.log(`📋 Bulk assignment: Assigning ${usersToAssign.length} user(s) to ${parentRows.length} parent folders`);
                    
                    // For each parent folder, assign all users
                    parentRows.forEach(parentRow => {
                        const cells = Array.from(parentRow.children);
                        const parentFolderId = parentRow.getAttribute('data-folder-id');
                        
                        usersToAssign.forEach((userName, userIndex) => {
                            // Find first empty cell starting from userColStart (after all folder columns)
                            let targetCell = null;
                            let targetIndex = -1;
                            
                            for (let i = currentFolderDisplayDepth; i < cells.length; i++) {
                                if (!cells[i].classList.contains('has-content')) {
                                    targetCell = cells[i];
                                    targetIndex = i;
                                    break;
                                }
                            }
                            
                            // If no empty cell, create new one
                            if (!targetCell) {
                                targetCell = document.createElement('td');
                                parentRow.appendChild(targetCell);
                                targetIndex = cells.length;
                            }
                            
                            // Look up subject info
                            const subjectInfo = lookupSubjectInfo(userName);
                            
                            // Determine identifier and display name
                            let userIdentifier = userName;
                            let displayName = userName;
                            
                            if (subjectInfo && subjectInfo.subjectType === 'USER') {
                                const userObj = currentProjectUsersRaw?.find(u => 
                                    u.email === userName || u.name === userName
                                );
                                
                                if (userObj) {
                                    userIdentifier = userObj.email;
                                    displayName = currentUserDisplayMode === 'name' 
                                        ? (userObj.name || userObj.email) 
                                        : userObj.email;
                                }
                        }
                        // No prefix for ROLE or COMPANY - use color coding instead
                        
                        // Create cell content
                        const defaultLevel = '1';
                        targetCell.innerHTML = `
                            <span class="cell-username" title="${displayName}">${displayName}</span>
                            <input type="text" class="cell-permission-level" value="${defaultLevel}" maxlength="1" />
                        `;
                        targetCell.setAttribute('data-user', userIdentifier);
                        targetCell.setAttribute('data-permission-level', defaultLevel);
                        targetCell.classList.add('has-content');
                        
                        // Set subject data attributes
                        if (subjectInfo && subjectInfo.subjectId && subjectInfo.subjectType) {
                            targetCell.setAttribute('data-subject-id', subjectInfo.subjectId);
                            targetCell.setAttribute('data-subject-type', subjectInfo.subjectType);
                        }
                        
                        // Apply subject type color with gradient based on level
                        const colors = subjectInfo ? getSubjectColor(subjectInfo.subjectType, defaultLevel) : getPermissionLevelColor(defaultLevel);
                        targetCell.style.backgroundColor = colors.background;
                        targetCell.style.color = colors.color;
                        
                        // Setup permission level input event listeners
                        const permissionInput = targetCell.querySelector('.cell-permission-level');
                        if (permissionInput) {
                            permissionInput.addEventListener('input', (event) => {
                                const value = event.target.value;
                                if (value && (value < '1' || value > '6' || isNaN(value))) {
                                    event.target.value = value.slice(0, -1);
                                } else if (value && value >= '1' && value <= '6') {
                                    const colors = getPermissionLevelColor(value);
                                    targetCell.style.backgroundColor = colors.background;
                                    targetCell.style.color = colors.color;
                                }
                            });
                            
                            permissionInput.addEventListener('change', (event) => {
                                const level = event.target.value || '1';
                                targetCell.setAttribute('data-permission-level', level);
                                const colors = getPermissionLevelColor(level);
                                targetCell.style.backgroundColor = colors.background;
                                targetCell.style.color = colors.color;
                                updateInheritedPermissions(parentFolderId, userIdentifier, level);
                            });
                        }
                        
                        // Add user to children folders with inheritance
                        addUserToChildren(parentFolderId, userIdentifier, defaultLevel);
                        });
                    });
                    
                    // Ensure all rows have consistent column count
                    const maxCols = Math.max(...Array.from(allRows).map(r => r.children.length));
                    allRows.forEach(r => {
                        while (r.children.length < maxCols) {
                            r.appendChild(document.createElement('td'));
                        }
                    });
                    
                    // Update column count and re-setup
                    additionalColumnsCount = maxCols - currentFolderDisplayDepth;
                    setupTableDragAndDrop();
                    attachArrowKeyNavigationToAllInputs();
                    
                    // Clear user selection
                    selectedUsers = [];
                    document.querySelectorAll('.user-list-item').forEach(item => {
                        item.classList.remove('user-selected');
                    });
                    
                    // console.log(`✅ Bulk assignment complete: ${usersToAssign.length} user(s) added to all ${parentRows.length} parent folders with inheritance`);
                    return; // Exit early, don't process normal drop
                }
                
                // NORMAL HANDLING: Drop on regular cells (column 2+)
                // Check if multiple users are being dragged
                const multiUserData = e.dataTransfer.getData('application/json');
                let usersToPlace = [];
                
                if (multiUserData) {
                    // Multiple users
                    try {
                        usersToPlace = JSON.parse(multiUserData);
                    } catch (err) {
                        // console.error('Failed to parse multi-user data:', err);
                        usersToPlace = [e.dataTransfer.getData('text/plain')];
                    }
                } else {
                    // Single user
                    const userName = e.dataTransfer.getData('text/plain');
                    if (userName) {
                        usersToPlace = [userName];
                    }
                }
                
                if (usersToPlace.length === 0) return;
                
                // Get the starting cell index (row already declared above)
                let cells = Array.from(row.children);
                const startIndex = cells.indexOf(newCell);
                
                // Check if we need more columns
                const requiredColumns = startIndex + usersToPlace.length;
                const currentColumns = cells.length;
                
                if (requiredColumns > currentColumns) {
                    // Need to add more columns to all rows
                    const columnsToAdd = requiredColumns - currentColumns;
                    // log(`📊 Need to add ${columnsToAdd} columns (current: ${currentColumns}, required: ${requiredColumns})`);
                    
                    // Add columns to the entire table
                    const table = document.querySelector('.folders-table');
                    if (table) {
                        const allRows = table.querySelectorAll('tbody tr');
                        allRows.forEach(tableRow => {
                            for (let i = 0; i < columnsToAdd; i++) {
                                const newCell = document.createElement('td');
                                // Don't add extra classes or styles here - let setupTableDragAndDrop handle it
                                tableRow.appendChild(newCell);
                            }
                        });
                        
                        // Update additionalColumnsCount
                        additionalColumnsCount += columnsToAdd;
                        // log(`📊 Added ${columnsToAdd} columns, total additional columns: ${additionalColumnsCount}`);
                        
                        // Re-setup drag and drop for ALL cells (including new ones)
                        setupTableDragAndDrop();
                        
                        // Re-attach arrow key navigation after cloning cells
                        attachArrowKeyNavigationToAllInputs();
                    }
                    
                    // Update cells array for current row
                    cells = Array.from(row.children);
                }
                
                // Place users horizontally starting from the drop cell
                // Track identifiers for propagation to children
                const userIdentifiers = [];
                
                usersToPlace.forEach((userName, index) => {
                    const targetIndex = startIndex + index;
                    if (targetIndex < cells.length) {
                        const targetCell = cells[targetIndex];
                        
                        // Look up subject info first to determine identifier and type
                        const subjectInfo = lookupSubjectInfo(userName);
                        
                        // Determine the identifier and display name
                        let userIdentifier = userName;
                        let displayName = userName;
                        
                        if (subjectInfo && subjectInfo.subjectType === 'USER') {
                            // For USER type, find the actual user object to get email
                            const userObj = currentProjectUsersRaw?.find(u => 
                                u.email === userName || u.name === userName
                            );
                            
                            if (userObj) {
                                // Always use email as identifier for USER type
                                userIdentifier = userObj.email;
                                // Display based on current mode
                                displayName = currentUserDisplayMode === 'name' 
                                    ? (userObj.name || userObj.email) 
                                    : userObj.email;
                            }
                        }
                        // No prefix for ROLE or COMPANY - use color coding instead
                        
                        // Track for child propagation
                        userIdentifiers.push(userIdentifier);
                        
                        // Create cell content with user name and editable permission level
                        const defaultLevel = '1';
                        targetCell.innerHTML = `
                            <span class="cell-username" title="${displayName}">${displayName}</span>
                            <input type="text" class="cell-permission-level" value="${defaultLevel}" maxlength="1" />
                        `;
                        targetCell.setAttribute('data-user', userIdentifier);
                        targetCell.classList.add('has-content');
                        
                        // Set subject data attributes for saving
                        if (subjectInfo && subjectInfo.subjectId && subjectInfo.subjectType) {
                            targetCell.setAttribute('data-subject-id', subjectInfo.subjectId);
                            targetCell.setAttribute('data-subject-type', subjectInfo.subjectType);
                            // log(`✅ Set subject attributes for dropped user: ${displayName} (${subjectInfo.subjectType}, ${subjectInfo.subjectId})`);
                        }
                        
                        // Apply subject type color with gradient based on level
                        const colors = subjectInfo ? getSubjectColor(subjectInfo.subjectType, defaultLevel) : getPermissionLevelColor(defaultLevel);
                        targetCell.style.backgroundColor = colors.background;
                        targetCell.style.color = colors.color;
                        
                        // Setup permission level input validation
                        const permissionInput = targetCell.querySelector('.cell-permission-level');
                        if (permissionInput) {
                            // Add tooltip on hover
                            setupPermissionTooltip(permissionInput);
                            
                            permissionInput.addEventListener('input', (event) => {
                                const value = event.target.value;
                                // Only allow numbers 1-6
                                if (value && (value < '1' || value > '6' || isNaN(value))) {
                                    event.target.value = value.slice(0, -1); // Remove last character
                                }
                            });
                            
                            permissionInput.addEventListener('keydown', (event) => {
                                // Handle arrow key navigation (Left/Right to decrease/increase level)
                                if (handlePermissionArrowKeys(event, permissionInput, (level) => {
                                    targetCell.setAttribute('data-permission-level', level);
                                    const colors = subjectInfo ? getSubjectColor(subjectInfo.subjectType, level) : getPermissionLevelColor(level);
                                    targetCell.style.backgroundColor = colors.background;
                                    targetCell.style.color = colors.color;
                                    
                                    // AUTO-PROPAGATE if parent folder
                                    const parentFolderId = row.getAttribute('data-folder-id');
                                    const level1Id = row.getAttribute('data-level1-id');
                                    const level2Id = row.getAttribute('data-level2-id');
                                    const isLevel2Folder = level1Id && !level2Id;
                                    
                                    if (isLevel2Folder) {
                                        updateInheritedPermissions(parentFolderId, userName, level.toString());
                                    }
                                })) {
                                    return; // Arrow key was handled
                                }
                                
                                // Allow: backspace, delete, tab, escape, enter
                                if ([8, 9, 27, 13, 46].indexOf(event.keyCode) !== -1 ||
                                    // Allow: Ctrl+A, Ctrl+C, Ctrl+V, Ctrl+X
                                    (event.keyCode === 65 && event.ctrlKey === true) ||
                                    (event.keyCode === 67 && event.ctrlKey === true) ||
                                    (event.keyCode === 86 && event.ctrlKey === true) ||
                                    (event.keyCode === 88 && event.ctrlKey === true)) {
                                    return;
                                }
                                // Ensure that it's a number 1-6 and stop the keypress
                                if ((event.shiftKey || (event.keyCode < 49 || event.keyCode > 54)) && (event.keyCode < 97 || event.keyCode > 102)) {
                                    event.preventDefault();
                                }
                            });
                            
                            // Update data attribute and background color when value changes
                            permissionInput.addEventListener('change', (event) => {
                                const level = event.target.value || '6';
                                targetCell.setAttribute('data-permission-level', level);
                                const colors = subjectInfo ? getSubjectColor(subjectInfo.subjectType, level) : getPermissionLevelColor(level);
                                targetCell.style.backgroundColor = colors.background;
                                targetCell.style.color = colors.color;
                                
                                // AUTO-PROPAGATE: Check if this is a parent folder
                                const parentFolderId = row.getAttribute('data-folder-id');
                                const level1Id = row.getAttribute('data-level1-id');
                                const level2Id = row.getAttribute('data-level2-id');
                                const isLevel2Folder = level1Id && !level2Id;
                                
                                if (isLevel2Folder) {
                                    updateInheritedPermissions(parentFolderId, userName, level);
                                }
                            });
                            
                            permissionInput.addEventListener('input', (event) => {
                                const level = event.target.value;
                                if (level && level >= '1' && level <= '6') {
                                    const colors = subjectInfo ? getSubjectColor(subjectInfo.subjectType, level) : getPermissionLevelColor(level);
                                    targetCell.style.backgroundColor = colors.background;
                                    targetCell.style.color = colors.color;
                                }
                            });
                            
                            // Set initial data attribute
                            targetCell.setAttribute('data-permission-level', '6');
                        }
                    }
                });
                
                // AUTO-ADD TO CHILDREN: Propagate to all descendants if this is a depth-0 folder
                const parentFolderId = row.getAttribute('data-folder-id');
                const folderDepth = parseInt(row.getAttribute('data-folder-depth') ?? '-1');
                const isRootFolder = folderDepth === 0;
                
                if (isRootFolder) {
                    // This is a depth-0 folder - propagate to all descendants
                    userIdentifiers.forEach((userIdentifier) => {
                        addUserToChildren(parentFolderId, userIdentifier, '1');
                    });
                } else if (folderDepth > 0) {
                    // Subfolder: propagate to its own descendants too
                    userIdentifiers.forEach((userIdentifier) => {
                        addUserToChildren(parentFolderId, userIdentifier, '1');
                    });
                }

                // Re-setup drag and drop for all cells after adding to children
                setupTableDragAndDrop();
                
                // Re-attach arrow key navigation to all inputs after setup
                attachArrowKeyNavigationToAllInputs();
                
                // Clear user selection after drop
                selectedUsers = [];
                document.querySelectorAll('.user-list-item').forEach(item => {
                    item.classList.remove('user-selected');
                });
            });
            
            // Add click handler for selection
            newCell.addEventListener('click', (e) => {
                handleCellSelection(newCell, e.shiftKey, e.ctrlKey);
            });
        });
        
        // Add keyboard handler for delete (only once)
        if (!deleteKeyHandlerAdded) {
            document.addEventListener('keydown', handleDeleteKey);
            deleteKeyHandlerAdded = true;
        }
        
        // Add click handler to deselect cells when clicking outside table (only once)
        if (!clickHandlerAdded) {
            document.addEventListener('click', (e) => {
                // Check if click is outside table cells
                const clickedCell = e.target.closest('.folders-table td');
                const clickedInput = e.target.closest('.cell-permission-level');
                
                // If clicked outside table cells (but not on permission inputs), clear selection
                if (!clickedCell && !clickedInput && selectedCells.length > 0) {
                    selectedCells.forEach(c => c.classList.remove('selected'));
                    selectedCells = [];
                    lastSelectedCell = null;
                }
            });
            clickHandlerAdded = true;
        }
        
        // Note: Column-wide hover effect is now handled in dragover/dragleave events above
        // This ensures highlighting only happens during drag operations, not normal hover
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
                
                // log(`🔍 Table zoom: ${Math.round(currentZoom * 100)}%`);
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
     * Handle cell selection with shift key support
     */
    function handleCellSelection(cell, shiftPressed, ctrlPressed) {
        const cellIndex = Array.from(cell.parentElement.children).indexOf(cell);
        
        // If clicking on first two columns (folder names), just clear selection and return
        if (cellIndex < 2) {
            if (!shiftPressed && !ctrlPressed && selectedCells.length > 0) {
                selectedCells.forEach(c => c.classList.remove('selected'));
                selectedCells = [];
                lastSelectedCell = null;
            }
            return;
        }

        if (!shiftPressed && !ctrlPressed) {
            // Clear previous selections
            selectedCells.forEach(c => c.classList.remove('selected'));
            selectedCells = [];
            
            // Select this cell
            cell.classList.add('selected');
            selectedCells.push(cell);
            lastSelectedCell = cell;
        } else if (ctrlPressed && !shiftPressed) {
            // CTRL pressed: Toggle individual cell selection
            if (selectedCells.includes(cell)) {
                // Cell is already selected - deselect it
                cell.classList.remove('selected');
                selectedCells = selectedCells.filter(c => c !== cell);
                // Update lastSelectedCell if we deselected it
                if (lastSelectedCell === cell) {
                    lastSelectedCell = selectedCells.length > 0 ? selectedCells[selectedCells.length - 1] : null;
                }
            } else {
                // Cell is not selected - add it to selection
                cell.classList.add('selected');
                selectedCells.push(cell);
                lastSelectedCell = cell;
                
                // Apply permission level from first selected cell if current cell has content
                if (selectedCells.length > 1 && cell.classList.contains('has-content')) {
                    const firstCell = selectedCells[0];
                    const sourcePermissionInput = firstCell.querySelector('.cell-permission-level');
                    const sourcePermissionLevel = sourcePermissionInput ? sourcePermissionInput.value : null;
                    
                    if (sourcePermissionLevel) {
                        const targetPermissionInput = cell.querySelector('.cell-permission-level');
                        if (targetPermissionInput) {
                            targetPermissionInput.value = sourcePermissionLevel;
                            cell.setAttribute('data-permission-level', sourcePermissionLevel);
                            
                            const subjectType = cell.getAttribute('data-subject-type');
                            const colors = subjectType ? getSubjectColor(subjectType, sourcePermissionLevel) : getPermissionLevelColor(sourcePermissionLevel);
                            cell.style.backgroundColor = colors.background;
                            cell.style.color = colors.color;
                            
                            // log(`📝 Applied permission level ${sourcePermissionLevel} to cell`);
                        }
                    }
                }
            }
        } else if (shiftPressed) {
            // Shift is pressed - toggle selection or select range
            if (selectedCells.includes(cell)) {
                // Cell is already selected - deselect it
                cell.classList.remove('selected');
                selectedCells = selectedCells.filter(c => c !== cell);
                // Update lastSelectedCell if we deselected it
                if (lastSelectedCell === cell) {
                    lastSelectedCell = selectedCells.length > 0 ? selectedCells[selectedCells.length - 1] : null;
                }
            } else if (lastSelectedCell) {
                // Select range between last selected and current
                // Determine if selection is horizontal (same row), vertical (same column), or rectangular
                const lastRow = lastSelectedCell.parentElement;
                const currentRow = cell.parentElement;
                
                const lastCellIndex = Array.from(lastRow.children).indexOf(lastSelectedCell);
                const currentCellIndex = Array.from(currentRow.children).indexOf(cell);
                
                const lastRowIndex = Array.from(lastRow.parentElement.children).indexOf(lastRow);
                const currentRowIndex = Array.from(currentRow.parentElement.children).indexOf(currentRow);
                
                // Get the permission level from the first selected cell (lastSelectedCell)
                const sourcePermissionInput = lastSelectedCell.querySelector('.cell-permission-level');
                const sourcePermissionLevel = sourcePermissionInput ? sourcePermissionInput.value : null;
                
                if (lastRowIndex === currentRowIndex) {
                    // HORIZONTAL selection (same row)
                    const startCol = Math.min(lastCellIndex, currentCellIndex);
                    const endCol = Math.max(lastCellIndex, currentCellIndex);
                    
                    for (let col = startCol; col <= endCol; col++) {
                        if (col >= 2) { // Skip first two columns
                            const targetCell = currentRow.children[col];
                            if (targetCell && !selectedCells.includes(targetCell)) {
                                targetCell.classList.add('selected');
                                selectedCells.push(targetCell);
                                
                                // Apply permission level if applicable
                                if (sourcePermissionLevel && targetCell.classList.contains('has-content')) {
                                    const targetPermissionInput = targetCell.querySelector('.cell-permission-level');
                                    if (targetPermissionInput) {
                                        targetPermissionInput.value = sourcePermissionLevel;
                                        targetCell.setAttribute('data-permission-level', sourcePermissionLevel);
                                        
                                        const subjectType = targetCell.getAttribute('data-subject-type');
                                        const colors = subjectType ? getSubjectColor(subjectType, sourcePermissionLevel) : getPermissionLevelColor(sourcePermissionLevel);
                                        targetCell.style.backgroundColor = colors.background;
                                        targetCell.style.color = colors.color;
                                        
                                        // AUTO-UPDATE inherited permissions in child folders
                                        const row = targetCell.parentElement;
                                        const parentFolderId = row.getAttribute('data-folder-id');
                                        const level1Id = row.getAttribute('data-level1-id');
                                        const level2Id = row.getAttribute('data-level2-id');
                                        const isLevel2Folder = level1Id && !level2Id;
                                        const userIdentifier = targetCell.getAttribute('data-user');
                                        
                                        if (isLevel2Folder && userIdentifier) {
                                            updateInheritedPermissions(parentFolderId, userIdentifier, sourcePermissionLevel);
                                        }
                                        
                                        // log(`📝 Applied permission level ${sourcePermissionLevel} to cell`);
                                    }
                                }
                            }
                        }
                    }
                } else if (lastCellIndex === currentCellIndex) {
                    // VERTICAL selection (same column)
                    const startRow = Math.min(lastRowIndex, currentRowIndex);
                    const endRow = Math.max(lastRowIndex, currentRowIndex);
                    
                    const allRows = Array.from(currentRow.parentElement.children);
                    
                    for (let row = startRow; row <= endRow; row++) {
                        const targetRow = allRows[row];
                        if (targetRow && currentCellIndex < targetRow.children.length) {
                            const targetCell = targetRow.children[currentCellIndex];
                            if (targetCell && !selectedCells.includes(targetCell)) {
                                targetCell.classList.add('selected');
                                selectedCells.push(targetCell);
                                
                                // Apply permission level if applicable
                                if (sourcePermissionLevel && targetCell.classList.contains('has-content')) {
                                    const targetPermissionInput = targetCell.querySelector('.cell-permission-level');
                                    if (targetPermissionInput) {
                                        targetPermissionInput.value = sourcePermissionLevel;
                                        targetCell.setAttribute('data-permission-level', sourcePermissionLevel);
                                        
                                        const subjectType = targetCell.getAttribute('data-subject-type');
                                        const colors = subjectType ? getSubjectColor(subjectType, sourcePermissionLevel) : getPermissionLevelColor(sourcePermissionLevel);
                                        targetCell.style.backgroundColor = colors.background;
                                        targetCell.style.color = colors.color;
                                        
                                        // AUTO-UPDATE inherited permissions in child folders
                                        const row = targetCell.parentElement;
                                        const parentFolderId = row.getAttribute('data-folder-id');
                                        const level1Id = row.getAttribute('data-level1-id');
                                        const level2Id = row.getAttribute('data-level2-id');
                                        const isLevel2Folder = level1Id && !level2Id;
                                        const userIdentifier = targetCell.getAttribute('data-user');
                                        
                                        if (isLevel2Folder && userIdentifier) {
                                            updateInheritedPermissions(parentFolderId, userIdentifier, sourcePermissionLevel);
                                        }
                                        
                                        // log(`📝 Applied permission level ${sourcePermissionLevel} to cell`);
                                    }
                                }
                            }
                        }
                    }
                } else {
                    // RECTANGULAR selection (different row AND different column)
                    const startRow = Math.min(lastRowIndex, currentRowIndex);
                    const endRow = Math.max(lastRowIndex, currentRowIndex);
                    const startCol = Math.min(lastCellIndex, currentCellIndex);
                    const endCol = Math.max(lastCellIndex, currentCellIndex);
                    
                    const allRows = Array.from(currentRow.parentElement.children);
                    
                    for (let row = startRow; row <= endRow; row++) {
                        const targetRow = allRows[row];
                        if (targetRow) {
                            for (let col = startCol; col <= endCol; col++) {
                                if (col >= 2 && col < targetRow.children.length) { // Skip first two columns
                                    const targetCell = targetRow.children[col];
                                    if (targetCell && !selectedCells.includes(targetCell)) {
                                        targetCell.classList.add('selected');
                                        selectedCells.push(targetCell);
                                        
                                        // Apply permission level if applicable
                                        if (sourcePermissionLevel && targetCell.classList.contains('has-content')) {
                                            const targetPermissionInput = targetCell.querySelector('.cell-permission-level');
                                            if (targetPermissionInput) {
                                                targetPermissionInput.value = sourcePermissionLevel;
                                                targetCell.setAttribute('data-permission-level', sourcePermissionLevel);
                                                
                                                const subjectType = targetCell.getAttribute('data-subject-type');
                                                const colors = subjectType ? getSubjectColor(subjectType, sourcePermissionLevel) : getPermissionLevelColor(sourcePermissionLevel);
                                                targetCell.style.backgroundColor = colors.background;
                                                targetCell.style.color = colors.color;
                                                
                                                // AUTO-UPDATE inherited permissions in child folders
                                                const row = targetCell.parentElement;
                                                const parentFolderId = row.getAttribute('data-folder-id');
                                                const level1Id = row.getAttribute('data-level1-id');
                                                const level2Id = row.getAttribute('data-level2-id');
                                                const isLevel2Folder = level1Id && !level2Id;
                                                const userIdentifier = targetCell.getAttribute('data-user');
                                                
                                                if (isLevel2Folder && userIdentifier) {
                                                    updateInheritedPermissions(parentFolderId, userIdentifier, sourcePermissionLevel);
                                                }
                                                
                                                // log(`📝 Applied permission level ${sourcePermissionLevel} to cell`);
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            } else {
                // No previous selection, just select this one
                cell.classList.add('selected');
                selectedCells.push(cell);
                lastSelectedCell = cell;
            }
        }
    }

    /**
     * Handle delete key press
     */
    function handleDeleteKey(e) {
        if (e.key === 'Delete' && selectedCells.length > 0) {
            selectedCells.forEach(cell => {
                // AUTO-DELETE: Check if this is a parent folder cell
                const row = cell.closest('tr');
                if (row) {
                    const folderId = row.getAttribute('data-folder-id');
                    const level1Id = row.getAttribute('data-level1-id');
                    const level2Id = row.getAttribute('data-level2-id');
                    const isLevel2Folder = level1Id && !level2Id; // Parent folder
                    const userIdentifier = cell.getAttribute('data-user');
                    
                    // If deleting from parent folder, also remove from children
                    if (isLevel2Folder && userIdentifier) {
                        removeUserFromChildren(folderId, userIdentifier);
                    }
                }
                
                // Clear the cell
                cell.textContent = '';
                cell.classList.remove('has-content');
                cell.classList.remove('selected');
                cell.classList.remove('inherited-permission');
                cell.removeAttribute('data-user');
                cell.removeAttribute('data-permission-level');
                cell.removeAttribute('data-subject-type');
                cell.removeAttribute('data-subject-id');
                cell.removeAttribute('data-is-inherited');
                cell.style.backgroundColor = '';
                cell.style.color = '';
            });
            selectedCells = [];
            lastSelectedCell = null;
        }
        
        // Handle Ctrl+C (Copy)
        if ((e.ctrlKey || e.metaKey) && e.key === 'c' && selectedCells.length > 0) {
            e.preventDefault();
            copiedCells = selectedCells.map(cell => {
                const userName = cell.getAttribute('data-user');
                const permissionInput = cell.querySelector('.cell-permission-level');
                const permissionLevel = permissionInput ? permissionInput.value : null;
                const subjectType = cell.getAttribute('data-subject-type');
                const subjectId = cell.getAttribute('data-subject-id');
                
                return {
                    userName: userName,
                    permissionLevel: permissionLevel,
                    subjectType: subjectType,
                    subjectId: subjectId,
                    hasContent: cell.classList.contains('has-content')
                };
            });
            // log(`📋 Copied ${copiedCells.length} cells`);
        }
        
        // Handle Ctrl+V (Paste)
        if ((e.ctrlKey || e.metaKey) && e.key === 'v' && copiedCells.length > 0 && selectedCells.length > 0) {
            e.preventDefault();
            
            // Paste copied cells starting from the first selected cell
            const startCell = selectedCells[0];
            const allCells = Array.from(document.querySelectorAll('.folders-table td'));
            const startIndex = allCells.indexOf(startCell);
            
            copiedCells.forEach((copiedData, index) => {
                const targetCell = allCells[startIndex + index];
                if (targetCell) {
                    const cellIndex = Array.from(targetCell.parentElement.children).indexOf(targetCell);
                    
                    // Skip first two columns
                    if (cellIndex >= 2) {
                        if (copiedData.hasContent && copiedData.userName && copiedData.permissionLevel) {
                            // Paste with full structure (username + permission level)
                            targetCell.innerHTML = `
                                <span class="cell-username" title="${copiedData.userName}">${copiedData.userName}</span>
                                <input type="text" class="cell-permission-level" value="${copiedData.permissionLevel}" maxlength="1" />
                            `;
                            targetCell.setAttribute('data-user', copiedData.userName);
                            targetCell.setAttribute('data-permission-level', copiedData.permissionLevel);
                            if (copiedData.subjectType) {
                                targetCell.setAttribute('data-subject-type', copiedData.subjectType);
                            }
                            if (copiedData.subjectId) {
                                targetCell.setAttribute('data-subject-id', copiedData.subjectId);
                            }
                            targetCell.classList.add('has-content');
                            
                            // Apply background and text color with gradient
                            const colors = copiedData.subjectType ? 
                                getSubjectColor(copiedData.subjectType, copiedData.permissionLevel) : 
                                getPermissionLevelColor(copiedData.permissionLevel);
                            targetCell.style.backgroundColor = colors.background;
                            targetCell.style.color = colors.color;
                            
                            // Setup validation for pasted input
                            const permissionInput = targetCell.querySelector('.cell-permission-level');
                            if (permissionInput) {
                                // Add tooltip on hover
                                setupPermissionTooltip(permissionInput);
                                
                                permissionInput.addEventListener('input', (event) => {
                                    const value = event.target.value;
                                    if (value && (value < '1' || value > '6' || isNaN(value))) {
                                        event.target.value = value.slice(0, -1);
                                    } else if (value && value >= '1' && value <= '6') {
                                        const subjectType = targetCell.getAttribute('data-subject-type');
                                        const colors = subjectType ? 
                                            getSubjectColor(subjectType, value) : 
                                            getPermissionLevelColor(value);
                                        targetCell.style.backgroundColor = colors.background;
                                        targetCell.style.color = colors.color;
                                    }
                                });
                                
                                permissionInput.addEventListener('keydown', (event) => {
                                    // Handle arrow key navigation (Left/Right to decrease/increase level)
                                    if (handlePermissionArrowKeys(event, permissionInput, (level) => {
                                        targetCell.setAttribute('data-permission-level', level);
                                        const subjectType = targetCell.getAttribute('data-subject-type');
                                        const colors = subjectType ? 
                                            getSubjectColor(subjectType, level) : 
                                            getPermissionLevelColor(level);
                                        targetCell.style.backgroundColor = colors.background;
                                        targetCell.style.color = colors.color;
                                    })) {
                                        return; // Arrow key was handled
                                    }
                                    
                                    if ([8, 9, 27, 13, 46].indexOf(event.keyCode) !== -1 ||
                                        (event.keyCode === 65 && event.ctrlKey === true) ||
                                        (event.keyCode === 67 && event.ctrlKey === true) ||
                                        (event.keyCode === 86 && event.ctrlKey === true) ||
                                        (event.keyCode === 88 && event.ctrlKey === true)) {
                                        return;
                                    }
                                    if ((event.shiftKey || (event.keyCode < 49 || event.keyCode > 54)) && (event.keyCode < 97 || event.keyCode > 102)) {
                                        event.preventDefault();
                                    }
                                });
                                
                                permissionInput.addEventListener('change', (event) => {
                                    const level = event.target.value || '1';
                                    targetCell.setAttribute('data-permission-level', level);
                                    const subjectType = targetCell.getAttribute('data-subject-type');
                                    const colors = subjectType ? 
                                        getSubjectColor(subjectType, level) : 
                                        getPermissionLevelColor(level);
                                    targetCell.style.backgroundColor = colors.background;
                                    targetCell.style.color = colors.color;
                                });
                            }
                        } else {
                            // Clear cell if copied cell was empty
                            targetCell.innerHTML = '';
                            targetCell.classList.remove('has-content');
                            targetCell.removeAttribute('data-user');
                            targetCell.removeAttribute('data-permission-level');
                            targetCell.style.backgroundColor = '';
                            targetCell.style.color = '';
                        }
                    }
                }
            });
            
            // log(`📌 Pasted ${copiedCells.length} cells`);
        }
    }

    /**
     * Update table to show users as email or name based on display mode
     * Only affects USER type entries (not companies or roles)
     */
    function updateTableUserDisplay(displayMode) {
        if (displayMode !== 'email' && displayMode !== 'name') {
            return; // Only handle email and name modes
        }
        
        const table = document.querySelector('.folders-table');
        if (!table) return;
        
        // Find all cells with user data
        const allCells = table.querySelectorAll('td[data-user]');
        let updatedCount = 0;
        
        allCells.forEach(cell => {
            const subjectType = cell.getAttribute('data-subject-type');
            
            // Only update USER type entries (skip COMPANY and ROLE)
            if (subjectType === 'USER') {
                const currentIdentifier = cell.getAttribute('data-user');
                const usernameSpan = cell.querySelector('.cell-username');
                
                if (usernameSpan && currentProjectUsersRaw) {
                    // Find user in raw data by email
                    const user = currentProjectUsersRaw.find(u => u.email === currentIdentifier);
                    
                    if (user) {
                        // Update display based on mode
                        if (displayMode === 'email') {
                            usernameSpan.textContent = user.email;
                        } else if (displayMode === 'name') {
                            usernameSpan.textContent = user.name || user.email;
                        }
                        updatedCount++;
                    }
                }
            }
        });
        
        if (updatedCount > 0) {
            // console.log(`🔄 Updated ${updatedCount} user entries to display as ${displayMode}`);
        }
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
                Drag and drop users to the table on the left.<br>
                <strong>💡 Tip:</strong> Drop on parent folder name (first column) to assign to <strong>ALL parent folders</strong> with inheritance.<br>
                <strong>💡 Tip:</strong> Press <strong>Shift</strong> to select a range of cells.<br>
                <strong>💡 Tip:</strong> Press <strong>Ctrl</strong> to toggle individual cell selection.<br>
                <strong>💡 Tip:</strong> Press <strong>Ctrl</strong> and <strong>scroll</strong> the mouse wheel to zoom in and zoom out.<br>
                <br>
                Access levels:<br>
                1 - View Only<br>
                2 - View/Download<br>
                3 - View/Download+PublishMarkups<br>
                4 - View/Download+PublishMarkups+Upload<br>
                5 - View/Download+PublishMarkups+Upload+Edit<br>
                6 - Full controll
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

    // Add Columns function
    function addColumns() {
        // Use the shared save/restore helpers so the dynamic folder-column offset is respected
        const savedCellData = saveFolderCellData();

        additionalColumnsCount += 10;

        if (currentHierarchy) {
            displayFolderHierarchy(currentHierarchy);
            // After re-render the user-col start is unchanged (folder depth didn't change)
            restoreFolderCellData(savedCellData, currentFolderDisplayDepth);
        }
    }

    // Clean Table function - removes all users from table without affecting saved JSON
    function cleanTable() {
        const table = document.querySelector('.folders-table');
        if (!table) return;

        const rows = table.querySelectorAll('tbody tr');
        rows.forEach(row => {
            const cells = row.querySelectorAll('td');
            cells.forEach((cell, index) => {
                // Skip first two columns (folder names)
                if (index >= 2 && cell.classList.contains('has-content')) {
                    cell.innerHTML = '';
                    cell.classList.remove('has-content');
                    cell.removeAttribute('data-user');
                    cell.removeAttribute('data-permission-level');
                    cell.style.backgroundColor = '';
                    cell.style.color = '';
                }
            });
        });

        // log('🧹 Table cleaned - all users removed from display');
    }

    /**
     * Lookup subjectId and subjectType for a user/company/role name
     */
    function lookupSubjectInfo(userName) {
        // log(`🔍 Looking up subject info for: "${userName}"`);
        
        if (!currentProjectUsersRaw || currentProjectUsersRaw.length === 0) {
            // console.error('❌ No raw user data available for lookup!');
            // log('currentProjectUsersRaw:', currentProjectUsersRaw);
            return null;
        }

        // log(`📊 Raw user data available: ${currentProjectUsersRaw.length} users`);

        // Check if it's a prefixed company or role name
        let actualName = userName;
        let forcedType = null;
        
        if (userName.startsWith('Company: ')) {
            actualName = userName.substring('Company: '.length);
            forcedType = 'COMPANY';
            // log(`🏢 Detected prefixed COMPANY: "${actualName}"`);
        } else if (userName.startsWith('Role: ')) {
            actualName = userName.substring('Role: '.length);
            forcedType = 'ROLE';
            // log(`👤 Detected prefixed ROLE: "${actualName}"`);
        }

        // Check if it's an email (USER)
        if (actualName.includes('@') && !forcedType) {
            // log('✉️ Detected as EMAIL');
            const user = currentProjectUsersRaw.find(u => u.email === actualName);
            if (user) {
                // log(`✅ Found USER - ID: ${user.id}, Name: ${user.name || 'No name'}`);
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
            // console.warn(`⚠️ Email not found: ${actualName}`);
        }

        // Check if it's a name (USER by name) - only if not forced as COMPANY or ROLE
        if (!forcedType) {
            const userByName = currentProjectUsersRaw.find(u => u.name === actualName);
            if (userByName) {
                // log(`✅ Found USER by name - ID: ${userByName.id}, Email: ${userByName.email}`);
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
            // log('🏢 Checking as COMPANY');
            const companyUser = currentProjectUsersRaw.find(u => u.companyName === actualName);
            if (companyUser && companyUser.companyId) {
                // log(`✅ Found COMPANY - ID: ${companyUser.companyId}`);
                return {
                    subjectId: companyUser.companyId,
                    subjectType: 'COMPANY'
                };
            }
        }

        // Check if it's a role name (ROLE)
        if (forcedType === 'ROLE' || !forcedType) {
            // log('👤 Checking as ROLE');
            for (const user of currentProjectUsersRaw) {
                if (user.roles && Array.isArray(user.roles)) {
                    const matchingRole = user.roles.find(r => r.name === actualName);
                    if (matchingRole && user.roleIds && user.roleIds.length > 0) {
                        // log(`✅ Found ROLE - ID: ${user.roleIds[0]}`);
                        return {
                            subjectId: user.roleIds[0],
                            subjectType: 'ROLE'
                        };
                    }
                }
            }
        }

        // console.error(`❌ Could not find subject info for: "${userName}" (searching for: "${actualName}")`);
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
            // console.error('❌ Sync module not loaded!');
            alert('Sync module not loaded. Please refresh the page.');
        }
    }

    /**
     * Save folder permissions to JSON file
     */
    async function saveFolderPermissions() {
        if (!currentProjectData) {
            alert('No project data available');
            return;
        }

        const table = document.querySelector('.folders-table');
        if (!table) {
            alert('No table data to save');
            return;
        }

        // Check if file already exists
        try {
            const token = window.getAuthToken && window.getAuthToken();
            const checkResponse = await fetch(`${window.location.origin}/check-folder-permissions/${encodeURIComponent(currentProjectData.hubId)}/${encodeURIComponent(currentProjectData.projectId)}`, {
                headers: token ? {
                    'Authorization': `Bearer ${token}`
                } : {}
            });
            const checkData = await checkResponse.json();
            
            if (checkData.exists) {
                const confirmed = await showConfirmDialog(
                    'Update Folder Permissions?',
                    'Do you want to update the folder permissions?'
                );
                if (!confirmed) {
                    return;
                }
            }
        } catch (error) {
            // console.error('Error checking file existence:', error);
        }

        const folders = [];
        const rows = table.querySelectorAll('tbody tr');

        // log('💾 Starting save operation...');
        // log(`📊 Current raw users available: ${currentProjectUsersRaw ? currentProjectUsersRaw.length : 0}`);

        rows.forEach(row => {
            const cells = row.querySelectorAll('td');
            if (cells.length === 0) return;

            const folderId = row.getAttribute('data-folder-id');
            const level1 = row.getAttribute('data-level1-name');
            const level2 = row.getAttribute('data-level2-name');
            
            // Determine level 2 and level 3 from cell content
            const level2Cell = cells[0].textContent.trim();
            const level3Cell = cells[1].textContent.trim();

            // Build permissions object (only non-empty columns)
            const permissions = {};
            for (let i = 2; i < cells.length; i++) {
                const cell = cells[i];
                
                // Check if cell has actual content (username span exists and is not empty)
                const usernameSpan = cell.querySelector('.cell-username');
                const permissionInput = cell.querySelector('.cell-permission-level');
                
                // Only process if both username and permission level exist with content
                if (usernameSpan && usernameSpan.textContent.trim() && permissionInput && permissionInput.value.trim()) {
                    const userName = usernameSpan.textContent.trim();
                    const permissionLevel = permissionInput.value.trim();
                    
                    // log(`\n📝 Processing permission for: ${userName}`);
                    
                    // First, check if cell already has subjectId and subjectType (from pre-population)
                    const existingSubjectId = cell.getAttribute('data-subject-id');
                    const existingSubjectType = cell.getAttribute('data-subject-type');
                    
                    let subjectInfo = null;
                    
                    if (existingSubjectId && existingSubjectType) {
                        // Use existing data attributes (from ACC pre-population)
                        // log(`✅ Using existing data attributes: subjectId=${existingSubjectId}, subjectType=${existingSubjectType}`);
                        subjectInfo = {
                            subjectId: existingSubjectId,
                            subjectType: existingSubjectType
                        };
                    } else {
                        // Fallback to lookup (for manually added users)
                        // log(`🔍 No data attributes found, looking up subject info...`);
                        subjectInfo = lookupSubjectInfo(userName);
                    }
                    
                    if (subjectInfo) {
                        // log(`✅ Saving with subjectId: ${subjectInfo.subjectId}, subjectType: ${subjectInfo.subjectType}`);
                        const permissionData = {
                            subjectId: subjectInfo.subjectId,
                            subjectType: subjectInfo.subjectType,
                            user: userName,
                            level: permissionLevel
                        };
                        
                        // Add name field only for USER type
                        if (subjectInfo.subjectType === 'USER' && subjectInfo.name) {
                            permissionData.name = subjectInfo.name;
                        }
                        
                        permissions[`column${i - 1}`] = permissionData;
                    } else {
                        // Fallback: save without subjectId if lookup fails
                        // console.error(`❌ LOOKUP FAILED for: ${userName} - Saving without subjectId`);
                        permissions[`column${i - 1}`] = {
                            user: userName,
                            level: permissionLevel
                        };
                    }
                }
                // Note: If cell is empty or cleared, we simply don't add it to permissions
                // This ensures removed users are not saved
            }

            // Only add folder if it has permissions or is a folder row
            if (Object.keys(permissions).length > 0 || level2Cell || level3Cell) {
                folders.push({
                    folderId: folderId,
                    level1: level1,
                    level2: level2Cell || level2 || null,
                    level3: level3Cell || null,
                    permissions: permissions
                });
            }
        });

        const jsonData = {
            projectName: currentProjectData.projectName,
            projectId: currentProjectData.projectId,
            hubId: currentProjectData.hubId,
            exportDate: new Date().toISOString(),
            folders: folders
        };

        // Save to server with Firebase authentication
        try {
            // Prepare headers with auth token
            const headers = {
                'Content-Type': 'application/json'
            };
            
            // Add authentication token if available (not in demo mode)
            const token = window.getAuthToken && window.getAuthToken();
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            } else {
                // console.error('❌ No authentication token available');
                const saveBtn = document.getElementById('saveFolderPermissionsBtn');
                showTooltip(saveBtn, '✗ Authentication required. Please log in again.');
                return;
            }
            
            // log('💾 Sending save request to server...');
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

            // log('💾 Server response status:', response.status, response.statusText);
            
            // Check HTTP status first
            if (!response.ok) {
                const errorData = await response.json();
                const errorMessage = errorData.error || errorData.message || `Server error: ${response.status}`;
                // console.error('❌ Server returned error:', response.status, errorMessage);
                
                const saveBtn = document.getElementById('saveFolderPermissionsBtn');
                if (response.status === 401) {
                    showTooltip(saveBtn, '✗ Authentication failed. Please log in again.');
                } else if (response.status === 403) {
                    showTooltip(saveBtn, '✗ Permission denied.');
                } else {
                    showTooltip(saveBtn, `✗ Error: ${errorMessage}`);
                }
                return;
            }
            
            // Parse successful response
            const result = await response.json();
            
            if (result.success) {
                // log(`💾 Saved folder permissions to Firebase for project: ${currentProjectData.projectName}`);
                const saveBtn = document.getElementById('saveFolderPermissionsBtn');
                showTooltip(saveBtn, '✓ Saved successfully');
            } else {
                // Should not happen if response.ok is true, but handle it anyway
                const errorMessage = result.message || 'Unknown error';
                // console.error('❌ Save failed:', errorMessage);
                const saveBtn = document.getElementById('saveFolderPermissionsBtn');
                showTooltip(saveBtn, `✗ Error: ${errorMessage}`);
            }
        } catch (error) {
            // console.error('❌ Network error saving folder permissions:', error);
            const saveBtn = document.getElementById('saveFolderPermissionsBtn');
            showTooltip(saveBtn, `✗ Network error: ${error.message}`);
        }
    }

    /**
     * Check for users in saved data that no longer exist in the project
     */
    async function checkForDeletedUsers(savedData) {
        const deletedUsers = [];
        
        // Create a set of current user emails from the display users
        const currentUserEmails = new Set(currentProjectUsers.map(u => u.email));
        
        // log('🔍 Current project user emails:', Array.from(currentUserEmails));
        
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

        // log('🔍 Saved users from JSON:', Array.from(savedUsers));

        // Check which saved users don't exist in current project users
        // Only include regular user emails (skip companies and roles)
        savedUsers.forEach(user => {
            // Skip if not an email (companies and roles don't have @)
            if (!user.includes('@')) {
                // log(`  ⏭️ Skipping non-email: ${user}`);
                return;
            }
            
            // Only add if user email doesn't exist in current project
            if (!currentUserEmails.has(user)) {
                // log(`  ❌ Deleted user found: ${user}`);
                deletedUsers.push(user);
            } else {
                // log(`  ✅ User still exists: ${user}`);
            }
        });

        // log('🔍 Deleted users (emails only) found:', deletedUsers);
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
                    <span>⚠️ Users Deleted from Project</span>
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
                        // log(`🗑️ Removed ${userName} from folder ${folder.level1}`);
                    }
                });
            }
        });
    }

    /**
     * Auto-update inherited permissions in child folders when parent permission changes
     */
    function updateInheritedPermissions(parentFolderId, userIdentifier, newLevel) {
        const table = document.querySelector('.folders-table');
        if (!table) return;
        
        const rows = table.querySelectorAll('tbody tr');
        let updatedCount = 0;
        
        rows.forEach(row => {
            // Walk up ancestor chain — updates ALL descendants, not just direct children
            let ancestor = row.getAttribute('data-parent-id');
            let isDescendant = false;
            const visited = new Set();
            while (ancestor && !visited.has(ancestor)) {
                visited.add(ancestor);
                if (ancestor === parentFolderId) { isDescendant = true; break; }
                const ancestorRow = table.querySelector(`tr[data-folder-id="${ancestor}"]`);
                ancestor = ancestorRow ? ancestorRow.getAttribute('data-parent-id') : null;
            }
            if (!isDescendant) return;
            
            const cells = row.querySelectorAll('td');
            
            cells.forEach(cell => {
                const cellUser = cell.getAttribute('data-user');
                const isInherited = cell.getAttribute('data-is-inherited') === 'true';
                
                if (cellUser === userIdentifier && isInherited) {
                    const permissionInput = cell.querySelector('.cell-permission-level');
                    if (permissionInput) {
                        permissionInput.value = newLevel;
                        cell.setAttribute('data-permission-level', newLevel);
                        
                        const subjectType = cell.getAttribute('data-subject-type');
                        const colors = subjectType ? 
                            getSubjectColor(subjectType, newLevel) : 
                            getPermissionLevelColor(newLevel);
                        cell.style.backgroundColor = colors.background;
                        cell.style.color = colors.color;
                        
                        updatedCount++;
                    }
                }
            });
        });
    }

    /**
     * Auto-remove user from child folders when deleted from parent folder
     */
    function removeUserFromChildren(parentFolderId, userIdentifier) {
        const table = document.querySelector('.folders-table');
        if (!table) return;
        
        const rows = table.querySelectorAll('tbody tr');
        let removedCount = 0;
        
        rows.forEach(row => {
            // Walk ancestor chain — removes from ALL descendants, not just direct children
            let ancestor = row.getAttribute('data-parent-id');
            let isDescendant = false;
            const visited = new Set();
            while (ancestor && !visited.has(ancestor)) {
                visited.add(ancestor);
                if (ancestor === parentFolderId) { isDescendant = true; break; }
                const ancestorRow = table.querySelector(`tr[data-folder-id="${ancestor}"]`);
                ancestor = ancestorRow ? ancestorRow.getAttribute('data-parent-id') : null;
            }
            if (!isDescendant) return;
            
            const cells = row.querySelectorAll('td');
            
            cells.forEach(cell => {
                const cellUser = cell.getAttribute('data-user');
                const isInherited = cell.getAttribute('data-is-inherited') === 'true';
                
                if (cellUser === userIdentifier && isInherited) {
                    cell.innerHTML = '';
                    cell.classList.remove('has-content');
                    cell.classList.remove('inherited-permission');
                    cell.removeAttribute('data-user');
                    cell.removeAttribute('data-display-name');
                    cell.removeAttribute('data-permission-level');
                    cell.removeAttribute('data-subject-type');
                    cell.removeAttribute('data-subject-id');
                    cell.removeAttribute('data-is-inherited');
                    cell.style.backgroundColor = '';
                    cell.style.color = '';
                    
                    removedCount++;
                }
            });
        });
    }

    /**
     * Auto-add user to child folders when added to parent folder
     */
    function addUserToChildren(parentFolderId, userIdentifier, level) {
        const table = document.querySelector('.folders-table');
        if (!table) return;
        
        // First, find the parent cell to copy subject data attributes AND get column index
        const parentRow = table.querySelector(`tr[data-folder-id="${parentFolderId}"]`);
        let parentSubjectId = null;
        let parentSubjectType = null;
        let parentColumnIndex = -1; // Track which column the user is in on parent
        
        if (parentRow) {
            const parentCells = parentRow.querySelectorAll('td');
            for (let i = currentFolderDisplayDepth; i < parentCells.length; i++) {
                const parentCell = parentCells[i];
                if (parentCell.getAttribute('data-user') === userIdentifier) {
                    parentSubjectId = parentCell.getAttribute('data-subject-id');
                    parentSubjectType = parentCell.getAttribute('data-subject-type');
                    parentColumnIndex = i; // Remember the column index
                    break;
                }
            }
        }
        
        // If we couldn't find the user in parent row, can't determine column placement
        if (parentColumnIndex === -1) {
            // console.warn(`⚠️ Could not find "${userIdentifier}" in parent row to determine column placement`);
            return;
        }
        
        const rows = table.querySelectorAll('tbody tr');
        let addedCount = 0;
        
        rows.forEach(row => {
            // Walk the data-parent-id chain upward to check if parentFolderId is an ancestor.
            // This makes inheritance work at ANY depth (not just direct children).
            let ancestor = row.getAttribute('data-parent-id');
            let isDescendant = false;
            const visited = new Set();
            let current = row;
            while (ancestor && !visited.has(ancestor)) {
                visited.add(ancestor);
                if (ancestor === parentFolderId) { isDescendant = true; break; }
                const ancestorRow = table.querySelector(`tr[data-folder-id="${ancestor}"]`);
                ancestor = ancestorRow ? ancestorRow.getAttribute('data-parent-id') : null;
            }
            if (!isDescendant) return;
            
            let cells = row.querySelectorAll('td');
            
            // Ensure child row has enough columns to match parent's column
            if (parentColumnIndex >= cells.length) {
                const columnsToAdd = parentColumnIndex - cells.length + 1;
                for (let i = 0; i < columnsToAdd; i++) {
                    const newCell = document.createElement('td');
                    row.appendChild(newCell);
                }
                cells = row.querySelectorAll('td');
            }
            
            const targetCell = cells[parentColumnIndex];
            
            // Check if this cell already has content from a different user (orphan)
            if (targetCell.classList.contains('has-content')) {
                const existingUser = targetCell.getAttribute('data-user');
                const isInherited = targetCell.getAttribute('data-is-inherited') === 'true';
                
                // If it's already an inherited copy of this same user, skip
                if (existingUser === userIdentifier && isInherited) {
                    return;
                }
                
                // If it's a different user (orphan), don't overwrite
                return;
            }
            
            // Determine display name based on current mode and subject type
            let displayName = userIdentifier;
            
            if (parentSubjectType === 'USER' && currentProjectUsersRaw) {
                const userObj = currentProjectUsersRaw.find(u => u.email === userIdentifier);
                if (userObj) {
                    displayName = currentUserDisplayMode === 'name' 
                        ? (userObj.name || userObj.email) 
                        : userObj.email;
                }
            }
            
            // Add the inherited user to the cell
            targetCell.innerHTML = `
                <span class="cell-username" title="${displayName}">${displayName}</span>
                <input type="text" class="cell-permission-level" value="${level}" maxlength="1" readonly title="Inherited from parent folder (read-only)" />
                <span class="inherited-indicator" title="Inherited from parent folder">↓</span>
            `;
            targetCell.setAttribute('data-user', userIdentifier);
            targetCell.setAttribute('data-display-name', displayName);
            targetCell.setAttribute('data-permission-level', level);
            targetCell.setAttribute('data-is-inherited', 'true');
            targetCell.classList.add('has-content');
            targetCell.classList.add('inherited-permission');
            
            if (parentSubjectId && parentSubjectType) {
                targetCell.setAttribute('data-subject-id', parentSubjectId);
                targetCell.setAttribute('data-subject-type', parentSubjectType);
            }
            
            const colors = parentSubjectType ? getSubjectColor(parentSubjectType, level) : getPermissionLevelColor(level);
            targetCell.style.backgroundColor = colors.background;
            targetCell.style.color = colors.color;
            
            addedCount++;
        });
        
        if (addedCount > 0) {
            // Ensure all rows have consistent column count
            const allRows = table.querySelectorAll('tbody tr');
            let maxColumns = 0;
            allRows.forEach(r => {
                const colCount = r.querySelectorAll('td').length;
                if (colCount > maxColumns) maxColumns = colCount;
            });
            allRows.forEach(r => {
                const currentCols = r.querySelectorAll('td').length;
                for (let i = currentCols; i < maxColumns; i++) r.appendChild(document.createElement('td'));
            });
        }
    }

    /**
     * Load existing ACC folder permissions and pre-populate table
     */
    async function loadExistingACCPermissions(projectId, hierarchy, projectUsers, accessToken, options = {}) {
        // onlyFolderIds: when set, only populate DOM rows for these folder IDs (used on lazy expand)
        const onlyFolderIds = options.onlyFolderIds || null;
        try {
            // Check if FolderPermissions module is available
            if (!window.FolderPermissions || !window.FolderPermissions.fetchAllFolderPermissions) {
                // console.warn('⚠️ FolderPermissions module not available, skipping ACC permissions load');
                updateLoadingProgress('Loading folder structure...', 98);
                return;
            }

            // log('🔐 Fetching existing folder permissions from ACC...');
            updateLoadingProgress('Loading folder structure...', 55);
            const permissionsMap = await window.FolderPermissions.fetchAllFolderPermissions(
                projectId, 
                hierarchy, 
                accessToken
            );

            // Match permissions to users in the project
            updateLoadingProgress('Loading folder structure...', 65);
            const userPermissionsMap = window.FolderPermissions.matchPermissionsToUsers(
                permissionsMap, 
                projectUsers
            );

            // Additional deduplication: ensure each folder has only unique identifiers with highest levels
            // This handles cases where ACC API returns same user multiple times
            updateLoadingProgress('Loading folder structure...', 70);
            for (const folderId in userPermissionsMap) {
                const perms = userPermissionsMap[folderId];
                
                // Debug: log all permissions with their KEYS for this folder
                const permEntries = Object.entries(perms);
                if (permEntries.length > 0) {
                    // console.group(`📁 Folder ${folderId} - ${permEntries.length} entries`);
                    permEntries.forEach(([key, p]) => {
                        // console.log(`  Key: "${key}" => Identifier: "${p.identifier}" Level: ${p.level}`);
                    });
                    // console.groupEnd();
                }
                
                const deduplicated = {};
                
                for (const [key, perm] of Object.entries(perms)) {
                    const id = perm.identifier;
                    if (!deduplicated[id] || perm.level > deduplicated[id].level) {
                        if (deduplicated[id]) {
                            // console.log(`    🔄 Replacing ${id} L${deduplicated[id].level} with L${perm.level} (higher)`);
                        }
                        deduplicated[id] = perm;
                    } else {
                        // console.log(`    ⏭️ Keeping ${id} L${deduplicated[id].level}, skipping L${perm.level} (lower)`);
                    }
                }
                
                // Only replace if deduplicated has entries  
                if (Object.keys(deduplicated).length > 0) {
                    userPermissionsMap[folderId] = deduplicated;
                    
                    const deduplicatedEntries = Object.entries(deduplicated);
                    if (deduplicatedEntries.length !== permEntries.length) {
                        // console.log(`  ✅ AFTER dedup: ${deduplicatedEntries.map(([k, p]) => `${p.identifier}:L${p.level}`).join(', ')}`);
                    }
                } else {
                    // console.warn(`  ⚠️ Deduplication resulted in empty object for folder ${folderId}!`);
                }
            }
            
            // Remove duplicate users from child folders at ANY depth.
            // Strategy: two-pass to avoid the "cascade delete" bug where clearing an
            // intermediate folder's perms in d=0 prevents d=1 from seeing them.
            //
            // Pass 1: For each folder, collect the FULL set of transitive ancestor
            //         identifiers (from ALL ancestors in the original data, before deletions).
            // Pass 2: Remove those identifiers from each folder's own direct perms.
            const transitiveAncestorIds = new Map(); // folderId -> Set<identifier>

            hierarchy.forEach(row => {
                const accumulated = new Set(); // identifiers seen in any ancestor so far
                for (let d = 0; d < currentFolderDisplayDepth; d++) {
                    const folder = row[levelKeyForDepth(d)];
                    if (!folder?.id) continue;

                    if (d > 0) {
                        // Record accumulated ancestor identifiers for this child folder.
                        // Merge with any previously recorded set (another hierarchy row
                        // may have already contributed ancestors for the same folder).
                        if (!transitiveAncestorIds.has(folder.id)) {
                            transitiveAncestorIds.set(folder.id, new Set(accumulated));
                        } else {
                            const existing = transitiveAncestorIds.get(folder.id);
                            accumulated.forEach(id => existing.add(id));
                        }
                    }

                    // Add this folder's OWN perms into the accumulator for deeper levels.
                    if (userPermissionsMap[folder.id]) {
                        Object.keys(userPermissionsMap[folder.id]).forEach(uid => accumulated.add(uid));
                    }
                }
            });

            // Pass 2: delete inherited identifiers from each child's direct perms.
            transitiveAncestorIds.forEach((ancestorIds, childId) => {
                if (!userPermissionsMap[childId]) return;
                const childPerms = userPermissionsMap[childId];
                Object.keys(childPerms).forEach(uid => {
                    if (ancestorIds.has(uid)) delete childPerms[uid];
                });
                if (Object.keys(childPerms).length === 0) delete userPermissionsMap[childId];
            });
            
            // console.log(`✅ Deduplication complete: Removed ${duplicateUsersRemoved} duplicate users, kept ${orphanUsersKept} orphan users`);

            updateLoadingProgress('Loading folder structure...', 75);
            const table = document.querySelector('.folders-table');
            if (!table) {
                // console.warn('⚠️ Table not found, cannot populate permissions');
                return;
            }

            const rows = table.querySelectorAll('tbody tr');
            let totalPermissionsLoaded = 0;
            let foldersWithPermissions = 0;
            const totalRows = rows.length;

            // Step 1: Build global subject-to-column mapping
            // Step 2: Process each row and populate with permissions
            // Use PER-ROW left-alignment (no gaps within each row)
            // For inherited permissions, maintain same column as parent
            
            const parentColumnMaps = new Map(); // parentFolderId -> Map(identifier -> columnIndex)
            // User permission columns begin right after the folder columns
            const userColStart = currentFolderDisplayDepth;
            let maxColumnsNeeded = userColStart;
            let processedRows = 0;

            // Build ancestor lookup for transitive inheritance (folderId → full hierarchy row)
            const ancestryMap = new Map();
            hierarchy.forEach(hRow => {
                for (let d = 0; d < currentFolderDisplayDepth; d++) {
                    const k = levelKeyForDepth(d);
                    if (hRow[k]?.id) ancestryMap.set(hRow[k].id, hRow);
                }
            });

            // Pre-populate parentColumnMaps from already-rendered cells.
            // Critical for lazy expand: parent rows are skipped by onlyFolderIds but their
            // column maps are needed so inherited perms land in the correct columns.
            if (onlyFolderIds) {
                rows.forEach(existingRow => {
                    const rfid = existingRow.getAttribute('data-folder-id');
                    if (!rfid || onlyFolderIds.has(rfid)) return;
                    const colMap = new Map();
                    existingRow.querySelectorAll('td').forEach((cell, idx) => {
                        if (idx >= userColStart && cell.classList.contains('has-content')) {
                            const uid = cell.getAttribute('data-user');
                            if (uid) colMap.set(uid, idx);
                        }
                    });
                    if (colMap.size > 0) parentColumnMaps.set(rfid, colMap);
                });
            }

            rows.forEach(row => {
                processedRows++;

                // Update progress every 10 rows or on last row
                if (processedRows % 10 === 0 || processedRows === totalRows) {
                    const progress = 75 + (processedRows / totalRows) * 20; // 75% to 95%
                    updateLoadingProgress('Loading folder structure...', progress);
                }

                const folderId = row.getAttribute('data-folder-id');
                const level1Id = row.getAttribute('data-level1-id');
                const level2Id = row.getAttribute('data-level2-id');

                if (!folderId) return;

                // Skip already-populated rows when called during lazy expansion
                if (onlyFolderIds && !onlyFolderIds.has(folderId)) return;

                // Determine folder type using generic depth attribute
                const folderDepth = parseInt(row.getAttribute('data-folder-depth') ?? '0');
                const isLevel2Folder = folderDepth === 0;  // depth-0 = first displayed level (parent)
                const isLevel3Folder = folderDepth > 0;    // depth>0 = child level
                
                const folderName = (row.querySelector('td:first-child')?.textContent || row.querySelector('td:nth-child(2)')?.textContent || 'Unknown').trim();

                // Build effective permissions with inheritance
                const effectivePermissions = new Map(); // identifier -> permission object
                
                if (isLevel3Folder) {
                    // LEVEL 3 FOLDERS: inherited from ALL ancestors + own orphan users
                    //
                    // Walk from ROOT (ad=0) to closest parent (ad=folderDepth-1), collecting
                    // every ancestor's deduplicated permissions into effectivePermissions.
                    // Deeper ancestors override shallower ones for the same identifier so
                    // that the nearest-ancestor level wins.
                    //
                    // This is necessary because the two-pass dedup removes a permission from
                    // an intermediate folder when it is also set on a root ancestor.  Without
                    // scanning all ancestors we would miss, e.g., Bau AG on Folder 1 when
                    // sub folder 1.2 only keeps its own non-duplicated "s" permission.
                    const ancestorHRow = ancestryMap.get(folderId);
                    if (ancestorHRow) {
                        for (let ad = 0; ad <= folderDepth - 1; ad++) {
                            const akey = levelKeyForDepth(ad);
                            const aid = ancestorHRow[akey]?.id;
                            if (aid && userPermissionsMap[aid]) {
                                Object.values(userPermissionsMap[aid]).forEach(perm => {
                                    // Deeper ancestor overrides shallower for same identifier
                                    effectivePermissions.set(perm.identifier, {
                                        ...perm,
                                        isInherited: true,
                                        inheritedFrom: aid
                                    });
                                });
                            }
                        }
                    }

                    // Second: Add orphan users (unique to this folder, not in any ancestor)
                    if (userPermissionsMap[folderId]) {
                        const ownPerms = Object.values(userPermissionsMap[folderId]);
                        ownPerms.forEach(perm => {
                            // Only add if not already covered by inheritance
                            if (!effectivePermissions.has(perm.identifier)) {
                                effectivePermissions.set(perm.identifier, {
                                    ...perm,
                                    isInherited: false,
                                    inheritedFrom: null
                                });
                            }
                        });
                    }
                } else if (isLevel2Folder) {
                    // LEVEL 2 FOLDERS: Use their own direct permissions (editable)
                    // console.log(`👨 PARENT "${folderName}" (${folderId}) using own permissions`);
                    
                    if (userPermissionsMap[folderId]) {
                        const ownPerms = Object.values(userPermissionsMap[folderId]);
                        // console.log(`  ✅ Has ${ownPerms.length} direct permissions:`, ownPerms.map(p => `${p.identifier}:L${p.level}`).join(', '));
                        
                        ownPerms.forEach(perm => {
                            effectivePermissions.set(perm.identifier, {
                                ...perm,
                                isInherited: false,
                                inheritedFrom: null
                            });
                        });
                    } else {
                        // console.warn(`  ❌ Own folder NOT FOUND in userPermissionsMap!`);
                    }
                }
                
                const permissionEntries = Array.from(effectivePermissions.values());
                
                // Sort permissions alphabetically by display name (case-insensitive)
                permissionEntries.sort((a, b) => {
                    const nameA = (a.displayName || '').toLowerCase();
                    const nameB = (b.displayName || '').toLowerCase();
                    return nameA.localeCompare(nameB);
                });
                
                if (permissionEntries.length === 0) return;

                foldersWithPermissions++;
                
                // Log inheritance for debugging
                const inheritedCount = permissionEntries.filter(p => p.isInherited).length;
                const directCount = permissionEntries.filter(p => !p.isInherited).length;
                if (inheritedCount > 0) {
                    // log(`📁 "${folderName}": ${directCount} direct, ${inheritedCount} inherited permissions`);
                }

                // PER-ROW LEFT-ALIGNMENT with inheritance column consistency
                const cells = row.querySelectorAll('td');
                let currentColumnIndex = userColStart; // Start after folder + expand-placeholder columns
                
                // For PARENT folders: place users left-aligned and save column map for children
                if (isLevel2Folder) {
                    const columnMap = new Map();
                    
                    permissionEntries.forEach(perm => {
                        // Ensure enough cells exist
                        if (currentColumnIndex >= cells.length) {
                            const newCell = document.createElement('td');
                            row.appendChild(newCell);
                        }
                        
                        const cell = row.querySelectorAll('td')[currentColumnIndex];
                        
                        // Save column position for this identifier
                        columnMap.set(perm.identifier, currentColumnIndex);
                        
                        // Populate cell
                        cell.innerHTML = `
                            <span class="cell-username" title="${perm.displayName}">${perm.displayName}</span>
                            <input type="text" class="cell-permission-level" value="${perm.level}" maxlength="1" />
                        `;
                        
                        cell.setAttribute('data-user', perm.identifier);
                        cell.setAttribute('data-display-name', perm.displayName);
                        cell.setAttribute('data-permission-level', perm.level);
                        cell.setAttribute('data-subject-type', perm.type);
                        cell.setAttribute('data-subject-id', perm.subjectId);
                        cell.setAttribute('data-is-inherited', 'false');
                        cell.classList.add('has-content');

                        const colors = getSubjectColor(perm.type, perm.level);
                        cell.style.backgroundColor = colors.background;
                        cell.style.color = colors.color;

                        // Setup event listeners for editable inputs
                        const permissionInput = cell.querySelector('.cell-permission-level');
                        if (permissionInput) {
                            setupPermissionTooltip(permissionInput);
                            
                            permissionInput.addEventListener('keydown', (event) => {
                                if (handlePermissionArrowKeys(event, permissionInput, (level) => {
                                    cell.setAttribute('data-permission-level', level);
                                    const subjectType = cell.getAttribute('data-subject-type');
                                    const colors = getSubjectColor(subjectType, level);
                                    cell.style.backgroundColor = colors.background;
                                    cell.style.color = colors.color;
                                    
                                    updateInheritedPermissions(folderId, perm.identifier, level.toString());
                                })) {
                                    return;
                                }
                            });
                            
                            permissionInput.addEventListener('input', (event) => {
                                const value = event.target.value;
                                if (value && (value < '1' || value > '6' || isNaN(value))) {
                                    event.target.value = value.slice(0, -1);
                                } else if (value && value >= '1' && value <= '6') {
                                    const subjectType = cell.getAttribute('data-subject-type');
                                    const colors = getSubjectColor(subjectType, value);
                                    cell.style.backgroundColor = colors.background;
                                    cell.style.color = colors.color;
                                    updateInheritedPermissions(folderId, perm.identifier, value);
                                }
                            });
                            
                            permissionInput.addEventListener('change', (event) => {
                                const level = event.target.value || '6';
                                cell.setAttribute('data-permission-level', level);
                                const subjectType = cell.getAttribute('data-subject-type');
                                const colors = getSubjectColor(subjectType, level);
                                cell.style.backgroundColor = colors.background;
                                cell.style.color = colors.color;
                                
                                updateInheritedPermissions(folderId, perm.identifier, level);
                            });
                        }
                        
                        currentColumnIndex++;
                        totalPermissionsLoaded++;
                    });
                    
                    // Save column map for this parent
                    parentColumnMaps.set(folderId, columnMap);
                    
                    // Track max columns
                    if (currentColumnIndex > maxColumnsNeeded) {
                        maxColumnsNeeded = currentColumnIndex;
                    }
                }
                // For CHILD folders: place inherited in same columns, orphans in remaining
                else if (isLevel3Folder && level2Id) {
                    // Use direct-parent map; fall back to root (depth-0) ancestor map.
                    // The root map is always pre-populated (initial load or DOM scan above).
                    const rootFolderId = ancestryMap.get(folderId)?.[levelKeyForDepth(0)]?.id;
                    const parentColumnMap = parentColumnMaps.get(level2Id)
                        || (rootFolderId ? parentColumnMaps.get(rootFolderId) : null);
                    
                    // Separate inherited and orphan permissions
                    const inheritedPerms = permissionEntries.filter(p => p.isInherited);
                    const orphanPerms = permissionEntries.filter(p => !p.isInherited);
                    
                    // First: Place inherited users in SAME columns as ancestor
                    inheritedPerms.forEach(perm => {
                        let targetColumn;
                        
                        // Use ancestor column map for alignment; safe fallback increments
                        // to avoid multiple perms colliding on the same column.
                        if (parentColumnMap && parentColumnMap.has(perm.identifier)) {
                            targetColumn = parentColumnMap.get(perm.identifier);
                        } else {
                            targetColumn = currentColumnIndex++;
                        }
                        
                        // Ensure enough cells exist
                        if (targetColumn >= cells.length) {
                            const cellsToAdd = targetColumn - cells.length + 1;
                            for (let i = 0; i < cellsToAdd; i++) {
                                const newCell = document.createElement('td');
                                row.appendChild(newCell);
                            }
                        }
                        
                        const cell = row.querySelectorAll('td')[targetColumn];
                        
                        // Populate as inherited (read-only)
                        cell.innerHTML = `
                            <span class="cell-username" title="${perm.displayName}">${perm.displayName}</span>
                            <input type="text" class="cell-permission-level" value="${perm.level}" maxlength="1" readonly title="Inherited from parent folder (read-only)" />
                            <span class="inherited-indicator" title="Inherited from parent folder">↓</span>
                        `;
                        
                        cell.setAttribute('data-user', perm.identifier);
                        cell.setAttribute('data-display-name', perm.displayName);
                        cell.setAttribute('data-permission-level', perm.level);
                        cell.setAttribute('data-subject-type', perm.type);
                        cell.setAttribute('data-subject-id', perm.subjectId);
                        cell.setAttribute('data-is-inherited', 'true');
                        cell.classList.add('has-content');
                        cell.classList.add('inherited-permission');

                        const colors = getSubjectColor(perm.type, perm.level);
                        cell.style.backgroundColor = colors.background;
                        cell.style.color = colors.color;
                        
                        totalPermissionsLoaded++;
                    });
                    
                    // Second: Place orphan users in remaining empty cells (left-aligned)
                    orphanPerms.forEach(perm => {
                        const allCells = row.querySelectorAll('td');
                        
                        // Find first empty cell starting from userColStart (skip folder columns)
                        let targetCell = null;
                        for (let i = userColStart; i < allCells.length; i++) {
                            if (!allCells[i].classList.contains('has-content')) {
                                targetCell = allCells[i];
                                currentColumnIndex = i;
                                break;
                            }
                        }
                        
                        // If no empty cell, create new one
                        if (!targetCell) {
                            currentColumnIndex = allCells.length;
                            targetCell = document.createElement('td');
                            row.appendChild(targetCell);
                        }
                        
                        // Populate as orphan (editable)
                        targetCell.innerHTML = `
                            <span class="cell-username" title="${perm.displayName}">${perm.displayName}</span>
                            <input type="text" class="cell-permission-level" value="${perm.level}" maxlength="1" />
                        `;
                        
                        targetCell.setAttribute('data-user', perm.identifier);
                        targetCell.setAttribute('data-display-name', perm.displayName);
                        targetCell.setAttribute('data-permission-level', perm.level);
                        targetCell.setAttribute('data-subject-type', perm.type);
                        targetCell.setAttribute('data-subject-id', perm.subjectId);
                        targetCell.setAttribute('data-is-inherited', 'false');
                        targetCell.classList.add('has-content');

                        const colors = getSubjectColor(perm.type, perm.level);
                        targetCell.style.backgroundColor = colors.background;
                        targetCell.style.color = colors.color;
                        
                        // Setup event listeners for orphan (editable)
                        const permissionInput = targetCell.querySelector('.cell-permission-level');
                        if (permissionInput) {
                            setupPermissionTooltip(permissionInput);
                            
                            permissionInput.addEventListener('keydown', (event) => {
                                if (handlePermissionArrowKeys(event, permissionInput, (level) => {
                                    targetCell.setAttribute('data-permission-level', level);
                                    const subjectType = targetCell.getAttribute('data-subject-type');
                                    const colors = getSubjectColor(subjectType, level);
                                    targetCell.style.backgroundColor = colors.background;
                                    targetCell.style.color = colors.color;
                                })) {
                                    return;
                                }
                            });
                            
                            permissionInput.addEventListener('input', (event) => {
                                const value = event.target.value;
                                if (value && (value < '1' || value > '6' || isNaN(value))) {
                                    event.target.value = value.slice(0, -1);
                                } else if (value && value >= '1' && value <= '6') {
                                    const subjectType = targetCell.getAttribute('data-subject-type');
                                    const colors = getSubjectColor(subjectType, value);
                                    targetCell.style.backgroundColor = colors.background;
                                    targetCell.style.color = colors.color;
                                }
                            });
                            
                            permissionInput.addEventListener('change', (event) => {
                                const level = event.target.value || '6';
                                targetCell.setAttribute('data-permission-level', level);
                                const subjectType = targetCell.getAttribute('data-subject-type');
                                const colors = getSubjectColor(subjectType, level);
                                targetCell.style.backgroundColor = colors.background;
                                targetCell.style.color = colors.color;
                            });
                        }
                        
                        totalPermissionsLoaded++;
                    });
                    
                    // Track max columns
                    const finalCells = row.querySelectorAll('td').length;
                    if (finalCells > maxColumnsNeeded) {
                        maxColumnsNeeded = finalCells;
                    }

                    // Save column map for this row so deeper children can align to it
                    const myColMap = new Map();
                    row.querySelectorAll('td').forEach((cell, idx) => {
                        if (idx >= userColStart && cell.classList.contains('has-content')) {
                            const uid = cell.getAttribute('data-user');
                            if (uid) myColMap.set(uid, idx);
                        }
                    });
                    if (myColMap.size > 0) parentColumnMaps.set(folderId, myColMap);
                }
            });
            
            // Ensure all rows have same number of columns
            const allRows = table.querySelectorAll('tbody tr');
            allRows.forEach(tableRow => {
                const currentCells = tableRow.querySelectorAll('td').length;
                if (currentCells < maxColumnsNeeded) {
                    for (let i = currentCells; i < maxColumnsNeeded; i++) {
                        const newCell = document.createElement('td');
                        tableRow.appendChild(newCell);
                    }
                }
            });
            additionalColumnsCount = maxColumnsNeeded - currentFolderDisplayDepth;

            // Re-setup drag and drop for new cells
            setupTableDragAndDrop();
            
            // Attach arrow key navigation to all existing permission inputs
            attachArrowKeyNavigationToAllInputs();

            updateLoadingProgress('Loading folder structure...', 95);

            if (totalPermissionsLoaded > 0) {
                // log(`✅ Pre-populated table with ${totalPermissionsLoaded} permissions from ${foldersWithPermissions} folders`);
                // log(`📊 Total columns: ${additionalColumnsCount + 2} (${additionalColumnsCount} for users + 2 for folder names)`);
                
                // Count inherited vs direct permissions
                const stats = Object.values(userPermissionsMap)
                    .flatMap(folder => Object.values(folder))
                    .reduce((acc, perm) => {
                        acc[perm.type] = (acc[perm.type] || 0) + 1;
                        if (perm.isInherited) {
                            acc.inherited = (acc.inherited || 0) + 1;
                        } else {
                            acc.direct = (acc.direct || 0) + 1;
                        }
                        return acc;
                    }, {});
                    
                // log(`📋 Breakdown:`, stats);
                // log(`🔗 Inherited: ${stats.inherited || 0} | Direct: ${stats.direct || 0}`);
            } else {
                // log('ℹ️ No existing ACC permissions found to pre-populate');
            }

            updateLoadingProgress('Loading folder structure...', 98);

        } catch (error) {
            // console.error('❌ Error loading existing ACC permissions:', error);
            // log('⚠️ Could not load existing ACC permissions, table will be empty');
            // Ensure progress reaches 98% even on error
            updateLoadingProgress('Loading folder structure...', 98);
        }
    }

    /**
     * DOM-based propagation pass: any subfolder row that still has no user-permission
     * cells after the ACC load step inherits them from its nearest ancestor row that
     * DOES have cells.  Uses the data-parent-id chain for ancestry lookup.
     *
     * Called after loadExistingACCPermissions during lazy expansion so that rows
     * at depth ≥ 2 that were skipped by onlyFolderIds (or left empty by any earlier
     * bug) get their inherited content filled in.
     */
    function propagatePermissionsToEmptyRows() {
        const table = document.querySelector('.folders-table');
        if (!table) return;
        const userColStart = currentFolderDisplayDepth;

        // Build a quick lookup: folderId → DOM row
        const rowById = new Map();
        table.querySelectorAll('tbody tr').forEach(r => {
            const id = r.getAttribute('data-folder-id');
            if (id) rowById.set(id, r);
        });

        table.querySelectorAll('tbody tr').forEach(row => {
            const folderDepth = parseInt(row.getAttribute('data-folder-depth') ?? '0');
            if (folderDepth === 0) return; // root-level folders manage their own perms

            const cells = row.querySelectorAll('td');
            const hasContent = [...cells].slice(userColStart).some(c => c.classList.contains('has-content'));
            if (hasContent) return; // already populated – leave it alone

            // Collect ancestor rows from root to direct parent (breadth-first via parent chain).
            // Build the chain from closest parent up to root, then reverse so root is first.
            const ancestorChain = [];
            let parentId = row.getAttribute('data-parent-id');
            while (parentId) {
                const candidate = rowById.get(parentId);
                if (!candidate) break;
                ancestorChain.unshift(candidate); // prepend so root is at index 0
                parentId = candidate.getAttribute('data-parent-id');
            }
            if (ancestorChain.length === 0) return;

            // Merge user cells from all ancestors, root first so nearest ancestor wins.
            // colIndex → {user, displayName, level, subjectType, subjectId}
            const mergedCells = new Map();
            ancestorChain.forEach(aRow => {
                aRow.querySelectorAll('td').forEach((cell, idx) => {
                    if (idx >= userColStart && cell.classList.contains('has-content')) {
                        const uid = cell.getAttribute('data-user');
                        if (uid) mergedCells.set(idx, {
                            user:        uid,
                            displayName: cell.getAttribute('data-display-name') || uid,
                            level:       cell.getAttribute('data-permission-level') || '1',
                            subjectType: cell.getAttribute('data-subject-type') || '',
                            subjectId:   cell.getAttribute('data-subject-id') || ''
                        });
                    }
                });
            });
            if (mergedCells.size === 0) return;

            mergedCells.forEach((data, i) => {
                // Ensure target row has enough cells
                while (row.querySelectorAll('td').length <= i) {
                    row.appendChild(document.createElement('td'));
                }
                const tgt = row.querySelectorAll('td')[i];
                tgt.innerHTML =
                    `<span class="cell-username" title="${data.displayName}">${data.displayName}</span>` +
                    `<input type="text" class="cell-permission-level" value="${data.level}" maxlength="1" readonly title="Inherited from parent folder (read-only)" />` +
                    `<span class="inherited-indicator" title="Inherited from parent folder">↓</span>`;
                tgt.setAttribute('data-user', data.user);
                tgt.setAttribute('data-display-name', data.displayName);
                tgt.setAttribute('data-permission-level', data.level);
                tgt.setAttribute('data-subject-type', data.subjectType);
                tgt.setAttribute('data-subject-id', data.subjectId);
                tgt.setAttribute('data-is-inherited', 'true');
                tgt.classList.add('has-content', 'inherited-permission');
                const colors = getSubjectColor(data.subjectType, data.level);
                tgt.style.backgroundColor = colors.background;
                tgt.style.color = colors.color;
                const inp = tgt.querySelector('.cell-permission-level');
                if (inp) setupPermissionTooltip(inp);
            });

            // Update maxColumnsNeeded so new columns get headers
            const finalLen = row.querySelectorAll('td').length;
            if (finalLen > currentFolderDisplayDepth + additionalColumnsCount) {
                additionalColumnsCount = finalLen - currentFolderDisplayDepth;
            }
        });
    }

    /**
     * Load folder permissions from JSON file
     */
    async function loadFolderPermissions(projectName) {
        try {
            if (!currentProjectData || !currentProjectData.hubId || !currentProjectData.projectId) {
                // console.error('Missing hubId or projectId in currentProjectData');
                return;
            }
            
            // Prepare headers with auth token
            const headers = {};
            const token = window.getAuthToken && window.getAuthToken();
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }
            
            const response = await fetch(`${window.location.origin}/load-folder-permissions/${encodeURIComponent(currentProjectData.hubId)}/${encodeURIComponent(currentProjectData.projectId)}`, {
                headers: headers
            });
            const result = await response.json();
            
            if (!result.success || !result.exists || !result.data) {
                // log('📂 No saved folder permissions found for this project');
                return;
            }

            const data = result.data;
            // log(`📂 Loading saved folder permissions for: ${projectName}`);

            // Check for users that no longer exist in the project
            const deletedUsers = await checkForDeletedUsers(data);
            if (deletedUsers.length > 0) {
                const shouldDelete = await showDeletedUsersWarning(deletedUsers);
                if (shouldDelete) {
                    // Remove deleted users from data before loading
                    removeDeletedUsersFromData(data, deletedUsers);
                }
                // If user chose "Continue", we proceed with the data as-is
            }

            // Populate the table with saved data
            const table = document.querySelector('.folders-table');
            if (!table) return;

            const rows = table.querySelectorAll('tbody tr');

            // Create a map of folderId to permissions
            const permissionsMap = {};
            data.folders.forEach(folder => {
                if (folder.folderId) {
                    permissionsMap[folder.folderId] = folder.permissions;
                }
            });

            // Apply permissions to table cells
            rows.forEach(row => {
                const folderId = row.getAttribute('data-folder-id');
                if (!folderId || !permissionsMap[folderId]) return;

                const permissions = permissionsMap[folderId];
                const cells = row.querySelectorAll('td');

                // Apply permissions to cells (starting from column 3, which is index 2)
                Object.keys(permissions).forEach(columnKey => {
                    const columnIndex = parseInt(columnKey.replace('column', '')) + 1; // column1 -> index 2
                    if (cells[columnIndex]) {
                        const permissionData = permissions[columnKey];
                        
                        // Check if it's new format (object with user and level) or old format (string)
                        if (typeof permissionData === 'object' && permissionData.user && permissionData.level) {
                            // New format with permission level
                            cells[columnIndex].innerHTML = `
                                <span class="cell-username" title="${permissionData.user}">${permissionData.user}</span>
                                <input type="text" class="cell-permission-level" value="${permissionData.level}" maxlength="1" />
                            `;
                            cells[columnIndex].setAttribute('data-user', permissionData.user);
                            cells[columnIndex].setAttribute('data-permission-level', permissionData.level);
                            
                            // Apply background and text color with gradient (check for subject type)
                            const subjectType = cells[columnIndex].getAttribute('data-subject-type');
                            const colors = subjectType ? 
                                getSubjectColor(subjectType, permissionData.level) : 
                                getPermissionLevelColor(permissionData.level);
                            cells[columnIndex].style.backgroundColor = colors.background;
                            cells[columnIndex].style.color = colors.color;
                            
                            // Setup validation for loaded input
                            const permissionInput = cells[columnIndex].querySelector('.cell-permission-level');
                            if (permissionInput) {
                                // Add tooltip on hover
                                setupPermissionTooltip(permissionInput);
                                
                                permissionInput.addEventListener('keydown', (event) => {
                                    // Handle arrow key navigation (Left/Right to decrease/increase level)
                                    if (handlePermissionArrowKeys(event, permissionInput, (level) => {
                                        cells[columnIndex].setAttribute('data-permission-level', level);
                                        const subjectType = cells[columnIndex].getAttribute('data-subject-type');
                                        const colors = subjectType ? 
                                            getSubjectColor(subjectType, level) : 
                                            getPermissionLevelColor(level);
                                        cells[columnIndex].style.backgroundColor = colors.background;
                                        cells[columnIndex].style.color = colors.color;
                                    })) {
                                        return; // Arrow key was handled
                                    }
                                });
                                
                                permissionInput.addEventListener('input', (event) => {
                                    const value = event.target.value;
                                    if (value && (value < '1' || value > '6' || isNaN(value))) {
                                        event.target.value = value.slice(0, -1);
                                    } else if (value && value >= '1' && value <= '6') {
                                        const subjectType = cells[columnIndex].getAttribute('data-subject-type');
                                        const colors = subjectType ? 
                                            getSubjectColor(subjectType, value) : 
                                            getPermissionLevelColor(value);
                                        cells[columnIndex].style.backgroundColor = colors.background;
                                        cells[columnIndex].style.color = colors.color;
                                    }
                                });
                                
                                permissionInput.addEventListener('change', (event) => {
                                    const level = event.target.value || '6';
                                    cells[columnIndex].setAttribute('data-permission-level', level);
                                    const subjectType = cells[columnIndex].getAttribute('data-subject-type');
                                    const colors = subjectType ? 
                                        getSubjectColor(subjectType, level) : 
                                        getPermissionLevelColor(level);
                                    cells[columnIndex].style.backgroundColor = colors.background;
                                    cells[columnIndex].style.color = colors.color;
                                });
                            }
                        } else {
                            // Old format (backward compatibility)
                            cells[columnIndex].textContent = permissionData;
                        }
                        cells[columnIndex].classList.add('has-content');
                    }
                });
            });

            // Re-attach arrow key navigation to all inputs after loading
            attachArrowKeyNavigationToAllInputs();

            // log(`✅ Loaded folder permissions from ${data.projectName}_folder_permissions.json`);
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

        // log(`🔍 Search for "${searchTerm}": ${matchCount} matches found`);
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
                        <button id="addColumnsBtn" class="add-columns-btn">Add Columns</button>
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
                                <h5 style="margin: 0 0 10px 0; color: #28a745;">✅ Sync Complete!</h5>
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

                .search-highlight {
                    background-color: #ff4444 !important;
                    color: white !important;
                    box-shadow: 0 0 8px rgba(255, 68, 68, 0.6) !important;
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
                    width: 320px;
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
                    /* Folder name: auto-size to content, cap at 250px, wrap if longer */
                    max-width: 250px;
                    min-width: 60px;
                    white-space: normal;
                    word-wrap: break-word;
                    overflow-wrap: break-word;
                    /* Chamfered (rounded) corners to give a folder-tab feel */
                    border-radius: 6px;
                    border: 1px solid #b0bec5 !important;
                    background-color: #f0f7ff;
                    font-weight: 500;
                    padding-left: 14px;
                }

                .folders-table td.folder-col-cell {
                    /* Empty indentation cells — no borders, fully transparent */
                    min-width: 30px;
                    border: none !important;
                    background-color: transparent !important;
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
        const addColumnsBtn = document.getElementById('addColumnsBtn');
        const searchInput = document.getElementById('userSearchInput');
        // const saveBtn = document.getElementById('saveFolderPermissionsBtn'); // Removed - no longer saving to Firebase
        const syncBtn = document.getElementById('syncToACCBtn');

        closeBtn.addEventListener('click', () => {
            closeFoldersModal();
        });

        cleanTableBtn.addEventListener('click', () => {
            cleanTable();
        });

        addColumnsBtn.addEventListener('click', () => {
            addColumns();
        });

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


