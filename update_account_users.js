// update_account_users.js
// Handles comparison between account users and users_main_list
// and prepares lists for PATCH (update) and POST (add) operations.

log('🔁 update_account_users.js loaded');

// Security: HTML escape function to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

async function fetchJSON(url, options = {}) {
    const res = await fetch(url, options);
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status} ${res.statusText}: ${text}`);
    }
    return res.json();
}

// Get 2-legged token with account:write scope for user management
async function get2LeggedTokenWithWriteScope() {
    // Check if we can access the credentials from the global scope
    if (typeof CLIENT_ID === 'undefined' || typeof CLIENT_SECRET === 'undefined') {
        throw new Error('CLIENT_ID and CLIENT_SECRET not available');
    }
    
    const TOKEN_URL = 'https://developer.api.autodesk.com/authentication/v2/token';
    
    const data = new URLSearchParams();
    data.append('client_id', CLIENT_ID);
    data.append('client_secret', CLIENT_SECRET);
    data.append('grant_type', 'client_credentials');
    // Based on APS docs, HQ APIs require account:read and account:write scopes
    data.append('scope', 'account:read account:write data:read');

    try {
        const response = await fetch(TOKEN_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: data
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Token error: ${errorData.error_description || 'Unknown error'}`);
        }
        
        const tokenData = await response.json();
        log('Got 2-legged token with account:write scope');
        return tokenData.access_token;
    } catch (error) {
        console.error('Error getting 2-legged token with write scope:', error);
        throw new Error(`Authentication error: ${error.message}`);
    }
}

// Fetch all companies for an account (Construction Admin API)
async function fetchAllCompanies(accountId, twoLeggedToken) {
    const limit = 100;
    let offset = 0;
    let all = [];
    let keepGoing = true;

    while (keepGoing) {
        const url = `https://developer.api.autodesk.com/construction/admin/v1/accounts/${accountId}/companies?limit=${limit}&offset=${offset}`;
        const res = await fetch(url, {
            headers: { 'Authorization': `Bearer ${twoLeggedToken}` }
        });
        if (!res.ok) {
            const txt = await res.text();
            throw new Error(`Error fetching companies: ${res.status} ${res.statusText} - ${txt}`);
        }
        const json = await res.json();
        if (json.results && json.results.length > 0) {
            all = all.concat(json.results);
            offset += limit;
            if (json.results.length < limit) keepGoing = false;
        } else {
            keepGoing = false;
        }
        if (offset > 10000) break;
    }
    return all;
}

