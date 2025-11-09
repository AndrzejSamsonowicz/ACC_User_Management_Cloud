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
            userHTML += `<div class="user-list-item">${item}</div>`;
        });
        
        userHTML += '</div>';
        userListContainer.innerHTML = userHTML;
        
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

    // Add Columns function
    function addColumns() {
        additionalColumnsCount += 10;
        if (currentHierarchy) {
            displayFolderHierarchy(currentHierarchy);
        }
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
                    margin: 2% auto;
                    padding: 0;
                    border: 1px solid #888;
                    width: 90%;
                    max-width: 1400px;
                    height: 85%;
                    border-radius: 8px;
                    box-shadow: 0 4px 8px rgba(0,0,0,0.1);
                    font-family: 'Artifact Elements', Arial, sans-serif;
                    display: flex;
                    flex-direction: column;
                }

                .folders-modal-header {
                    padding: 15px 20px;
                    background-color: #f8f9fa;
                    border-bottom: 1px solid #ddd;
                    border-radius: 8px 8px 0 0;
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

                .user-list-item {
                    padding: 8px 10px;
                    margin-bottom: 5px;
                    background-color: white;
                    border: 1px solid #ddd;
                    border-radius: 4px;
                    font-size: 13px;
                    color: #333;
                    word-break: break-all;
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
                }
                
                .folders-table td:first-child,
                .folders-table td:nth-child(2) {
                    /* Level 2 and Level 3 folder columns - auto width */
                }
                
                .folders-table td:nth-child(n+3) {
                    /* Additional columns 3-12 - wide enough for emails */
                    min-width: 200px;
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

        closeBtn.addEventListener('click', () => {
            closeFoldersModal();
        });

        addColumnsBtn.addEventListener('click', () => {
            addColumns();
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
