// update_project_users.js
// Handles synchronization between Users Main List (Firestore) and Project Users (APS API)
// Performs PATCH (update), POST (add), and DELETE (remove) operations at project level
// BUG FIX 2026-03-29 V2: Roles are ACCOUNT-LEVEL only - use account role IDs directly in project operations

log('🔄 update_project_users.js loaded');

/**
 * Analyze users and show sync dialog
 * Compares Users Main List with current project users and identifies:
 * - Users to PATCH (update existing)
 * - Users to POST (add new)
 * - Users to DELETE (remove)
 */
async function updateProjectUsersFromMainList(projectId, accountId, accessToken, progressId) {
    const progressEl = document.getElementById(progressId);
    const progressBar = document.getElementById(`${progressId.replace('projectProgress-','projectProgressBar-')}`) || null;
    const progressText = document.getElementById(`${progressId.replace('projectProgress-','projectProgressText-')}`) || null;
    if (progressEl) progressEl.style.display = 'block';
    if (progressBar) progressBar.style.width = '20%';
    if (progressText) progressText.textContent = 'Analyzing users...';
    
    try {
        // Load user permissions from Firestore (project-specific)
        if (progressBar) progressBar.style.width = '40%';
        
        // Fetch from server API with authentication (project-specific endpoint)
        const importResponse = await fetch(`${window.location.origin}/load-project-users/${projectId}`, {
            headers: isDemoMode ? {} : {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        if (!importResponse.ok) {
            if (importResponse.status === 401) {
                alert('Session expired. Please login again.');
                if (!isDemoMode) await auth.signOut();
                window.location.href = 'login.html';
                return;
            }
            throw new Error('Failed to load user permissions');
        }
        
        const importData = await importResponse.json();
        const importUsers = importData.users || [];
        log(`Loaded ${importUsers.length} users from Firestore for project ${projectId}`);
        
        // Fetch project users
        if (progressBar) progressBar.style.width = '60%';
        const projectUsers = await fetchAllProjectUsers(projectId, accessToken);
        log(`Fetched ${projectUsers.length} project users`);
        
        // Build email maps for quick lookup
        const importEmailMap = new Map();
        importUsers.forEach(user => {
            if (user.email) importEmailMap.set(user.email.toLowerCase(), user);
        });
        
        const projectEmailMap = new Map();
        projectUsers.forEach(user => {
            if (user.email) projectEmailMap.set(user.email.toLowerCase(), user);
        });
        
        // Build 3 lists
        const listToPatch = []; // Users in both (to update)
        const listToPost = [];  // Users in JSON but not in project (to add)
        const listToDelete = []; // Users in project but not in JSON (to delete)
        
        log('Import users emails:', Array.from(importEmailMap.keys()));
        log('Project users emails:', Array.from(projectEmailMap.keys()));
        
        // List 1 & 2: Check import users
        importUsers.forEach(importUser => {
            if (!importUser.email) {
                console.warn('Skipping import user with no email:', importUser);
                return;
            }
            const email = importUser.email.toLowerCase();
            
            if (projectEmailMap.has(email)) {
                // User exists in both → PATCH
                log(`✓ PATCH: ${importUser.email} (exists in both)`);
                listToPatch.push({
                    email: importUser.email,
                    projectUserId: projectEmailMap.get(email).id
                });
            } else {
                // User in JSON but not in project → POST
                log(`+ POST: ${importUser.email} (only in JSON)`);
                listToPost.push({
                    email: importUser.email
                });
            }
        });
        
        // List 3: Check project users not in import
        projectUsers.forEach(projectUser => {
            if (!projectUser.email) {
                console.warn('Skipping project user with no email:', projectUser);
                return;
            }
            const email = projectUser.email.toLowerCase();
            
            if (!importEmailMap.has(email)) {
                // User in project but not in JSON → DELETE
                log(`- DELETE: ${projectUser.email} (only in project)`);
                listToDelete.push({
                    email: projectUser.email,
                    id: projectUser.id
                });
            }
        });
        
        log('Analysis complete:');
        log(`- To PATCH (update): ${listToPatch.length}`, listToPatch);
        log(`- To POST (add): ${listToPost.length}`, listToPost);
        log(`- To DELETE (remove): ${listToDelete.length}`, listToDelete);
        
        // Hide progress immediately before showing dialog
        if (progressEl) progressEl.style.display = 'none';
        
        // OPTIMIZATION: Pass cached data to avoid duplicate fetches
        const cachedData = {
            importData: importData,
            importUsers: importUsers,
            projectUsers: projectUsers,
            importEmailMap: importEmailMap,
            projectEmailMap: projectEmailMap
        };
        
        // Show results in a dialog
        showUserListsDialog(listToPatch, listToPost, listToDelete, projectId, accountId, accessToken, cachedData);
        
    } catch (error) {
        console.error('Error analyzing users:', error);
        if (progressText) progressText.textContent = `Error: ${error.message}`;
        alert(`Failed to analyze users: ${error.message}`);
    }
}

/**
 * Wrapper to trigger sync from modal context
 * Gets context from userTableManager (projectId, accountId, accessToken)
 */
async function updateProjectUsersFromModalContext() {
    log('🚀 updateProjectUsersFromModalContext called');
    
    // Get project context from userTableManager
    if (!userTableManager || !userTableManager.modalProjectId) {
        alert('Error: No project context available. Please close and reopen the modal.');
        return;
    }
    
    const projectId = userTableManager.modalProjectId;
    const accountId = window.currentHubId;
    const accessToken = window.currentAccessToken;
    
    if (!accountId || !accessToken) {
        alert('Error: Missing hub or access token. Please refresh the page.');
        return;
    }
    
    log('Context:', { projectId, accountId, accessToken: accessToken ? 'exists' : 'missing' });
    
    // Call the existing function with modal progress indicator
    await updateProjectUsersFromMainList(projectId, accountId, accessToken, 'modalProgressIndicator');
}

/**
 * Combined Save & Sync operation
 * 1. Saves table to JSON (Firestore)
 * 2. Triggers sync analysis
 */
async function saveAndSync() {
    log('🔄 saveAndSync called - executing Save then Sync');
    
    try {
        // Step 1: Save the table data
        log('Step 1: Saving table data...');
        await saveModalTableToJson();
        
        // Step 2: Synchronize with account users
        log('Step 2: Synchronizing with account users...');
        await updateProjectUsersFromModalContext();
        
        log('✅ Save & Sync completed successfully');
    } catch (error) {
        console.error('❌ Error in Save & Sync:', error);
        alert(`Error during Save & Sync: ${error.message}`);
    }
}

/**
 * Show sync analysis dialog with 3 lists
 * Displays PATCH, POST, DELETE lists with checkboxes
 * @param {Object} cachedData - OPTIMIZATION: Cached data to avoid duplicate API calls
 */
function showUserListsDialog(listToPatch, listToPost, listToDelete, projectId, accountId, accessToken, cachedData = null) {
    // Use user lists as-is
    const enrichedPatchList = listToPatch;
    const enrichedPostList = listToPost;
    
    // Calculate dynamic modal height based on total number of users
    const totalUsers = listToPatch.length + listToPost.length + listToDelete.length;
    let modalMaxHeight, tableMaxHeight;
    
    if (totalUsers <= 5) {
        modalMaxHeight = '50vh';  // Small modal for few users
        tableMaxHeight = '150px';
    } else if (totalUsers <= 15) {
        modalMaxHeight = '70vh';  // Medium modal
        tableMaxHeight = '200px';
    } else if (totalUsers <= 30) {
        modalMaxHeight = '85vh';  // Large modal
        tableMaxHeight = '250px';
    } else {
        modalMaxHeight = '95vh';  // Nearly full screen for many users
        tableMaxHeight = '350px'; // Taller tables for many users
    }
    
    // Build table HTML for a user list
    const buildUserTable = (users, tableId, emptyMessage) => {
        if (users.length === 0) {
            return `<div style="max-height: 150px; overflow-y: auto; border: 1px solid #ddd; border-radius: 4px; padding: 10px; background: #f9f9f9;"><div style="color: #999; font-style: italic;">${emptyMessage}</div></div>`;
        }
        
        return `
            <div style="max-height: ${tableMaxHeight}; overflow-y: auto; border: 1px solid #ddd; border-radius: 4px; background: #f9f9f9;">
                <table id="${tableId}" style="width: 100%; border-collapse: collapse; font-size: 13px; font-family: 'Artifact Elements', Arial, sans-serif;">
                    <thead>
                        <tr style="background: #e8e8e8; position: sticky; top: 0;">
                            <th style="padding: 8px; text-align: left; border-bottom: 1px solid #ccc;">Email</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${users.map((user, idx) => `
                            <tr data-user-index="${idx}" style="border-bottom: 1px solid #eee;">
                                <td style="padding: 6px 8px;">${user.email}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    };
    
    // Create modal HTML
    const modalHTML = `
        <div id="userListsModal" style="position: fixed; z-index: 10000; left: 0; top: 0; width: 100%; height: 100%; background-color: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center;">
            <div style="background-color: white; padding: 0; border-radius: 8px; width: 90%; max-width: 700px; max-height: ${modalMaxHeight}; display: flex; flex-direction: column; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                <div style="padding: 20px; border-bottom: 1px solid #ddd; display: flex; justify-content: space-between; align-items: center;">
                    <h2 style="margin: 0; font-family: 'Artifact Elements', Arial, sans-serif;">User Sync Analysis</h2>
                    <span class="sync-modal-close" style="color: #aaa; font-size: 28px; font-weight: bold; cursor: pointer; line-height: 1; font-family: 'Artifact Elements', Arial, sans-serif;">&times;</span>
                </div>
                <div style="padding: 20px; overflow-y: auto; flex: 1;">
                    <div style="margin-bottom: 30px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                            <h3 style="color: #0696D7; font-family: 'Artifact Elements', Arial, sans-serif; margin: 0;">
                                Users to UPDATE - ${enrichedPatchList.length}
                            </h3>
                            <input type="checkbox" id="enableUpdate" checked style="width: 18px; height: 18px; cursor: pointer;">
                        </div>
                        <p style="color: #666; font-size: 14px; margin-bottom: 10px;">
                            These users exist in both the project and Users Main List. They will be updated.
                        </p>
                        ${buildUserTable(enrichedPatchList, 'syncTablePatch', 'No users to update')}
                    </div>
                    
                    <div style="margin-bottom: 30px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                            <h3 style="color: #28a745; font-family: 'Artifact Elements', Arial, sans-serif; margin: 0;">
                                Users to ADD - ${enrichedPostList.length}
                            </h3>
                            <input type="checkbox" id="enableAdd" checked style="width: 18px; height: 18px; cursor: pointer;">
                        </div>
                        <p style="color: #666; font-size: 14px; margin-bottom: 10px;">
                            These users exist in Users Main List but not in the project. They will be added.
                        </p>
                        ${buildUserTable(enrichedPostList, 'syncTablePost', 'No users to add')}
                    </div>
                    
                    <div style="margin-bottom: 20px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                            <h3 style="color: #dc3545; font-family: 'Artifact Elements', Arial, sans-serif; margin: 0;">
                                Users to DELETE - ${listToDelete.length}
                            </h3>
                            <input type="checkbox" id="enableDelete" checked style="width: 18px; height: 18px; cursor: pointer;">
                        </div>
                        <p style="color: #666; font-size: 14px; margin-bottom: 10px;">These users exist in the project but not in Users Main List. They will be removed.</p>
                        <div style="max-height: ${tableMaxHeight}; overflow-y: auto; border: 1px solid #ddd; border-radius: 4px; padding: 10px; background: #f9f9f9;">
                            ${listToDelete.length > 0 ? listToDelete.map(u => `<div style="padding: 4px 0; font-family: 'Artifact Elements', Arial, sans-serif; font-size: 13px;">- ${u.email}</div>`).join('') : '<div style="color: #999; font-style: italic;">No users to delete</div>'}
                        </div>
                    </div>
                    
                    <!-- Results section (hidden initially) -->
                    <div id="syncResults" style="display: none; margin-top: 20px; padding: 15px; border: 1px solid #ddd; border-radius: 4px; background: #f8f9fa;">
                        <h4 style="margin: 0 0 10px 0; font-family: 'Artifact Elements', Arial, sans-serif;">Sync completed!</h4>
                        <div id="syncResultsContent" style="font-family: 'Artifact Elements', Arial, sans-serif; font-size: 14px; line-height: 1.6;"></div>
                    </div>
                </div>
                <div style="padding: 20px; border-top: 1px solid #ddd; display: flex; justify-content: space-between; align-items: center; gap: 20px;">
                    <div style="color: #666; font-size: 13px; font-style: italic; font-family: 'Artifact Elements', Arial, sans-serif;">
                        ⏱️ Be patient, synchronization might take a while depending on the number of users
                    </div>
                    <button id="syncButton" style="padding: 10px 20px; background: #0696D7; color: white; border: none; border-radius: 4px; cursor: pointer; font-family: 'Artifact Elements', Arial, sans-serif; white-space: nowrap;">Sync</button>
                </div>
            </div>
        </div>
    `;
    
    // Add modal to page
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    // Add event listeners
    const closeBtn = document.querySelector('.sync-modal-close');
    if (closeBtn) {
        closeBtn.onclick = function() {
            document.getElementById('userListsModal').remove();
        };
        
        // Add hover effect
        closeBtn.addEventListener('mouseenter', function() {
            this.style.color = '#000';
        });
        closeBtn.addEventListener('mouseleave', function() {
            this.style.color = '#aaa';
        });
    }
    
    // Close on Escape key
    document.addEventListener('keydown', function escapeHandler(e) {
        if (e.key === 'Escape') {
            const modal = document.getElementById('userListsModal');
            if (modal) {
                modal.remove();
                document.removeEventListener('keydown', escapeHandler);
            }
        }
    });
    
    // Add Sync button event listener
    const syncButton = document.getElementById('syncButton');
    if (syncButton) {
        syncButton.onclick = async function() {
            await executeSyncOperations(enrichedPatchList, enrichedPostList, listToDelete, projectId, accountId, accessToken, cachedData);
        };
    }
}

/**
 * Show invalid roles warning modal
 */
function showInvalidRolesModal(htmlContent) {
    // Remove existing warning if any
    let warningDiv = document.getElementById('invalidRolesWarning');
    if (warningDiv) {
        warningDiv.remove();
    }

    // Create warning div
    warningDiv = document.createElement('div');
    warningDiv.id = 'invalidRolesWarning';
    warningDiv.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: #fff3cd;
        border: 2px solid #ffc107;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        z-index: 10001;
        min-width: 400px;
        max-width: 600px;
        font-family: 'Artifact Elements', Arial, sans-serif;
        color: #856404;
        display: flex;
        flex-direction: column;
        max-height: 80vh;
    `;
    
    // Add scrollable content and fixed OK button
    warningDiv.innerHTML = `
        <div style="
            padding: 20px;
            overflow-y: auto;
            flex: 1;
        ">${htmlContent}</div>
        <div style="
            padding: 15px 20px;
            text-align: center;
            border-top: 1px solid #ffc107;
            background: #fff3cd;
            border-radius: 0 0 6px 6px;
        ">
            <button id="closeInvalidRolesWarning" style="
                padding: 10px 30px;
                background: #ffc107;
                border: none;
                border-radius: 4px;
                color: #856404;
                font-weight: bold;
                cursor: pointer;
                font-size: 14px;
                font-family: 'Artifact Elements', Arial, sans-serif;
            ">OK</button>
        </div>
    `;
    
    document.body.appendChild(warningDiv);
    
    // Add click handler for OK button
    const okButton = document.getElementById('closeInvalidRolesWarning');
    if (okButton) {
        okButton.addEventListener('click', () => {
            warningDiv.remove();
        });
    }
    
    // Close on Escape key
    const escapeHandler = (e) => {
        if (e.key === 'Escape' && document.getElementById('invalidRolesWarning')) {
            warningDiv.remove();
            document.removeEventListener('keydown', escapeHandler);
        }
    };
    document.addEventListener('keydown', escapeHandler);
}

/**
 * Execute sync operations based on checkbox selections
 * Performs PATCH, POST, and DELETE operations at project level
 * @param {Object} cachedData - OPTIMIZATION: Cached data to avoid duplicate API calls
 */
async function executeSyncOperations(listToPatch, listToPost, listToDelete, projectId, accountId, accessToken, cachedData = null) {
    log('🔥🔥🔥 SYNC CODE VERSION: 2026-03-29-ROLE-FIX-V2 - Roles are account-level, use account role IDs directly 🔥🔥🔥');
    const enableUpdate = document.getElementById('enableUpdate').checked;
    const enableAdd = document.getElementById('enableAdd').checked;
    const enableDelete = document.getElementById('enableDelete').checked;
    
    log('Sync initiated:', { enableUpdate, enableAdd, enableDelete, projectId, accountId });
    
    if (!projectId || !accountId) {
        alert('Missing project or account ID');
        return;
    }
    
    // Calculate total operations
    let totalOperations = 0;
    if (enableUpdate) totalOperations += listToPatch.length;
    if (enableAdd) totalOperations += listToPost.length;
    if (enableDelete) totalOperations += listToDelete.length;
    
    // Check if there are any operations to perform
    if (totalOperations === 0) {
        alert('No operations selected. Please enable at least one checkbox (Update/Add/Delete).');
        return;
    }
    
    let completedOperations = 0;
    
    // Disable sync button and show progress
    const syncButton = document.getElementById('syncButton');
    const originalButtonText = syncButton.textContent;
    syncButton.disabled = true;
    syncButton.style.opacity = '0.6';
    syncButton.style.cursor = 'not-allowed';
    
    // Function to update progress
    const updateProgress = () => {
        if (totalOperations === 0) return;
        const percentage = Math.round((completedOperations / totalOperations) * 100);
        syncButton.textContent = `Processing... ${percentage}%`;
    };
    
    try {
        // Get 2-legged token
        updateProgress();
        const twoLeggedToken = await get2LeggedToken();
        
        // STEP 1: Update account users first (company and role from Users Main List)
        log('🚀 STEP 1: Updating account users with company and role from Users Main List');
        try {
            const accountUpdateResult = await updateAccountUsersForAccount(accountId, {performOps: true}, projectId);
            log('✅ Account users updated:', accountUpdateResult);
            
            // Check for invalid roles and warn the user
            const invalidRoleCount = accountUpdateResult.invalidRoles?.size || 0;
            if (invalidRoleCount > 0) {
                console.warn('⚠️ INVALID ROLES DETECTED - users were processed without roles:', accountUpdateResult.invalidRoles);
                
                // Build error message HTML for modal
                let errorHTML = '<div style="margin-bottom: 10px; font-weight: bold; color: #ff9800;">⚠️ Invalid roles were found and automatically removed - users were processed without these roles:</div>';
                for (const [role, emails] of accountUpdateResult.invalidRoles) {
                    errorHTML += `<div style="margin: 10px 0; padding: 10px; background: #fff3cd; border-left: 3px solid #ffc107;">`;
                    errorHTML += `<strong style="color: #856404;">Role "${role}" doesn't exist in this account</strong>`;
                    errorHTML += '<ul style="margin: 5px 0; padding-left: 20px; color: #856404;">';
                    emails.forEach(email => {
                        errorHTML += `<li>${email} - added/updated without this role (operation succeeded)</li>`;
                    });
                    errorHTML += '</ul></div>';
                }
                errorHTML += '<div style="margin-top: 15px; padding: 10px; background: #e3f2fd; border: 1px solid #2196f3; border-radius: 4px; font-size: 13px;">';
                errorHTML += '<strong>Action Required:</strong> Check your account settings to see which roles are configured, then update the "Project user list" with valid roles.';
                errorHTML += '</div>';
                
                // Show modal to user
                showInvalidRolesModal(errorHTML);
            }
        } catch (accountError) {
            console.error('⚠️ Account update failed (continuing anyway):', accountError);
            // Continue even if account update fails - user might not have permissions
        }
        
        // STEP 2: Fetch all required data (OPTIMIZED: Use cache if available)
        let importData, importUsers, projectUsers, importEmailMap, projectEmailMap;
        
        if (cachedData) {
            // OPTIMIZATION: Use cached data from initial analysis
            log('✅ Using cached data - skipping duplicate API calls');
            importData = cachedData.importData;
            importUsers = cachedData.importUsers;
            projectUsers = cachedData.projectUsers;
            importEmailMap = cachedData.importEmailMap;
            projectEmailMap = cachedData.projectEmailMap;
        } else {
            // Fallback: Fetch data if cache not available
            log('⚠️ No cached data - fetching from API');
            const importResponse = await fetch(`${window.location.origin}/load-project-users/${projectId}`, {
                headers: isDemoMode ? {} : {
                    'Authorization': `Bearer ${authToken}`
                }
            });
            
            if (!importResponse.ok) {
                throw new Error('Failed to load user permissions');
            }
            
            importData = await importResponse.json();
            projectUsers = await fetchAllProjectUsers(projectId, twoLeggedToken);
            importUsers = importData.users || [];
            
            // Create lookup maps (filter out users without emails)
            importEmailMap = new Map(importUsers.filter(u => u.email).map(u => [u.email.toLowerCase(), u]));
            projectEmailMap = new Map(projectUsers.filter(u => u.email).map(u => [u.email.toLowerCase(), u]));
        }
        
        // Always fetch account users (needed for company/role)
        const accountUsers = await accountUsersManager.fetchAllAccountUsersWith2LeggedAuth(accountId);
        const accountEmailMap = new Map(accountUsers.filter(u => u.email).map(u => [u.email.toLowerCase(), u]));
        
        // Extract available product keys from existing project users
        // This determines which products are activated for this project
        const availableProductKeys = new Set();
        if (projectUsers.length > 0) {
            projectUsers.forEach(user => {
                if (user.products && Array.isArray(user.products)) {
                    user.products.forEach(product => {
                        if (product.key) availableProductKeys.add(product.key);
                    });
                }
            });
        }
        
        // Always include projectAdministration (it's always available)
        availableProductKeys.add('projectAdministration');
        
        log('Available products for this project:', Array.from(availableProductKeys));
        log('Data loaded:', {
            importUsers: importUsers.length,
            accountUsers: accountUsers.length,
            projectUsers: projectUsers.length,
            availableProducts: availableProductKeys.size
        });
        
        let results = {
            updated: 0,
            added: 0,
            deleted: 0,
            errors: []
        };
        
        // NOTE: Roles are defined at ACCOUNT level, not project level
        // We use account role IDs directly in project-level PATCH/POST operations
        
        // Execute PATCH operations (OPTIMIZED: Parallel processing with concurrency control)
        if (enableUpdate && listToPatch.length > 0) {
            log('\n=== PATCH Operation - Updating Users (Parallel Processing) ===');
            
            // Helper function for parallel execution with concurrency limit
            const executeInParallel = async (items, concurrency, executor) => {
                const results = [];
                const executing = [];
                
                for (const [index, item] of items.entries()) {
                    const promise = executor(item, index).then(result => {
                        executing.splice(executing.indexOf(promise), 1);
                        return result;
                    });
                    
                    results.push(promise);
                    executing.push(promise);
                    
                    if (executing.length >= concurrency) {
                        await Promise.race(executing);
                    }
                }
                
                return Promise.all(results);
            };
            
            // PATCH executor function
            const patchUser = async (userToPatch) => {
                if (!userToPatch.email) {
                    console.warn('Skipping user with no email in PATCH operation');
                    return { success: false, skipped: true };
                }
                
                const email = userToPatch.email.toLowerCase();
                
                try {
                    // Get data from all sources
                    const importUser = importEmailMap.get(email);
                    const accountUser = accountEmailMap.get(email);
                    const projectUser = projectEmailMap.get(email);
                    
                    if (!importUser || !accountUser || !projectUser) {
                        throw new Error(`Missing data for ${userToPatch.email}`);
                    }
                    
                    // Build products array from import JSON (REQUIRED)
                    const projectAdmin = importUser.products.find(p => p.key === 'projectAdministration');
                    const isProjectAdmin = projectAdmin?.access === 'administrator';
                    
                    const products = importUser.products
                        .filter(p => availableProductKeys.has(p.key)) // Only include products available in this project
                        .map(p => {
                            const currentAccess = p.access;
                            if (p.key === 'projectAdministration') {
                                return { key: p.key, access: currentAccess };
                            }
                            if (currentAccess === 'none') {
                                return { key: p.key, access: 'none' };
                            }
                            if (isProjectAdmin) {
                                return { key: p.key, access: 'administrator' };
                            } else {
                                return { key: p.key, access: 'member' };
                            }
                        });
                    
                    // Log if any products were filtered out
                    const filteredOut = importUser.products.filter(p => !availableProductKeys.has(p.key));
                    if (filteredOut.length > 0) {
                        log(`ℹ️ Filtered out unavailable products for ${userToPatch.email}:`, filteredOut.map(p => p.key));
                    }
                    
                    const patchPayload = { products: products };
                    if (accountUser.company_id) patchPayload.companyId = accountUser.company_id;
                    if (accountUser.company_name) patchPayload.companyName = accountUser.company_name;
                    
                    // Add role ID from account (roles are account-level, not project-level)
                    if (accountUser.default_role_id) {
                        patchPayload.roleIds = [accountUser.default_role_id];
                        log(`✓ Adding role ID ${accountUser.default_role_id} for ${userToPatch.email}`);
                    }
                    
                    log(`PATCH user ${userToPatch.email}:`, patchPayload);
                    
                    // Execute PATCH request
                    const response = await fetch(
                        `https://developer.api.autodesk.com/construction/admin/v1/projects/${projectId}/users/${projectUser.id}`,
                        {
                            method: 'PATCH',
                            headers: {
                                'Authorization': `Bearer ${accessToken}`,
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify(patchPayload)
                        }
                    );
                    
                    if (!response.ok) {
                        const errorText = await response.text();
                        let errorData;
                        try {
                            errorData = JSON.parse(errorText);
                        } catch (e) {
                            errorData = { message: errorText || response.statusText };
                        }
                        
                        // Check if error is about inactive products
                        const errorDetail = errorData.detail || errorData.message || '';
                        if (response.status === 400 && (errorDetail.includes('nicht aktiviert') || errorDetail.includes('not activated'))) {
                            console.warn(`⚠️ Product not activated for ${userToPatch.email}: ${errorDetail}`);
                            console.warn(`⚠️ Skipping user - project doesn't have required products activated`);
                            results.errors.push(`Skipped ${userToPatch.email}: ${errorDetail}`);
                            return { success: false, email: userToPatch.email, skipped: true, reason: 'Product not activated' };
                        }
                        
                        console.error(`❌ API Error for ${userToPatch.email}:`, {
                            status: response.status,
                            statusText: response.statusText,
                            errorData: errorData,
                            sentPayload: patchPayload
                        });
                        throw new Error(JSON.stringify(errorData) || `HTTP ${response.status}`);
                    }
                    
                    const result = await response.json();
                    log(`✓ Updated ${userToPatch.email}:`, result);
                    results.updated++;
                    completedOperations++;
                    updateProgress();
                    
                    // OPTIMIZATION: Reduced delay from 100ms to 20ms
                    await new Promise(resolve => setTimeout(resolve, 20));
                    return { success: true, email: userToPatch.email };
                    
                } catch (error) {
                    console.error(`✗ Failed to update ${userToPatch.email}:`, error);
                    results.errors.push(`Update failed for ${userToPatch.email}: ${error.message}`);
                    completedOperations++;
                    updateProgress();
                    return { success: false, email: userToPatch.email, error: error.message };
                }
            };
            
            // OPTIMIZATION: Process 4 users in parallel (up from 1)
            log(`Processing ${listToPatch.length} PATCH operations with concurrency=4`);
            await executeInParallel(listToPatch, 4, patchUser);
        }
        
        // === POST Operation - Add users ===
        if (enableAdd && listToPost.length > 0) {
            log('\n=== POST Operation - Adding Users ===');
            
            // Batch users in groups of 200 (API limit)
            const batchSize = 200;
            const batches = [];
            for (let i = 0; i < listToPost.length; i += batchSize) {
                batches.push(listToPost.slice(i, i + batchSize));
            }
            
            log(`Processing ${listToPost.length} users in ${batches.length} batch(es)`);
            
            const totalToAdd = listToPost.length;
            let processedCount = 0;
            
            for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
                const batch = batches[batchIndex];
                
                try {
                    // Build users array for POST
                    const usersToAdd = [];
                    
                    for (const userToAdd of batch) {
                        // Check if email exists
                        if (!userToAdd.email) {
                            console.warn('Skipping user with no email in POST operation');
                            results.errors.push('Add failed: User has no email');
                            continue;
                        }
                        
                        // Get user data from import JSON (email and products are required)
                        const importUser = importEmailMap.get(userToAdd.email.toLowerCase());
                        if (!importUser || !importUser.products) {
                            console.warn(`Skipping ${userToAdd.email}: No products data in import JSON`);
                            results.errors.push(`Add failed for ${userToAdd.email}: No products data`);
                            continue;
                        }
                        
                        // API constraint: cannot mix 'member' and 'administrator' access levels
                        // MASTER RULE: Only Project Admin toggle can grant 'administrator' access
                        // If Project Admin = 'administrator', ALL non-none products become 'administrator'
                        // If Project Admin != 'administrator', ALL products are 'member' or 'none' (no administrator)
                        const projectAdmin = importUser.products.find(p => p.key === 'projectAdministration');
                        const isProjectAdmin = projectAdmin?.access === 'administrator';
                        
                        const products = importUser.products
                            .filter(p => availableProductKeys.has(p.key)) // Only include products available in this project
                            .map(p => {
                                const currentAccess = p.access;
                                
                                // Keep projectAdministration exactly as set by user
                                if (p.key === 'projectAdministration') {
                                    return { key: p.key, access: currentAccess };
                                }
                                
                                // Keep 'none' as is for all other products
                                if (currentAccess === 'none') {
                                    return { key: p.key, access: 'none' };
                                }
                                
                                // If Project Admin is ON, ALL non-none products become 'administrator'
                                // If Project Admin is OFF, ALL non-none products become 'member'
                                if (isProjectAdmin) {
                                    return { key: p.key, access: 'administrator' };
                                } else {
                                    return { key: p.key, access: 'member' };
                                }
                            });
                        
                        // Log if any products were filtered out
                        const filteredOut = importUser.products.filter(p => !availableProductKeys.has(p.key));
                        if (filteredOut.length > 0) {
                            log(`ℹ️ Filtered out unavailable products for ${userToAdd.email}:`, filteredOut.map(p => p.key));
                        }
                        
                        // Build user object
                        const userPayload = {
                            email: userToAdd.email,
                            products: products
                        };
                        
                        // Get optional company and role from account user
                        const accountUser = accountEmailMap.get(userToAdd.email.toLowerCase());
                        if (accountUser) {
                            if (accountUser.company_id) {
                                userPayload.companyId = accountUser.company_id;
                            }
                            
                            // Add role ID from account (roles are account-level, not project-level)
                            if (accountUser.default_role_id) {
                                userPayload.roleIds = [accountUser.default_role_id];
                            }
                        }
                        
                        usersToAdd.push(userPayload);
                    }
                    
                    if (usersToAdd.length === 0) {
                        console.warn(`Batch ${batchIndex + 1}: No valid users to add`);
                        continue;
                    }
                    
                    log(`Batch ${batchIndex + 1}: Adding ${usersToAdd.length} users`);
                    
                    // Execute POST request
                    const postUrl = `https://developer.api.autodesk.com/construction/admin/v2/projects/${projectId}/users:import`;
                    const response = await fetch(postUrl, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${accessToken}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ users: usersToAdd })
                    });
                    
                    if (!response.ok) {
                        const errorData = await response.json().catch(() => ({ message: response.statusText }));
                        throw new Error(errorData.message || `HTTP ${response.status}`);
                    }
                    
                    const result = await response.json();
                    log(`✓ Batch ${batchIndex + 1} completed:`, result);
                    results.added += usersToAdd.length;
                    processedCount += usersToAdd.length;
                    completedOperations += usersToAdd.length;
                    updateProgress();
                    
                } catch (error) {
                    console.error(`✗ Batch ${batchIndex + 1} failed:`, error);
                    results.errors.push(`Batch ${batchIndex + 1} add failed: ${error.message}`);
                    completedOperations += batch.length;
                    updateProgress();
                }
                
                // OPTIMIZATION: Reduced delay between batches from 500ms to 200ms
                if (batchIndex < batches.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 200));
                }
            }
        }
        
        // === DELETE Operation - Remove users (OPTIMIZED: Parallel processing) ===
        if (enableDelete && listToDelete.length > 0) {
            log('\n=== DELETE Operation - Removing Users (Parallel Processing) ===');
            
            // DELETE executor function
            const deleteUser = async (userToDelete) => {
                if (!userToDelete.email) {
                    console.warn('Skipping user with no email in DELETE operation');
                    return { success: false, skipped: true };
                }
                
                try {
                    // Get userId from project users
                    const projectUser = projectEmailMap.get(userToDelete.email.toLowerCase());
                    if (!projectUser || !projectUser.id) {
                        console.warn(`Skipping ${userToDelete.email}: No user ID found in project`);
                        results.errors.push(`Delete failed for ${userToDelete.email}: No user ID`);
                        return { success: false, email: userToDelete.email };
                    }
                    
                    log(`DELETE user ${userToDelete.email} (ID: ${projectUser.id})`);
                    
                    // Execute DELETE request
                    const deleteUrl = `https://developer.api.autodesk.com/construction/admin/v1/projects/${projectId}/users/${projectUser.id}`;
                    const response = await fetch(deleteUrl, {
                        method: 'DELETE',
                        headers: {
                            'Authorization': `Bearer ${accessToken}`,
                            'Content-Type': 'application/json'
                        }
                    });
                    
                    if (!response.ok) {
                        const errorData = await response.json().catch(() => ({ message: response.statusText }));
                        throw new Error(errorData.message || `HTTP ${response.status}`);
                    }
                    
                    log(`✓ Deleted ${userToDelete.email}`);
                    results.deleted++;
                    completedOperations++;
                    updateProgress();
                    
                    // OPTIMIZATION: Reduced delay from 100ms to 20ms
                    await new Promise(resolve => setTimeout(resolve, 20));
                    return { success: true, email: userToDelete.email };
                    
                } catch (error) {
                    console.error(`✗ Failed to delete ${userToDelete.email}:`, error);
                    results.errors.push(`Delete failed for ${userToDelete.email}: ${error.message}`);
                    completedOperations++;
                    updateProgress();
                    return { success: false, email: userToDelete.email, error: error.message };
                }
            };
            
            // Helper function for parallel execution with concurrency limit
            const executeInParallelDelete = async (items, concurrency, executor) => {
                const results = [];
                const executing = [];
                
                for (const [index, item] of items.entries()) {
                    const promise = executor(item, index).then(result => {
                        executing.splice(executing.indexOf(promise), 1);
                        return result;
                    });
                    
                    results.push(promise);
                    executing.push(promise);
                    
                    if (executing.length >= concurrency) {
                        await Promise.race(executing);
                    }
                }
                
                return Promise.all(results);
            };
            
            // OPTIMIZATION: Process 4 users in parallel
            log(`Processing ${listToDelete.length} DELETE operations with concurrency=4`);
            await executeInParallelDelete(listToDelete, 4, deleteUser);
        }
        
        // Show results in modal
        syncButton.textContent = 'Sync Complete!';
        syncButton.disabled = false;
        syncButton.style.opacity = '1';
        syncButton.style.cursor = 'pointer';
        
        // Build summary HTML
        let summaryHTML = '';
        if (enableUpdate) summaryHTML += `Updated: ${results.updated}/${listToPatch.length}<br>`;
        if (enableAdd) summaryHTML += `Added: ${results.added}/${listToPost.length}<br>`;
        if (enableDelete) summaryHTML += `Deleted: ${results.deleted}/${listToDelete.length}<br>`;
        
        if (results.errors.length > 0) {
            summaryHTML += `<br><strong style="color: #dc3545;">Errors (${results.errors.length}):</strong><br>`;
            summaryHTML += results.errors.slice(0, 5).map(err => `<span style="color: #666; font-size: 12px;">• ${err}</span>`).join('<br>');
            if (results.errors.length > 5) {
                summaryHTML += `<br><span style="color: #666; font-size: 12px;">... and ${results.errors.length - 5} more errors. Check console for details.</span>`;
            }
        }
        
        // Show results section
        const resultsDiv = document.getElementById('syncResults');
        const resultsContent = document.getElementById('syncResultsContent');
        if (resultsDiv && resultsContent) {
            resultsContent.innerHTML = summaryHTML;
            resultsDiv.style.display = 'block';
            
            // Scroll to results
            resultsDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
        
    } catch (error) {
        console.error('Sync error:', error);
        alert(`Sync failed: ${error.message}`);
        // Re-enable button on error
        syncButton.disabled = false;
        syncButton.style.opacity = '1';
        syncButton.style.cursor = 'pointer';
        syncButton.textContent = originalButtonText;
    }
}

// Expose global functions
window.updateProjectUsersFromMainList = updateProjectUsersFromMainList;
window.updateProjectUsersFromModalContext = updateProjectUsersFromModalContext;
window.saveAndSync = saveAndSync;
window.showUserListsDialog = showUserListsDialog;
window.showInvalidRolesModal = showInvalidRolesModal;
window.executeSyncOperations = executeSyncOperations;
