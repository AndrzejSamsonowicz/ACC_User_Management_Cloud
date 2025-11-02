// Project Users Management
class ProjectUsersManager {
    constructor() {
        this.currentAccessToken = null;
        this.currentProjectId = null;
        this.currentProjectName = null;
        this.projectUsers = [];
        this.accountUsers = [];
        this.importUsers = [];
        this.createModal();
        this.loadImportUsers();
    }

    setAccessToken(token) {
        this.currentAccessToken = token;
    }

    // Helper to find a suitable admin user for User-Id header
    getAdminUserId() {
        // Look for an admin user in the import JSON first
        const adminUser = this.importUsers.find(user => 
            user.products.some(product => product.access === 'administrator')
        );
        
        if (adminUser) {
            // Try to find this user in the project users to get their ID
            const projectUser = this.projectUsers.find(pu => 
                pu.email.toLowerCase() === adminUser.email.toLowerCase()
            );
            if (projectUser) {
                console.log(`Using admin user ${adminUser.email} (${projectUser.id}) for User-Id header`);
                return projectUser.id;
            }
        }
        
        // Fallback: use the first project user we can find
        if (this.projectUsers.length > 0) {
            console.log(`Using first project user ${this.projectUsers[0].email} (${this.projectUsers[0].id}) for User-Id header`);
            return this.projectUsers[0].id;
        }
        
        console.warn('No suitable user found for User-Id header');
        return null;
    }

    // Helper to fetch project roles and find role ID by name
    async fetchProjectRoles(projectId) {
        try {
            const apiUrl = `https://developer.api.autodesk.com/construction/admin/v1/projects/${projectId}/roles`;
            console.log(`Fetching project roles: ${apiUrl}`);

            const response = await fetch(apiUrl, {
                headers: {
                    'Authorization': `Bearer ${this.currentAccessToken}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                console.warn(`Failed to fetch project roles: ${response.status} ${response.statusText}`);
                return [];
            }

            const rolesData = await response.json();
            console.log('Project roles:', rolesData);
            return rolesData.results || rolesData || [];
        } catch (error) {
            console.warn('Error fetching project roles:', error);
            return [];
        }
    }

    // Helper to find role ID by role name
    findRoleIdByName(roles, roleName) {
        if (!roles || !roleName) return null;
        
        const role = roles.find(r => 
            r.name && r.name.toLowerCase() === roleName.toLowerCase()
        );
        
        if (role) {
            console.log(`Found role ID ${role.id} for role name "${roleName}"`);
            return role.id;
        }
        
        console.warn(`No role found for name "${roleName}"`);
        return null;
    }

    // Helper to report progress to per-project UI
    reportProgress(progressId, text, percent) {
        try {
            if (!progressId) return;
            const progressEl = document.getElementById(progressId);
            const barId = progressId.replace('projectProgress-','projectProgressBar-');
            const textId = progressId.replace('projectProgress-','projectProgressText-');
            const progressBar = document.getElementById(barId);
            const progressText = document.getElementById(textId);
            if (progressEl) progressEl.style.display = 'block';
            if (progressBar && typeof percent === 'number') progressBar.style.width = `${percent}%`;
            if (progressText && text) progressText.textContent = text;
        } catch (e) {
            console.warn('reportProgress failed', e);
        }
    }

    // Load user permissions from import file
    async loadImportUsers() {
        try {
            const response = await fetch('user_permissions_import.json');
            const data = await response.json();
            this.importUsers = data.users || [];
            console.log('Loaded import users:', this.importUsers);
        } catch (error) {
            console.error('Error loading import users:', error);
            this.importUsers = [];
        }
    }

    createModal() {
        // Create modal HTML
        const modalHTML = `
            <div id="usersModal" class="users-modal" style="display: none;">
                <div class="users-modal-content">
                    <div class="users-modal-header">
                        <h3 id="modalTitle">Project Users</h3>
                        <span class="users-modal-close">&times;</span>
                    </div>
                    <div class="users-modal-body">
                        <div id="usersLoadingMessage">Loading users...</div>
                        <div id="usersTableContainer" style="display: none;">
                            <table id="usersTable">
                                <thead>
                                    <tr>
                                        <th>ID</th>
                                        <th>Email</th>
                                    </tr>
                                </thead>
                                <tbody id="usersTableBody">
                                </tbody>
                            </table>
                        </div>
                        <div id="usersErrorMessage" style="display: none; color: red;"></div>
                    </div>
                </div>
            </div>
        `;

        // Add CSS styles
        const styles = `
            <style>
                .users-modal {
                    position: fixed;
                    z-index: 1000;
                    left: 0;
                    top: 0;
                    width: 100%;
                    height: 100%;
                    background-color: rgba(0,0,0,0.5);
                }

                .users-modal-content {
                    background-color: #fefefe;
                    margin: 5% auto;
                    padding: 0;
                    border: 1px solid #888;
                    width: 80%;
                    max-width: 800px;
                    border-radius: 8px;
                    max-height: 80vh;
                    display: flex;
                    flex-direction: column;
                }

                .users-modal-header {
                    padding: 15px 20px;
                    background-color: #f1f1f1;
                    border-bottom: 1px solid #ddd;
                    border-radius: 8px 8px 0 0;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }

                .users-modal-header h3 {
                    margin: 0;
                    color: #333;
                }

                .users-modal-close {
                    color: #aaa;
                    font-size: 28px;
                    font-weight: bold;
                    cursor: pointer;
                    line-height: 1;
                }

                .users-modal-close:hover,
                .users-modal-close:focus {
                    color: #000;
                }

                .users-modal-body {
                    padding: 20px;
                    flex-grow: 1;
                    overflow-y: auto;
                }

                #usersTable {
                    width: 100%;
                    border-collapse: collapse;
                    margin-top: 10px;
                }

                #usersTable th,
                #usersTable td {
                    border: 1px solid #ddd;
                    padding: 12px;
                    text-align: left;
                }

                #usersTable th {
                    background-color: #f2f2f2;
                    font-weight: bold;
                    position: sticky;
                    top: 0;
                }

                #usersTable tr:nth-child(even) {
                    background-color: #f9f9f9;
                }

                #usersTable tr:hover {
                    background-color: #f5f5f5;
                }

