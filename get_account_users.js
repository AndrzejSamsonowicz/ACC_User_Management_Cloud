// Account Users Management
class AccountUsersManager {
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
            <div id="accountUsersModal" class="account-users-modal" style="display: none;">
                <div class="account-users-modal-content">
                    <div class="account-users-modal-header">
                        <h3 id="accountModalTitle">Account Users</h3>
                        <span class="account-users-modal-close">&times;</span>
                    </div>
                    <div class="account-users-modal-body">
                        <div id="accountUsersLoadingMessage">Loading users...</div>
                        <div id="accountUsersTableContainer" style="display: none;">
                            <table id="accountUsersTable">
                                <thead>
                                    <tr>
                                        <th>Email</th>
                                        <th>Default Role</th>
                                        <th>Company</th>
                                    </tr>
                                </thead>
                                <tbody id="accountUsersTableBody">
                                </tbody>
                            </table>
                        </div>
                        <div id="accountUsersErrorMessage" style="display: none; color: red;"></div>
                    </div>
                </div>
            </div>
        `;

        // Add CSS styles
        const styles = `
            <style>
                .account-users-modal {
                    position: fixed;
                    z-index: 1001;
                    left: 0;
                    top: 0;
                    width: 100%;
                    height: 100%;
                    background-color: rgba(0,0,0,0.5);
                }

                .account-users-modal-content {
                    background-color: #fefefe;
                    margin: 3% auto;
                    padding: 0;
                    border: 1px solid #888;
                    width: 90%;
                    max-width: 1000px;
                    border-radius: 8px;
                    max-height: 85vh;
                    display: flex;
                    flex-direction: column;
                }

                .account-users-modal-header {
                    padding: 15px 20px;
                    background-color: #e8f4f8;
                    border-bottom: 1px solid #ddd;
                    border-radius: 8px 8px 0 0;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }

                .account-users-modal-header h3 {
                    margin: 0;
                    color: #333;
                }

                .account-users-modal-close {
                    color: #aaa;
                    font-size: 28px;
                    font-weight: bold;
                    cursor: pointer;
                    line-height: 1;
                }

                .account-users-modal-close:hover,
                .account-users-modal-close:focus {
                    color: #000;
                }

                .account-users-modal-body {
                    padding: 20px;
                    flex-grow: 1;
                    overflow-y: auto;
                }