// Create companies in batch via HQ companies import
async function createCompanies(accountId, twoLeggedToken, companies) {
    if (!companies || companies.length === 0) return [];
    
    log(`🏢 Creating ${companies.length} companies one by one...`);
    const created = [];
    
    for (const company of companies) {
        try {
            const url = `https://developer.api.autodesk.com/hq/v1/accounts/${accountId}/companies`;
            
            // Format according to POST Company documentation
            // Only include non-empty fields to avoid API validation errors
            const payload = {
                name: company.name,
                trade: company.trade || "General Contractor"
            };
            
            // Only add optional fields if they have values
            if (company.address_line_1) payload.address_line_1 = company.address_line_1;
            if (company.address_line_2) payload.address_line_2 = company.address_line_2;
            if (company.city) payload.city = company.city;
            if (company.state_or_province) payload.state_or_province = company.state_or_province;
            if (company.postal_code) payload.postal_code = company.postal_code;
            if (company.country) payload.country = company.country;
            if (company.phone) payload.phone = company.phone;
            if (company.website_url) payload.website_url = company.website_url;
            if (company.description) payload.description = company.description;

            log('🏢 Creating company:', company.name);
            log('🏢 POST URL:', url);
            log('🏢 Payload:', JSON.stringify(payload, null, 2));

            const res = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${twoLeggedToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            log('🏢 Response status:', res.status, res.statusText);

            if (!res.ok) {
                const txt = await res.text();
                console.error('🏢 Error response body:', txt);
                console.warn(`⚠️ Failed to create company "${company.name}": ${res.status} ${res.statusText}`);
                // Continue with next company instead of throwing
                continue;
            }

            const result = await res.json();
            log('✅ Successfully created company:', company.name, result);
            created.push(result);
            
        } catch (error) {
            console.error(`❌ Error creating company "${company.name}":`, error);
            // Continue with next company
        }
    }
    
    log(`🏢 Created ${created.length} out of ${companies.length} companies`);
    return created;
}

// Fetch all account users from HQ API (the correct endpoint from documentation)
async function fetchAllAccountUsers(accountId, userToken) {
    const limit = 100;
    let offset = 0;
    let all = [];
    let keepGoing = true;

    while (keepGoing) {
        const url = `https://developer.api.autodesk.com/hq/v1/accounts/${accountId}/users?limit=${limit}&offset=${offset}`;
        const res = await fetch(url, {
            headers: { 
                'Authorization': `Bearer ${userToken}`,
                'Content-Type': 'application/json'
            }
        });
        if (!res.ok) {
            const txt = await res.text();
            throw new Error(`Error fetching account users: ${res.status} ${res.statusText} - ${txt}`);
        }
        const json = await res.json();
        if (Array.isArray(json) && json.length > 0) {
            all = all.concat(json);
            offset += limit;
            if (json.length < limit) keepGoing = false;
        } else if (json.results && json.results.length > 0) {
            // Some endpoints return { results: [...] }
            all = all.concat(json.results);
            offset += limit;
            if (json.results.length < limit) keepGoing = false;
        } else {
            keepGoing = false;
        }
        if (offset > 10000) break;
    }
    return all;
}

// Patch a single user using HQ API format from documentation
async function patchUser(accountId, userId, token, body) {
    const url = `https://developer.api.autodesk.com/hq/v1/accounts/${accountId}/users/${userId}`;
    
    // Format body according to HQ API documentation
    const cleanBody = {};
    if (body.company_id !== undefined) cleanBody.company_id = body.company_id;
    if (body.default_role !== undefined) cleanBody.default_role = body.default_role;
    if (body.status !== undefined) cleanBody.status = body.status;
    
    const res = await fetch(url, {
        method: 'PATCH',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(cleanBody)
    });
    
    if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Patch failed: ${res.status} ${res.statusText} - ${txt}`);
    }
    
    try {
        return await res.json();
    } catch {
        return res.status; // fallback if no JSON response
    }
}

// Import (add) users in batch using HQ API format from documentation
// Note: API accepts maximum 50 users per call, so we batch large arrays
async function importUsers(accountId, token, usersArray) {
    if (!usersArray || usersArray.length === 0) return { success: 0, failure: 0, success_items: [], failure_items: [] };
    
    const BATCH_SIZE = 50; // API limit per documentation
    const DELAY_BETWEEN_BATCHES = 1500; // 1.5 second delay between batches to avoid rate limits
    const url = `https://developer.api.autodesk.com/hq/v1/accounts/${accountId}/users/import`;
    
    // Split users into batches of 50
    const batches = [];
    for (let i = 0; i < usersArray.length; i += BATCH_SIZE) {
        batches.push(usersArray.slice(i, i + BATCH_SIZE));
    }
    
    console.log(`📦 Splitting ${usersArray.length} users into ${batches.length} batches of ${BATCH_SIZE}`);
    
    // Accumulate results from all batches
    const aggregatedResults = {
        success: 0,
        failure: 0,
        success_items: [],
        failure_items: []
    };
    
    // Process each batch sequentially with delays
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];
        console.log(`📦 Processing batch ${batchIndex + 1}/${batches.length} (${batch.length} users)`);
        
        // Format users according to HQ API specification from documentation
        const payload = batch.map(user => {
            const formattedUser = {
                email: user.email
            };
            
            // Add optional fields only if they exist
            if (user.first_name) formattedUser.first_name = user.first_name;
            if (user.last_name) formattedUser.last_name = user.last_name;
            if (user.companyId) formattedUser.company_id = user.companyId;
            if (user.default_role) formattedUser.default_role = user.default_role;
            if (user.job_title) formattedUser.job_title = user.job_title;
            if (user.nickname) formattedUser.nickname = user.nickname;
            if (user.company) formattedUser.company = user.company;
            
            console.log(`📤 API Payload for ${user.email}:`, JSON.stringify(formattedUser, null, 2));
            return formattedUser;
        });
        
        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });
            
            if (!res.ok) {
                const txt = await res.text();
                console.error(`❌ Batch ${batchIndex + 1} failed: ${res.status} ${res.statusText}`);
                
                // Check if it's a rate limit error
                if (res.status === 429) {
                    console.warn(`⚠️ Rate limit hit on batch ${batchIndex + 1}, waiting 3 seconds and retrying...`);
                    await new Promise(resolve => setTimeout(resolve, 3000));
                    
                    // Retry the same batch
                    try {
                        const retryRes = await fetch(url, {
                            method: 'POST',
                            headers: {
                                'Authorization': `Bearer ${token}`,
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify(payload)
                        });
                        
                        if (!retryRes.ok) {
                            const retryTxt = await retryRes.text();
                            throw new Error(`Retry failed: ${retryRes.status} ${retryRes.statusText} - ${retryTxt}`);
                        }
                        
                        const retryResult = await retryRes.json();
                        log(`✅ Batch ${batchIndex + 1} completed after retry: ${retryResult.success} success, ${retryResult.failure} failures`);
                        
                        // Aggregate retry results
                        aggregatedResults.success += retryResult.success || 0;
                        aggregatedResults.failure += retryResult.failure || 0;
                        if (retryResult.success_items) {
                            aggregatedResults.success_items.push(...retryResult.success_items);
                        }
                        if (retryResult.failure_items) {
                            aggregatedResults.failure_items.push(...retryResult.failure_items);
                        }
                        
                        // Continue to next batch
                        if (batchIndex + 1 < batches.length) {
                            log(`⏱️ Waiting ${DELAY_BETWEEN_BATCHES}ms before next batch...`);
                            await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
                        }
                        continue;
                        
                    } catch (retryError) {
                        console.error(`❌ Batch ${batchIndex + 1} retry failed:`, retryError);
                        // Mark all users in this batch as failed
                        batch.forEach(user => {
                            aggregatedResults.failure++;
                            aggregatedResults.failure_items.push({
                                email: user.email,
                                error: `Batch import failed after retry: ${retryError.message}`,
                                details: retryError.toString()
                            });
                        });
                        continue;
                    }
                }
                
                // Mark all users in this batch as failed
                batch.forEach(user => {
                    aggregatedResults.failure++;
                    aggregatedResults.failure_items.push({
                        email: user.email,
                        error: `Batch import failed: ${res.status} ${res.statusText}`,
                        details: txt
                    });
                });
                continue; // Continue with next batch instead of failing completely
            }
            
            const batchResult = await res.json();
            log(`✅ Batch ${batchIndex + 1} completed: ${batchResult.success} success, ${batchResult.failure} failures`);
            
            // Aggregate results
            aggregatedResults.success += batchResult.success || 0;
            aggregatedResults.failure += batchResult.failure || 0;
            if (batchResult.success_items) {
                aggregatedResults.success_items.push(...batchResult.success_items);
            }
            if (batchResult.failure_items) {
                aggregatedResults.failure_items.push(...batchResult.failure_items);
            }
            
        } catch (error) {
            console.error(`❌ Batch ${batchIndex + 1} error:`, error);
            // Mark all users in this batch as failed
            batch.forEach(user => {
                aggregatedResults.failure++;
                aggregatedResults.failure_items.push({
                    email: user.email,
                    error: `Batch error: ${error.message}`,
                    details: error.toString()
                });
            });
        }
        
        // Add delay between batches (except for the last batch)
        if (batchIndex + 1 < batches.length) {
            log(`⏱️ Waiting ${DELAY_BETWEEN_BATCHES}ms before next batch...`);
            await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
        }
    }
    
    log(`📊 Final results: ${aggregatedResults.success} succeeded, ${aggregatedResults.failure} failed`);
    return aggregatedResults;
}

