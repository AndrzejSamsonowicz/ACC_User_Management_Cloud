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
async function updateProjectUsersFromMainList(projectId, accountId, accessToken, progressId, overrideImportUsers = null) {
    const progressEl = document.getElementById(progressId);
    const progressBar = document.getElementById(`${progressId.replace('projectProgress-','projectProgressBar-')}`) || null;
    const progressText = document.getElementById(`${progressId.replace('projectProgress-','projectProgressText-')}`) || null;
    if (progressEl) progressEl.style.display = 'block';
    if (progressBar) progressBar.style.width = '20%';
    if (progressText) progressText.textContent = 'Analyzing users...';
    
    try {
        // Load user permissions from Firestore (project-specific), unless overrideImportUsers supplied
        if (progressBar) progressBar.style.width = '40%';
        
        let importUsers, importData;
        
        if (overrideImportUsers) {
            // Use live table data (manage/Existing Users mode — changes not yet saved to Firestore)
            importUsers = overrideImportUsers;
            importData = { users: importUsers };
            log(`Using ${importUsers.length} users from live modal table (override)`);
        } else {
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
            
            importData = await importResponse.json();
            importUsers = importData.users || [];
            log(`Loaded ${importUsers.length} users from Firestore for project ${projectId}`);
        }
        
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
        
        // DELETE is only enabled in manage mode ("Existing Users") — when adding new users, skip it
        if (userTableManager?.modalMode !== 'manage') {
            listToDelete.length = 0;
        }

        log('Analysis complete:');
        log(`- To PATCH (update): ${listToPatch.length}`, listToPatch);
        log(`- To POST (add): ${listToPost.length}`, listToPost);
        log(`- To DELETE (remove): ${listToDelete.length} (${userTableManager?.modalMode === 'manage' ? 'enabled in manage mode' : 'disabled'}`);
        
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
async function updateProjectUsersFromModalContext(overrideImportUsers = null) {
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
    await updateProjectUsersFromMainList(projectId, accountId, accessToken, 'modalProgressIndicator', overrideImportUsers);
}

/**
 * Combined Save & Sync operation
 * 1. Saves table to JSON (Firestore)
 * 2. Triggers sync analysis
 */
async function saveAndSync() {
    log('🔄 saveAndSync called - executing Save then Sync');
    
    try {
        const projectIds = userTableManager?.modalProjectIds;
        if (projectIds && projectIds.length > 1) {
            await saveAndSyncMultiProject(projectIds);
            return;
        }

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

async function syncOnly() {
    log('🔄 syncOnly called - skipping Firestore save, syncing only');
    try {
        // Collect live table data so PATCH uses current toggle state, not stale Firestore data
        const tableUsers = (userTableManager && typeof userTableManager.collectTableUsers === 'function')
            ? userTableManager.collectTableUsers()
            : null;
        await updateProjectUsersFromModalContext(tableUsers);
        log('✅ Sync completed successfully');
    } catch (error) {
        console.error('❌ Error in Sync:', error);
        alert(`Error during Sync: ${error.message}`);
    }
}

/**
 * Directly run sync and show the summary results modal (consistent with multi-project flow).
 * @param {Object} cachedData - OPTIMIZATION: Cached data to avoid duplicate API calls
 */
async function showUserListsDialog(listToPatch, listToPost, listToDelete, projectId, accountId, accessToken, cachedData = null) {
    // Detect manage mode (Existing Users)
    const isManageMode = userTableManager?.modalMode === 'manage';
    const projectName = userTableManager?.modalProjectName || 'Project';
    const enrichedPatchList = listToPatch;
    const enrichedPostList = listToPost;
    
    // Show progress overlay (same style as multi-project)
    document.body.insertAdjacentHTML('beforeend', `
        <div id="singleSyncOverlay" style="position:fixed;z-index:20000;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;">
            <div style="background:#fff;border-radius:8px;padding:30px;width:90%;max-width:500px;font-family:'Artifact Elements',Arial,sans-serif;box-shadow:0 4px 12px rgba(0,0,0,0.3);">
                <h3 style="margin:0 0 16px 0;font-family:'Artifact Elements',Arial,sans-serif;">Syncing ${projectName}</h3>
                <div id="singleSyncStatus" style="font-size:14px;color:#555;margin-bottom:12px;min-height:20px;">Processing...</div>
                <div style="background:#eee;border-radius:4px;height:8px;overflow:hidden;">
                    <div id="singleSyncBar" style="background:#0696D7;height:100%;width:30%;transition:width 0.3s;"></div>
                </div>
            </div>
        </div>
    `);

    let result = null;
    let syncError = null;
    try {
        result = await executeSyncOperations(
            enrichedPatchList, enrichedPostList, listToDelete,
            projectId, accountId, accessToken, cachedData,
            {
                directMode: true,
                enableUpdate: true,
                enableAdd: !isManageMode,
                enableDelete: isManageMode
            }
        );
    } catch (err) {
        console.error('Sync error:', err);
        syncError = err.message;
    }

    // Complete progress bar
    const barEl = document.getElementById('singleSyncBar');
    if (barEl) barEl.style.width = '100%';
    await new Promise(resolve => setTimeout(resolve, 300));
    document.getElementById('singleSyncOverlay')?.remove();

    // Handle invalid roles warning (same as multi-project)
    if (result?.invalidRoles?.size > 0) {
        let errorHTML = '<div style="margin-bottom: 10px; font-weight: bold; color: #ff9800;">⚠️ Invalid roles were found and automatically removed:</div>';
        for (const [role, emails] of result.invalidRoles) {
            errorHTML += `<div style="margin: 10px 0; padding: 10px; background: #fff3cd; border-left: 3px solid #ffc107;">`;
            errorHTML += `<strong style="color: #856404;">Role "${role}" doesn't exist in this account</strong>`;
            errorHTML += '<ul style="margin: 5px 0; padding-left: 20px; color: #856404;">';
            emails.forEach(email => { errorHTML += `<li>${email} - processed without this role</li>`; });
            errorHTML += '</ul></div>';
        }
        showInvalidRolesModal(errorHTML);
    }

    // Show summary in the same style as multi-project
    _showMultiSyncResults([{ project: { name: projectName }, result, error: syncError }]);
}

/**
 * Show invalid roles warning modal
 */
function showInvalidRolesModal(htmlContent) {
    // Remove existing warning if any (both naming patterns)
    document.getElementById('invalidRolesBackdrop')?.remove();
    document.getElementById('invalidRolesWarning')?.remove();

    // Backdrop overlay (sits above everything)
    const backdrop = document.createElement('div');
    backdrop.id = 'invalidRolesBackdrop';
    backdrop.style.cssText = `
        position: fixed;
        top: 0; left: 0;
        width: 100vw; height: 100vh;
        background: rgba(0,0,0,0.55);
        z-index: 99999;
        display: flex;
        align-items: flex-start;
        justify-content: center;
        padding-top: 6vh;
        box-sizing: border-box;
    `;

    // Warning card
    const warningDiv = document.createElement('div');
    warningDiv.id = 'invalidRolesWarning';
    warningDiv.style.cssText = `
        background: #fff3cd;
        border: 2px solid #ffc107;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        min-width: 400px;
        max-width: 600px;
        width: 90%;
        font-family: 'Artifact Elements', Arial, sans-serif;
        color: #856404;
        display: flex;
        flex-direction: column;
        max-height: 60vh;
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

    backdrop.appendChild(warningDiv);
    document.body.appendChild(backdrop);

    const close = () => backdrop.remove();

    // Use querySelector on the container to avoid ID clash with any other elements
    const okButton = backdrop.querySelector('#closeInvalidRolesWarning');
    if (okButton) okButton.addEventListener('click', close);

    // Close on Escape key
    const escapeHandler = (e) => {
        if (e.key === 'Escape' && document.getElementById('invalidRolesBackdrop')) {
            close();
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
async function executeSyncOperations(listToPatch, listToPost, listToDelete, projectId, accountId, accessToken, cachedData = null, options = {}) {
    log('🔥🔥🔥 SYNC CODE VERSION: 2026-03-29-ROLE-FIX-V2 - Roles are account-level, use account role IDs directly 🔥🔥🔥');
    const isDirectMode = !!options.directMode;
    const enableUpdate = options.enableUpdate ?? (document.getElementById('enableUpdate')?.checked ?? true);
    const enableAdd = options.enableAdd ?? (document.getElementById('enableAdd')?.checked ?? false);
    // DELETE only enabled in manage mode ("Existing Users"); always disabled for add-new flows
    const isManageMode = userTableManager?.modalMode === 'manage';
    const enableDelete = isManageMode
        ? (options.enableDelete ?? (document.getElementById('enableDelete')?.checked ?? true))
        : false;
    
    log('Sync initiated:', { enableUpdate, enableAdd, enableDelete, projectId, accountId, isDirectMode });
    
    if (!projectId || !accountId) {
        if (!isDirectMode) alert('Missing project or account ID');
        return { updated: 0, added: 0, deleted: 0, errors: ['Missing project or account ID'] };
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

    // Results object — declared here so STEP 1 (account update) can store invalidRoles
    let results = {
        updated: 0,
        added: 0,
        deleted: 0,
        errors: [],
        invalidRoles: null
    };
    
    // Disable sync button and show progress
    const syncButton = isDirectMode
        ? { textContent: '', disabled: false, style: { opacity: '1', cursor: 'pointer' } }
        : document.getElementById('syncButton');
    const originalButtonText = syncButton ? syncButton.textContent : '';
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
            // Pass cached/live import users so company & role come from the current table, not stale Firestore data
            const accountUpdateResult = await updateAccountUsersForAccount(accountId, {performOps: true}, projectId, cachedData?.importUsers || null);
            log('✅ Account users updated:', accountUpdateResult);
            
            // Check for invalid roles and warn the user
            const invalidRoleCount = accountUpdateResult.invalidRoles?.size || 0;
            if (invalidRoleCount > 0) {
                console.warn('⚠️ INVALID ROLES DETECTED - users were processed without roles:', accountUpdateResult.invalidRoles);
                results.invalidRoles = accountUpdateResult.invalidRoles;

                if (!isDirectMode) {
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
                    showInvalidRolesModal(errorHTML);
                }
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
                    
                    // === CHANGE DETECTION: skip PATCH if nothing has actually changed ===
                    const hasChanges = (() => {
                        // Compare products
                        const currentProductMap = new Map(
                            (projectUser.products || []).map(p => [p.key, p.access])
                        );
                        for (const p of patchPayload.products) {
                            if (currentProductMap.get(p.key) !== p.access) return true;
                        }
                        // Compare roleIds
                        const currentRoles = (projectUser.roleIds || []).slice().sort().join(',');
                        const newRoles = (patchPayload.roleIds || []).slice().sort().join(',');
                        if (currentRoles !== newRoles) return true;
                        // Compare companyId
                        if (patchPayload.companyId && patchPayload.companyId !== projectUser.companyId) return true;
                        return false;
                    })();
                    
                    if (!hasChanges) {
                        log(`⏭ No changes for ${userToPatch.email}, skipping PATCH`);
                        completedOperations++;
                        updateProgress();
                        return { success: true, email: userToPatch.email, skipped: true };
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
        
        // Show results section briefly, then auto-close the modal
        const resultsDiv = document.getElementById('syncResults');
        const resultsContent = document.getElementById('syncResultsContent');
        if (resultsDiv && resultsContent) {
            resultsContent.innerHTML = summaryHTML;
            resultsDiv.style.display = 'block';
            
            // Scroll to results
            resultsDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }

        // Auto-close the modal after a short delay so the user can see the completion message
        setTimeout(() => {
            const modal = document.getElementById('userListsModal');
            if (modal) modal.remove();
        }, 1500);

        return results;
        
    } catch (error) {
        console.error('Sync error:', error);
        if (!isDirectMode) {
            alert(`Sync failed: ${error.message}`);
            // Re-enable button on error
            syncButton.disabled = false;
            syncButton.style.opacity = '1';
            syncButton.style.cursor = 'pointer';
            syncButton.textContent = originalButtonText;
        }
        return { updated: 0, added: 0, deleted: 0, errors: [`Sync failed: ${error.message}`] };
    }
}

/**
 * Run sync for a single project directly (no confirmation dialog).
 * Builds the 3 lists then calls executeSyncOperations in direct mode.
 * enableDelete = false for "add new users" flow — we never delete from other projects.
 */
async function runSyncForProjectDirect(projectId, accountId, accessToken, tableUsers) {
    log(`🔁 runSyncForProjectDirect: project ${projectId}`);

    const projectUsers = await fetchAllProjectUsers(projectId, accessToken);

    const importEmailMap = new Map();
    (tableUsers || []).forEach(u => { if (u.email) importEmailMap.set(u.email.toLowerCase(), u); });

    const projectEmailMap = new Map();
    projectUsers.forEach(u => { if (u.email) projectEmailMap.set(u.email.toLowerCase(), u); });

    const listToPatch = [];
    const listToPost = [];
    const listToDelete = []; // built but not executed (enableDelete = false)

    (tableUsers || []).forEach(importUser => {
        if (!importUser.email) return;
        const email = importUser.email.toLowerCase();
        if (projectEmailMap.has(email)) {
            listToPatch.push({ email: importUser.email, projectUserId: projectEmailMap.get(email).id });
        } else {
            listToPost.push({ email: importUser.email });
        }
    });

    projectUsers.forEach(pu => {
        if (!pu.email) return;
        if (!importEmailMap.has(pu.email.toLowerCase())) {
            listToDelete.push({ email: pu.email, id: pu.id });
        }
    });

    const cachedData = {
        importData: { users: tableUsers },
        importUsers: tableUsers,
        projectUsers,
        importEmailMap,
        projectEmailMap
    };

    return await executeSyncOperations(
        listToPatch, listToPost, listToDelete,
        projectId, accountId, accessToken, cachedData,
        { directMode: true, enableUpdate: true, enableAdd: true, enableDelete: false }
    );
}

/**
 * Save & Sync for multiple selected projects.
 * Saves the modal table to Firestore for each project, then syncs them all.
 */
async function saveAndSyncMultiProject(projects) {
    log('🔄 saveAndSyncMultiProject called for', projects.length, 'projects');

    const tableUsers = (userTableManager && typeof userTableManager.collectTableUsers === 'function')
        ? userTableManager.collectTableUsers()
        : null;

    if (!tableUsers || tableUsers.length === 0) {
        alert('No users in the table to sync.');
        return;
    }

    const accountId = window.currentHubId;
    const accessToken = window.currentAccessToken;

    if (!accountId || !accessToken) {
        alert('Error: Missing hub or access token. Please refresh the page.');
        return;
    }

    // Show progress overlay
    document.body.insertAdjacentHTML('beforeend', `
        <div id="multiSyncOverlay" style="position:fixed;z-index:20000;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;">
            <div style="background:#fff;border-radius:8px;padding:30px;width:90%;max-width:500px;font-family:'Artifact Elements',Arial,sans-serif;box-shadow:0 4px 12px rgba(0,0,0,0.3);">
                <h3 style="margin:0 0 16px 0;font-family:'Artifact Elements',Arial,sans-serif;">Syncing ${projects.length} Projects</h3>
                <div id="multiSyncStatus" style="font-size:14px;color:#555;margin-bottom:12px;min-height:20px;">Preparing...</div>
                <div style="background:#eee;border-radius:4px;height:8px;overflow:hidden;">
                    <div id="multiSyncBar" style="background:#0696D7;height:100%;width:0%;transition:width 0.3s;"></div>
                </div>
            </div>
        </div>
    `);

    const statusEl = document.getElementById('multiSyncStatus');
    const barEl = document.getElementById('multiSyncBar');

    const allResults = [];

    for (let i = 0; i < projects.length; i++) {
        const project = projects[i];
        if (statusEl) statusEl.textContent = `(${i + 1}/${projects.length}) ${project.name}`;
        if (barEl) barEl.style.width = `${Math.round((i / projects.length) * 100)}%`;

        try {
            // Save table to Firestore for this project (skip account update — executeSyncOperations STEP 1 handles it)
            userTableManager.modalProjectId = project.id;
            userTableManager.modalProjectName = project.name;
            await userTableManager.saveTableToJson(true); // skipAccountUpdate = true

            // Run sync directly (no confirmation dialog)
            const result = await runSyncForProjectDirect(project.id, accountId, accessToken, tableUsers);
            allResults.push({ project, result, error: null });
        } catch (err) {
            console.error(`Error syncing project ${project.name}:`, err);
            allResults.push({ project, result: null, error: err.message });
        }
    }

    // Complete progress bar
    if (barEl) barEl.style.width = '100%';
    await new Promise(resolve => setTimeout(resolve, 300));

    // Remove progress overlay
    document.getElementById('multiSyncOverlay')?.remove();

    // Collect and show ONE combined invalid roles warning across all projects
    const allInvalidRoles = new Map();
    allResults.forEach(({ project, result }) => {
        if (result?.invalidRoles?.size > 0) {
            for (const [role, emails] of result.invalidRoles) {
                if (!allInvalidRoles.has(role)) allInvalidRoles.set(role, { emails: [], projects: [] });
                const entry = allInvalidRoles.get(role);
                emails.forEach(e => { if (!entry.emails.includes(e)) entry.emails.push(e); });
                if (!entry.projects.includes(project.name)) entry.projects.push(project.name);
            }
        }
    });
    if (allInvalidRoles.size > 0) {
        let errorHTML = '<div style="margin-bottom: 10px; font-weight: bold; color: #ff9800;">⚠️ Invalid roles were found and automatically removed - users were processed without these roles:</div>';
        for (const [role, { emails, projects: pNames }] of allInvalidRoles) {
            errorHTML += `<div style="margin: 10px 0; padding: 10px; background: #fff3cd; border-left: 3px solid #ffc107;">`;
            errorHTML += `<strong style="color: #856404;">Role "${role}" doesn't exist in this account</strong>`;
            if (pNames.length > 1) errorHTML += `<div style="font-size: 12px; color: #856404; margin: 4px 0;">Projects: ${pNames.join(', ')}</div>`;
            errorHTML += '<ul style="margin: 5px 0; padding-left: 20px; color: #856404;">';
            emails.forEach(email => { errorHTML += `<li>${email} - added/updated without this role (operation succeeded)</li>`; });
            errorHTML += '</ul></div>';
        }
        errorHTML += '<div style="margin-top: 15px; padding: 10px; background: #e3f2fd; border: 1px solid #2196f3; border-radius: 4px; font-size: 13px;">';
        errorHTML += '<strong>Action Required:</strong> Check your account settings to see which roles are configured, then update the "Project user list" with valid roles.';
        errorHTML += '</div>';
        showInvalidRolesModal(errorHTML);
    }

    // Show summary
    _showMultiSyncResults(allResults);
}

/**
 * Show a summary dialog after multi-project sync completes.
 */
function _showMultiSyncResults(allResults) {
    const title = allResults.length === 1 ? 'Sync Complete' : 'Multi-Project Sync Complete';
    const rows = allResults.map(({ project, result, error }) => {
        if (error) {
            return `<tr><td style="padding:6px 8px;border-bottom:1px solid #eee;font-family:'Artifact Elements',Arial,sans-serif;">${project.name}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;color:#dc3545;font-family:'Artifact Elements',Arial,sans-serif;">Error: ${error}</td></tr>`;
        }
        const r = result || {};
        const deletedPart = r.deleted > 0 ? ` &bull; <span style="color:#dc3545;">Deleted: ${r.deleted}</span>` : '';
        const errNote = r.errors?.length ? ` &bull; <span style="color:#dc3545;">${r.errors.length} error(s)</span>` : '';
        return `<tr><td style="padding:6px 8px;border-bottom:1px solid #eee;font-family:'Artifact Elements',Arial,sans-serif;">${project.name}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;color:#28a745;font-family:'Artifact Elements',Arial,sans-serif;">Updated: ${r.updated || 0} &bull; Added: ${r.added || 0}${deletedPart}${errNote}</td></tr>`;
    }).join('');

    document.body.insertAdjacentHTML('beforeend', `
        <div id="multiSyncResultsModal" style="position:fixed;z-index:20000;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;">
            <div style="background:#fff;border-radius:8px;padding:0;width:90%;max-width:620px;max-height:80vh;display:flex;flex-direction:column;font-family:'Artifact Elements',Arial,sans-serif;box-shadow:0 4px 12px rgba(0,0,0,0.25);">
                <div style="padding:20px;border-bottom:1px solid #ddd;display:flex;justify-content:space-between;align-items:center;">
                    <h3 style="margin:0;font-family:'Artifact Elements',Arial,sans-serif;">${title}</h3>
                    <span id="multiSyncResultsClose" style="color:#aaa;font-size:26px;line-height:1;cursor:pointer;">&times;</span>
                </div>
                <div style="overflow-y:auto;flex:1;padding:20px;">
                    <table style="width:100%;border-collapse:collapse;font-size:13px;">
                        <thead>
                            <tr style="background:#f5f5f5;">
                                <th style="padding:8px;text-align:left;border-bottom:1px solid #ddd;font-family:'Artifact Elements',Arial,sans-serif;">Project</th>
                                <th style="padding:8px;text-align:left;border-bottom:1px solid #ddd;font-family:'Artifact Elements',Arial,sans-serif;">Result</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
                <div style="padding:15px 20px;border-top:1px solid #ddd;text-align:right;">
                    <button id="multiSyncResultsOk" style="padding:8px 24px;background:#0696D7;color:#fff;border:none;border-radius:4px;cursor:pointer;font-family:'Artifact Elements',Arial,sans-serif;">OK</button>
                </div>
            </div>
        </div>
    `);

    const close = () => document.getElementById('multiSyncResultsModal')?.remove();
    document.getElementById('multiSyncResultsClose').onclick = close;
    document.getElementById('multiSyncResultsOk').onclick = close;
    document.addEventListener('keydown', function esc(e) {
        if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
    });
}

// Expose global functions
window.updateProjectUsersFromMainList = updateProjectUsersFromMainList;
window.updateProjectUsersFromModalContext = updateProjectUsersFromModalContext;
window.saveAndSync = saveAndSync;
window.syncOnly = syncOnly;
window.showUserListsDialog = showUserListsDialog;
window.showInvalidRolesModal = showInvalidRolesModal;
window.executeSyncOperations = executeSyncOperations;
window.saveAndSyncMultiProject = saveAndSyncMultiProject;
