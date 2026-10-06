// update_account_users.js
// Handles comparison between account users and users_main_list
// and prepares lists for PATCH (update) and POST (add) operations.

log('🔁 update_account_users.js loaded');
// (escapeHtml is defined in shared/dom-utils.js, loaded before this file)

// Get 2-legged token with account:write scope for user management. Goes
// through /api/aps/token (server-side) instead of calling Autodesk directly —
// the browser never sees or sends the APS client secret.
async function get2LeggedTokenWithWriteScope() {
    if (typeof CLIENT_ID === 'undefined' || !CLIENT_ID) {
        throw new Error('CLIENT_ID not available');
    }

    try {
        // Based on APS docs, HQ APIs require account:read and account:write scopes.
        // Cached until near expiry (getCached2LeggedToken in index.html).
        const token = await getCached2LeggedToken('account:read account:write data:read');
        log('Got 2-legged token with account:write scope');
        return token;
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
            window.ActivityLog?.record({ tool: 'Account users', type: 'Company created', member: result?.name || company.name });
            
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
    
    const res = await apsFetch(url, {
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
// Account-level provisioning is identical for every project a table snapshot is
// synced to, but was re-run per call: once in prepareUsersBeforeSync and again in
// executeSyncOperations (single project), and once per project in multi-project
// sync - each run = token calls + full account-user + company pagination + PATCHes.
// Memoize by snapshot identity (collectTableUsers() returns a fresh array per sync,
// so a new sync always re-runs) and account.
const _accountUpdateMemo = new WeakMap(); // importUsersList -> Map(accountId -> Promise<results>)

async function updateAccountUsersForAccount(accountId, options = {performOps: false}, projectId = null, importUsersList = null) {
    if (!options.performOps || !Array.isArray(importUsersList)) {
        return _updateAccountUsersForAccount(accountId, options, projectId, importUsersList);
    }
    let byAccount = _accountUpdateMemo.get(importUsersList);
    if (!byAccount) {
        byAccount = new Map();
        _accountUpdateMemo.set(importUsersList, byAccount);
    }
    if (byAccount.has(accountId)) {
        log('♻️ Account users already updated for this table snapshot - reusing result');
        return byAccount.get(accountId);
    }
    const promise = _updateAccountUsersForAccount(accountId, options, projectId, importUsersList);
    byAccount.set(accountId, promise);
    promise.catch(() => byAccount.delete(accountId)); // let a failed run be retried
    return promise;
}

async function _updateAccountUsersForAccount(accountId, options = {performOps: false}, projectId = null, importUsersList = null) {
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

        // User data always comes from the live table. The server-side
        // /load-project-users fallback was removed along with that endpoint.
        if (!Array.isArray(importUsersList)) {
            throw new Error('No user data provided - collect the table users before updating the account');
        }
        const usersData = importUsersList;
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

        // Build email -> accountUser map (case-insensitive - emails differing only in
        // case are the same Autodesk identity; an exact match made existing members
        // look new, so they were re-POSTed and never got their company/role PATCH)
        const accountByEmail = new Map();
        accountUsers.forEach(u => {
            if (u.email) accountByEmail.set(u.email.toLowerCase(), u);
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

            const accountUser = accountByEmail.get(email.toLowerCase());
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

        // PATCH existing users through a small worker pool. Rate limiting is
        // handled by apsFetch inside patchUser (backs off on 429 / Retry-After),
        // so no fixed sleeps between requests are needed.
        const PATCH_CONCURRENCY = 4;

        log(`📝 Processing ${toPatch.length} PATCH operations with concurrency=${PATCH_CONCURRENCY}`);

        await runWithConcurrency(toPatch, PATCH_CONCURRENCY, async (item) => {
                try {
                    const body = {};
                    if (item.companyId) body.company_id = item.companyId;
                    if (item.default_role) body.default_role = item.default_role;
                    
                    // Only include fields we have
                    if (Object.keys(body).length === 0) {
                        log(`⏭️ Skipping patch for ${item.email} - no data to update`);
                        results.patched.push({ email: item.email, skipped: true });
                        return;
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
                } catch (err) {
                    console.error(`❌ Outer catch - Patch error for ${item.email}:`, err.message);
                    results.errors.push({ email: item.email, operation: 'PATCH', error: err.message });
                }
        });

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

        // Activity log: only real changes (not simulated, skipped or no-op patches)
        if (window.ActivityLog) {
            const companyNameById = new Map(companies.map(c => [c.id, c.name]));
            results.patched.forEach(p => {
                if (p.simulated || p.skipped || !p.changes || Object.keys(p.changes).length === 0) return;
                const details = [
                    p.changes.default_role && `Default role: ${p.changes.default_role}`,
                    p.changes.company_id && `Company: ${companyNameById.get(p.changes.company_id) || 'changed'}`
                ].filter(Boolean).join('; ');
                ActivityLog.record({ tool: 'Account users', type: 'Account member updated', member: p.email, details });
            });
            results.added.forEach(a => {
                if (a.simulated || !a.email) return;
                const source = toAdd.find(u => u.email && u.email.toLowerCase() === a.email.toLowerCase());
                const details = [
                    source?.companyName && `Company: ${source.companyName}`,
                    source?.default_role && `Default role: ${source.default_role}`
                ].filter(Boolean).join('; ');
                ActivityLog.record({ tool: 'Account users', type: 'Account member added', member: a.email, details });
            });
        }

        return results;

    } catch (err) {
        console.error('updateAccountUsersForAccount error:', err);
        throw err;
    }
}



// Make function available globally
window.updateAccountUsersForAccount = updateAccountUsersForAccount;
window.importUsers = importUsers;
window.fetchAllAccountUsers = fetchAllAccountUsers;
window.createCompanies = createCompanies;
window.patchUser = patchUser;
