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
            barEl.textContent = `${Math.round(percent)}%`;
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
        console.log('📁 Folders Permissions module initialized');
    };

    /**
     * Show the folders management modal for a project
     */
    window.showFoldersModal = async function(projectId, projectName, hubId, accessToken) {
        console.log('📁 Opening folders modal for project:', projectName);
        console.log('📁 Project ID:', projectId);
        console.log('📁 Hub ID:', hubId);

        // Store current project data
        currentProjectData = {
            projectId,
            projectName,
            hubId,
            accessToken
        };

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
        loadingMessage.style.display = 'block';
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
            
            // Try to load saved folder permissions
            await loadFolderPermissions(projectName);
            
            loadingMessage.style.display = 'none';
            tableContainer.style.display = 'block';
            userListContainer.style.display = 'block';
        } catch (error) {
            console.error('❌ Error loading folders:', error);
            loadingMessage.style.display = 'none';
            errorMessage.textContent = `Error loading folders: ${error.message}`;
            errorMessage.style.display = 'block';
        }
    };

    /**
     * Fetch complete folder hierarchy (3 levels) with parallel API calls
     */
    async function fetchFolderHierarchy(hubId, projectId, accessToken) {
        console.log('📂 Fetching folder hierarchy...');
        
        // Show progress modal
        showLoadingProgress('Loading folder structure...', 0);
        
        // Step 1: Get top-level folders
        const topFolders = await fetchTopFolders(hubId, projectId, accessToken);
        console.log(`📂 Found ${topFolders.length} top-level folders`);
        updateLoadingProgress('Fetching level 2 folders...', 10);

        const hierarchy = [];
        let totalFolders = topFolders.length;
        let processedFolders = 0;

        // Step 2: Fetch ALL level 2 folders in PARALLEL
        const level2Promises = topFolders.map(async (level1Folder) => {
            const level2Folders = await fetchFolderContents(projectId, level1Folder.id, accessToken);
            console.log(`📂 Folder "${level1Folder.name}" has ${level2Folders.length} children`);
            
            processedFolders++;
            const progress = 10 + (processedFolders / totalFolders) * 40; // 10% to 50%
            updateLoadingProgress(`Loading folders: ${processedFolders}/${totalFolders}`, progress);
            
            return { level1Folder, level2Folders };
        });

        const level2Results = await Promise.all(level2Promises);
        updateLoadingProgress('Fetching level 3 folders...', 50);

        // Step 3: Fetch ALL level 3 folders in PARALLEL
        const level3Promises = [];
        for (const { level1Folder, level2Folders } of level2Results) {
            if (level2Folders.length === 0) {
                // No children, just add the level 1 folder
                hierarchy.push({
                    level1: level1Folder,
                    level2: null,
                    level3: null
                });
            } else {
                for (const level2Folder of level2Folders) {
                    level3Promises.push(
                        fetchFolderContents(projectId, level2Folder.id, accessToken)
                            .then(level3Folders => ({
                                level1Folder,
                                level2Folder,
                                level3Folders
                            }))
                    );
                }
            }
        }

        totalFolders = level3Promises.length;
        processedFolders = 0;

        // Process level 3 results as they come in
        const level3Results = await Promise.all(
            level3Promises.map(async (promise) => {
                const result = await promise;
                processedFolders++;
                const progress = 50 + (processedFolders / Math.max(totalFolders, 1)) * 40; // 50% to 90%
                updateLoadingProgress(`Loading subfolders: ${processedFolders}/${totalFolders}`, progress);
                return result;
            })
        );

        updateLoadingProgress('Building hierarchy...', 90);

        // Build final hierarchy
        for (const { level1Folder, level2Folder, level3Folders } of level3Results) {
            console.log(`📂 Folder "${level2Folder.name}" has ${level3Folders.length} children`);
            
            if (level3Folders.length === 0) {
                hierarchy.push({
                    level1: level1Folder,
                    level2: level2Folder,
                    level3: null
                });
            } else {
                for (const level3Folder of level3Folders) {
                    hierarchy.push({
                        level1: level1Folder,
                        level2: level2Folder,
                        level3: level3Folder
                    });
                }
            }
        }

        updateLoadingProgress('Complete!', 100);
        console.log(`✅ Complete hierarchy built: ${hierarchy.length} rows`);
        
        // Hide progress modal after a brief delay
        setTimeout(() => hideLoadingProgress(), 500);
        
        return hierarchy;
    }

    /**
     * Fetch top-level folders using Project API
     */
    async function fetchTopFolders(hubId, projectId, accessToken) {
        // Ensure project ID has "b." prefix for Data Management API
        const formattedProjectId = projectId.startsWith('b.') ? projectId : `b.${projectId}`;
        const url = `https://developer.api.autodesk.com/project/v1/hubs/${hubId}/projects/${formattedProjectId}/topFolders`;
        
        console.log('📡 Fetching top folders from:', url);

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
        
        console.log('📡 Fetching folder contents from:', url);

        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            console.warn(`⚠️ Failed to fetch contents for folder ${folderId}: ${response.status}`);
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
        console.log('👥 Fetching project users...');
        
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
                console.log('Sample API user response:', usersData.results[0]);
                console.log('Available keys:', Object.keys(usersData.results[0]));
                console.log('Role field check:', {
                    default_role: usersData.results[0].default_role,
                    role: usersData.results[0].role,
                    role_name: usersData.results[0].role_name,
                    roleName: usersData.results[0].roleName
                });
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
                console.log('User without role:', user);
            }
            
            return userData;
        });
        
        console.log(`✅ Fetched ${displayUsers.length} project users`);
        console.log('Sample display user:', displayUsers[0]);
        console.log('Sample raw user:', rawUsers[0]);
        
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
     * Display folder hierarchy in table
     */
    function displayFolderHierarchy(hierarchy) {
        const tableContainer = document.getElementById('foldersTableContainer');
        
        // Group hierarchy by Level 2 folders
        const groupedByLevel2 = {};
        
        hierarchy.forEach(row => {
            const level1Name = row.level1 ? row.level1.name : '';
            const level2Name = row.level2 ? row.level2.name : '';
            const level2Id = row.level2 ? row.level2.id : '';
            const level3Name = row.level3 ? row.level3.name : '';
            const level3Id = row.level3 ? row.level3.id : '';
            
            if (level2Name) {
                // Use level2Id as key to group
                if (!groupedByLevel2[level2Id]) {
                    groupedByLevel2[level2Id] = {
                        level1Name: level1Name,
                        level2Name: level2Name,
                        level2Id: level2Id,
                        level3Folders: []
                    };
                }
                
                // Add level 3 folder if exists
                if (level3Name) {
                    groupedByLevel2[level2Id].level3Folders.push({
                        name: level3Name,
                        id: level3Id
                    });
                }
            }
        });
        
        let tableHTML = `
            <table class="folders-table">
                <tbody>
        `;

        // Sort Level 2 folders naturally and display grouped data
        const sortedGroups = Object.values(groupedByLevel2).sort((a, b) => 
            naturalSort(a.level2Name, b.level2Name)
        );
        
        sortedGroups.forEach(group => {
            // First row: Level 2 folder name
            tableHTML += `
                <tr data-folder-id="${group.level2Id}" data-level1="${group.level1Name}">
                    <td>${group.level2Name}</td>
                    <td></td>`;
            
            // Add additional columns
            for (let i = 0; i < additionalColumnsCount; i++) {
                tableHTML += `<td></td>`;
            }
            
            tableHTML += `</tr>`;
            
            // Sort Level 3 folders naturally
            const sortedLevel3 = group.level3Folders.sort((a, b) => 
                naturalSort(a.name, b.name)
            );
            
            // Following rows: Level 3 folders (one per row)
            sortedLevel3.forEach(level3 => {
                tableHTML += `
                    <tr data-folder-id="${level3.id}" data-level1="${group.level1Name}" data-level2="${group.level2Name}">
                        <td></td>
                        <td>${level3.name}</td>`;
                
                // Add additional columns
                for (let i = 0; i < additionalColumnsCount; i++) {
                    tableHTML += `<td></td>`;
                }
                
                tableHTML += `</tr>`;
            });
        });

        tableHTML += `
                </tbody>
            </table>
        `;

        tableContainer.innerHTML = tableHTML;
        
        // Setup drag-and-drop for table cells
        setupTableDragAndDrop();
        
        // Setup zoom functionality
        setupTableZoom();
    }

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
     * Setup drag-and-drop functionality for table cells
     */
    function setupTableDragAndDrop() {
        const table = document.querySelector('.folders-table');
        if (!table) return;

        // Get all table cells (td elements)
        const cells = table.querySelectorAll('td');
        
        cells.forEach((cell, index) => {
            const cellIndex = Array.from(cell.parentElement.children).indexOf(cell);
            
            // Skip first two columns (Level 2 and Level 3 folder names)
            if (cellIndex < 2) {
                return;
            }
            
            // Make cells valid drop targets
            cell.addEventListener('dragover', (e) => {
                e.preventDefault();
                cell.classList.add('drag-over');
            });
            
            cell.addEventListener('dragleave', () => {
                cell.classList.remove('drag-over');
            });
            
            cell.addEventListener('drop', (e) => {
                e.preventDefault();
                cell.classList.remove('drag-over');
                
                const userName = e.dataTransfer.getData('text/plain');
                if (userName) {
                    // Create cell content with user name and editable permission level
                    const defaultLevel = '1';
                    cell.innerHTML = `
                        <span class="cell-username">${userName}</span>
                        <input type="text" class="cell-permission-level" value="${defaultLevel}" maxlength="1" />
                    `;
                    cell.setAttribute('data-user', userName);
                    cell.classList.add('has-content');
                    
                    // Apply background and text color based on permission level
                    const colors = getPermissionLevelColor(defaultLevel);
                    cell.style.backgroundColor = colors.background;
                    cell.style.color = colors.color;
                    
                    // Setup permission level input validation
                    const permissionInput = cell.querySelector('.cell-permission-level');
                    if (permissionInput) {
                        permissionInput.addEventListener('input', (event) => {
                            const value = event.target.value;
                            // Only allow numbers 1-6
                            if (value && (value < '1' || value > '6' || isNaN(value))) {
                                event.target.value = value.slice(0, -1); // Remove last character
                            }
                        });
                        
                        permissionInput.addEventListener('keydown', (event) => {
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
                            cell.setAttribute('data-permission-level', level);
                            const colors = getPermissionLevelColor(level);
                            cell.style.backgroundColor = colors.background;
                            cell.style.color = colors.color;
                        });
                        
                        permissionInput.addEventListener('input', (event) => {
                            const level = event.target.value;
                            if (level && level >= '1' && level <= '6') {
                                const colors = getPermissionLevelColor(level);
                                cell.style.backgroundColor = colors.background;
                                cell.style.color = colors.color;
                            }
                        });
                        
                        // Set initial data attribute
                        cell.setAttribute('data-permission-level', '6');
                    }
                }
            });
            
            // Add click handler for selection
            cell.addEventListener('click', (e) => {
                handleCellSelection(cell, e.shiftKey);
            });
        });
        
        // Add keyboard handler for delete
        document.addEventListener('keydown', handleDeleteKey);
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
                
                console.log(`🔍 Table zoom: ${Math.round(currentZoom * 100)}%`);
            }
        }, { passive: false });
    }

    // Track selected cells
    let selectedCells = [];
    let lastSelectedCell = null;
    let copiedCells = []; // Store copied cell data

    /**
     * Handle cell selection with shift key support
     */
    function handleCellSelection(cell, shiftPressed) {
        const cellIndex = Array.from(cell.parentElement.children).indexOf(cell);
        
        // Skip first two columns
        if (cellIndex < 2) {
            return;
        }

        if (!shiftPressed) {
            // Clear previous selections
            selectedCells.forEach(c => c.classList.remove('selected'));
            selectedCells = [];
            
            // Select this cell
            cell.classList.add('selected');
            selectedCells.push(cell);
            lastSelectedCell = cell;
        } else {
            // Shift is pressed - select range or add to selection
            if (lastSelectedCell) {
                // Select range between last selected and current
                const allCells = Array.from(document.querySelectorAll('.folders-table td'));
                const startIndex = allCells.indexOf(lastSelectedCell);
                const endIndex = allCells.indexOf(cell);
                
                const start = Math.min(startIndex, endIndex);
                const end = Math.max(startIndex, endIndex);
                
                for (let i = start; i <= end; i++) {
                    const targetCell = allCells[i];
                    const targetCellIndex = Array.from(targetCell.parentElement.children).indexOf(targetCell);
                    
                    // Skip first two columns
                    if (targetCellIndex >= 2 && !selectedCells.includes(targetCell)) {
                        targetCell.classList.add('selected');
                        selectedCells.push(targetCell);
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
                cell.textContent = '';
                cell.classList.remove('has-content');
                cell.classList.remove('selected');
                cell.removeAttribute('data-user');
                cell.removeAttribute('data-permission-level');
                cell.style.backgroundColor = '';
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
                
                return {
                    userName: userName,
                    permissionLevel: permissionLevel,
                    hasContent: cell.classList.contains('has-content')
                };
            });
            console.log(`📋 Copied ${copiedCells.length} cells`);
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
                                <span class="cell-username">${copiedData.userName}</span>
                                <input type="text" class="cell-permission-level" value="${copiedData.permissionLevel}" maxlength="1" />
                            `;
                            targetCell.setAttribute('data-user', copiedData.userName);
                            targetCell.setAttribute('data-permission-level', copiedData.permissionLevel);
                            targetCell.classList.add('has-content');
                            
                            // Apply background and text color based on permission level
                            const colors = getPermissionLevelColor(copiedData.permissionLevel);
                            targetCell.style.backgroundColor = colors.background;
                            targetCell.style.color = colors.color;
                            
                            // Setup validation for pasted input
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
                                
                                permissionInput.addEventListener('keydown', (event) => {
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
                                    const colors = getPermissionLevelColor(level);
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
            
            console.log(`📌 Pasted ${copiedCells.length} cells`);
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
                        <input type="radio" name="userDisplay" value="company" ${displayMode === 'company' ? 'checked' : ''}>
                        <span>Company</span>
                    </label>
                    <label class="user-display-option">
                        <input type="radio" name="userDisplay" value="role" ${displayMode === 'role' ? 'checked' : ''}>
                        <span>Role</span>
                    </label>
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
                displayUserList(currentProjectUsers, sortOrder, e.target.value);
            });
        });
    }

    /**
     * Setup drag functionality for user list items
     */
    function setupUserListDrag() {
        const userItems = document.querySelectorAll('.user-list-item');
        
        userItems.forEach(item => {
            item.addEventListener('dragstart', (e) => {
                e.dataTransfer.effectAllowed = 'copy';
                const userName = item.textContent;
                
                // Just transfer the user name (permission level will be added in the cell)
                e.dataTransfer.setData('text/plain', userName);
                item.classList.add('dragging');
            });
            
            item.addEventListener('dragend', (e) => {
                item.classList.remove('dragging');
            });
        });
    }

    // Add Columns function
    function addColumns() {
        // Save current cell data before adding columns
        const savedCellData = {};
        const table = document.querySelector('.folders-table');
        if (table) {
            const rows = table.querySelectorAll('tbody tr');
            rows.forEach(row => {
                const folderId = row.getAttribute('data-folder-id');
                if (folderId) {
                    savedCellData[folderId] = {};
                    const cells = row.querySelectorAll('td');
                    cells.forEach((cell, index) => {
                        if (index >= 2 && cell.classList.contains('has-content')) {
                            const userName = cell.getAttribute('data-user');
                            const permissionLevel = cell.getAttribute('data-permission-level');
                            if (userName && permissionLevel) {
                                savedCellData[folderId][`column${index - 1}`] = {
                                    user: userName,
                                    level: permissionLevel
                                };
                            }
                        }
                    });
                }
            });
        }
        
        additionalColumnsCount += 10;
        
        if (currentHierarchy) {
            displayFolderHierarchy(currentHierarchy);
            
            // Restore saved cell data
            if (Object.keys(savedCellData).length > 0) {
                const newTable = document.querySelector('.folders-table');
                if (newTable) {
                    const newRows = newTable.querySelectorAll('tbody tr');
                    newRows.forEach(row => {
                        const folderId = row.getAttribute('data-folder-id');
                        if (folderId && savedCellData[folderId]) {
                            const cells = row.querySelectorAll('td');
                            const folderData = savedCellData[folderId];
                            
                            Object.keys(folderData).forEach(columnKey => {
                                const columnIndex = parseInt(columnKey.replace('column', '')) + 1;
                                if (cells[columnIndex]) {
                                    const permissionData = folderData[columnKey];
                                    cells[columnIndex].innerHTML = `
                                        <span class="cell-username">${permissionData.user}</span>
                                        <input type="text" class="cell-permission-level" value="${permissionData.level}" maxlength="1" />
                                    `;
                                    cells[columnIndex].setAttribute('data-user', permissionData.user);
                                    cells[columnIndex].setAttribute('data-permission-level', permissionData.level);
                                    cells[columnIndex].classList.add('has-content');
                                    
                                    // Apply colors
                                    const colors = getPermissionLevelColor(permissionData.level);
                                    cells[columnIndex].style.backgroundColor = colors.background;
                                    cells[columnIndex].style.color = colors.color;
                                    
                                    // Setup validation for restored input
                                    const permissionInput = cells[columnIndex].querySelector('.cell-permission-level');
                                    if (permissionInput) {
                                        permissionInput.addEventListener('input', (event) => {
                                            const value = event.target.value;
                                            if (value && (value < '1' || value > '6' || isNaN(value))) {
                                                event.target.value = value.slice(0, -1);
                                            } else if (value && value >= '1' && value <= '6') {
                                                const colors = getPermissionLevelColor(value);
                                                cells[columnIndex].style.backgroundColor = colors.background;
                                                cells[columnIndex].style.color = colors.color;
                                            }
                                        });
                                        
                                        permissionInput.addEventListener('change', (event) => {
                                            const level = event.target.value || '6';
                                            cells[columnIndex].setAttribute('data-permission-level', level);
                                            const colors = getPermissionLevelColor(level);
                                            cells[columnIndex].style.backgroundColor = colors.background;
                                            cells[columnIndex].style.color = colors.color;
                                        });
                                    }
                                }
                            });
                        }
                    });
                }
            }
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

        console.log('🧹 Table cleaned - all users removed from display');
    }

    /**
     * Lookup subjectId and subjectType for a user/company/role name
     */
    function lookupSubjectInfo(userName) {
        console.log(`🔍 Looking up subject info for: "${userName}"`);
        
        if (!currentProjectUsersRaw || currentProjectUsersRaw.length === 0) {
            console.error('❌ No raw user data available for lookup!');
            console.log('currentProjectUsersRaw:', currentProjectUsersRaw);
            return null;
        }

        console.log(`📊 Raw user data available: ${currentProjectUsersRaw.length} users`);

        // Check if it's an email (USER)
        if (userName.includes('@')) {
            console.log('✉️ Detected as EMAIL');
            const user = currentProjectUsersRaw.find(u => u.email === userName);
            if (user) {
                console.log(`✅ Found USER - ID: ${user.id}`);
                return {
                    subjectId: user.id,
                    subjectType: 'USER'
                };
            }
            console.warn(`⚠️ Email not found: ${userName}`);
        }

        // Check if it's a company name (COMPANY)
        console.log('🏢 Checking as COMPANY');
        const companyUser = currentProjectUsersRaw.find(u => u.companyName === userName);
        if (companyUser && companyUser.companyId) {
            console.log(`✅ Found COMPANY - ID: ${companyUser.companyId}`);
            return {
                subjectId: companyUser.companyId,
                subjectType: 'COMPANY'
            };
        }

        // Check if it's a role name (ROLE)
        console.log('👤 Checking as ROLE');
        for (const user of currentProjectUsersRaw) {
            if (user.roles && Array.isArray(user.roles)) {
                const matchingRole = user.roles.find(r => r.name === userName);
                if (matchingRole && user.roleIds && user.roleIds.length > 0) {
                    console.log(`✅ Found ROLE - ID: ${user.roleIds[0]}`);
                    return {
                        subjectId: user.roleIds[0],
                        subjectType: 'ROLE'
                    };
                }
            }
        }

        console.error(`❌ Could not find subject info for: "${userName}"`);
        console.log('Available companies:', currentProjectUsersRaw.map(u => u.companyName).filter((v, i, a) => a.indexOf(v) === i));
        console.log('Available roles:', currentProjectUsersRaw.flatMap(u => u.roles ? u.roles.map(r => r.name) : []).filter((v, i, a) => a.indexOf(v) === i));
        return null;
    }

    /**
     * Convert permission level (1-6) to ACC actions array
     */
    /**
     * Sync permissions to ACC - delegated to update_folder_permission.js
     */
    async function handleSyncPermissions() {
        // Call the sync function from the external module
        // Pass the required context data
        if (typeof window.syncPermissionsToACC === 'function') {
            await window.syncPermissionsToACC(currentProjectData, currentProjectUsersRaw);
        } else {
            console.error('❌ Sync module not loaded!');
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
            const checkResponse = await fetch(`${window.location.origin}/check-folder-permissions/${encodeURIComponent(currentProjectData.projectName)}`);
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
            console.error('Error checking file existence:', error);
        }

        const folders = [];
        const rows = table.querySelectorAll('tbody tr');

        console.log('💾 Starting save operation...');
        console.log(`📊 Current raw users available: ${currentProjectUsersRaw ? currentProjectUsersRaw.length : 0}`);

        rows.forEach(row => {
            const cells = row.querySelectorAll('td');
            if (cells.length === 0) return;

            const folderId = row.getAttribute('data-folder-id');
            const level1 = row.getAttribute('data-level1');
            const level2 = row.getAttribute('data-level2');
            
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
                    
                    console.log(`\n📝 Processing permission for: ${userName}`);
                    
                    // Look up subjectId and subjectType
                    const subjectInfo = lookupSubjectInfo(userName);
                    
                    if (subjectInfo) {
                        console.log(`✅ Saving with subjectId: ${subjectInfo.subjectId}, subjectType: ${subjectInfo.subjectType}`);
                        permissions[`column${i - 1}`] = {
                            subjectId: subjectInfo.subjectId,
                            subjectType: subjectInfo.subjectType,
                            user: userName,
                            level: permissionLevel
                        };
                    } else {
                        // Fallback: save without subjectId if lookup fails
                        console.error(`❌ LOOKUP FAILED for: ${userName} - Saving without subjectId`);
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

        // Save to server
        try {
            const response = await fetch(`${window.location.origin}/save-folder-permissions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    projectName: currentProjectData.projectName,
                    data: jsonData
                })
            });

            const result = await response.json();
            
            if (result.success) {
                // Success - no alert needed, user can see the data is saved
                console.log(`💾 Saved folder permissions for project: ${currentProjectData.projectName}`);
            } else {
                alert(`❌ Error saving folder permissions: ${result.message}`);
            }
        } catch (error) {
            console.error('Error saving folder permissions:', error);
            alert(`❌ Error saving folder permissions: ${error.message}`);
        }
    }

    /**
     * Load folder permissions from JSON file
     */
    async function loadFolderPermissions(projectName) {
        try {
            const response = await fetch(`${window.location.origin}/load-folder-permissions/${encodeURIComponent(projectName)}`);
            const result = await response.json();
            
            if (!result.success || !result.exists || !result.data) {
                console.log('📂 No saved folder permissions found for this project');
                return;
            }

            const data = result.data;
            console.log(`📂 Loading saved folder permissions for: ${projectName}`);

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
                                <span class="cell-username">${permissionData.user}</span>
                                <input type="text" class="cell-permission-level" value="${permissionData.level}" maxlength="1" />
                            `;
                            cells[columnIndex].setAttribute('data-user', permissionData.user);
                            cells[columnIndex].setAttribute('data-permission-level', permissionData.level);
                            
                            // Apply background and text color based on permission level
                            const colors = getPermissionLevelColor(permissionData.level);
                            cells[columnIndex].style.backgroundColor = colors.background;
                            cells[columnIndex].style.color = colors.color;
                            
                            // Setup validation for loaded input
                            const permissionInput = cells[columnIndex].querySelector('.cell-permission-level');
                            if (permissionInput) {
                                permissionInput.addEventListener('input', (event) => {
                                    const value = event.target.value;
                                    if (value && (value < '1' || value > '6' || isNaN(value))) {
                                        event.target.value = value.slice(0, -1);
                                    } else if (value && value >= '1' && value <= '6') {
                                        const colors = getPermissionLevelColor(value);
                                        cells[columnIndex].style.backgroundColor = colors.background;
                                        cells[columnIndex].style.color = colors.color;
                                    }
                                });
                                
                                permissionInput.addEventListener('change', (event) => {
                                    const level = event.target.value || '6';
                                    cells[columnIndex].setAttribute('data-permission-level', level);
                                    const colors = getPermissionLevelColor(level);
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

            console.log(`✅ Loaded folder permissions from ${data.projectName}_folder_permissions.json`);
        } catch (error) {
            console.error('Error loading folder permissions:', error);
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
     * Create the folders modal
     */
    function createFoldersModal() {
        if (foldersModal) return; // Already created

        const modalHTML = `
            <div id="foldersModal" class="folders-modal">
                <div class="folders-modal-content">
                    <div class="folders-modal-header">
                        <h3 id="foldersModalTitle">Folder Structure</h3>
                        <button id="cleanTableBtn" class="clean-table-btn">Clean Table</button>
                        <button id="addColumnsBtn" class="add-columns-btn">Add Columns</button>
                        <button id="saveFolderPermissionsBtn" class="save-btn">Save folders permissions</button>
                        <button id="syncToACCBtn" class="sync-btn">Update to the project</button>
                        <span class="folders-modal-close">&times;</span>
                    </div>
                    <div class="folders-modal-body">
                        <div id="foldersLoadingMessage" style="text-align: center; padding: 40px; color: #666;">
                            Loading folder structure...
                        </div>
                        <div id="foldersErrorMessage" style="display: none; padding: 20px; background-color: #ffebee; color: #d32f2f; border-radius: 4px; margin-bottom: 20px;">
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
                    color: #aaa;
                    font-size: 28px;
                    font-weight: bold;
                    cursor: pointer;
                    line-height: 1;
                }

                .folders-modal-close:hover,
                .folders-modal-close:focus {
                    color: #000;
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
                    width: 300px;
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

                .user-list-item.dragging {
                    opacity: 0.5;
                    cursor: grabbing;
                }

                /* Cell content styles */
                .folders-table td {
                    position: relative;
                }

                .cell-username {
                    display: inline-block;
                    margin-right: 8px;
                }

                .cell-permission-level {
                    display: inline-block;
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

                .folders-table {
                    width: auto;
                    border-collapse: collapse;
                    font-family: 'Artifact Elements', Arial, sans-serif;
                }

                .folders-table th,
                .folders-table td {
                    border: 1px solid #ddd;
                    padding: 10px;
                    text-align: left;
                    font-family: 'Artifact Elements', Arial, sans-serif;
                    white-space: nowrap;
                    user-select: none;
                    -webkit-user-select: none;
                    -moz-user-select: none;
                    -ms-user-select: none;
                }
                
                .folders-table td:first-child,
                .folders-table td:nth-child(2) {
                    /* Level 2 and Level 3 folder columns - auto width */
                    width: auto;
                }
                
                .folders-table td:nth-child(n+3) {
                    /* Additional columns - auto width to fit content */
                    width: auto;
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
        const saveBtn = document.getElementById('saveFolderPermissionsBtn');
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

        saveBtn.addEventListener('click', () => {
            saveFolderPermissions();
        });

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