// Main function - compute lists and (optionally) perform operations
// If importUsersList is provided, use that instead of loading from server
async function updateAccountUsersForAccount(accountId, options = {performOps: false}, projectId = null, importUsersList = null) {
    console.log('🚨🚨🚨 UPDATE_ACCOUNT_USERS.JS VERSION v=2026030821 LOADED 🚨🚨🚨');
    log('⚙️ updateAccountUsersForAccount called for account:', accountId, 'projectId:', projectId, 'userDataProvided:', !!importUsersList, options);

    try {
        // Validate inputs first
        if (!accountId) {
            throw new Error('Account ID is required');
        }
        
        // Validate projectId is provided
        if (!projectId) {
            console.error('❌ ERROR: projectId is required for loading project-specific user list');
            throw new Error('Project ID is required');
        }
        
        // Get tokens - prioritize 3-legged for user operations
        let twoLeggedToken = null;
        let userToken = null;
        
        // Get 2-legged token for company operations (Construction Admin API)
        log('🔑 Checking for get2LeggedToken function...');
        if (typeof get2LeggedToken === 'function') {
            log('✅ get2LeggedToken function found, calling...');
            twoLeggedToken = await get2LeggedToken();
            log('✅ 2-legged token obtained from global function');
        } else {
            throw new Error('get2LeggedToken() not available in this page.');
        }
        
        // For HQ API user operations, we need a token with account:write scope
        // Let's try to get our own token with the correct scopes
        let hqApiToken = null;
        try {
            log('🔑 Getting HQ API token with account:write scope...');
            hqApiToken = await get2LeggedTokenWithWriteScope();
            log('✅ HQ API token with write scope obtained');
        } catch (error) {
            console.warn('⚠️ Could not get HQ API token with write scope:', error.message);
            console.warn('⚠️ Will use existing 2-legged token (may have limited permissions)');
            hqApiToken = twoLeggedToken;
        }

        // For user operations (HQ API), require 3-legged token
        log('🔑 Checking for 3-legged token...');
        log('Debug: typeof currentAccessToken =', typeof currentAccessToken);
        log('Debug: currentAccessToken =', currentAccessToken ? 'exists' : 'undefined');
        log('Debug: typeof window.currentAccessToken =', typeof window.currentAccessToken);
        
        // Try multiple ways to get the 3-legged token
        let token3Legged = null;
        let simulationMode = false;
        
        if (typeof currentAccessToken !== 'undefined' && currentAccessToken) {
            token3Legged = currentAccessToken;
        } else if (typeof window !== 'undefined' && window.currentAccessToken) {
            token3Legged = window.currentAccessToken;
        }
        
        if (token3Legged) {
            userToken = token3Legged;
            log('✅ 3-legged token available');
        } else {
            console.error('❌ 3-legged token not available');
            console.error('Available global variables:', Object.keys(window).filter(k => k.includes('token') || k.includes('Token') || k.includes('access')));
        }
        
        // Important: According to APS documentation, HQ API user operations (PATCH/POST) require 2-legged tokens
        // Use 2-legged token with account:write scope for all HQ API operations per documentation
        userToken = hqApiToken;
        log('🔑 Using 2-legged token with account:write scope for HQ API operations (per APS documentation)');

        // Load import JSON - either from parameter or from server
        let usersData;
        if (importUsersList) {
            log('📥 Using provided user data (fresh from table), NOT loading from server');
            usersData = importUsersList;
        } else {
            // Load import JSON from local server endpoint (project-specific)
            log(`📥 Loading project-specific user list for project: ${projectId}`);
            const importData = await fetchJSON(`${window.location.origin}/load-project-users/${projectId}`, {
                headers: {
                    'Authorization': `Bearer ${authToken}`
                }
            });
            usersData = importData.users || [];
        }
        log(`Loaded ${usersData.length} users`);
        log('📋 Sample user data from load:', JSON.stringify(usersData[0], null, 2));

        // Fetch account users (may need 2-legged token for reading)
        let accountUsers;
        try {
            // Try with 3-legged token first
            accountUsers = await fetchAllAccountUsers(accountId, userToken);
            log(`✅ Fetched ${accountUsers.length} account users with 3-legged token`);
        } catch (err) {
            if (err.message.includes('Only support 2 legged access token')) {
                log('⚠️ Falling back to 2-legged token for fetching users');
                accountUsers = await fetchAllAccountUsers(accountId, twoLeggedToken);
                log(`✅ Fetched ${accountUsers.length} account users with 2-legged token`);
            } else {
                throw err;
            }
        }

        // Build email -> accountUser map (exact match)
        const accountByEmail = new Map();
        accountUsers.forEach(u => {
            if (u.email) accountByEmail.set(u.email, u);
        });

        // Fetch companies and build name -> id map (case-insensitive)
        let companies = await fetchAllCompanies(accountId, twoLeggedToken);
        log(`Fetched ${companies.length} companies`);
        const companyMap = new Map();
        companies.forEach(c => {
            if (c.name) companyMap.set(c.name.trim().toLowerCase(), c.id);
        });

        // Note: There is no API endpoint to fetch valid account roles
        // Admin must manually verify roles exist in the account before importing
        // All roles from JSON will be sent to the API - the API will validate them
        
        const toPatch = []; // existing users to PATCH
        const toAdd = [];   // new users to POST
        const companiesToCreate = new Map(); // name -> {name, trade}

        console.log('📊 Processing users from JSON...');

        // Build lists
        usersData.forEach(user => {
            const email = user.email;
            if (!email) return;
            const companyName = (user.metadata && user.metadata.company) ? user.metadata.company.trim() : '';
            const role = (user.metadata && user.metadata.role) ? user.metadata.role.trim() : '';
            
            console.log(`📝 Processing ${email}: company="${companyName}", role="${role}"`);

            const accountUser = accountByEmail.get(email);
            if (accountUser) {
                // Check if role or company has changed
                const companyId = companyName ? companyMap.get(companyName.toLowerCase()) : null;
                if (companyName && !companyId) {
                    // schedule create
                    companiesToCreate.set(companyName, { name: companyName, trade: companyName });
                }
                
                // Compare current values with desired values
                const currentRole = accountUser.default_role || accountUser.role || '';
                const currentCompanyId = accountUser.company_id || '';
                const desiredRole = role || '';
                const desiredCompanyId = companyId || '';
                
                // Only add to patch list if something changed
                // IMPORTANT: If desiredRole is empty, don't try to update role (can't clear roles via API)
                const roleChanged = desiredRole && (currentRole !== desiredRole); // Only update if new role is non-empty
                const companyChanged = currentCompanyId !== desiredCompanyId;
                
                if (roleChanged || companyChanged) {
                    const patchItem = {
                        email,
                        userId: accountUser.id,
                        companyName,
                        companyId // may be null for now
                    };
                    
                    // Only include role if it's non-empty (can't clear roles via API)
                    if (role) {
                        patchItem.default_role = role;
                    }
                    
                    toPatch.push(patchItem);
                    
                    log(`🔄 Will patch ${email}: role=${roleChanged ? `"${currentRole}" → "${desiredRole}"` : 'unchanged'}, company=${companyChanged ? `"${currentCompanyId}" → "${desiredCompanyId}"` : 'unchanged'}`);
                }
            } else {
                // goes to add
                const companyId = companyName ? companyMap.get(companyName.toLowerCase()) : null;
                if (companyName && !companyId) {
                    companiesToCreate.set(companyName, { name: companyName, trade: companyName });
                }
                
                const newUser = {
                    email,
                    first_name: user.first_name || user.email.split('@')[0] || 'User',
                    last_name: user.last_name || '',
                    companyName,
                    companyId, // may be null
                    nickname: user.nickname || user.first_name || user.email.split('@')[0],
                    company: companyName || ''
                };
                
                // Only include role fields if role is non-empty (don't force a default)
                if (role) {
                    newUser.default_role = role;
                    newUser.job_title = role;
                }
                
                toAdd.push(newUser);
                console.log(`➕ Added to ADD list: ${email} with company="${companyName}", companyId="${companyId}", default_role="${role || '(empty)'}"`);
            }
        });

        console.log(`📊 To PATCH: ${toPatch.length}, To ADD: ${toAdd.length}, Companies to create: ${companiesToCreate.size}`);

        // Create missing companies if any (and then re-fetch companies map)
        if (companiesToCreate.size > 0) {
            console.log('🏢 Creating', companiesToCreate.size, 'missing companies...');
            const createList = Array.from(companiesToCreate.values());
            log('🏢 Creating companies:', createList.map(c => c.name).join(', '));
            // Use 2-legged token with account:write scope for company creation
            log('🔑 Using 2-legged token with account:write scope for company creation');
            const createdCompanies = await createCompanies(accountId, hqApiToken, createList);
            log(`🏢 Successfully created ${createdCompanies.length} out of ${createList.length} companies`);

            // Re-fetch companies
            companies = await fetchAllCompanies(accountId, twoLeggedToken);
            companyMap.clear();
            companies.forEach(c => {
                if (c.name) companyMap.set(c.name.trim().toLowerCase(), c.id);
            });
            log('Re-fetched companies after creation, total:', companies.length);
            log('🏢 Company map now contains:', Array.from(companyMap.keys()).join(', '));

            // Update companyIds in toPatch/toAdd
            toPatch.forEach(item => {
                if (item.companyName) {
                    const oldId = item.companyId;
                    item.companyId = companyMap.get(item.companyName.trim().toLowerCase()) || null;
                    if (oldId !== item.companyId) {
                        log(`🔄 Updated companyId for ${item.email}: "${oldId}" → "${item.companyId}"`);
                    }
                }
            });
            toAdd.forEach(item => {
                if (item.companyName) {
                    const oldId = item.companyId;
                    item.companyId = companyMap.get(item.companyName.trim().toLowerCase()) || null;
                    if (oldId !== item.companyId) {
                        log(`🔄 Updated companyId for ${item.email}: "${oldId}" → "${item.companyId}"`);
                    }
                }
            });
        }

        // If performOps is false, return lists for review
        if (!options.performOps) {
            console.log('⏹️ EARLY RETURN: performOps is false, returning without operations');
            return { toPatch, toAdd };
        }

        // Otherwise, perform PATCH and POST operations
        const results = { patched: [], added: [], errors: [], invalidRoles: new Map() };

        // Check authentication level for realistic error handling
        // HQ API operations require 2-legged tokens with account:write scope
        const hasProperAuth = hqApiToken && userToken === hqApiToken;
        simulationMode = simulationMode || !hasProperAuth; // Update existing variable
        
        if (simulationMode) {
            console.warn('⚠️ Running in SIMULATION MODE - operations will show what WOULD be done');
        } else {
            log('🚀 Attempting real operations with 2-legged token + account:write scope');
        }

        // PATCH existing users with rate limiting (OPTIMIZED)
        // Process in small batches with delays to avoid API rate limits
        const PATCH_BATCH_SIZE = 5; // OPTIMIZATION: Increased from 3 to 5 users at a time
        const DELAY_BETWEEN_BATCHES = 400; // OPTIMIZATION: Reduced from 1500ms to 400ms
        
        log(`📝 Processing ${toPatch.length} PATCH operations in batches of ${PATCH_BATCH_SIZE} (OPTIMIZED)`);
        
        for (let i = 0; i < toPatch.length; i += PATCH_BATCH_SIZE) {
            const batch = toPatch.slice(i, i + PATCH_BATCH_SIZE);
            log(`📝 Processing PATCH batch ${Math.floor(i / PATCH_BATCH_SIZE) + 1}/${Math.ceil(toPatch.length / PATCH_BATCH_SIZE)} (users ${i + 1}-${Math.min(i + PATCH_BATCH_SIZE, toPatch.length)} of ${toPatch.length})`);
            
            // Process batch sequentially to avoid Promise.all issues with error handling
            for (const item of batch) {
                try {
                    const body = {};
                    if (item.companyId) body.company_id = item.companyId;
                    if (item.default_role) body.default_role = item.default_role;
                    
                    // Only include fields we have
                    if (Object.keys(body).length === 0) {
                        log(`⏭️ Skipping patch for ${item.email} - no data to update`);
                        results.patched.push({ email: item.email, skipped: true });
                        continue;
                    }
                    
                    log(`📝 Attempting to update ${item.email} with:`, body);
                    
                    if (simulationMode) {
                        // Simulate success
                        results.patched.push({ 
                            email: item.email, 
                            simulated: true, 
                            changes: body,
                            note: 'Would update: ' + Object.keys(body).join(', ')
                        });
                        log(`✅ SIMULATION: Would update ${item.email} with:`, body);
                    } else {
                        // Try actual operation
                        let retryCount = 0;
                        let success = false;
                        
                        while (!success && retryCount < 3) {
                            try {
                                log(`🔍 PATCH URL: https://developer.api.autodesk.com/hq/v1/accounts/${accountId}/users/${item.userId}`);
                                log(`🔍 PATCH Body:`, JSON.stringify(body, null, 2));
                                const result = await patchUser(accountId, item.userId, userToken, body);
                                results.patched.push({ email: item.email, changes: body });
                                log(`✅ Successfully updated ${item.email} with:`, body);
                                log(`✅ API Response:`, JSON.stringify(result, null, 2));
                                success = true;
                            } catch (patchError) {
                                console.error(`❌ Patch attempt ${retryCount + 1} failed for ${item.email}:`, patchError.message);
                                console.error(`❌ Full error:`, patchError);
                                
                                if (patchError.message.includes('403') || patchError.message.includes('privilege') || patchError.message.includes('AUTH-010')) {
                                    // Switch to simulation mode for this and future operations
                                    simulationMode = true;
                                    console.warn('⚠️ Switching to SIMULATION MODE due to authentication error:', patchError.message);
                                    results.patched.push({ 
                                        email: item.email, 
                                        simulated: true, 
                                        changes: body,
                                        note: 'Would update: ' + Object.keys(body).join(', ') + ' (auth failed)'
                                    });
                                    log(`✅ SIMULATION: Would update ${item.email} with:`, body);
                                    success = true; // Don't retry, just switch to simulation
                                    
                                } else if (patchError.message.includes('404') && patchError.message.includes("this default_role doesn't exist")) {
                                    // Invalid role - retry WITHOUT the role field but keep company
                                    const role = item.default_role || body.default_role || 'unknown';
                                    console.warn(`⚠️ Invalid role "${role}" for ${item.email} - retrying without role field`);
                                    
                                    // Track invalid role for warning
                                    if (!results.invalidRoles.has(role)) {
                                        results.invalidRoles.set(role, []);
                                    }
                                    results.invalidRoles.get(role).push(item.email);
                                    
                                    // Retry PATCH without the role field - PRESERVE company_id from original body
                                    try {
                                        const bodyWithoutRole = {};
                                        // Use company_id from original body object instead of item.companyId
                                        if (body.company_id !== undefined) {
                                            bodyWithoutRole.company_id = body.company_id;
                                        }
                                        
                                        // Only retry if there's something to update (company)
                                        if (Object.keys(bodyWithoutRole).length > 0) {
                                            console.log(`🔄 Retrying PATCH for ${item.email} without role, updating:`, bodyWithoutRole);
                                            const retryResult = await patchUser(accountId, item.userId, userToken, bodyWithoutRole);
                                            results.patched.push({ 
                                                email: item.email, 
                                                changes: bodyWithoutRole,
                                                note: `Updated company - invalid role "${role}" was skipped`
                                            });
                                            console.log(`✅ Successfully updated ${item.email} without role:`, bodyWithoutRole);
                                            console.log(`✅ Retry result:`, JSON.stringify(retryResult));
                                        } else {
                                            // No company to update - user was only being updated for invalid role
                                            console.log(`⚠️ No changes for ${item.email} - only invalid role was being updated`);
                                            results.patched.push({ 
                                                email: item.email, 
                                                changes: {},
                                                note: `No changes - only invalid role "${role}" was specified`
                                            });
                                        }
                                    } catch (retryError) {
                                        console.error(`❌ Retry without role failed for ${item.email}:`, retryError.message);
                                        results.errors.push({ 
                                            email: item.email, 
                                            operation: 'PATCH_RETRY', 
                                            error: retryError.message 
                                        });
                                    }
                                    
                                    success = true; // Don't retry again - we already tried without role
                                    
                                } else if (patchError.message.includes('429') || patchError.message.includes('Too Many Requests') || patchError.message.includes('rate limit')) {
                                    // Rate limit hit - wait and retry
                                    retryCount++;
                                    if (retryCount < 3) {
                                        const waitTime = 2000 * retryCount; // Exponential backoff: 2s, 4s
                                        console.warn(`⚠️ Rate limit hit for ${item.email}, waiting ${waitTime}ms before retry ${retryCount}/2...`);
                                        await new Promise(resolve => setTimeout(resolve, waitTime));
                                    } else {
                                        // Max retries reached
                                        console.error(`❌ Max retries reached for ${item.email}, adding to errors`);
                                        results.errors.push({ email: item.email, operation: 'PATCH', error: 'Rate limit - max retries exceeded' });
                                        success = true; // Stop retrying
                                    }
                                    
                                } else {
                                    // Other error - add to errors and stop retrying
                                    console.error(`❌ Unhandled error for ${item.email}:`, patchError.message);
                                    results.errors.push({ email: item.email, operation: 'PATCH', error: patchError.message });
                                    success = true; // Stop retrying
                                }
                            }
                        }
                    }
                    
                    // OPTIMIZATION: Reduced delay from 200ms to 50ms between individual requests within batch
                    await new Promise(resolve => setTimeout(resolve, 50));
                    
                } catch (err) {
                    console.error(`❌ Outer catch - Patch error for ${item.email}:`, err.message);
                    results.errors.push({ email: item.email, operation: 'PATCH', error: err.message });
                }
            }
            
            // Add delay between batches (except for the last batch)
            if (i + PATCH_BATCH_SIZE < toPatch.length) {
                log(`⏱️ Waiting ${DELAY_BETWEEN_BATCHES}ms before next batch...`);
                await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
            }
        }

        // POST new users in batches (API takes an array)
        console.log('📍 REACHED POST SECTION - about to add', toAdd.length, 'users');
        try {
            if (toAdd.length > 0) {
                console.log('🚀 Starting import of', toAdd.length, 'users...');
                log('About to call importUsers with:', toAdd.length, 'users');
                log('typeof importUsers:', typeof importUsers);
                
                // Use window reference to ensure function is accessible
                const importUsersFunction = window.importUsers || importUsers;
                log('typeof importUsersFunction:', typeof importUsersFunction);
                
                if (typeof importUsersFunction !== 'function') {
                    console.error('importUsers function is not available, switching to simulation mode');
                    simulationMode = true;
                }
                
                if (simulationMode) {
                    // Simulate adding users
                    toAdd.forEach(item => {
                        results.added.push({ 
                            email: item.email, 
                            simulated: true,
                            details: item,
                            note: `Would add user with role: ${item.default_role || 'Team Member'}`
                        });
                        log(`✅ SIMULATION: Would add user ${item.email} with role ${item.default_role || 'Team Member'}`);
                    });
                } else {
                    // Try actual operation, but switch to simulation on 403
                    try {
                        const importResult = await importUsersFunction(accountId, userToken, toAdd);
                        log('Import result:', importResult);
                        
                        // Handle batched import results
                        if (importResult.success_items && importResult.success_items.length > 0) {
                            importResult.success_items.forEach(item => {
                                results.added.push({ email: item.email, id: item.id });
                            });
                        }
                        
                        // Track any failures from batches
                        if (importResult.failure_items && importResult.failure_items.length > 0) {
                            // Separate invalid role failures for retry
                            const invalidRoleUsers = [];
                            const otherFailures = [];
                            
                            importResult.failure_items.forEach(item => {
                                // Check if error is due to invalid role
                                const errorMsg = item.error || item.details || '';
                                if (errorMsg.includes("this default_role doesn't exist") || (item.details && item.details.includes("this default_role doesn't exist"))) {
                                    invalidRoleUsers.push(item);
                                } else {
                                    otherFailures.push(item);
                                }
                            });
                            
                            // Handle invalid role users - RETRY without role field
                            if (invalidRoleUsers.length > 0) {
                                console.log(`🔄 Retrying ${invalidRoleUsers.length} users with invalid roles (without role field)...`);
                                console.log(`🔍 invalidRoleUsers =`, JSON.stringify(invalidRoleUsers, null, 2));
                                console.log(`🔍 toAdd array length:`, toAdd.length);
                                console.log(`🔍 toAdd emails:`, toAdd.map(u => u.email));
                                
                                for (const item of invalidRoleUsers) {
                                    console.log(`🔍 Loop iteration - processing item:`, JSON.stringify(item));
                                    // API returns failures as {item: {...}, error: "..."}  so access item.item.email
                                    const failedUser = toAdd.find(u => u.email === item.item.email);
                                    console.log(`🔍 failedUser lookup result:`, failedUser ? 'FOUND' : 'NOT FOUND');
                                    if (!failedUser) {
                                        console.log(`⚠️ Skipping ${item.item?.email || 'unknown'} - not found in toAdd array`);
                                        continue;
                                    }
                                    
                                    const invalidRole = failedUser.default_role || 'unknown';
                                    console.warn(`⚠️ Retrying ${item.item.email} WITHOUT invalid role "${invalidRole}"`);
                                    
                                    // Track invalid role for warning
                                    if (!results.invalidRoles.has(invalidRole)) {
                                        results.invalidRoles.set(invalidRole, []);
                                    }
                                    results.invalidRoles.get(invalidRole).push(item.email);
                                    
                                    // Retry adding user WITHOUT the role field
                                    try {
                                        const userWithoutRole = {
                                            email: failedUser.email,
                                            first_name: failedUser.first_name,
                                            last_name: failedUser.last_name,
                                            nickname: failedUser.nickname
                                        };
                                        
                                        // Add company fields if available
                                        if (failedUser.company) {
                                            userWithoutRole.company = failedUser.company;
                                        }
                                        if (failedUser.companyName) {
                                            userWithoutRole.companyName = failedUser.companyName;
                                        }
                                        if (failedUser.companyId) {
                                            userWithoutRole.companyId = failedUser.companyId;
                                        }
                                        
                                        console.log(`🔄 Retrying user without role:`, JSON.stringify(userWithoutRole));
                                        console.log(`🔍 User has companyId: "${userWithoutRole.companyId || '(none)'}"`);
                                        
                                        // Retry with single user import
                                        const retryResult = await importUsersFunction(accountId, userToken, [userWithoutRole]);
                                        
                                        console.log(`📋 Retry result:`, JSON.stringify(retryResult));
                                        
                                        if (retryResult.success > 0) {
                                            results.added.push({ 
                                                email: failedUser.email, 
                                                id: retryResult.success_items?.[0]?.id,
                                                note: `Added without invalid role "${invalidRole}"`
                                            });
                                            console.log(`✅ Successfully added ${failedUser.email} without role`);
                                        } else {
                                            // Retry also failed for other reasons
                                            results.errors.push({ 
                                                operation: 'IMPORT_RETRY', 
                                                email: failedUser.email,
                                                error: `Failed to add even without role: ${retryResult.failure_items?.[0]?.error || 'Unknown error'}`
                                            });
                                            console.log(`❌ Failed to add ${failedUser.email} even without role`);
                                        }
                                        
                                        // Small delay between retries
                                        await new Promise(resolve => setTimeout(resolve, 200));
                                        
                                    } catch (retryError) {
                                        console.error(`❌ Error retrying ${item.item.email}:`, retryError);
                                        results.errors.push({ 
                                            operation: 'IMPORT_RETRY', 
                                            email: item.item.email,
                                            error: retryError.message
                                        });
                                    }
                                }
                            }
                            
                            // Handle other failures (not role-related)
                            otherFailures.forEach(item => {
                                results.errors.push({ 
                                    operation: 'IMPORT', 
                                    email: item.email,
                                    error: item.error || 'Import failed'
                                });
                            });
                        }
                        
                        log(`✅ Import completed: ${importResult.success} succeeded, ${importResult.failure} failed out of ${toAdd.length} users`);
                    } catch (authError) {
                        if (authError.message.includes('403') || authError.message.includes('privilege') || authError.message.includes('AUTH-010')) {
                            // Switch to simulation mode
                            simulationMode = true;
                            console.warn('⚠️ Switching to SIMULATION MODE for imports due to authentication error');
                            toAdd.forEach(item => {
                                results.added.push({ 
                                    email: item.email, 
                                    simulated: true,
                                    details: item,
                                    note: `Would add user with role: ${item.default_role || 'Team Member'} (auth failed)`
                                });
                                log(`✅ SIMULATION: Would add user ${item.email} with role ${item.default_role || 'Team Member'}`);
                            });
                        } else {
                            throw authError;
                        }
                    }
                }
            }
        } catch (err) {
            console.error('Import users error:', err.message || err);
            console.error('Error stack:', err.stack);
            results.errors.push({ operation: 'IMPORT', error: err.message || String(err) });
        }

        return results;

    } catch (err) {
        console.error('updateAccountUsersForAccount error:', err);
        throw err;
    }
}

