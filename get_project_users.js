// Project Users Viewer (Read-Only)
// log('🚀🚀🚀 get_project_users.js LOADING - VERSION 20251109171600 🚀🚀🚀');

class ProjectUsersViewer {
    constructor() {
        this.currentAccessToken = null;
        this.currentProjectId = null;
        this.originalUsers = [];
        this.currentProjectName = '';
        this.sortColumn = 'email';
        this.sortDirection = 'asc';
        this.lastCheckedIndex = null;
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
                            <!-- Action Section -->
                            <div style="margin-bottom: 15px; display: flex; gap: 10px; align-items: center;">
                                <label for="projectUsersFilter" style="font-weight: bold;">Search:</label>
                                <input 
                                    type="text" 
                                    id="projectUsersFilter" 
                                    placeholder="Type to search..." 
                                    style="flex: 1; padding: 8px; border: 1px solid #ccc; border-radius: 4px;"
                                />
                                <button onclick="projectUsersViewer.deleteSelectedUsers()" style="padding: 8px 16px; background: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">Delete</button>
                            </div>
                            <div id="projectUsersFilterInfo" style="margin-bottom: 10px; font-size: 13px; color: #666;"></div>
                            
                            <table id="usersTable">
                                <thead>
                                    <tr>
                                        <th style="width: 40px; text-align: center;">
                                            <input type="checkbox" id="selectAllCheckbox" onchange="projectUsersViewer.toggleSelectAll()" title="Select/Deselect All">
                                        </th>
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
                    background-color: #F1F1F1;
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
        
        // Store project info
        this.currentProjectName = projectName;
        this.currentProjectId = projectId;
        
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
            
            // log('🔍 RAW API DATA - Total users:', allUsers.length);
            if (allUsers.length > 0) {
                // log('🔍 First raw user:', allUsers[0]);
                // log('🔍 First user.email:', allUsers[0].email);
                // log('🔍 First user.companyName:', allUsers[0].companyName);
                // log('🔍 First user.roles:', allUsers[0].roles);
            }
            
            // Store original users data
            this.originalUsers = allUsers.map(user => {
                // Extract role names from roles array
                let roleNames = 'N/A';
                if (user.roles && Array.isArray(user.roles) && user.roles.length > 0) {
                    roleNames = user.roles.map(r => r.name).join(', ');
                }
                
                const mapped = {
                    id: user.id,
                    email: user.email || 'N/A',
                    company: user.companyName || 'N/A',
                    role: roleNames
                };
                
                // log('🔍 Mapped user:', mapped);
                return mapped;
            });
            
            // log('🔍 FINAL originalUsers array:', this.originalUsers);
            
            // Reset sort to default
            this.sortColumn = 'email';
            this.sortDirection = 'asc';
            
            // Display users in table
            this.renderTable();
            
            // Show table, hide loading
            loadingMessage.style.display = 'none';
            tableContainer.style.display = 'block';
            
        } catch (error) {
            // console.error('Error fetching users:', error);
            
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
            // log(`Fetching users: ${apiUrl}`);

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
                    // log('Error response:', errorData);
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
            // log(`Fetched ${usersData.results?.length || 0} users at offset ${offset}`);

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
                // console.warn('Stopping at 10,000 users for safety');
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
        sortedUsers.forEach((user, index) => {
            const row = document.createElement('tr');
            row.dataset.userId = user.id;
            row.dataset.userEmail = user.email;
            row.dataset.rowIndex = index;
            
            // Checkbox cell
            const checkboxCell = document.createElement('td');
            checkboxCell.style.textAlign = 'center';
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'user-checkbox';
            checkbox.dataset.rowIndex = index;
            checkbox.addEventListener('click', (e) => {
                this.handleCheckboxChange(e, index);
            });
            checkboxCell.appendChild(checkbox);
            row.appendChild(checkboxCell);
            
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
        
        // Update select all checkbox state
        this.updateSelectAllCheckbox();

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

    handleCheckboxChange(event, index) {
        const checkbox = event.target;
        
        // Get all checkboxes to find the actual current position in DOM
        const checkboxes = document.querySelectorAll('.user-checkbox');
        const checkboxArray = Array.from(checkboxes);
        const currentIndex = checkboxArray.indexOf(checkbox);
        
        // Safety check
        if (currentIndex === -1) return;
        
        // Check if Shift key is pressed for range selection
        if (event.shiftKey && this.lastCheckedIndex !== null && this.lastCheckedIndex !== currentIndex) {
            // Use the clicked checkbox's current state (after toggle) as target
            // The checkbox has already toggled by the time this handler runs
            const targetState = checkbox.checked;
            
            const start = Math.min(this.lastCheckedIndex, currentIndex);
            const end = Math.max(this.lastCheckedIndex, currentIndex);
            
            // Set all checkboxes in range (inclusive) to the same state
            for (let i = start; i <= end; i++) {
                if (checkboxArray[i]) {
                    checkboxArray[i].checked = targetState;
                }
            }
            
            // Don't update lastCheckedIndex - keep the anchor point
        } else {
            // Normal click (no shift) - update the anchor point
            this.lastCheckedIndex = currentIndex;
        }
        
        // Update select all checkbox state
        this.updateSelectAllCheckbox();
    }

    toggleSelectAll() {
        const selectAllCheckbox = document.getElementById('selectAllCheckbox');
        const checkboxes = document.querySelectorAll('.user-checkbox');
        
        checkboxes.forEach(checkbox => {
            checkbox.checked = selectAllCheckbox.checked;
        });
    }

    updateSelectAllCheckbox() {
        const selectAllCheckbox = document.getElementById('selectAllCheckbox');
        const checkboxes = document.querySelectorAll('.user-checkbox');
        
        if (checkboxes.length === 0) {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = false;
            return;
        }
        
        const checkedCount = Array.from(checkboxes).filter(cb => cb.checked).length;
        
        if (checkedCount === 0) {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = false;
        } else if (checkedCount === checkboxes.length) {
            selectAllCheckbox.checked = true;
            selectAllCheckbox.indeterminate = false;
        } else {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = true;
        }
    }

    async deleteSelectedUsers() {
        // Get selected checkboxes
        const checkboxes = Array.from(document.querySelectorAll('.user-checkbox:checked'));
        
        if (checkboxes.length === 0) {
            this.showMessage('Please select at least one user to delete.', 'warning');
            return;
        }
        
        // Get user info from rows
        const usersToDelete = checkboxes.map(checkbox => {
            const row = checkbox.closest('tr');
            return {
                id: row.dataset.userId,
                email: row.dataset.userEmail
            };
        });
        
        // Show confirmation modal
        const confirmed = await this.showConfirmModal(usersToDelete);
        if (!confirmed) {
            return;
        }
        
        // Show loading overlay
        const modal = document.getElementById('usersModal');
        const loadingOverlay = document.createElement('div');
        loadingOverlay.id = 'deleteLoadingOverlay';
        loadingOverlay.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(255,255,255,0.9); z-index: 9999; display: flex; align-items: center; justify-content: center;';
        loadingOverlay.innerHTML = '<div style="text-align: center;"><div style="font-size: 18px; font-weight: bold; margin-bottom: 10px;">Deleting users...</div><div id="deleteProgress" style="font-size: 14px; color: #666;">0 / ' + usersToDelete.length + '</div></div>';
        modal.querySelector('.users-modal-content').style.position = 'relative';
        modal.querySelector('.users-modal-content').appendChild(loadingOverlay);
        
        // Delete users one by one
        let successCount = 0;
        let failedUsers = [];
        
        for (let i = 0; i < usersToDelete.length; i++) {
            const user = usersToDelete[i];
            const progressEl = document.getElementById('deleteProgress');
            if (progressEl) {
                progressEl.textContent = `${i + 1} / ${usersToDelete.length} - ${user.email}`;
            }
            
            try {
                await this.deleteUser(user.id);
                successCount++;
            } catch (error) {
                failedUsers.push({ email: user.email, error: error.message });
            }
        }
        
        // Remove loading overlay
        if (loadingOverlay.parentNode) {
            loadingOverlay.parentNode.removeChild(loadingOverlay);
        }
        
        // Show result modal
        this.showResultModal(successCount, failedUsers, usersToDelete.length);
        
        // Refresh the user list
        await this.showProjectUsers(this.currentProjectId, this.currentProjectName);
    }

    showConfirmModal(usersToDelete) {
        return new Promise((resolve) => {
            // Create modal overlay
            const overlay = document.createElement('div');
            overlay.id = 'deleteConfirmModal';
            overlay.style.cssText = 'position: fixed; z-index: 10000; left: 0; top: 0; width: 100%; height: 100%; background-color: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center;';
            
            // Create modal content
            const modalContent = document.createElement('div');
            modalContent.style.cssText = 'background-color: white; border-radius: 8px; max-width: 600px; width: 90%; max-height: 80vh; display: flex; flex-direction: column; box-shadow: 0 4px 20px rgba(0,0,0,0.3);';
            
            // Header
            const header = document.createElement('div');
            header.style.cssText = 'padding: 15px 20px; background-color: #F1F1F1; border-bottom: 1px solid #ddd; border-radius: 8px 8px 0 0; display: flex; justify-content: space-between; align-items: center;';
            header.innerHTML = '<h3 style="margin: 0; font-size: 18px; color: #333;">Confirm Deletion</h3>';
            
            // Body
            const body = document.createElement('div');
            body.style.cssText = 'padding: 20px; overflow-y: auto; flex: 1;';
            
            const message = document.createElement('p');
            message.style.cssText = 'margin: 0 0 15px 0; font-size: 16px; font-weight: 500;';
            message.textContent = `You are about to delete ${usersToDelete.length} user(s) from this project:`;
            body.appendChild(message);
            
            // User list
            const userList = document.createElement('div');
            userList.style.cssText = 'background: #f8f9fa; border: 1px solid #dee2e6; border-radius: 4px; padding: 15px; max-height: 300px; overflow-y: auto;';
            const list = document.createElement('ul');
            list.style.cssText = 'margin: 0; padding-left: 20px; list-style-type: disc;';
            usersToDelete.forEach(user => {
                const item = document.createElement('li');
                item.style.cssText = 'margin: 5px 0; color: #333; font-size: 14px;';
                item.textContent = user.email;
                list.appendChild(item);
            });
            userList.appendChild(list);
            body.appendChild(userList);
            
            // Footer with buttons
            const footer = document.createElement('div');
            footer.style.cssText = 'padding: 15px 20px; background-color: #f8f9fa; border-top: 1px solid #dee2e6; border-radius: 0 0 8px 8px; display: flex; justify-content: space-evenly; gap: 10px;';
            
            const cancelBtn = document.createElement('button');
            cancelBtn.textContent = 'Cancel';
            cancelBtn.style.cssText = 'padding: 10px 20px; background: #6c757d; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; font-weight: 500; flex: 1; max-width: 200px;';
            cancelBtn.onmouseover = () => cancelBtn.style.background = '#5a6268';
            cancelBtn.onmouseout = () => cancelBtn.style.background = '#6c757d';
            cancelBtn.onclick = () => {
                document.body.removeChild(overlay);
                resolve(false);
            };
            
            const confirmBtn = document.createElement('button');
            confirmBtn.textContent = 'Yes, Delete';
            confirmBtn.style.cssText = 'padding: 10px 20px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; font-weight: 500; flex: 1; max-width: 200px;';
            confirmBtn.onmouseover = () => confirmBtn.style.background = '#0056b3';
            confirmBtn.onmouseout = () => confirmBtn.style.background = '#007bff';
            confirmBtn.onclick = () => {
                document.body.removeChild(overlay);
                resolve(true);
            };
            
            footer.appendChild(cancelBtn);
            footer.appendChild(confirmBtn);
            
            // Assemble modal
            modalContent.appendChild(header);
            modalContent.appendChild(body);
            modalContent.appendChild(footer);
            overlay.appendChild(modalContent);
            
            // Add to page
            document.body.appendChild(overlay);
            
            // Close on overlay click
            overlay.onclick = (e) => {
                if (e.target === overlay) {
                    document.body.removeChild(overlay);
                    resolve(false);
                }
            };
        });
    }

    showResultModal(successCount, failedUsers, totalCount) {
        // Create modal overlay
        const overlay = document.createElement('div');
        overlay.id = 'deleteResultModal';
        overlay.style.cssText = 'position: fixed; z-index: 10000; left: 0; top: 0; width: 100%; height: 100%; background-color: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center;';
        
        // Create modal content
        const modalContent = document.createElement('div');
        modalContent.style.cssText = 'background-color: white; border-radius: 8px; max-width: 600px; width: 90%; max-height: 80vh; display: flex; flex-direction: column; box-shadow: 0 4px 20px rgba(0,0,0,0.3);';
        
        // Determine if operation was successful
        const isSuccess = failedUsers.length === 0;
        
        // Header
        const header = document.createElement('div');
        header.style.cssText = 'padding: 15px 20px; background-color: #F1F1F1; border-bottom: 1px solid #ddd; border-radius: 8px 8px 0 0; display: flex; justify-content: space-between; align-items: center;';
        header.innerHTML = '<h3 style="margin: 0; font-size: 18px; color: #333;">Deletion Complete</h3>';
        
        // Body
        const body = document.createElement('div');
        body.style.cssText = 'padding: 20px; overflow-y: auto; flex: 1;';
        
        if (isSuccess) {
            const message = document.createElement('p');
            message.style.cssText = 'margin: 0; font-size: 16px; color: #333;';
            message.innerHTML = `<strong>Successfully deleted ${successCount} user(s).</strong>`;
            body.appendChild(message);
        } else {
            const successMsg = document.createElement('p');
            successMsg.style.cssText = 'margin: 0 0 15px 0; font-size: 16px; color: #333;';
            successMsg.innerHTML = `<strong>Successfully deleted:</strong> ${successCount} user(s)`;
            body.appendChild(successMsg);
            
            const failMsg = document.createElement('p');
            failMsg.style.cssText = 'margin: 0 0 10px 0; font-size: 16px; color: #dc3545; font-weight: 500;';
            failMsg.textContent = `Failed to delete ${failedUsers.length} user(s):`;
            body.appendChild(failMsg);
            
            // Failed users list
            const failList = document.createElement('div');
            failList.style.cssText = 'background: #fff3cd; border: 1px solid #ffc107; border-radius: 4px; padding: 15px; max-height: 300px; overflow-y: auto;';
            const list = document.createElement('div');
            list.style.cssText = 'font-size: 14px;';
            failedUsers.forEach(fail => {
                const item = document.createElement('div');
                item.style.cssText = 'margin: 8px 0; padding: 8px; background: white; border-radius: 3px;';
                item.innerHTML = `<strong>${fail.email}</strong><br><span style="color: #666; font-size: 13px;">${fail.error}</span>`;
                list.appendChild(item);
            });
            failList.appendChild(list);
            body.appendChild(failList);
        }
        
        // Footer with OK button
        const footer = document.createElement('div');
        footer.style.cssText = 'padding: 15px 20px; background-color: #f8f9fa; border-top: 1px solid #dee2e6; border-radius: 0 0 8px 8px; display: flex; justify-content: center;';
        
        const okBtn = document.createElement('button');
        okBtn.textContent = 'OK';
        okBtn.style.cssText = 'padding: 10px 30px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; font-weight: 500; min-width: 120px;';
        okBtn.onmouseover = () => okBtn.style.background = '#0056b3';
        okBtn.onmouseout = () => okBtn.style.background = '#007bff';
        okBtn.onclick = () => {
            document.body.removeChild(overlay);
        };
        
        footer.appendChild(okBtn);
        
        // Assemble modal
        modalContent.appendChild(header);
        modalContent.appendChild(body);
        modalContent.appendChild(footer);
        overlay.appendChild(modalContent);
        
        // Add to page
        document.body.appendChild(overlay);
        
        // Close on overlay click
        overlay.onclick = (e) => {
            if (e.target === overlay) {
                document.body.removeChild(overlay);
            }
        };
    }

    showMessage(message, type = 'info') {
        // Simple message modal for quick notifications
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position: fixed; z-index: 10000; left: 0; top: 0; width: 100%; height: 100%; background-color: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center;';
        
        const modalContent = document.createElement('div');
        modalContent.style.cssText = 'background-color: white; border-radius: 8px; max-width: 400px; width: 90%; box-shadow: 0 4px 20px rgba(0,0,0,0.3);';
        
        const colors = {
            info: '#17a2b8',
            warning: '#ffc107',
            error: '#dc3545',
            success: '#28a745'
        };
        
        const header = document.createElement('div');
        header.style.cssText = `padding: 15px 20px; background-color: ${colors[type] || colors.info}; color: white; border-radius: 8px 8px 0 0;`;
        header.innerHTML = `<h4 style="margin: 0; font-size: 16px;">${type.charAt(0).toUpperCase() + type.slice(1)}</h4>`;
        
        const body = document.createElement('div');
        body.style.cssText = 'padding: 20px; font-size: 14px;';
        body.textContent = message;
        
        const footer = document.createElement('div');
        footer.style.cssText = 'padding: 10px 20px; background-color: #f8f9fa; border-top: 1px solid #dee2e6; border-radius: 0 0 8px 8px; text-align: right;';
        
        const okBtn = document.createElement('button');
        okBtn.textContent = 'OK';
        okBtn.style.cssText = 'padding: 8px 20px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 14px;';
        okBtn.onclick = () => document.body.removeChild(overlay);
        
        footer.appendChild(okBtn);
        modalContent.appendChild(header);
        modalContent.appendChild(body);
        modalContent.appendChild(footer);
        overlay.appendChild(modalContent);
        document.body.appendChild(overlay);
        
        overlay.onclick = (e) => {
            if (e.target === overlay) document.body.removeChild(overlay);
        };
    }

    getAdminUserId() {
        // Use the same logic as manage_project_users.js which works
        // Try to find first user's ID from originalUsers array
        if (this.originalUsers && this.originalUsers.length > 0) {
            const firstUser = this.originalUsers[0];
            if (firstUser.id) {
                return firstUser.id;
            }
        }
        
        // Fallback: try to get from table DOM
        const firstRow = document.querySelector('#usersTable tbody tr');
        if (firstRow) {
            const userId = firstRow.dataset.userId;
            return userId;
        }
        
        return null;
    }

    async deleteUser(userId) {
        const apiUrl = `https://developer.api.autodesk.com/construction/admin/v1/projects/${this.currentProjectId}/users/${userId}`;
        
        // Get a suitable admin user for the User-Id header (same as manage_project_users.js)
        const adminUserId = this.getAdminUserId();
        
        const headers = {
            'Authorization': `Bearer ${this.currentAccessToken}`,
            'Content-Type': 'application/json'
        };
        
        // Add User-Id header if we found a suitable user
        if (adminUserId) {
            headers['User-Id'] = adminUserId;
        }
        
        const response = await fetch(apiUrl, {
            method: 'DELETE',
            headers: headers
        });

        if (!response.ok) {
            let errorData;
            try {
                errorData = await response.json();
            } catch (parseError) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const errorMessage = errorData.message || 
                               errorData.error || 
                               errorData.error_description || 
                               (errorData.errors && errorData.errors[0] && errorData.errors[0].detail) ||
                               `HTTP ${response.status}: ${response.statusText}`;
            throw new Error(errorMessage);
        }
        
        return true;
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
    // log('🎯🎯🎯 showProjectUsers CALLED! 🎯🎯🎯');
    // log('Project ID:', projectId);
    // log('Project Name:', projectName);
    
    try {
        // Use the passed 3-legged access token (has account:write scope)
        projectUsersViewer.setAccessToken(accessToken);
        projectUsersViewer.showProjectUsers(projectId, projectName);
    } catch (error) {
        // console.error('Error in showProjectUsers:', error);
        alert(`Failed to load project users: ${error.message}`);
    }
}

