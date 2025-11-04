/**
 * Folder Permissions Management Module
 * Handles folder hierarchy retrieval and display for ACC projects
 */

(function() {
    'use strict';

    // Module state
    let foldersModal = null;
    let currentProjectData = null;

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
        const errorMessage = document.getElementById('foldersErrorMessage');

        modalTitle.textContent = `Folder Structure: ${projectName}`;
        foldersModal.style.display = 'block';
        loadingMessage.style.display = 'block';
        tableContainer.style.display = 'none';
        errorMessage.style.display = 'none';

        try {
            // Fetch folder hierarchy
            const folderHierarchy = await fetchFolderHierarchy(hubId, projectId, accessToken);
            
            // Display in table
            displayFolderHierarchy(folderHierarchy);
            
            loadingMessage.style.display = 'none';
            tableContainer.style.display = 'block';
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
     * Display folder hierarchy in table
     */
    function displayFolderHierarchy(hierarchy) {
        const tableContainer = document.getElementById('foldersTableContainer');
        
        let tableHTML = `
            <table class="folders-table">
                <thead>
                    <tr>
                        <th style="width: 45%">Folder ID</th>
                        <th style="width: 18%">Level 1 Folder</th>
                        <th style="width: 18%">Level 2 Folder</th>
                        <th style="width: 19%">Level 3 Folder</th>
                    </tr>
                </thead>
                <tbody>
        `;

        hierarchy.forEach(row => {
            const level1Name = row.level1 ? row.level1.name : '';
            const level2Name = row.level2 ? row.level2.name : '';
            const level3Name = row.level3 ? row.level3.name : '';
            
            // Determine which folder ID to show (prioritize deepest level)
            const folderId = row.level3?.id || row.level2?.id || row.level1?.id || '';

            tableHTML += `
                <tr>
                    <td style="font-family: monospace; font-size: 11px;">${folderId}</td>
                    <td>${level1Name}</td>
                    <td>${level2Name}</td>
                    <td>${level3Name}</td>
                </tr>
            `;
        });

        tableHTML += `
                </tbody>
            </table>
        `;

        tableContainer.innerHTML = tableHTML;
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
                        <span class="folders-modal-close">&times;</span>
                    </div>
                    <div class="folders-modal-body">
                        <div id="foldersLoadingMessage" style="text-align: center; padding: 40px; color: #666;">
                            Loading folder structure...
                        </div>
                        <div id="foldersErrorMessage" style="display: none; padding: 20px; background-color: #ffebee; color: #d32f2f; border-radius: 4px; margin-bottom: 20px;">
                        </div>
                        <div id="foldersTableContainer" style="display: none; overflow-x: auto;">
                            <!-- Table will be inserted here -->
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
                    flex-shrink: 0;
                }

                .folders-modal-header h3 {
                    margin: 0;
                    color: #333;
                    font-family: 'Artifact Elements', Arial, sans-serif;
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
                    padding: 20px;
                    font-family: 'Artifact Elements', Arial, sans-serif;
                    flex: 1;
                    overflow-y: auto;
                }

                .folders-table {
                    width: 100%;
                    border-collapse: collapse;
                    font-family: 'Artifact Elements', Arial, sans-serif;
                }

                .folders-table th,
                .folders-table td {
                    border: 1px solid #ddd;
                    padding: 10px;
                    text-align: left;
                    font-family: 'Artifact Elements', Arial, sans-serif;
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

        closeBtn.addEventListener('click', () => {
            closeFoldersModal();
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