// Expose a global wrapper for UI with progress bar
async function updateAccountUsersInteractive(accountId) {
    log('🚀 updateAccountUsersInteractive called with accountId:', accountId);
    
    // Create progress modal
    createProgressModal();
    
    try {
        updateProgress('Starting user comparison...', 0);
        
        // Add detailed debugging
        log('📊 Available functions check:');
        log('- get2LeggedToken:', typeof get2LeggedToken);
        log('- currentAccessToken:', typeof currentAccessToken);
        log('- fetchJSON:', typeof fetchJSON);
        log('- updateAccountUsersForAccount:', typeof updateAccountUsersForAccount);
        
        // Preview first
        updateProgress('Running preview analysis...', 10);
        const preview = await updateAccountUsersForAccount(accountId, { performOps: false });
        log('✅ Preview result:', preview);

        updateProgress(`Found: ${preview.toPatch.length} to update, ${preview.toAdd.length} to add`, 20);
        
        // Show preview in progress modal
        showPreviewInModal(preview);
        
        // Wait for user confirmation
        const proceed = await waitForUserConfirmation();
        if (!proceed) {
            updateProgress('Operation cancelled by user', 100);
            setTimeout(hideProgressModal, 2000);
            return;
        }

        updateProgress('Performing operations...', 40);
        
        // Perform operations
        const results = await updateAccountUsersForAccount(accountId, { performOps: true });
        log('✅ Operation results:', results);
        
        updateProgress('Operations completed', 100);
        
        // Show results
        showResultsInModal(results);
        
    } catch (err) {
        console.error('❌ Error during update:', err);
        console.error('❌ Error stack:', err.stack);
        updateProgress(`Error: ${err.message}`, 100);
        showErrorInModal(err.message);
    }
}

