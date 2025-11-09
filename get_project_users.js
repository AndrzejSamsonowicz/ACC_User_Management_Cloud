// Project Users Viewer (Read-Only)
console.log('🚀🚀🚀 get_project_users.js LOADING - VERSION 20251109171600 🚀🚀🚀');

class ProjectUsersViewer {
    constructor() {
        this.currentAccessToken = null;
        this.originalUsers = [];
        this.currentProjectName = '';
        this.sortColumn = 'email';
        this.sortDirection = 'asc';
        this.createModal();
    }

    setAccessToken(token) {
        this.currentAccessToken = token;
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
                            <!-- Filter Section -->
                            <div style="margin-bottom: 15px; display: flex; gap: 10px; align-items: center;">
                                <label for="projectUsersFilter" style="font-weight: bold;">Filter by Email:</label>
                                <input 
                                    type="text" 
                                    id="projectUsersFilter" 
                                    placeholder="Type to filter by email..." 
                                    style="flex: 1; padding: 8px; border: 1px solid #ccc; border-radius: 4px;"
                                />
                                <button onclick="projectUsersViewer.clearFilter()" style="padding: 8px 16px; background: #f0f0f0; border: 1px solid #ccc; border-radius: 4px; cursor: pointer;">Clear</button>
                            </div>
                            <div id="projectUsersFilterInfo" style="margin-bottom: 10px; font-size: 13px; color: #666;"></div>
                            
                            <table id="usersTable">
                                <thead>
                                    <tr>
                                        <th onclick="projectUsersViewer.sortTable('email')" style="cursor: pointer; user-select: none;">
                                            Email <span id="sortIndicator-email">↕</span>
                                        </th>
                                        <th onclick="projectUsersViewer.sortTable('company')" style="cursor: pointer; user-select: none;">
                                            Company <span id="sortIndicator-company">↕</span>
                                        </th>
                                        <th onclick="projectUsersViewer.sortTable('role')" style="cursor: pointer; user-select: none;">
                                            Role <span id="sortIndicator-role">↕</span>
                                        </th>
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
                    background-color: #e8f4f8;
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

        // Add filter input event listener
        const filterInput = document.getElementById('projectUsersFilter');
        if (filterInput) {
            filterInput.addEventListener('input', () => {
                this.filterUsers();
            });
        }
    }

