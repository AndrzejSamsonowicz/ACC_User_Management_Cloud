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
    let additionalColumnsCount = 10; // Start with 10 additional columns

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
            const [folderHierarchy, projectUsers] = await Promise.all([
                fetchFolderHierarchy(hubId, projectId, accessToken),
                fetchProjectUsers(hubId, projectId, accessToken)
            ]);
            
            // Store hierarchy and users for re-rendering when adding columns
            currentHierarchy = folderHierarchy;
            currentProjectUsers = projectUsers;
            
            // Display in table and user list
            displayFolderHierarchy(folderHierarchy);
            displayUserList(projectUsers);
            
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
     * Fetch complete folder hierarchy (3 levels)
     */
    async function fetchFolderHierarchy(hubId, projectId, accessToken) {
        console.log('📂 Fetching folder hierarchy...');
        
        // Step 1: Get top-level folders
        const topFolders = await fetchTopFolders(hubId, projectId, accessToken);
        console.log(`📂 Found ${topFolders.length} top-level folders`);

        const hierarchy = [];

        // Step 2: For each top-level folder, get its children (level 2)
        for (const level1Folder of topFolders) {
            const level2Folders = await fetchFolderContents(projectId, level1Folder.id, accessToken);
            console.log(`📂 Folder "${level1Folder.name}" has ${level2Folders.length} children`);

            if (level2Folders.length === 0) {
                // No children, just add the level 1 folder
                hierarchy.push({
                    level1: level1Folder,
                    level2: null,
                    level3: null
                });
            } else {
                // Has children
                for (const level2Folder of level2Folders) {
                    // Step 3: For each level 2 folder, get its children (level 3)
                    const level3Folders = await fetchFolderContents(projectId, level2Folder.id, accessToken);
                    console.log(`📂 Folder "${level2Folder.name}" has ${level3Folders.length} children`);

                    if (level3Folders.length === 0) {
                        // No children at level 3
                        hierarchy.push({
                            level1: level1Folder,
                            level2: level2Folder,
                            level3: null
                        });
                    } else {
                        // Has children at level 3
                        for (const level3Folder of level3Folders) {
                            hierarchy.push({
                                level1: level1Folder,
                                level2: level2Folder,
                                level3: level3Folder
                            });
                        }
                    }
                }
            }
        }

        console.log(`✅ Complete hierarchy built: ${hierarchy.length} rows`);
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
        
        // Extract user data
        const users = allUsers.map(user => {
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
        
        console.log(`✅ Fetched ${users.length} project users`);
        console.log('Sample user data:', users[0]); // Log first user to check fields
        return users;
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
                    cell.innerHTML = `
                        <span class="cell-username">${userName}</span>
                        <input type="text" class="cell-permission-level" value="1" maxlength="1" />
                    `;
                    cell.setAttribute('data-user', userName);
                    cell.classList.add('has-content');
                    
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
                        
                        // Update data attribute when value changes
                        permissionInput.addEventListener('change', (event) => {
                            const level = event.target.value || '6';
                            cell.setAttribute('data-permission-level', level);
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
                            
                            // Setup validation for pasted input
                            const permissionInput = targetCell.querySelector('.cell-permission-level');
                            if (permissionInput) {
                                permissionInput.addEventListener('input', (event) => {
                                    const value = event.target.value;
                                    if (value && (value < '1' || value > '6' || isNaN(value))) {
                                        event.target.value = value.slice(0, -1);
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
                                });
                            }
                        } else {
                            // Clear cell if copied cell was empty
                            targetCell.innerHTML = '';
                            targetCell.classList.remove('has-content');
                            targetCell.removeAttribute('data-user');
                            targetCell.removeAttribute('data-permission-level');
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
        additionalColumnsCount += 10;
        if (currentHierarchy) {
            displayFolderHierarchy(currentHierarchy);
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
                const userName = cell.getAttribute('data-user');
                const permissionInput = cell.querySelector('.cell-permission-level');
                const permissionLevel = permissionInput ? permissionInput.value : cell.getAttribute('data-permission-level');
                
                if (userName && permissionLevel) {
                    permissions[`column${i - 1}`] = {
                        user: userName,
                        level: permissionLevel
                    };
                } else if (cell.textContent.trim()) {
                    // Backward compatibility: if no structured data, store as string
                    permissions[`column${i - 1}`] = cell.textContent.trim();
                }
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
                            
                            // Setup validation for loaded input
                            const permissionInput = cells[columnIndex].querySelector('.cell-permission-level');
                            if (permissionInput) {
                                permissionInput.addEventListener('input', (event) => {
                                    const value = event.target.value;
                                    if (value && (value < '1' || value > '6' || isNaN(value))) {
                                        event.target.value = value.slice(0, -1);
                                    }
                                });
                                
                                permissionInput.addEventListener('change', (event) => {
                                    const level = event.target.value || '6';
                                    cells[columnIndex].setAttribute('data-permission-level', level);
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
                        <button id="addColumnsBtn" class="add-columns-btn">Add Columns</button>
                        <button id="saveFolderPermissionsBtn" class="save-btn">SAVE</button>
                        <span class="folders-modal-close">&times;</span>
                    </div>
                    <div class="folders-modal-body">
                        <div id="foldersLoadingMessage" style="text-align: center; padding: 40px; color: #666;">
                            Loading folder structure...
                        </div>
                        <div id="foldersErrorMessage" style="display: none; padding: 20px; background-color: #ffebee; color: #d32f2f; border-radius: 4px; margin-bottom: 20px;">
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
                    background-color: #c8e6c9 !important;
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
        const addColumnsBtn = document.getElementById('addColumnsBtn');
        const saveBtn = document.getElementById('saveFolderPermissionsBtn');

        closeBtn.addEventListener('click', () => {
            closeFoldersModal();
        });

        addColumnsBtn.addEventListener('click', () => {
            addColumns();
        });

        saveBtn.addEventListener('click', () => {
            saveFolderPermissions();
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
