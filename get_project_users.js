// Project Users Management
class ProjectUsersManager {
    constructor() {
        this.currentAccessToken = null;
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
            const allUsers = await this.fetchAllUsers(projectId);
            
            // Display users in table
            this.displayUsersTable(allUsers);
            
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