                #accountUsersTable {
                    width: 100%;
                    border-collapse: collapse;
                    margin-top: 10px;
                }

                #accountUsersTable th,
                #accountUsersTable td {
                    border: 1px solid #ddd;
                    padding: 12px;
                    text-align: left;
                }

                #accountUsersTable th {
                    background-color: #f8f9fa;
                    font-weight: bold;
                    position: sticky;
                    top: 0;
                }

                #accountUsersTable tr:nth-child(even) {
                    background-color: #f9f9f9;
                }

                #accountUsersTable tr:hover {
                    background-color: #f0f8ff;
                }

                #accountUsersLoadingMessage {
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
        const modal = document.getElementById('accountUsersModal');
        const closeBtn = document.querySelector('.account-users-modal-close');

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

    async showAccountUsers(accountId, accountName) {
        const modal = document.getElementById('accountUsersModal');
        const modalTitle = document.getElementById('accountModalTitle');
        const loadingMessage = document.getElementById('accountUsersLoadingMessage');
        const tableContainer = document.getElementById('accountUsersTableContainer');
        const errorMessage = document.getElementById('accountUsersErrorMessage');
        
        // Set modal title
        modalTitle.textContent = `Users in Account: ${accountName}`;
        
        // Show modal and loading state
        modal.style.display = 'block';
        loadingMessage.style.display = 'block';
        tableContainer.style.display = 'none';
        errorMessage.style.display = 'none';

        try {
            // Fetch all users with pagination
            const allUsers = await this.fetchAllAccountUsers(accountId);
            
            // Display users in table
            this.displayUsersTable(allUsers, accountName);
            
            // Show table, hide loading
            loadingMessage.style.display = 'none';
            tableContainer.style.display = 'block';
            
        } catch (error) {
            console.error('Error fetching account users:', error);
            
            // Show error message
            loadingMessage.style.display = 'none';
            errorMessage.textContent = `Failed to load users: ${error.message}`;
            errorMessage.style.display = 'block';
        }
    }

    async fetchAllAccountUsers(accountId, providedToken = null) {
        // If a token is provided, use it; otherwise use the current token
        // This allows external callers to provide their own 2-legged token
        const tokenToUse = providedToken || this.currentAccessToken;
        
        let allUsers = [];
        let offset = 0;
        const limit = 100;
        let hasMoreData = true;

        while (hasMoreData) {
            const queryParams = new URLSearchParams({
                'limit': limit.toString(),
                'offset': offset.toString()
            });

            const apiUrl = `https://developer.api.autodesk.com/hq/v1/accounts/${accountId}/users?${queryParams}`;
            console.log(`Fetching account users: ${apiUrl}`);

            const response = await fetch(apiUrl, {
                headers: {
                    'Authorization': `Bearer ${tokenToUse}`,
                    'Content-Type': 'application/json'
                }
            });

            console.log(`API Response Status: ${response.status} ${response.statusText}`);

            if (!response.ok) {
                let errorData;
                try {
                    errorData = await response.json();
                    console.log('Error response data:', errorData);
                    if (errorData.errors && Array.isArray(errorData.errors)) {
                        console.log('Detailed errors:', errorData.errors);
                        errorData.errors.forEach((error, index) => {
                            console.log(`Error ${index + 1}:`, error);
                        });
                    }
                } catch (parseError) {
                    const textError = await response.text();
                    console.log('Error response (text):', textError);
                    throw new Error(`API error ${response.status}: ${response.statusText} - ${textError}`);
                }
                
                const errorMessage = errorData.message || 
                                   errorData.error || 
                                   errorData.error_description || 
                                   errorData.detail ||
                                   (errorData.errors && errorData.errors[0] && errorData.errors[0].detail) ||
                                   `HTTP ${response.status}: ${response.statusText}`;
                throw new Error(errorMessage);
            }

            const usersData = await response.json();
            console.log(`Fetched ${usersData.length || 0} users at offset ${offset}`);

            if (usersData && Array.isArray(usersData) && usersData.length > 0) {
                allUsers = allUsers.concat(usersData);

                // Update loading message with progress
                const loadingMessage = document.getElementById('accountUsersLoadingMessage');
                loadingMessage.textContent = `Loading users... Found ${allUsers.length} users so far.`;

                // Check if we got fewer results than requested (indicates end of data)
                if (usersData.length < limit) {
                    hasMoreData = false;
                    console.log('Got fewer results than limit, assuming end of data');
                } else {
                    offset += limit;
                    console.log(`Next request will use offset: ${offset}`);
                }
            } else {
                hasMoreData = false;
                console.log('No results returned, stopping pagination');
            }

            // Safety check to prevent infinite loops
            if (offset > 10000) {
                console.warn('Stopping pagination at 10,000 users for safety');
                hasMoreData = false;
            }
        }

        return allUsers;
    }

    displayUsersTable(users, accountName) {
        const tableBody = document.getElementById('accountUsersTableBody');
        
        // Clear existing rows
        tableBody.innerHTML = '';

        // Filter and sort users
        const validUsers = users
            .filter(user => user.email) // Filter out any null/undefined emails
            .sort((a, b) => a.email.localeCompare(b.email));

        // Create table rows
        validUsers.forEach((user, index) => {
            const row = document.createElement('tr');
            
            // Email cell
            const emailCell = document.createElement('td');
            emailCell.textContent = user.email || 'N/A';
            row.appendChild(emailCell);
            
            // Default Role cell
            const roleCell = document.createElement('td');
            roleCell.textContent = user.default_role || user.role || 'N/A';
            row.appendChild(roleCell);
            
            // Company cell
            const companyCell = document.createElement('td');
            const companyValue = user.company_name || 'N/A';
            companyCell.textContent = companyValue;
            row.appendChild(companyCell);
            
            tableBody.appendChild(row);
        });

        // Update modal title with count
        const modalTitle = document.getElementById('accountModalTitle');
        modalTitle.textContent = `Users in Account: ${accountName} (${validUsers.length} users)`;
    }

    // Method to fetch account users with 2-legged token (for use by other modules)
    async fetchAllAccountUsersWith2LeggedAuth(accountId) {
        try {
            // Use the global get2LeggedToken function from index.html
            const twoLeggedToken = await get2LeggedToken();
            return await this.fetchAllAccountUsers(accountId, twoLeggedToken);
        } catch (error) {
            console.error('Error fetching account users with 2-legged auth:', error);
            throw error;
        }
    }

    closeModal() {
        const modal = document.getElementById('accountUsersModal');
        modal.style.display = 'none';
        
        // Clear table content
        document.getElementById('accountUsersTableBody').innerHTML = '';
        
        // Reset loading state
        document.getElementById('accountUsersLoadingMessage').textContent = 'Loading users...';
        document.getElementById('accountUsersLoadingMessage').style.display = 'block';
        document.getElementById('accountUsersTableContainer').style.display = 'none';
        document.getElementById('accountUsersErrorMessage').style.display = 'none';
    }
}

// Create global instance
const accountUsersManager = new AccountUsersManager();

// Global function to be called from main page
// Always uses 2-legged OAuth for account users
async function showAccountUsers(accountId, accountName, accessToken) {
    try {
        // Get 2-legged token for account users (HQ API requires 2-legged)
        // Use the global get2LeggedToken function from index.html
        const twoLeggedToken = await get2LeggedToken();
        accountUsersManager.setAccessToken(twoLeggedToken);
        accountUsersManager.showAccountUsers(accountId, accountName);
    } catch (error) {
        console.error('Error getting 2-legged token for account users:', error);
        alert(`Failed to authenticate: ${error.message}`);
    }
}
