/**
 * Update Folder Permissions Module
 * Handles syncing folder permissions to ACC
 */

(function() {
    'use strict';

    /**
     * Show folder sync modal with progress
     */
    function showFolderSyncModal() {
        // Remove existing modal if present
        const existingModal = document.getElementById('folderSyncModal');
        if (existingModal) {
            existingModal.remove();
        }

        const modalHTML = `
            <div id="folderSyncModal" style="position: fixed; z-index: 10000; left: 0; top: 0; width: 100%; height: 100%; background-color: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center;">
                <div style="background-color: white; padding: 0; border-radius: 8px; width: 90%; max-width: 700px; max-height: 80vh; display: flex; flex-direction: column; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                    <div style="padding: 20px; border-bottom: 1px solid #ddd; display: flex; justify-content: space-between; align-items: center;">
                        <h2 style="margin: 0; font-family: 'Artifact Elements', Arial, sans-serif;">Folder Permissions Sync</h2>
                        <span class="folder-sync-modal-close" style="color: #aaa; font-size: 28px; font-weight: bold; cursor: pointer; line-height: 1; font-family: 'Artifact Elements', Arial, sans-serif;">&times;</span>
                    </div>
                    <div style="padding: 20px; overflow-y: auto; flex: 1;">
                        <div id="folderSyncProgress" style="margin-bottom: 20px;">
                            <h4 style="margin: 0 0 15px 0; font-family: 'Artifact Elements', Arial, sans-serif; color: #333;">Progress</h4>
                            <div id="folderSyncStatus" style="font-family: 'Artifact Elements', Arial, sans-serif; font-size: 14px; color: #666; margin-bottom: 10px;">Preparing sync...</div>
                            <div style="background: #e9ecef; border-radius: 4px; height: 30px; overflow: hidden;">
                                <div id="folderSyncBar" style="background: rgb(6, 150, 215); height: 100%; width: 0%; transition: width 0.3s; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 14px;">0%</div>
                            </div>
                        </div>
                        
                        <div id="folderSyncResults" style="display: none; margin-top: 20px; padding: 15px; border: 1px solid #ddd; border-radius: 4px; background: #f8f9fa;">
                            <h4 style="margin: 0 0 10px 0; font-family: 'Artifact Elements', Arial, sans-serif;">Sync Complete!</h4>
                            <div id="folderSyncResultsContent" style="font-family: 'Artifact Elements', Arial, sans-serif; font-size: 14px; line-height: 1.8;"></div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);

        // Setup event listeners
        const closeBtn = document.querySelector('.folder-sync-modal-close');
        const syncButton = document.getElementById('folderSyncButton');

        if (closeBtn) {
            closeBtn.onclick = () => {
                const modal = document.getElementById('folderSyncModal');
                if (modal) modal.remove();
            };
        }
    }

    function updateFolderSyncProgress(message, percent) {
        const statusEl = document.getElementById('folderSyncStatus');
        const barEl = document.getElementById('folderSyncBar');

        if (statusEl) statusEl.textContent = message;
        if (barEl) {
            barEl.style.width = `${percent}%`;
            barEl.textContent = `${Math.round(percent)}%`;
        }
    }

    function showFolderSyncResults(summary) {
        const resultsDiv = document.getElementById('folderSyncResults');
        const resultsContent = document.getElementById('folderSyncResultsContent');
        const progressDiv = document.getElementById('folderSyncProgress');
        const syncButton = document.getElementById('folderSyncButton');

        if (progressDiv) progressDiv.style.display = 'none';
        if (syncButton) syncButton.style.display = 'none';

        let html = `
            <div style="margin-bottom: 15px;">
                <strong>Summary:</strong><br>
                ➕ Created: ${summary.created}<br>
                🔄 Updated: ${summary.updated}<br>
                ➖ Deleted: ${summary.deleted}<br>
                ⚠️ Skipped (Admins): ${summary.skippedAdmins || 0}<br>
                ⚠️ Skipped (Not in Project): ${summary.skippedNonExistent || 0}
            </div>
        `;

        if (summary.createdUsers.length > 0) {
            html += `
                <div style="margin-bottom: 15px;">
                    <strong>Created Users:</strong><br>
                    <div style="max-height: 150px; overflow-y: auto; margin-top: 5px; padding: 10px; background: #e8f5e9; border-radius: 4px;">
                        ${summary.createdUsers.map(u => `<div style="padding: 2px 0; font-size: 13px;">✓ ${u}</div>`).join('')}
                    </div>
                </div>
            `;
        }

        if (summary.updatedUsers.length > 0) {
            html += `
                <div style="margin-bottom: 15px;">
                    <strong>Updated Users:</strong><br>
                    <div style="max-height: 150px; overflow-y: auto; margin-top: 5px; padding: 10px; background: #e3f2fd; border-radius: 4px;">
                        ${summary.updatedUsers.map(u => `<div style="padding: 2px 0; font-size: 13px;">↻ ${u}</div>`).join('')}
                    </div>
                </div>
            `;
        }

        if (summary.deletedUsers.length > 0) {
            html += `
                <div style="margin-bottom: 15px;">
                    <strong>Deleted Users:</strong><br>
                    <div style="max-height: 150px; overflow-y: auto; margin-top: 5px; padding: 10px; background: #ffebee; border-radius: 4px;">
                        ${summary.deletedUsers.map(u => `<div style="padding: 2px 0; font-size: 13px;">✗ ${u}</div>`).join('')}
                    </div>
                </div>
            `;
        }

        if (summary.nonExistentUsers && summary.nonExistentUsers.length > 0) {
            html += `
                <div style="margin-bottom: 15px;">
                    <strong>Users Not in Project (Skipped):</strong><br>
                    <div style="max-height: 150px; overflow-y: auto; margin-top: 5px; padding: 10px; background: #fff3e0; border-radius: 4px;">
                        ${summary.nonExistentUsers.map(u => `<div style="padding: 2px 0; font-size: 13px;">⚠️ ${u}</div>`).join('')}
                    </div>
                </div>
            `;
        }

        if (summary.errors.length > 0) {
            html += `
                <div style="margin-top: 15px; padding: 10px; background: #fff3cd; border-radius: 4px;">
                    <strong style="color: #856404;">Errors (${summary.errors.length}):</strong><br>
                    <div style="max-height: 100px; overflow-y: auto; margin-top: 5px; font-size: 12px; color: #856404;">
                        ${summary.errors.map(e => `<div>• ${e}</div>`).join('')}
                    </div>
                </div>
            `;
        }

        if (resultsContent) resultsContent.innerHTML = html;
        if (resultsDiv) resultsDiv.style.display = 'block';
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
     * Fetch current folder permissions from ACC
     */
    async function fetchFolderPermissions(projectId, folderId, accessToken) {
        try {
            const folderUrn = encodeURIComponent(folderId);
            const apiUrl = `https://developer.api.autodesk.com/bim360/docs/v1/projects/${projectId}/folders/${folderUrn}/permissions`;
            
            console.log(`📥 Fetching permissions for folder: ${folderId}`);
            
            const response = await fetch(apiUrl, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                console.warn(`⚠️ Failed to fetch permissions: ${response.status}`);
                return [];
            }

            const data = await response.json();
            console.log(`📥 Raw API response:`, data);
            
            const results = Array.isArray(data) ? data : (data.results || []);
            console.log(`📥 Processing ${results.length} permission entries`);
            
            const permissions = results.map(perm => ({
                subjectId: perm.subjectId,
                subjectType: perm.subjectType,
                actions: perm.actions || [],
                name: perm.name,
                email: perm.email
            }));
            
            console.log(`📥 Returning ${permissions.length} permissions`);
            return permissions;
        } catch (error) {
            console.error(`Error fetching folder permissions:`, error);
            return [];
        }
    }

    /**
     * Check if a user exists in the project
     */
    function userExistsInProject(subjectId, subjectType, currentProjectUsersRaw) {
        if (subjectType !== 'USER') {
            return true; // Companies and roles are not checked
        }

        if (!currentProjectUsersRaw) {
            console.warn('No raw user data available to check user existence');
            return false;
        }

        const user = currentProjectUsersRaw.find(u => u.id === subjectId);
        return !!user;
    }

    /**
     * Check if a user is a project admin
     */
    function isProjectAdmin(subjectId, subjectType, currentProjectUsersRaw) {
        if (subjectType !== 'USER') {
            return false;
        }

        if (!currentProjectUsersRaw) {
            console.warn('No raw user data available to check admin status');
            return false;
        }

        const user = currentProjectUsersRaw.find(u => u.id === subjectId);
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
     * Batch create folder permissions
     */
    async function batchCreatePermissions(projectId, folderId, permissions, accessToken) {
        if (permissions.length === 0) return { success: true, results: [] };

        try {
            const folderUrn = encodeURIComponent(folderId);
            const apiUrl = `https://developer.api.autodesk.com/bim360/docs/v1/projects/${projectId}/folders/${folderUrn}/permissions:batch-create`;
            
            console.log(`📤 Creating ${permissions.length} permissions...`);
            
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(permissions)
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }

            const data = await response.json();
            return { success: true, results: data.results || [] };
        } catch (error) {
            console.error(`Error creating permissions:`, error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Batch update folder permissions
     */
    async function batchUpdatePermissions(projectId, folderId, permissions, accessToken) {
        if (permissions.length === 0) return { success: true, results: [] };

        try {
            const folderUrn = encodeURIComponent(folderId);
            const apiUrl = `https://developer.api.autodesk.com/bim360/docs/v1/projects/${projectId}/folders/${folderUrn}/permissions:batch-update`;
            
            console.log(`📤 Updating ${permissions.length} permissions...`);
            
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(permissions)
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }

            const data = await response.json();
            return { success: true, results: data.results || [] };
        } catch (error) {
            console.error(`Error updating permissions:`, error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Batch delete folder permissions
     */
    async function batchDeletePermissions(projectId, folderId, permissions, accessToken) {
        if (permissions.length === 0) return { success: true, results: [] };

        try {
            const folderUrn = encodeURIComponent(folderId);
            const apiUrl = `https://developer.api.autodesk.com/bim360/docs/v1/projects/${projectId}/folders/${folderUrn}/permissions:batch-delete`;
            
            console.log(`📤 Deleting ${permissions.length} permissions...`);
            console.log(`📤 DELETE API URL: ${apiUrl}`);
            console.log(`📤 DELETE Request Body:`, JSON.stringify(permissions, null, 2));
            
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(permissions)
            });

            console.log(`📤 DELETE Response Status: ${response.status} ${response.statusText}`);

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }

            const responseText = await response.text();
            console.log(`📤 DELETE Response:`, responseText || 'No body (200 OK)');

            return { success: true };
        } catch (error) {
            console.error(`Error deleting permissions:`, error);
            return { success: false, error: error.message };
        }
    }

    // Flag to prevent multiple simultaneous syncs
    let isSyncing = false;

    /**
     * Sync permissions to ACC - Modal-based approach
     */
    async function syncPermissionsToACC(currentProjectData, currentProjectUsersRaw) {
        if (isSyncing) {
            console.log('⚠️ Sync already in progress, ignoring request');
            return;
        }

        if (!currentProjectData) {
            alert('No project data available');
            return;
        }

        // Show modal and auto-start sync
        showFolderSyncModal();
        
        isSyncing = true;
        console.log('🔒 Sync started - button locked');

        updateFolderSyncProgress('Loading permissions data...', 0);

        // Start sync immediately
        (async () => {

            // Load JSON file first to get source of truth
            try {
                const loadResponse = await fetch(`${window.location.origin}/load-folder-permissions/${encodeURIComponent(currentProjectData.projectName)}`);
                const loadResult = await loadResponse.json();
            
                
                if (!loadResult.success || !loadResult.exists || !loadResult.data) {
                    updateFolderSyncProgress('Error: No saved permissions found', 0);
                    isSyncing = false;
                    console.log('🔓 Sync failed (no data) - button unlocked');
                    alert('No saved folder permissions found. Please save permissions first.');
                    return;
                }            const jsonData = loadResult.data;
            console.log('\n🔄 ========== STARTING SYNC TO ACC ==========');
            console.log(`📁 Project: ${currentProjectData.projectName}`);
            console.log(`📊 Total folders in JSON: ${jsonData.folders.length}`);
            console.log(`\n========== END TEST ==========\n\n`);

            const syncSummary = {
                totalFolders: jsonData.folders.length,
                processedFolders: 0,
                created: 0,
                updated: 0,
                deleted: 0,
                skippedAdmins: 0,
                skippedNonExistent: 0,
                errors: [],
                createdUsers: [],
                updatedUsers: [],
                deletedUsers: [],
                nonExistentUsers: []
            };

            // Process folders in PARALLEL batches for speed
            const BATCH_SIZE = 5; // Process 5 folders at a time
            const folderBatches = [];
            for (let i = 0; i < jsonData.folders.length; i += BATCH_SIZE) {
                folderBatches.push(jsonData.folders.slice(i, i + BATCH_SIZE));
            }

            console.log(`📦 Processing ${jsonData.folders.length} folders in ${folderBatches.length} batches of ${BATCH_SIZE}`);

            for (let batchIndex = 0; batchIndex < folderBatches.length; batchIndex++) {
                const batch = folderBatches[batchIndex];
                
                // Process batch in parallel
                const batchPromises = batch.map(async (folder) => {
                    const folderName = `${folder.level2}${folder.level3 ? ' > ' + folder.level3 : ''}`;
                    console.log(`\n📂 Processing: ${folderName}`);
                    
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
                        console.log(`  📋 JSON permissions for ${folderName}:`, Object.keys(folder.permissions).length);
                        Object.values(folder.permissions).forEach(perm => {
                            if (perm.subjectId && perm.subjectType && perm.level) {
                                const key = `${perm.subjectId}_${perm.subjectType}`;
                                jsonPermMap.set(key, {
                                    subjectId: perm.subjectId,
                                    subjectType: perm.subjectType,
                                    actions: levelToActions(perm.level),
                                    user: perm.user
                                });
                                console.log(`    📄 JSON: ${perm.user} | Key: ${key}`);
                            }
                        });

                        // Parse ACC permissions - only explicit permissions
                        console.log(`  📋 ACC permissions for ${folderName}:`, currentPermissions.length);
                        currentPermissions.forEach(perm => {
                            const key = `${perm.subjectId}_${perm.subjectType}`;
                            const userName = perm.name || perm.email || perm.subjectId;
                            const hasExplicitPermissions = perm.actions && perm.actions.length > 0;
                            
                            console.log(`    📄 ACC: ${userName} | Key: ${key} | Explicit: ${hasExplicitPermissions} | Actions: ${perm.actions?.length || 0}`);
                            
                            if (hasExplicitPermissions) {
                                accPermMap.set(key, {
                                    subjectId: perm.subjectId,
                                    subjectType: perm.subjectType,
                                    actions: perm.actions,
                                    user: userName
                                });
                            }
                        });

                        // Determine operations
                        const toCreate = [];
                        const toUpdate = [];
                        const toDelete = [];

                        // Check for CREATE and UPDATE
                        jsonPermMap.forEach((jsonPerm, key) => {
                            if (!accPermMap.has(key)) {
                                // Check if user exists in project
                                if (!userExistsInProject(jsonPerm.subjectId, jsonPerm.subjectType, currentProjectUsersRaw)) {
                                    console.log(`  ⚠️ SKIP CREATE: User doesn't exist in project (${jsonPerm.user})`);
                                    syncSummary.skippedNonExistent++;
                                    if (!syncSummary.nonExistentUsers.includes(jsonPerm.user)) {
                                        syncSummary.nonExistentUsers.push(jsonPerm.user);
                                    }
                                } else if (isProjectAdmin(jsonPerm.subjectId, jsonPerm.subjectType, currentProjectUsersRaw)) {
                                    console.log(`  ⚠️ SKIP CREATE: Project admin (${jsonPerm.user})`);
                                    syncSummary.skippedAdmins++;
                                } else {
                                    toCreate.push({
                                        subjectId: jsonPerm.subjectId,
                                        subjectType: jsonPerm.subjectType,
                                        actions: jsonPerm.actions,
                                        user: jsonPerm.user
                                    });
                                    console.log(`  ➕ CREATE: ${jsonPerm.user} (${jsonPerm.subjectType})`);
                                }
                            } else {
                                const accPerm = accPermMap.get(key);
                                const actionsMatch = JSON.stringify(jsonPerm.actions.sort()) === JSON.stringify(accPerm.actions.sort());
                                
                                if (!actionsMatch) {
                                    // Check if user exists in project
                                    if (!userExistsInProject(jsonPerm.subjectId, jsonPerm.subjectType, currentProjectUsersRaw)) {
                                        console.log(`  ⚠️ SKIP UPDATE: User doesn't exist in project (${jsonPerm.user})`);
                                        syncSummary.skippedNonExistent++;
                                        if (!syncSummary.nonExistentUsers.includes(jsonPerm.user)) {
                                            syncSummary.nonExistentUsers.push(jsonPerm.user);
                                        }
                                    } else if (isProjectAdmin(jsonPerm.subjectId, jsonPerm.subjectType, currentProjectUsersRaw)) {
                                        console.log(`  ⚠️ SKIP UPDATE: Project admin (${jsonPerm.user})`);
                                        syncSummary.skippedAdmins++;
                                    } else {
                                        toUpdate.push({
                                            subjectId: jsonPerm.subjectId,
                                            subjectType: jsonPerm.subjectType,
                                            actions: jsonPerm.actions,
                                            user: jsonPerm.user
                                        });
                                        console.log(`  🔄 UPDATE: ${jsonPerm.user} (${jsonPerm.subjectType})`);
                                    }
                                }
                            }
                        });

                        // Check for DELETE
                        accPermMap.forEach((accPerm, key) => {
                            if (!jsonPermMap.has(key)) {
                                if (isProjectAdmin(accPerm.subjectId, accPerm.subjectType, currentProjectUsersRaw)) {
                                    console.log(`  ⚠️ SKIP DELETE: Project admin (${accPerm.user})`);
                                    syncSummary.skippedAdmins++;
                                } else {
                                    toDelete.push({
                                        subjectId: accPerm.subjectId,
                                        subjectType: accPerm.subjectType,
                                        user: accPerm.user
                                    });
                                    console.log(`  ➖ DELETE: ${accPerm.user} (${accPerm.subjectType})`);
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
                            deletedUsers: []
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
                                        permissions,
                                        currentProjectData.accessToken
                                    );
                                    if (result.success) {
                                        results.created += permissions.length;
                                        results.createdUsers.push(...permissions.map(p => `${p.user} (${folderName})`));
                                    } else {
                                        results.errors.push(`${folderName}: Create ${type} failed`);
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
                                        permissions,
                                        currentProjectData.accessToken
                                    );
                                    if (result.success) {
                                        results.updated += permissions.length;
                                        results.updatedUsers.push(...permissions.map(p => `${p.user} (${folderName})`));
                                    } else {
                                        results.errors.push(`${folderName}: Update ${type} failed`);
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
                                        permissions,
                                        currentProjectData.accessToken
                                    );
                                    if (result.success) {
                                        results.deleted += permissions.length;
                                        results.deletedUsers.push(...permissions.map(p => `${p.user} (${folderName})`));
                                    } else {
                                        results.errors.push(`${folderName}: Delete ${type} failed`);
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
                                errors: [error.message],
                                createdUsers: [],
                                updatedUsers: [],
                                deletedUsers: []
                            } 
                        };
                    }
                });

                // Wait for batch to complete
                const batchResults = await Promise.all(batchPromises);
                
                // Update summary and progress
                batchResults.forEach(({ folderName, results }) => {
                    console.log(`📦 Batch result for ${folderName}:`, results);
                    syncSummary.processedFolders++;
                    syncSummary.created += results.created;
                    syncSummary.updated += results.updated;
                    syncSummary.deleted += results.deleted;
                    syncSummary.errors.push(...results.errors);
                    if (results.createdUsers) {
                        console.log(`  Adding ${results.createdUsers.length} created users`);
                        syncSummary.createdUsers.push(...results.createdUsers);
                    }
                    if (results.updatedUsers) {
                        console.log(`  Adding ${results.updatedUsers.length} updated users`);
                        syncSummary.updatedUsers.push(...results.updatedUsers);
                    }
                    if (results.deletedUsers) {
                        console.log(`  Adding ${results.deletedUsers.length} deleted users`);
                        syncSummary.deletedUsers.push(...results.deletedUsers);
                    }
                });
                
                // Update progress after each batch
                const progressPercent = (syncSummary.processedFolders / syncSummary.totalFolders) * 100;
                updateFolderSyncProgress(`Syncing permissions... ${syncSummary.processedFolders}/${syncSummary.totalFolders} folders`, progressPercent);
                console.log(`📊 Progress: ${Math.round(progressPercent)}% (${syncSummary.processedFolders}/${syncSummary.totalFolders} folders)`);
                
                console.log(`📊 Current summary:`, {
                    created: syncSummary.created,
                    updated: syncSummary.updated,
                    deleted: syncSummary.deleted,
                    createdUsers: syncSummary.createdUsers.length,
                    updatedUsers: syncSummary.updatedUsers.length,
                    deletedUsers: syncSummary.deletedUsers.length
                });
            }

            // Remove test code section
            console.log('\n🔄 ========== SYNC COMPLETE ==========');
            console.log(`📊 Summary:`);
            console.log(`  Folders processed: ${syncSummary.processedFolders}/${syncSummary.totalFolders}`);
            console.log(`  ➕ Created: ${syncSummary.created}`);
            console.log(`  🔄 Updated: ${syncSummary.updated}`);
            console.log(`  ➖ Deleted: ${syncSummary.deleted}`);
            console.log(`  ⚠️ Skipped (admins): ${syncSummary.skipped}`);
            console.log(`  ❌ Errors: ${syncSummary.errors.length}`);
            
            if (syncSummary.errors.length > 0) {
                console.log(`\nErrors:`);
                syncSummary.errors.forEach(err => console.log(`  - ${err}`));
            }

                // Show results in modal
                showFolderSyncResults(syncSummary);
                
                // Unlock sync button
                isSyncing = false;
                console.log('🔓 Sync completed - button unlocked');

            } catch (error) {
                console.error('❌ Sync error:', error);
                updateFolderSyncProgress(`Error: ${error.message}`, 0);
                isSyncing = false;
                console.log('🔓 Sync failed - button unlocked');
                alert(`Sync failed: ${error.message}`);
            }
        })();
    }

    // Expose the sync function globally
    window.syncPermissionsToACC = syncPermissionsToACC;

})();
