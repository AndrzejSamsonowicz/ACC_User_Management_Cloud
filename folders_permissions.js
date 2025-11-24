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
        
        console.log('🔐 Fetching permissions for folder:', folderId);

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
            console.log(`✅ Found ${permissions.length} permissions for folder`);
            
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
        console.log('🔐 Fetching permissions for all folders in hierarchy...');
        
        const permissionsMap = {};
        const uniqueFolderIds = new Set();

        // Collect all unique folder IDs from hierarchy
        hierarchy.forEach(row => {
            if (row.level1?.id) uniqueFolderIds.add(row.level1.id);
            if (row.level2?.id) uniqueFolderIds.add(row.level2.id);
            if (row.level3?.id) uniqueFolderIds.add(row.level3.id);
        });

        console.log(`📂 Found ${uniqueFolderIds.size} unique folders to fetch permissions for`);

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
            
            console.log(`📊 Progress: ${Math.min(i + batchSize, folderIds.length)}/${folderIds.length} folders`);
        }

        console.log('✅ Finished fetching all folder permissions');
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
     * @param {Array<string>} actions - Array of permission actions
     * @returns {number} Permission level (1-6)
     */
    function actionsToPermissionLevel(actions) {
        if (!actions || actions.length === 0) return 1;
        
        const actionsSet = new Set(actions);
        
        // Check from highest to lowest permission level
        if (actionsSet.has('CONTROL')) return 6;
        if (actionsSet.has('EDIT')) return 5;
        if (actionsSet.has('PUBLISH')) return 4;
        if (actionsSet.has('PUBLISH_MARKUP')) return 3;
        if (actionsSet.has('DOWNLOAD')) return 2;
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
            const userPermissions = {};
            
            permissions.forEach(perm => {
                // Only process USER type permissions
                if (perm.subjectType === 'USER' && perm.email) {
                    const user = findUserByEmail(perm.email, projectUsers);
                    if (user) {
                        const level = actionsToPermissionLevel(perm.actions);
                        userPermissions[perm.email] = {
                            user: perm.email,
                            level: level,
                            name: perm.name,
                            subjectId: perm.subjectId,
                            autodeskId: perm.autodeskId,
                            actions: perm.actions
                        };
                    }
                }
            });
            
            if (Object.keys(userPermissions).length > 0) {
                userPermissionsMap[folderId] = userPermissions;
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

    console.log('🔐 Folder Permissions module initialized');

})();
