/**
 * Folder Permissions Management Module
 * Handles fetching existing permissions and comparing with new assignments
 */

(function() {
    'use strict';

    /**
     * Fetch existing folder permissions from ACC
     * @param {string} projectId - The project ID (without 'b.' prefix for BIM360 API)
     * @param {string} folderId - The folder ID (URN)
     * @param {string} accessToken - OAuth access token
     * @returns {Promise<Array>} Array of permission objects
     */
    async function fetchFolderPermissions(projectId, folderId, accessToken) {
        // Remove 'b.' prefix if present for BIM360 API
        const formattedProjectId = projectId.startsWith('b.') ? projectId.substring(2) : projectId;
        const encodedFolderId = encodeURIComponent(folderId);
        const url = `https://developer.api.autodesk.com/bim360/docs/v1/projects/${formattedProjectId}/folders/${encodedFolderId}/permissions`;
        
        log('🔐 Fetching permissions for folder:', folderId);

        try {
            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                if (response.status === 404) {
                    console.warn(`⚠️ Folder not found or no permissions: ${folderId}`);
                    return [];
                }
                throw new Error(`Failed to fetch permissions: ${response.status} ${response.statusText}`);
            }

            const permissions = await response.json();
            log(`✅ Found ${permissions.length} permissions for folder`);
            
            return permissions;
        } catch (error) {
            console.error('❌ Error fetching folder permissions:', error);
            return [];
        }
    }

    /**
     * Fetch all folder permissions for the hierarchy
     * @param {string} projectId - The project ID
     * @param {Array} hierarchy - The folder hierarchy array
     * @param {string} accessToken - OAuth access token
     * @returns {Promise<Object>} Map of folderId to permissions array
     */
    async function fetchAllFolderPermissions(projectId, hierarchy, accessToken) {
        log('🔐 Fetching permissions for all folders in hierarchy...');
        
        const permissionsMap = {};
        const uniqueFolderIds = new Set();

        // Collect all unique folder IDs from hierarchy
        hierarchy.forEach(row => {
            if (row.level1?.id) uniqueFolderIds.add(row.level1.id);
            if (row.level2?.id) uniqueFolderIds.add(row.level2.id);
            if (row.level3?.id) uniqueFolderIds.add(row.level3.id);
        });

        log(`📂 Found ${uniqueFolderIds.size} unique folders to fetch permissions for`);

        // Fetch permissions for each folder
        // Process in batches to avoid overwhelming the API
        const folderIds = Array.from(uniqueFolderIds);
        const batchSize = 5;
        
        for (let i = 0; i < folderIds.length; i += batchSize) {
            const batch = folderIds.slice(i, i + batchSize);
            const batchPromises = batch.map(folderId => 
                fetchFolderPermissions(projectId, folderId, accessToken)
                    .then(permissions => ({ folderId, permissions }))
            );
            
            const batchResults = await Promise.all(batchPromises);
            batchResults.forEach(({ folderId, permissions }) => {
                permissionsMap[folderId] = permissions;
            });
            
            log(`📊 Progress: ${Math.min(i + batchSize, folderIds.length)}/${folderIds.length} folders`);
        }

        log('✅ Finished fetching all folder permissions');
        return permissionsMap;
    }

    /**
     * Convert permission level (1-6) to ACC actions array
     * @param {string|number} level - Permission level (1-6)
     * @returns {Array<string>} Array of permission actions
     */
    function permissionLevelToActions(level) {
        const levelNum = parseInt(level);
        
        switch(levelNum) {
            case 1: // View Only
                return ['VIEW', 'COLLABORATE'];
            case 2: // View/Download
                return ['VIEW', 'DOWNLOAD', 'COLLABORATE'];
            case 3: // View/Download+PublishMarkups
                return ['VIEW', 'DOWNLOAD', 'COLLABORATE', 'PUBLISH_MARKUP'];
            case 4: // View/Download+PublishMarkups+Upload
                return ['PUBLISH', 'VIEW', 'DOWNLOAD', 'COLLABORATE', 'PUBLISH_MARKUP'];
            case 5: // View/Download+PublishMarkups+Upload+Edit
                return ['PUBLISH', 'VIEW', 'DOWNLOAD', 'COLLABORATE', 'PUBLISH_MARKUP', 'EDIT'];
            case 6: // Full controller
                return ['PUBLISH', 'VIEW', 'DOWNLOAD', 'COLLABORATE', 'PUBLISH_MARKUP', 'EDIT', 'CONTROL'];
            default:
                console.warn(`⚠️ Invalid permission level: ${level}, defaulting to level 1`);
                return ['VIEW', 'COLLABORATE'];
        }
    }

    /**
     * Convert ACC actions array to permission level (1-6)
     * Uses the HIGHER of direct actions or inheritActions
     * @param {Array<string>} actions - Array of direct permission actions
     * @param {Array<string>} inheritActions - Array of inherited permission actions
     * @returns {number} Permission level (1-6)
     */
    function actionsToPermissionLevel(actions, inheritActions) {
        // Combine both direct and inherited actions to get effective permissions
        const allActions = new Set([...(actions || []), ...(inheritActions || [])]);
        
        if (allActions.size === 0) return 1;
        
        // Check from highest to lowest permission level
        if (allActions.has('CONTROL')) return 6;
        if (allActions.has('EDIT')) return 5;
        if (allActions.has('PUBLISH')) return 4;
        if (allActions.has('PUBLISH_MARKUP')) return 3;
        if (allActions.has('DOWNLOAD')) return 2;
        return 1; // Default to View Only
    }

    /**
     * Find user by email in project users list
     * @param {string} email - User email
     * @param {Array} projectUsers - Array of project users
     * @returns {Object|null} User object or null
     */
    function findUserByEmail(email, projectUsers) {
        return projectUsers.find(user => 
            user.email.toLowerCase() === email.toLowerCase()
        ) || null;
    }

    /**
     * Match existing permissions to users in the table
     * @param {Object} permissionsMap - Map of folderId to permissions array
     * @param {Array} projectUsers - Array of project users
     * @returns {Object} Map of folderId to user email and permission level
     */
    function matchPermissionsToUsers(permissionsMap, projectUsers) {
        const userPermissionsMap = {};
        
        Object.keys(permissionsMap).forEach(folderId => {
            const permissions = permissionsMap[folderId];
            const subjectPermissions = {};
            
            permissions.forEach(perm => {
                const level = actionsToPermissionLevel(perm.actions, perm.inheritActions);
                const isInherited = (perm.inheritActions && perm.inheritActions.length > 0);
                
                // Process USER type permissions
                if (perm.subjectType === 'USER' && perm.email) {
                    // Filter out Project Admins - they have automatic full access in ACC
                    if (perm.userType === 'PROJECT_ADMIN') {
                        return; // Skip this permission
                    }
                    
                    const user = findUserByEmail(perm.email, projectUsers);
                    if (user) {
                        const identifier = perm.email;
                        
                        // Handle duplicates: keep the highest permission level
                        if (!subjectPermissions[identifier] || level > subjectPermissions[identifier].level) {
                            if (subjectPermissions[identifier]) {
                                console.warn(`🔄 DUPLICATE in source: ${identifier} L${subjectPermissions[identifier].level} -> L${level} (keeping higher)`);
                            }
                            subjectPermissions[identifier] = {
                                identifier: perm.email,
                                displayName: perm.email,
                                type: 'USER',
                                level: level,
                                isInherited: isInherited,
                                name: perm.name,
                                subjectId: perm.subjectId,
                                autodeskId: perm.autodeskId,
                                userType: perm.userType,
                                actions: perm.actions,
                                inheritActions: perm.inheritActions
                            };
                        } else {
                            console.warn(`⏭️ SKIPPING duplicate: ${identifier} keeping L${subjectPermissions[identifier].level}, ignoring L${level}`);
                        }
                    }
                }
                // Process ROLE type permissions (skip Administrator role)
                else if (perm.subjectType === 'ROLE' && perm.name) {
                    // Filter out Administrator role - it's automatically assigned in ACC
                    if (perm.name.toLowerCase() === 'administrator') {
                        return; // Skip this permission
                    }
                    const roleKey = `role_${perm.subjectId}`;
                    
                    // Handle duplicates: keep the highest permission level
                    if (!subjectPermissions[roleKey] || level > subjectPermissions[roleKey].level) {
                        subjectPermissions[roleKey] = {
                            identifier: roleKey,
                            displayName: `Role: ${perm.name}`,
                            type: 'ROLE',
                            level: level,
                            isInherited: isInherited,
                            name: perm.name,
                            subjectId: perm.subjectId,
                            autodeskId: perm.autodeskId,
                            actions: perm.actions,
                            inheritActions: perm.inheritActions
                        };
                    }
                }
                // Process COMPANY type permissions
                else if (perm.subjectType === 'COMPANY' && perm.name) {
                    const companyKey = `company_${perm.subjectId}`;
                    
                    // Handle duplicates: keep the highest permission level
                    if (!subjectPermissions[companyKey] || level > subjectPermissions[companyKey].level) {
                        subjectPermissions[companyKey] = {
                            identifier: companyKey,
                            displayName: `Company: ${perm.name}`,
                            type: 'COMPANY',
                            level: level,
                            isInherited: isInherited,
                            name: perm.name,
                            subjectId: perm.subjectId,
                            autodeskId: perm.autodeskId,
                            actions: perm.actions,
                            inheritActions: perm.inheritActions
                        };
                    }
                }
            });
            
            if (Object.keys(subjectPermissions).length > 0) {
                userPermissionsMap[folderId] = subjectPermissions;
            }
        });
        
        return userPermissionsMap;
    }

    // Export functions to global scope
    window.FolderPermissions = {
        fetchFolderPermissions,
        fetchAllFolderPermissions,
        permissionLevelToActions,
        actionsToPermissionLevel,
        findUserByEmail,
        matchPermissionsToUsers
    };

    log('🔐 Folder Permissions module initialized');

})();