                #usersLoadingMessage {
                    text-align: center;
                    padding: 40px;
                    font-size: 16px;
                    color: #666;
                }
            </style>
        `;

        // Add modal to the page
        document.head.insertAdjacentHTML('beforeend', styles);
        document.body.insertAdjacentHTML('beforeend', modalHTML);

        // Set up event listeners
        this.setupModalEvents();
    }

    setupModalEvents() {
        const modal = document.getElementById('usersModal');
        const closeBtn = document.querySelector('.users-modal-close');

        // Close modal when clicking the X
        closeBtn.addEventListener('click', () => {
            this.closeModal();
        });

        // Close modal when clicking outside of it
        window.addEventListener('click', (event) => {
            if (event.target === modal) {
                this.closeModal();
            }
        });

        // Close modal when pressing ESC key
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && modal.style.display === 'block') {
                this.closeModal();
            }
        });
    }

    async showProjectUsers(projectId, projectName) {
        this.currentProjectId = projectId;
        this.currentProjectName = projectName;
        
        const modal = document.getElementById('usersModal');
        const modalTitle = document.getElementById('modalTitle');
        const loadingMessage = document.getElementById('usersLoadingMessage');
        const tableContainer = document.getElementById('usersTableContainer');
        const errorMessage = document.getElementById('usersErrorMessage');
        
        // Set modal title
        modalTitle.textContent = `Users in: ${projectName}`;
        
        // Show modal and loading state
        modal.style.display = 'block';
        loadingMessage.style.display = 'block';
        tableContainer.style.display = 'none';
        errorMessage.style.display = 'none';

        try {
            // Fetch all users with pagination
            this.projectUsers = await this.fetchAllUsers(projectId);
            
            // Display users in table
            this.displayUsersTable(this.projectUsers);
            
            // Show table, hide loading
            loadingMessage.style.display = 'none';
            tableContainer.style.display = 'block';
            
        } catch (error) {
            console.error('Error fetching users:', error);
            
            // Show error message
            loadingMessage.style.display = 'none';
            errorMessage.textContent = `Failed to load users: ${error.message}`;
            errorMessage.style.display = 'block';
        }
    }

    async fetchAllUsers(projectId) {
        let allUsers = [];
        let offset = 0;
        const limit = 100;
        let hasMoreData = true;

        while (hasMoreData) {
            const queryParams = new URLSearchParams({
                'limit': limit.toString(),
                'offset': offset.toString()
            });

            const apiUrl = `https://developer.api.autodesk.com/construction/admin/v1/projects/${projectId}/users?${queryParams}`;
            console.log(`Fetching users: ${apiUrl}`);

            const response = await fetch(apiUrl, {
                headers: {
                    'Authorization': `Bearer ${this.currentAccessToken}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                let errorData;
                try {
                    errorData = await response.json();
                    console.log('Error response:', errorData);
                } catch (parseError) {
                    const textError = await response.text();
                    throw new Error(`HTTP ${response.status}: ${response.statusText} - ${textError}`);
                }
                
                const errorMessage = errorData.message || 
                                   errorData.error || 
                                   errorData.error_description || 
                                   (errorData.errors && errorData.errors[0] && errorData.errors[0].detail) ||
                                   `HTTP ${response.status}: ${response.statusText}`;
                throw new Error(errorMessage);
            }

            const usersData = await response.json();
            console.log(`Fetched ${usersData.results?.length || 0} users at offset ${offset}`);

            if (usersData.results && usersData.results.length > 0) {
                allUsers = allUsers.concat(usersData.results);

                // Update loading message with progress
                const loadingMessage = document.getElementById('usersLoadingMessage');
                const totalExpected = usersData.pagination ? usersData.pagination.totalResults : 'unknown';
                loadingMessage.textContent = `Loading users... Found ${allUsers.length}${totalExpected !== 'unknown' ? ` of ${totalExpected}` : ''} users so far.`;

                // Check pagination
                if (usersData.pagination && usersData.pagination.totalResults) {
                    if (allUsers.length >= usersData.pagination.totalResults) {
                        hasMoreData = false;
                    } else {
                        offset += limit;
                    }
                } else {
                    if (usersData.results.length < limit) {
                        hasMoreData = false;
                    } else {
                        offset += limit;
                    }
                }
            } else {
                hasMoreData = false;
            }

            // Safety check
            if (offset > 10000) {
                console.warn('Stopping at 10,000 users for safety');
                hasMoreData = false;
            }
        }

        return allUsers;
    }

    displayUsersTable(users) {
        const tableBody = document.getElementById('usersTableBody');
        
        // Clear existing rows
        tableBody.innerHTML = '';

        // Filter and sort users
        const validUsers = users
            .filter(user => user.email && user.id)
            .sort((a, b) => a.email.localeCompare(b.email));

        // Create table rows
        validUsers.forEach((user, index) => {
            const row = document.createElement('tr');
            
            // ID cell
            const idCell = document.createElement('td');
            idCell.textContent = user.id;
            idCell.style.fontFamily = 'monospace';
            idCell.style.fontSize = '12px';
            row.appendChild(idCell);
            
            // Email cell
            const emailCell = document.createElement('td');
            emailCell.textContent = user.email;
            row.appendChild(emailCell);
            
            tableBody.appendChild(row);
        });

        // Update modal title with count
        const modalTitle = document.getElementById('modalTitle');
        const currentTitle = modalTitle.textContent;
        modalTitle.textContent = `${currentTitle} (${validUsers.length} users)`;
    }

    // PATCH: Update existing users
    async updateProjectUsers(projectId, accountId, progressId) {
        console.log('Starting PATCH operation for existing users...');
        this.reportProgress(progressId, 'Starting update...', 2);
        
        if (!this.projectUsers.length) {
            console.log('No project users loaded, fetching...');
            this.projectUsers = await this.fetchAllUsers(projectId);
        }

        if (!this.accountUsers.length) {
            console.log('No account users loaded, fetching with 2-legged auth...');
            try {
                this.accountUsers = await accountUsersManager.fetchAllAccountUsersWith2LeggedAuth(accountId);
            } catch (error) {
                console.warn('Failed to fetch account users, continuing without company/role mapping:', error);
                this.accountUsers = [];
            }
        }

        // Find users that exist in both project and import JSON (match by email)
        const usersToUpdate = [];
        for (const importUser of this.importUsers) {
            const projectUser = this.projectUsers.find(pu => pu.email.toLowerCase() === importUser.email.toLowerCase());
            if (projectUser) {
                // Find account user to get company and role info
                const accountUser = this.accountUsers.find(au => au.email.toLowerCase() === importUser.email.toLowerCase());
                
                usersToUpdate.push({
                    projectUser,
                    importUser,
                    accountUser
                });
            }
        }

        console.log(`Found ${usersToUpdate.length} users to update`);
        if (usersToUpdate.length === 0) {
            this.reportProgress(progressId, 'No users to update', 100);
            return;
        }

        // Fetch project roles for role ID mapping
        this.reportProgress(progressId, 'Fetching project roles...', 10);
        const projectRoles = await this.fetchProjectRoles(projectId);

        for (let i = 0; i < usersToUpdate.length; i++) {
            const userInfo = usersToUpdate[i];
            try {
                this.reportProgress(progressId, `Updating ${i + 1} of ${usersToUpdate.length}: ${userInfo.projectUser.email}`, Math.round(((i + 10) / (usersToUpdate.length + 10)) * 100));
                await this.patchUser(projectId, userInfo.projectUser.id, userInfo.importUser, userInfo.accountUser, projectRoles);
                console.log(`Updated user: ${userInfo.projectUser.email}`);
            } catch (error) {
                console.error(`Failed to update user ${userInfo.projectUser.email}:`, error);
            }
        }

        this.reportProgress(progressId, 'Update completed', 100);
        console.log('PATCH operation completed');
    }

    async patchUser(projectId, userId, importUser, accountUser, projectRoles) {
        const patchData = {
            products: importUser.products
        };

        // Always update services if present in importUser
        if (importUser.services) {
            patchData.services = importUser.services;
            console.log(`User ${importUser.email}: updating services:`, importUser.services);
        }

        // Add role IDs based on role name from import user metadata
        let roleId = null;
        if (importUser.metadata && importUser.metadata.role && projectRoles) {
            roleId = this.findRoleIdByName(projectRoles, importUser.metadata.role);
            if (roleId) {
                patchData.roleIds = [roleId]; // Use first role ID as requested
                console.log(`User ${importUser.email}: mapped role "${importUser.metadata.role}" to roleId: ${roleId}`);
            } else {
                console.warn(`User ${importUser.email}: role '${importUser.metadata.role}' not found in project roles.`);
            }
        }

        // Add company name from import user metadata or account user
        if (importUser.metadata && importUser.metadata.company) {
            patchData.companyName = importUser.metadata.company;
            console.log(`User ${importUser.email}: using company from metadata: ${importUser.metadata.company}`);
        } else if (accountUser && accountUser.company) {
            patchData.companyName = accountUser.company;
            console.log(`User ${importUser.email}: using company from account user: ${accountUser.company}`);
        }

        console.log(`PATCH data for ${importUser.email}:`, JSON.stringify(patchData, null, 2));

        const apiUrl = `https://developer.api.autodesk.com/construction/admin/v1/projects/${projectId}/users/${userId}`;

        // Get a suitable admin user for the User-Id header
        const adminUserId = this.getAdminUserId();

        const headers = {
            'Authorization': `Bearer ${this.currentAccessToken}`,
            'Content-Type': 'application/json'
        };

        // Add User-Id header if we found a suitable user
        if (adminUserId) {
            headers['User-Id'] = adminUserId;
            console.log(`PATCH: Using User-Id header: ${adminUserId}`);
        }

        const response = await fetch(apiUrl, {
            method: 'PATCH',
            headers: headers,
            body: JSON.stringify(patchData)
        });

        if (!response.ok) {
            let errorData;
            try {
                errorData = await response.json();
                console.error('PATCH error response:', errorData);
            } catch (parseError) {
                const textError = await response.text();
                console.error('PATCH error response (text):', textError);
                throw new Error(`HTTP ${response.status}: ${response.statusText} - ${textError}`);
            }
            const errorMessage = errorData && (errorData.message || errorData.error || errorData.error_description || (errorData.errors && errorData.errors[0] && errorData.errors[0].detail)) || `HTTP ${response.status}: ${response.statusText}`;
            throw new Error(errorMessage);
        }

        const result = await response.json();
        console.log('PATCH success response:', result);
        return result;
    }

    // POST: Add new users
    async addNewProjectUsers(projectId, accountId, progressId) {
        console.log('Starting POST operation for new users...');
        this.reportProgress(progressId, 'Preparing to add users...', 2);
        
        if (!this.projectUsers.length) {
            console.log('No project users loaded, fetching...');
            this.projectUsers = await this.fetchAllUsers(projectId);
        }

        if (!this.accountUsers.length) {
            console.log('No account users loaded, fetching with 2-legged auth...');
            try {
                this.accountUsers = await accountUsersManager.fetchAllAccountUsersWith2LeggedAuth(accountId);
            } catch (error) {
                console.warn('Failed to fetch account users, continuing without company/role mapping:', error);
                this.accountUsers = [];
            }
        }

        // Find users that exist in import JSON but not in project (match by email)
        const usersToAdd = [];
        for (const importUser of this.importUsers) {
            const projectUser = this.projectUsers.find(pu => pu.email.toLowerCase() === importUser.email.toLowerCase());
            if (!projectUser) {
                // Find account user to get company and role info
                const accountUser = this.accountUsers.find(au => au.email.toLowerCase() === importUser.email.toLowerCase());
                
                usersToAdd.push({
                    importUser,
                    accountUser
                });
            }
        }

        console.log(`Found ${usersToAdd.length} users to add`);

        if (usersToAdd.length === 0) {
            this.reportProgress(progressId, 'No users to add', 100);
            console.log('No users to add');
            return;
        }

        // Fetch project roles for role ID mapping
        this.reportProgress(progressId, 'Fetching project roles...', 10);
        const projectRoles = await this.fetchProjectRoles(projectId);

        // Prepare users array for batch import
        const usersArray = usersToAdd.map(userInfo => {
            const userData = {
                email: userInfo.importUser.email,
                products: userInfo.importUser.products
            };

            // Add role IDs based on role name from import user metadata
            if (userInfo.importUser.metadata && userInfo.importUser.metadata.role && projectRoles) {
                const roleId = this.findRoleIdByName(projectRoles, userInfo.importUser.metadata.role);
                if (roleId) {
                    userData.roleIds = [roleId]; // Use first role ID as requested
                    console.log(`User ${userInfo.importUser.email}: mapped role "${userInfo.importUser.metadata.role}" to roleId: ${roleId}`);
                }
            }

            // Add company name from import user metadata
            if (userInfo.importUser.metadata && userInfo.importUser.metadata.company) {
                userData.companyName = userInfo.importUser.metadata.company;
                console.log(`User ${userInfo.importUser.email}: using company from metadata: ${userInfo.importUser.metadata.company}`);
            } else if (userInfo.accountUser && userInfo.accountUser.company) {
                userData.companyName = userInfo.accountUser.company;
                console.log(`User ${userInfo.importUser.email}: using company from account user: ${userInfo.accountUser.company}`);
            }

            console.log(`Prepared user data for ${userData.email}:`, userData);
            return userData;
        });

        try {
            this.reportProgress(progressId, `Importing ${usersArray.length} users...`, 20);
            await this.postUsers(projectId, usersArray);
            this.reportProgress(progressId, 'Add completed', 100);
            console.log('POST operation completed successfully');
        } catch (error) {
            this.reportProgress(progressId, `Add failed: ${error.message}`, 0);
            console.error('POST operation failed:', error);
            throw error;
        }
    }

    async postUsers(projectId, usersArray) {
        const apiUrl = `https://developer.api.autodesk.com/construction/admin/v2/projects/${projectId}/users:import`;
        
        console.log(`Posting ${usersArray.length} users to:`, apiUrl);
        console.log('Users payload:', JSON.stringify({ users: usersArray }, null, 2));
        
        // Get a suitable admin user for the User-Id header
        const adminUserId = this.getAdminUserId();
        
        const headers = {
            'Authorization': `Bearer ${this.currentAccessToken}`,
            'Content-Type': 'application/json'
        };
        
        // Add User-Id header if we found a suitable user
        if (adminUserId) {
            headers['User-Id'] = adminUserId;
            console.log(`POST: Using User-Id header: ${adminUserId}`);
        }
        
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({
                users: usersArray
            })
        });

        console.log(`POST response status: ${response.status} ${response.statusText}`);

        if (!response.ok) {
            let errorData;
            try {
                errorData = await response.json();
                console.error('POST error response:', errorData);
            } catch (parseError) {
                const textError = await response.text();
                console.error('POST error response (text):', textError);
                throw new Error(`HTTP ${response.status}: ${response.statusText} - ${textError}`);
            }
            
            const errorMessage = errorData.message || 
                               errorData.error || 
                               errorData.error_description || 
                               (errorData.errors && errorData.errors[0] && errorData.errors[0].detail) ||
                               `HTTP ${response.status}: ${response.statusText}`;
            throw new Error(errorMessage);
        }

        const result = await response.json();
        console.log('POST success response:', result);
        return result;
    }

    // DELETE: Remove users not in import JSON
    async deleteProjectUsers(projectId, progressId) {
        console.log('Starting DELETE operation for extra users...');
        this.reportProgress(progressId, 'Preparing deletion...', 2);
        
        if (!this.projectUsers.length) {
            console.log('No project users loaded, fetching...');
            this.projectUsers = await this.fetchAllUsers(projectId);
        }

        // Find users that exist in project but not in import JSON (match by email)
        const usersToDelete = [];
        for (const projectUser of this.projectUsers) {
            const importUser = this.importUsers.find(iu => iu.email.toLowerCase() === projectUser.email.toLowerCase());
            if (!importUser) {
                usersToDelete.push(projectUser);
            }
        }

        console.log(`Found ${usersToDelete.length} users to delete`);
        if (usersToDelete.length === 0) {
            this.reportProgress(progressId, 'No users to delete', 100);
            return;
        }

        for (let i = 0; i < usersToDelete.length; i++) {
            const user = usersToDelete[i];
            try {
                this.reportProgress(progressId, `Deleting ${i + 1} of ${usersToDelete.length}: ${user.email}`, Math.round(((i) / usersToDelete.length) * 100));
                await this.deleteUser(projectId, user.id);
                console.log(`Deleted user: ${user.email}`);
            } catch (error) {
                console.error(`Failed to delete user ${user.email}:`, error);
            }
        }

        this.reportProgress(progressId, 'Delete completed', 100);
        console.log('DELETE operation completed');
    }

    async deleteUser(projectId, userId) {
        const apiUrl = `https://developer.api.autodesk.com/construction/admin/v1/projects/${projectId}/users/${userId}`;
        
        console.log(`Attempting to delete user ${userId} from project ${projectId}`);
        console.log(`DELETE URL: ${apiUrl}`);
        
        // Get a suitable admin user for the User-Id header
        const adminUserId = this.getAdminUserId();
        
        const headers = {
            'Authorization': `Bearer ${this.currentAccessToken}`,
            'Content-Type': 'application/json'
        };
        
        // Add User-Id header if we found a suitable user
        if (adminUserId) {
            headers['User-Id'] = adminUserId;
            console.log(`Using User-Id header: ${adminUserId}`);
        } else {
            console.warn('No User-Id header set - DELETE might fail with 2-legged OAuth');
        }
        
        const response = await fetch(apiUrl, {
            method: 'DELETE',
            headers: headers
        });

        console.log(`DELETE response status: ${response.status} ${response.statusText}`);

        if (!response.ok) {
            let errorData;
            try {
                errorData = await response.json();
                console.error('DELETE error response:', errorData);
            } catch (parseError) {
                const textError = await response.text();
                console.error('DELETE error response (text):', textError);
                throw new Error(`HTTP ${response.status}: ${response.statusText} - ${textError}`);
            }
            
            const errorMessage = errorData.message || 
                               errorData.error || 
                               errorData.error_description || 
                               (errorData.errors && errorData.errors[0] && errorData.errors[0].detail) ||
                               `HTTP ${response.status}: ${response.statusText}`;
            throw new Error(errorMessage);
        }

        // DELETE returns 204 No Content on success
        console.log(`Successfully deleted user ${userId}`);
        return true;
    }

    closeModal() {
        const modal = document.getElementById('usersModal');
        modal.style.display = 'none';
        
        // Clear table content
        document.getElementById('usersTableBody').innerHTML = '';
        
        // Reset loading state
        document.getElementById('usersLoadingMessage').textContent = 'Loading users...';
        document.getElementById('usersLoadingMessage').style.display = 'block';
        document.getElementById('usersTableContainer').style.display = 'none';
        document.getElementById('usersErrorMessage').style.display = 'none';
    }
}

// Create global instance
const projectUsersManager = new ProjectUsersManager();

// Global function to be called from main page
function showProjectUsers(projectId, projectName, accessToken) {
    projectUsersManager.setAccessToken(accessToken);
    projectUsersManager.showProjectUsers(projectId, projectName);
}

// New global functions for the three operations
function updateProjectUsers(projectId, accountId, accessToken, progressId) {
    projectUsersManager.setAccessToken(accessToken);
    return projectUsersManager.updateProjectUsers(projectId, accountId, progressId);
}

function addNewProjectUsers(projectId, accountId, accessToken, progressId) {
    projectUsersManager.setAccessToken(accessToken);
    return projectUsersManager.addNewProjectUsers(projectId, accountId, progressId);
}

function deleteProjectUsers(projectId, accessToken, progressId) {
    projectUsersManager.setAccessToken(accessToken);
    return projectUsersManager.deleteProjectUsers(projectId, progressId);
}