function createProgressModal() {
    // Remove existing modal if any
    const existing = document.getElementById('updateProgressModal');
    if (existing) existing.remove();
    
    const modalHTML = `
        <div id="updateProgressModal" style="
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.7);
            z-index: 10000;
            display: flex;
            justify-content: center;
            align-items: center;
        ">
            <div style="
                background: white;
                padding: 30px;
                border-radius: 8px;
                min-width: 500px;
                max-width: 700px;
                font-family: 'Artifact Elements', Arial, sans-serif;
            ">
                <h3 style="margin-top: 0; color: #0696D7;">Update Account Users</h3>
                
                <div id="progressMessage" style="margin: 20px 0; font-size: 14px;">
                    Initializing...
                </div>
                
                <div style="
                    width: 100%;
                    height: 20px;
                    background: #f0f0f0;
                    border-radius: 10px;
                    overflow: hidden;
                    margin: 20px 0;
                ">
                    <div id="progressBar" style="
                        height: 100%;
                        background: #0696D7;
                        width: 0%;
                        transition: width 0.3s ease;
                    "></div>
                </div>
                
                <div id="progressDetails" style="
                    max-height: 200px;
                    overflow-y: auto;
                    background: #f9f9f9;
                    padding: 15px;
                    border-radius: 4px;
                    font-size: 12px;
                    margin: 15px 0;
                    display: none;
                "></div>
                
                <div id="progressButtons" style="text-align: center; margin-top: 20px;">
                    <button id="progressCloseBtn" onclick="hideProgressModal()" style="
                        background: #666;
                        color: white;
                        border: none;
                        padding: 8px 16px;
                        border-radius: 4px;
                        cursor: pointer;
                        font-family: 'Artifact Elements', Arial, sans-serif;
                        display: none;
                    ">Close</button>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
}

function updateProgress(message, percentage) {
    const messageEl = document.getElementById('progressMessage');
    const barEl = document.getElementById('progressBar');
    
    if (messageEl) messageEl.textContent = message;
    if (barEl) barEl.style.width = percentage + '%';
}

function showPreviewInModal(preview) {
    const detailsEl = document.getElementById('progressDetails');
    if (!detailsEl) return;
    
    let html = '<strong>Preview:</strong><br>';
    html += `• ${preview.toPatch.length} users to update<br>`;
    html += `• ${preview.toAdd.length} users to add<br><br>`;
    
    if (preview.toPatch.length > 0) {
        html += '<strong>Users to update:</strong><br>';
        preview.toPatch.slice(0, 5).forEach(u => {
            html += `- ${u.email}<br>`;
        });
        if (preview.toPatch.length > 5) {
            html += `... and ${preview.toPatch.length - 5} more<br>`;
        }
        html += '<br>';
    }
    
    if (preview.toAdd.length > 0) {
        html += '<strong>Users to add:</strong><br>';
        preview.toAdd.slice(0, 5).forEach(u => {
            html += `- ${u.email}<br>`;
        });
        if (preview.toAdd.length > 5) {
            html += `... and ${preview.toAdd.length - 5} more<br>`;
        }
    }
    
    detailsEl.innerHTML = html;
    detailsEl.style.display = 'block';
    
    // Add confirmation buttons
    const buttonsEl = document.getElementById('progressButtons');
    buttonsEl.innerHTML = `
        <button onclick="confirmOperation(true)" style="
            background: #0696D7;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            font-family: 'Artifact Elements', Arial, sans-serif;
            margin-right: 10px;
        ">Proceed</button>
        <button onclick="confirmOperation(false)" style="
            background: #666;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            font-family: 'Artifact Elements', Arial, sans-serif;
        ">Cancel</button>
    `;
}

function showResultsInModal(results) {
    const detailsEl = document.getElementById('progressDetails');
    if (!detailsEl) {
        console.error('Progress modal not found, creating new one');
        createProgressModal();
        return showResultsInModal(results); // Retry
    }
    
    let html = '<strong>Results:</strong><br>';
    
    // Count simulated vs real operations
    const simulatedPatches = results.patched.filter(p => p.simulated).length;
    const realPatches = results.patched.length - simulatedPatches;
    const simulatedAdded = results.added.filter(a => a.simulated).length;
    const realAdded = results.added.length - simulatedAdded;
    
    if (simulatedPatches > 0 || simulatedAdded > 0) {
        html += '<strong>🎭 SIMULATION RESULTS:</strong><br>';
        html += `• ${simulatedPatches} users would be updated<br>`;
        html += `• ${simulatedAdded} users would be added<br>`;
        if (realPatches > 0 || realAdded > 0) {
            html += '<strong>✅ ACTUAL OPERATIONS:</strong><br>';
            html += `• ${realPatches} users actually updated<br>`;
            html += `• ${realAdded} users actually added<br>`;
        }
    } else {
        html += `• ${results.patched.length} users updated<br>`;
        html += `• ${results.added.length} users added<br>`;
    }
    
    html += `• ${results.errors.length} errors<br><br>`;
    
    // Show invalid roles warning
    const invalidRoleCount = results.invalidRoles?.size || 0;
    if (invalidRoleCount > 0) {
        html += '<strong style="color: #d32f2f;">⚠️ INVALID ROLES - Users SKIPPED:</strong><br>';
        html += '<div style="background: #fff3cd; border-left: 3px solid #ffc107; padding: 10px; margin: 10px 0;">';
        for (const [role, emails] of results.invalidRoles) {
            html += `<strong style="color: #856404;">Role "${role}" doesn't exist in this account:</strong><br>`;
            html += '<ul style="margin: 5px 0; padding-left: 20px; color: #856404;">';
            emails.forEach(email => {
                html += `<li>${email}</li>`;
            });
            html += '</ul>';
        }
        html += '<div style="margin-top: 10px; padding: 8px; background: #e3f2fd; border: 1px solid #2196f3; border-radius: 4px; font-size: 13px;">';
        html += '<strong>Action Required:</strong> Check your account settings to see which roles are configured, then update the JSON file with valid roles.';
        html += '</div>';
        html += '</div><br>';
    }
    
    // Show simulated operations
    const simulatedOps = [...results.patched.filter(p => p.simulated), ...results.added.filter(a => a.simulated)];
    if (simulatedOps.length > 0) {
        html += '<strong>📝 What would be done:</strong><br>';
        simulatedOps.slice(0, 10).forEach(op => {
            html += `- ${op.email}: ${op.note || 'Operation would be performed'}<br>`;
        });
        if (simulatedOps.length > 10) {
            html += `... and ${simulatedOps.length - 10} more operations<br>`;
        }
        html += '<br>';
    }
    
    if (results.errors.length > 0) {
        html += '<strong>❌ Errors:</strong><br>';
        results.errors.forEach(err => {
            html += `- ${err.email || 'Unknown'}: ${err.error}<br>`;
        });
    }
    
    detailsEl.innerHTML = html;
    detailsEl.style.display = 'block';
    
    // Show close button safely
    const closeBtn = document.getElementById('progressCloseBtn');
    if (closeBtn) closeBtn.style.display = 'inline-block';
    
    const buttonsEl = document.getElementById('progressButtons');
    if (buttonsEl) {
        buttonsEl.innerHTML = `
            <button onclick="hideProgressModal()" style="
                background: #0696D7;
                color: white;
                border: none;
                padding: 8px 16px;
                border-radius: 4px;
                cursor: pointer;
                font-family: 'Artifact Elements', Arial, sans-serif;
            ">Close</button>
        `;
    }
}