    async showProjectUsers(projectId, projectName) {
        const modal = document.getElementById('usersModal');
        const modalTitle = document.getElementById('modalTitle');
        const loadingMessage = document.getElementById('usersLoadingMessage');
        const tableContainer = document.getElementById('usersTableContainer');
        const errorMessage = document.getElementById('usersErrorMessage');
        
        // Store project name
        this.currentProjectName = projectName;
        
        // Set modal title
        modalTitle.textContent = `Users in: ${projectName}`;
        
        // Show modal and loading state
        modal.style.display = 'block';
        loadingMessage.style.display = 'block';
        tableContainer.style.display = 'none';
        errorMessage.style.display = 'none';
        
        // Clear filter
        const filterInput = document.getElementById('projectUsersFilter');
        if (filterInput) filterInput.value = '';
        const filterInfo = document.getElementById('projectUsersFilterInfo');
        if (filterInfo) filterInfo.textContent = '';

        try {
            // Fetch all users with pagination
            const allUsers = await this.fetchAllUsers(projectId);
            
            console.log('🔍 RAW API DATA - Total users:', allUsers.length);
            if (allUsers.length > 0) {
                console.log('🔍 First raw user:', allUsers[0]);
                console.log('🔍 First user.email:', allUsers[0].email);
                console.log('🔍 First user.companyName:', allUsers[0].companyName);
                console.log('🔍 First user.roles:', allUsers[0].roles);
            }
            
            // Store original users data
            this.originalUsers = allUsers.map(user => {
                // Extract role names from roles array
                let roleNames = 'N/A';
                if (user.roles && Array.isArray(user.roles) && user.roles.length > 0) {
                    roleNames = user.roles.map(r => r.name).join(', ');
                }
                
                const mapped = {
                    email: user.email || 'N/A',
                    company: user.companyName || 'N/A',
                    role: roleNames
                };
                
                console.log('🔍 Mapped user:', mapped);
                return mapped;
            });
            
            console.log('🔍 FINAL originalUsers array:', this.originalUsers);
            
            // Reset sort to default
            this.sortColumn = 'email';
            this.sortDirection = 'asc';
            
            // Display users in table
            this.renderTable();
            
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

    filterUsers() {
        if (!this.originalUsers || this.originalUsers.length === 0) return;

        const filterText = document.getElementById('projectUsersFilter').value.toLowerCase().trim();
        const filterInfo = document.getElementById('projectUsersFilterInfo');
        
        if (!filterText) {
            // No filter, render all users
            this.renderTable();
            filterInfo.textContent = '';
            return;
        }

        // Filter users by email
        const filteredUsers = this.originalUsers.filter(user => 
            user.email.toLowerCase().includes(filterText)
        );

        this.renderTable(filteredUsers);
        
        // Update filter info
        if (filteredUsers.length === 0) {
            filterInfo.textContent = 'No users found matching the filter.';
            filterInfo.style.color = '#dc3545';
        } else if (filteredUsers.length === this.originalUsers.length) {
            filterInfo.textContent = 'Filter matches all users.';
            filterInfo.style.color = '#28a745';
        } else {
            filterInfo.textContent = `Showing ${filteredUsers.length} of ${this.originalUsers.length} users.`;
            filterInfo.style.color = '#007cba';
        }
    }

    clearFilter() {
        const filterInput = document.getElementById('projectUsersFilter');
        const filterInfo = document.getElementById('projectUsersFilterInfo');
        if (filterInput) filterInput.value = '';
        if (filterInfo) filterInfo.textContent = '';
        this.renderTable();
    }

    sortTable(column) {
        // Toggle sort direction if clicking the same column
        if (this.sortColumn === column) {
            this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            this.sortColumn = column;
            this.sortDirection = 'asc';
        }
        
        // Re-render with current filter
        const filterText = document.getElementById('projectUsersFilter').value.toLowerCase().trim();
        if (filterText) {
            this.filterUsers();
        } else {
            this.renderTable();
        }
    }

    renderTable(usersToDisplay = null) {
        const tableBody = document.getElementById('usersTableBody');
        
        // Clear existing rows
        tableBody.innerHTML = '';

        // Use provided users or all original users
        let users = usersToDisplay || this.originalUsers;
        
        // Sort users
        const sortedUsers = [...users].sort((a, b) => {
            let aVal = a[this.sortColumn] || '';
            let bVal = b[this.sortColumn] || '';
            
            const comparison = aVal.localeCompare(bVal);
            return this.sortDirection === 'asc' ? comparison : -comparison;
        });

        // Update sort indicators
        ['email', 'company', 'role'].forEach(col => {
            const indicator = document.getElementById(`sortIndicator-${col}`);
            if (indicator) {
                if (col === this.sortColumn) {
                    indicator.textContent = this.sortDirection === 'asc' ? '↑' : '↓';
                } else {
                    indicator.textContent = '↕';
                }
            }
        });

        // Create table rows
        sortedUsers.forEach((user) => {
            const row = document.createElement('tr');
            
            // Email cell
            const emailCell = document.createElement('td');
            emailCell.textContent = user.email;
            row.appendChild(emailCell);
            
            // Company cell
            const companyCell = document.createElement('td');
            companyCell.textContent = user.company;
            row.appendChild(companyCell);
            
            // Default Role cell
            const roleCell = document.createElement('td');
            roleCell.textContent = user.role;
            row.appendChild(roleCell);
            
            tableBody.appendChild(row);
        });

        // Update modal title with count
        const modalTitle = document.getElementById('modalTitle');
        const filterText = document.getElementById('projectUsersFilter').value;
        const titleSuffix = filterText ? 
            ` (${sortedUsers.length} filtered / ${this.originalUsers.length} total)` :
            ` (${sortedUsers.length} users)`;
        modalTitle.textContent = `Users in: ${this.currentProjectName}${titleSuffix}`;
    }

    displayUsersTable(users) {
        // This method is kept for backward compatibility but now just calls renderTable
        this.renderTable();
    }

    closeModal() {
        const modal = document.getElementById('usersModal');
        modal.style.display = 'none';
        
        // Clear stored data
        this.originalUsers = [];
        this.currentProjectName = '';
        
        // Clear table content
        document.getElementById('usersTableBody').innerHTML = '';
        
        // Clear filter
        const filterInput = document.getElementById('projectUsersFilter');
        const filterInfo = document.getElementById('projectUsersFilterInfo');
        if (filterInput) filterInput.value = '';
        if (filterInfo) filterInfo.textContent = '';
        
        // Reset loading state
        document.getElementById('usersLoadingMessage').textContent = 'Loading users...';
        document.getElementById('usersLoadingMessage').style.display = 'block';
        document.getElementById('usersTableContainer').style.display = 'none';
        document.getElementById('usersErrorMessage').style.display = 'none';
    }
}

// Create global instance
const projectUsersViewer = new ProjectUsersViewer();

// Global function to be called from main page
async function showProjectUsers(projectId, projectName, accessToken) {
    console.log('🎯🎯🎯 showProjectUsers CALLED! 🎯🎯🎯');
    console.log('Project ID:', projectId);
    console.log('Project Name:', projectName);
    
    try {
        // Get 2-legged token for project users (Construction Admin API requires 2-legged)
        const twoLeggedToken = await get2LeggedToken();
        projectUsersViewer.setAccessToken(twoLeggedToken);
        projectUsersViewer.showProjectUsers(projectId, projectName);
    } catch (error) {
        console.error('Error getting 2-legged token for project users:', error);
        alert(`Failed to authenticate: ${error.message}`);
    }
}