function showErrorInModal(errorMessage) {
    const detailsEl = document.getElementById('progressDetails');
    if (!detailsEl) return;
    
    detailsEl.innerHTML = `<strong>Error:</strong><br>${escapeHtml(errorMessage)}`;
    detailsEl.style.display = 'block';
    detailsEl.style.background = '#ffebee';
    
    // Show close button
    document.getElementById('progressButtons').innerHTML = `
        <button onclick="hideProgressModal()" style="
            background: #d32f2f;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            font-family: 'Artifact Elements', Arial, sans-serif;
        ">Close</button>
    `;
}

function hideProgressModal() {
    const modal = document.getElementById('updateProgressModal');
    if (modal) modal.remove();
}

// Global variables for confirmation handling
let operationConfirmResolve = null;

function waitForUserConfirmation() {
    return new Promise((resolve) => {
        operationConfirmResolve = resolve;
    });
}

function confirmOperation(proceed) {
    if (operationConfirmResolve) {
        operationConfirmResolve(proceed);
        operationConfirmResolve = null;
    }
}

// Make function available globally
window.updateAccountUsersInteractive = updateAccountUsersInteractive;
window.updateAccountUsersForAccount = updateAccountUsersForAccount;
window.importUsers = importUsers;
window.fetchAllAccountUsers = fetchAllAccountUsers;
window.createCompanies = createCompanies;
window.patchUser = patchUser;
