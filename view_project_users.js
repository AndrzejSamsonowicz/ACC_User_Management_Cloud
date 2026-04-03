// Project Users Viewer (Read-Only)
// log('🚀🚀🚀 view_project_users.js LOADING - VERSION 20260329172500 🚀🚀🚀');
// UPDATED: 2026-03-29 17:25 - UX: Moved Cancel/OK buttons to top of confirmation modal (sticky), user list scrolls
// UPDATED: 2026-03-29 17:20 - Removed success dialog after Update All (only show errors)
// UPDATED: 2026-03-29 17:15 - BUG FIX: Re-fetch account user after role update to get NEW role ID for project update
// UPDATED: 2026-03-29 17:00 - Added Excel-like vertical paste for multi-line clipboard data
// UPDATED: 2026-03-29 16:00 - BUG FIX: Roles are ACCOUNT-LEVEL only - use account role IDs directly
// UPDATED: 2026-03-29 15:30 - OPTIMIZED Update button with parallel processing, handles ACC new behavior (users in project but not in account)
// UPDATED: 2026-03-28 17:00 - Disabled backdrop click to close modal

class ProjectUsersViewer {
    constructor() {
        this.currentAccessToken = null;
        this.currentProjectId = null;
        this.originalUsers = [];
        this.currentProjectName = '';
        this.sortColumn = 'email';
        this.sortDirection = 'asc';
        this.lastCheckedIndex = null;
        // Selection tracking for shift-click propagation
        this.lastSelectedCell = null;
        this.selectedCells = new Set();
        this.createModal();
    }

    setAccessToken(token) {
        this.currentAccessToken = token;
    }

    createModal() {
        // Create modal HTML - All content scrolls naturally (headers scroll away)
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
                                <button onclick="projectUsersViewer.updateSelectedUsers()" style="padding: 8px 16px; background: #0696D7; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; margin-right: 8px;">Update All</button>
                                <button onclick="projectUsersViewer.deleteSelectedUsers()" style="padding: 8px 16px; background: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">Delete</button>
                            </div>
                            <div style="margin-bottom: 10px; padding: 8px; background: #e7f3ff; border-left: 3px solid #0696D7; font-size: 13px; color: #333;">
                                💡 <strong>Tip:</strong> Company and Role columns are editable. Press Shift to select multiple cells vertically and horizontally.
                            </div>
                            <div id="projectUsersFilterInfo" style="margin-bottom: 10px; font-size: 13px; color: #666;"></div>
                            
                            <table id="usersTable">
                                <thead>
                                    <tr>
                                        <th style="width: 40px; text-align: center; position: static !important; background-color: #f2f2f2; font-weight: bold;">
                                            <input type="checkbox" id="selectAllCheckbox" onchange="projectUsersViewer.toggleSelectAll()" title="Select/Deselect All">
                                        </th>
                                        <th onclick="projectUsersViewer.sortTable('email')" style="cursor: pointer; user-select: none; position: static !important; background-color: #f2f2f2; font-weight: bold;">
                                            Email <span id="sortIndicator-email">↕</span>
                                        </th>
                                        <th onclick="projectUsersViewer.sortTable('company')" style="cursor: pointer; user-select: none; position: static !important; background-color: #f2f2f2; font-weight: bold;">
                                            Company <span id="sortIndicator-company">↕</span>
                                        </th>
                                        <th onclick="projectUsersViewer.sortTable('role')" style="cursor: pointer; user-select: none; position: static !important; background-color: #f2f2f2; font-weight: bold;">
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
                
                kbd {
                    background-color: #f4f4f4;
                    border: 1px solid #ccc;
                    border-radius: 3px;
                    box-shadow: 0 1px 0 rgba(0,0,0,0.2);
                    padding: 2px 6px;
                    font-family: monospace;
                    font-size: 12px;
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
                    /* VERIFIED 2026-03-29 13:54: NO sticky positioning - headers scroll away naturally */
                    /* If you see position:sticky in DevTools, the browser is loading a cached version */
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
                
                /* Editable cell styles */
                .view-editable-cell {
                    cursor: text !important;
                    background-color: white;
                }
                
                .view-editable-cell:hover {
                    background-color: #f5f9fc !important;
                }
                
                .view-editable-cell:focus {
                    outline: none;
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
        const modalContent = document.querySelector('.users-modal-content');
        const closeBtn = document.querySelector('.users-modal-close');

        console.log('[ViewProjectUsers] Setting up modal events - backdrop click disabled (2026-03-28 17:00)');

        // CRITICAL: Prevent modal from closing when clicking on backdrop
        // Handle clicks on modal backdrop (gray area) - do NOT close
        if (modal) {
            modal.addEventListener('click', (event) => {
                // Only close if clicking directly on modal backdrop AND content area to prevent closing
                // Actually, don't close at all - only X button should close
                if (event.target === modal) {
                    console.log('[ViewProjectUsers] Backdrop clicked - preventing close');
                    // Prevent any bubbling and don't close
                    event.stopPropagation();
                    event.preventDefault();
                    // Do NOT call this.closeModal()
                }
            });
        }

        // Prevent clicks on modal content from reaching modal backdrop
        if (modalContent) {
            modalContent.addEventListener('click', (event) => {
                event.stopPropagation();
            });
        }

        // Close modal when clicking the X
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                this.closeModal();
            });
        }

        // Close modal when pressing ESC key — intentionally disabled
        // Modal closes ONLY via the X button

        // Add filter input event listener
        const filterInput = document.getElementById('projectUsersFilter');
        if (filterInput) {
            filterInput.addEventListener('input', () => {
                this.filterUsers();
            });
        }

        // Setup paste event listener for Excel-like paste
        this.setupPasteListener();
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

    /**
     * Setup paste event listener for Excel-like multi-line paste
     */
    setupPasteListener() {
        const table = document.getElementById('usersTable');
        if (!table) return;

        table.addEventListener('paste', (event) => {
            const target = event.target;
            
            // Only handle paste in editable cells
            if (!target.classList.contains('view-editable-cell')) {
                return;
            }
            
            this.handlePaste(event, target);
        });

        log('📋 Paste event listener setup for Project Users table');
    }

    /**
     * Handle paste event with Excel-like vertical paste for multi-line data
     * @param {ClipboardEvent} event - Paste event
     * @param {HTMLElement} targetCell - The cell where paste was triggered
     */
    async handlePaste(event, targetCell) {
        event.preventDefault();

        try {
            // Get clipboard text
            const clipboardText = event.clipboardData.getData('text/plain');
            
            if (!clipboardText) {
                log('⚠️ No text in clipboard');
                return;
            }

            log(`📋 Paste detected: "${clipboardText.substring(0, 50)}${clipboardText.length > 50 ? '...' : ''}"`);

            // Split by newlines and clean up
            let dataSource = clipboardText.split(/\r?\n/);
            
            // Remove only the trailing empty line if it exists
            if (dataSource.length > 0 && dataSource[dataSource.length - 1].trim() === '') {
                dataSource = dataSource.slice(0, -1);
            }

            log(`📋 Data source has ${dataSource.length} line(s)`);

            // Determine if we have multiple lines
            const hasMultipleLines = dataSource.length > 1;

            // Get the target cell's field (company or role)
            const field = targetCell.dataset.field;
            const targetRowIndex = parseInt(targetCell.dataset.row);

            // Get all rows in the table
            const tableBody = document.getElementById('usersTableBody');
            const allRows = Array.from(tableBody.querySelectorAll('tr'));
            
            if (hasMultipleLines) {
                // Multi-line paste: Always paste vertically from target cell downward
                log(`📋 Multi-line paste: filling ${dataSource.length} cells vertically in "${field}" column`);
                
                const targetRow = allRows.find(row => {
                    const cell = row.querySelector(`.view-editable-cell[data-field="${field}"]`);
                    return cell === targetCell;
                });
                
                if (!targetRow) {
                    log('⚠️ Target row not found');
                    return;
                }
                
                const startRowIndex = allRows.indexOf(targetRow);
                
                for (let i = 0; i < dataSource.length && (startRowIndex + i) < allRows.length; i++) {
                    const cell = allRows[startRowIndex + i].querySelector(`.view-editable-cell[data-field="${field}"]`);
                    if (cell) {
                        cell.textContent = dataSource[i].trim();
                        log(`  ✅ Row ${startRowIndex + i}: "${dataSource[i].trim()}"`);
                    }
                }
                
                log(`✅ Pasted ${Math.min(dataSource.length, allRows.length - startRowIndex)} values vertically`);
            } else {
                // Single-line paste: Just paste into target cell
                const value = dataSource[0].trim();
                targetCell.textContent = value;
                log(`📋 Single-line paste: "${value}" into ${field} cell`);
            }

        } catch (error) {
            console.error('❌ Error handling paste:', error);
            log(`❌ Paste error: ${error.message}`);
        }
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
            
            // Company cell (editable)
            const companyCell = document.createElement('td');
            companyCell.textContent = user.company;
            companyCell.contentEditable = 'true';
            companyCell.className = 'view-editable-cell';
            companyCell.dataset.field = 'company';
            companyCell.dataset.row = index;
            companyCell.dataset.userId = user.id;
            // Add click handler for shift-select propagation
            companyCell.addEventListener('click', (e) => {
                this.handleCellClick(companyCell, e);
            });
            row.appendChild(companyCell);
            
            // Default Role cell (editable)
            const roleCell = document.createElement('td');
            roleCell.textContent = user.role;
            roleCell.contentEditable = 'true';
            roleCell.className = 'view-editable-cell';
            roleCell.dataset.field = 'role';
            roleCell.dataset.row = index;
            roleCell.dataset.userId = user.id;
            // Add click handler for shift-select propagation
            roleCell.addEventListener('click', (e) => {
                this.handleCellClick(roleCell, e);
            });
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

    /**
     * Handle cell click with shift-click propagation (like user-table-v2.js)
     * Propagation happens IMMEDIATELY on shift-click, not when typing
     */
    handleCellClick(cell, event) {
        const shiftPressed = event.shiftKey;
        const ctrlPressed = event.ctrlKey || event.metaKey;
        
        log(`🖱️ Cell clicked: field="${cell.dataset.field}", row=${cell.dataset.row}, shift=${shiftPressed}, ctrl=${ctrlPressed}`);
        
        if (!shiftPressed && !ctrlPressed) {
            // Regular click - track as last selected cell
            this.selectedCells.clear();
            this.selectedCells.add(cell);
            this.lastSelectedCell = cell;
            log(`  📌 Set as last selected cell`);
        } else if (shiftPressed && this.lastSelectedCell) {
            // Shift-click - select range AND propagate value immediately
            event.preventDefault();
            
            const startRow = parseInt(this.lastSelectedCell.dataset.row);
            const endRow = parseInt(cell.dataset.row);
            const field = this.lastSelectedCell.dataset.field;
            const sourceValue = this.lastSelectedCell.textContent.trim();
            
            const minRow = Math.min(startRow, endRow);
            const maxRow = Math.max(startRow, endRow);
            
            log(`  ⚡ Shift-selection: rows ${minRow}-${maxRow}, field="${field}", value="${sourceValue}"`);
            
            // Clear previous selection
            this.selectedCells.clear();
            
            // Select all cells in range with same field and propagate value
            const table = document.getElementById('usersTable');
            const cells = table.querySelectorAll(`.view-editable-cell[data-field="${field}"]`);
            
            let propagatedCount = 0;
            cells.forEach(targetCell => {
                const row = parseInt(targetCell.dataset.row);
                if (row >= minRow && row <= maxRow) {
                    // Add to selection
                    this.selectedCells.add(targetCell);
                    
                    // Propagate value immediately
                    targetCell.textContent = sourceValue;
                    propagatedCount++;
                }
            });
            
            log(`  ✅ Selected and propagated to ${propagatedCount} cells`);
        } else if (ctrlPressed) {
            // Ctrl-click - toggle individual cell selection
            event.preventDefault();
            
            if (this.selectedCells.has(cell)) {
                this.selectedCells.delete(cell);
                log(`  ➖ Removed from selection (${this.selectedCells.size} remaining)`);
            } else {
                this.selectedCells.add(cell);
                this.lastSelectedCell = cell;
                log(`  ➕ Added to selection (${this.selectedCells.size} total)`);
            }
        }
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

    showInvalidRolesModalInline(htmlContent) {
        // Delegate to the global backdrop version if available
        if (typeof window.showInvalidRolesModal === 'function') {
            window.showInvalidRolesModal(htmlContent);
            return;
        }

        // Fallback: Remove existing warning if any (both naming patterns)
        document.getElementById('invalidRolesBackdrop')?.remove();
        document.getElementById('invalidRolesWarning')?.remove();

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

        warningDiv.innerHTML = `
            <div style="padding: 20px; overflow-y: auto; flex: 1;">${htmlContent}</div>
            <div style="padding: 15px 20px; text-align: center; border-top: 1px solid #ffc107; background: #fff3cd; border-radius: 0 0 6px 6px;">
                <button id="closeInvalidRolesWarning" style="padding: 10px 30px; background: #ffc107; border: none; border-radius: 4px; color: #856404; font-weight: bold; cursor: pointer; font-size: 14px; font-family: 'Artifact Elements', Arial, sans-serif;">OK</button>
            </div>
        `;

        backdrop.appendChild(warningDiv);
        document.body.appendChild(backdrop);

        const close = () => backdrop.remove();
        backdrop.querySelector('#closeInvalidRolesWarning').addEventListener('click', close);
        document.addEventListener('keydown', function esc(e) {
            if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
        });
    }

    showConfirmationModal(message, onConfirm, onCancel) {
        // Remove existing confirmation if any
        const existingModal = document.getElementById('confirmationModal');
        if (existingModal) {
            existingModal.remove();
        }

        // Create modal
        const modal = document.createElement('div');
        modal.id = 'confirmationModal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.5);
            z-index: 10002;
            display: flex;
            align-items: center;
            justify-content: center;
        `;

        const content = document.createElement('div');
        content.style.cssText = `
            background: white;
            border-radius: 8px;
            max-width: 500px;
            max-height: 80vh;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            font-family: 'Artifact Elements', Arial, sans-serif;
            display: flex;
            flex-direction: column;
        `;

        content.innerHTML = `
            <div style="padding: 25px 25px 20px 25px; border-bottom: 1px solid #ddd;">
                <div style="margin-bottom: 15px; font-size: 16px; font-weight: bold; color: #333;">
                    Confirm Update
                </div>
                <div style="display: flex; gap: 10px; justify-content: flex-end;">
                    <button id="confirmModalCancel" style="
                        padding: 10px 20px;
                        background: #f0f0f0;
                        border: 1px solid #ccc;
                        border-radius: 4px;
                        cursor: pointer;
                        font-size: 14px;
                        font-family: 'Artifact Elements', Arial, sans-serif;
                    ">Cancel</button>
                    <button id="confirmModalOK" style="
                        padding: 10px 20px;
                        background: #0696D7;
                        color: white;
                        border: none;
                        border-radius: 4px;
                        cursor: pointer;
                        font-weight: bold;
                        font-size: 14px;
                        font-family: 'Artifact Elements', Arial, sans-serif;
                    ">OK</button>
                </div>
            </div>
            <div style="padding: 20px 25px; overflow-y: auto; flex: 1; white-space: pre-wrap; color: #666; font-size: 14px; line-height: 1.6;">
                ${message}
            </div>
        `;

        modal.appendChild(content);
        document.body.appendChild(modal);

        // Event handlers
        document.getElementById('confirmModalOK').onclick = () => {
            modal.remove();
            if (onConfirm) onConfirm();
        };

        document.getElementById('confirmModalCancel').onclick = () => {
            modal.remove();
            if (onCancel) onCancel();
        };

        // ESC key to cancel
        const escHandler = (e) => {
            if (e.key === 'Escape') {
                modal.remove();
                if (onCancel) onCancel();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);
    }

    showProgressModal(total) {
        // Remove existing progress modal if any
        const existingModal = document.getElementById('progressModal');
        if (existingModal) {
            existingModal.remove();
        }

        // Create modal
        const modal = document.createElement('div');
        modal.id = 'progressModal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.5);
            z-index: 10003;
            display: flex;
            align-items: center;
            justify-content: center;
        `;

        const content = document.createElement('div');
        content.style.cssText = `
            background: white;
            padding: 30px;
            border-radius: 8px;
            min-width: 400px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            font-family: 'Artifact Elements', Arial, sans-serif;
        `;

        content.innerHTML = `
            <div style="margin-bottom: 20px; font-size: 16px; font-weight: bold; color: #333; text-align: center;">
                Updating Users
            </div>
            <div id="progressText" style="margin-bottom: 15px; color: #666; font-size: 14px; text-align: center;">
                Preparing...
            </div>
            <div style="width: 100%; background: #e0e0e0; border-radius: 10px; height: 24px; overflow: hidden; margin-bottom: 10px;">
                <div id="progressBar" style="
                    width: 0%;
                    height: 100%;
                    background: linear-gradient(90deg, #0696D7, #05b3e8);
                    transition: width 0.3s ease;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: white;
                    font-size: 12px;
                    font-weight: bold;
                ">
                    <span id="progressPercent">0%</span>
                </div>
            </div>
            <div id="progressDetails" style="margin-top: 10px; font-size: 12px; color: #999; text-align: center;">
                0 of ${total} completed
            </div>
        `;

        modal.appendChild(content);
        document.body.appendChild(modal);

        // Prevent backdrop clicks
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                e.stopPropagation();
                e.preventDefault();
            }
        });
    }

    updateProgress(current, total, email) {
        const progressBar = document.getElementById('progressBar');
        const progressPercent = document.getElementById('progressPercent');
        const progressText = document.getElementById('progressText');
        const progressDetails = document.getElementById('progressDetails');

        if (progressBar && progressPercent && progressText && progressDetails) {
            const percent = Math.round((current / total) * 100);
            progressBar.style.width = percent + '%';
            progressPercent.textContent = percent + '%';
            progressText.textContent = `Updating: ${email}`;
            progressDetails.textContent = `${current} of ${total} completed`;
        }
    }

    closeProgressModal() {
        const modal = document.getElementById('progressModal');
        if (modal) {
            modal.remove();
        }
    }

    async updateSelectedUsers() {
        // Get all rows from the table
        const rows = Array.from(document.querySelectorAll('#usersTable tbody tr'));
        
        if (rows.length === 0) {
            this.showMessage('No users to update.', 'warning');
            return;
        }
        
        const accountId = window.currentHubId;
        if (!accountId) {
            this.showMessage('❌ Account ID not available. Please refresh the page.', 'error');
            return;
        }
        
        // Collect user data with edited Company and Role values
        const usersToUpdate = [];
        
        rows.forEach(row => {
            const userId = row.dataset.userId;
            const userEmail = row.dataset.userEmail;
            const companyCell = row.querySelector('.view-editable-cell[data-field="company"]');
            const roleCell = row.querySelector('.view-editable-cell[data-field="role"]');
            
            const currentCompany = companyCell ? companyCell.textContent.trim() : '';
            const currentRole = roleCell ? roleCell.textContent.trim() : '';
            
            // Find original user data
            const originalUser = this.originalUsers.find(u => u.id === userId);
            
            if (originalUser) {
                // Check if Company or Role has changed
                const companyChanged = currentCompany !== (originalUser.company || '');
                const roleChanged = currentRole !== (originalUser.role || '');
                
                if (companyChanged || roleChanged) {
                    usersToUpdate.push({
                        id: userId,
                        email: userEmail,
                        company: currentCompany,
                        role: currentRole,
                        changes: {
                            company: companyChanged ? `"${originalUser.company || ''}" → "${currentCompany}"` : null,
                            role: roleChanged ? `"${originalUser.role || ''}" → "${currentRole}"` : null
                        }
                    });
                }
            }
        });
        
        if (usersToUpdate.length === 0) {
            this.showMessage('No changes detected. Edit Company or Role values before updating.', 'info');
            return;
        }
        
        log('📝 Users to update:', usersToUpdate);
        
        // Build detailed change summary
        const changeSummary = usersToUpdate.map(u => {
            const changes = [];
            if (u.changes.company) changes.push(`Company: ${u.changes.company}`);
            if (u.changes.role) changes.push(`Role: ${u.changes.role}`);
            return `• ${u.email}\n  ${changes.join('\n  ')}`;
        }).join('\n\n');
        
        // Show confirmation modal with summary
        this.showConfirmationModal(
            `Update ${usersToUpdate.length} user(s) with edited values?\n\n${changeSummary}`,
            async () => {
                // User confirmed - proceed with update
                await this.performUserUpdates(usersToUpdate, accountId);
            },
            () => {
                // User cancelled
                log('Update cancelled by user');
            }
        );
    }

    async performUserUpdates(usersToUpdate, accountId) {
        log('🔥🔥🔥 VIEW PROJECT USERS UPDATE CODE VERSION: 2026-03-29-ROLE-FIX-V2 - Roles are account-level, use account role IDs directly 🔥🔥🔥');
        
        try {
            // Show progress modal
            this.showProgressModal(usersToUpdate.length);
            
            // Step 1: Get 2-legged token with account:write scope
            log('🔑 Getting 2-legged token with account:write scope...');
            
            const TOKEN_URL = 'https://developer.api.autodesk.com/authentication/v2/token';
            const tokenData = new URLSearchParams();
            tokenData.append('client_id', CLIENT_ID);
            tokenData.append('client_secret', CLIENT_SECRET);
            tokenData.append('grant_type', 'client_credentials');
            tokenData.append('scope', 'account:read account:write data:read');
            
            const tokenResponse = await fetch(TOKEN_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: tokenData
            });
            
            if (!tokenResponse.ok) {
                const errorData = await tokenResponse.json();
                throw new Error(`Token error: ${errorData.error_description || 'Unknown error'}`);
            }
            
            const tokenResult = await tokenResponse.json();
            const twoLeggedToken = tokenResult.access_token;
            log('✅ Got 2-legged token with account:write scope');
            
            // OPTIMIZATION: Fetch all data in parallel (Step 2 & 3)
            log('📊 Fetching companies and account users in parallel...');
            const [companiesData, accountUsers] = await Promise.all([
                // Fetch companies
                fetch(
                    `https://developer.api.autodesk.com/construction/admin/v1/accounts/${accountId}/companies?limit=100`,
                    {
                        headers: {
                            'Authorization': `Bearer ${twoLeggedToken}`,
                            'Content-Type': 'application/json'
                        }
                    }
                ).then(r => r.ok ? r.json() : { results: [] }),
                
                // Fetch account users
                fetchAllAccountUsers(accountId, twoLeggedToken)
            ]);
            
            const companies = companiesData.results || companiesData || [];
            
            // Build case-insensitive company name → id map
            const companyMap = new Map();
            companies.forEach(c => {
                if (c.name) {
                    companyMap.set(c.name.toLowerCase().trim(), c.id);
                }
            });
            
            log('📋 Company map:', companyMap);
            
            // Step 2b: Check for missing companies and create them
            const missingCompanies = new Set();
            usersToUpdate.forEach(user => {
                if (user.changes.company) {
                    const companyName = user.company.toLowerCase().trim();
                    if (!companyMap.has(companyName)) {
                        missingCompanies.add(user.company); // Use original case
                    }
                }
            });
            
            if (missingCompanies.size > 0) {
                log(`🏢 Creating ${missingCompanies.size} missing companies:`, Array.from(missingCompanies));
                
                // OPTIMIZATION: Create companies in parallel
                const companyCreationPromises = Array.from(missingCompanies).map(async (companyName) => {
                    try {
                        const payload = {
                            name: companyName,
                            trade: "General Contractor"
                        };
                        
                        log(`🏢 Creating company "${companyName}"...`);
                        
                        const createResponse = await fetch(
                            `https://developer.api.autodesk.com/hq/v1/accounts/${accountId}/companies`,
                            {
                                method: 'POST',
                                headers: {
                                    'Authorization': `Bearer ${twoLeggedToken}`,
                                    'Content-Type': 'application/json'
                                },
                                body: JSON.stringify(payload)
                            }
                        );
                        
                        if (!createResponse.ok) {
                            const errorText = await createResponse.text();
                            log(`❌ Failed to create company "${companyName}": ${createResponse.status} - ${errorText}`);
                            return null;
                        }
                        
                        const createdCompany = await createResponse.json();
                        log(`✅ Created company "${companyName}" with ID: ${createdCompany.id}`);
                        
                        return { name: companyName, id: createdCompany.id };
                        
                    } catch (error) {
                        log(`❌ Error creating company "${companyName}":`, error);
                        return null;
                    }
                });
                
                const createdCompanies = await Promise.all(companyCreationPromises);
                
                // Add to map
                createdCompanies.forEach(company => {
                    if (company) {
                        companyMap.set(company.name.toLowerCase().trim(), company.id);
                    }
                });
            }
            
            // Build email → account user map
            const accountUserMap = new Map();
            accountUsers.forEach(u => {
                if (u.email) {
                    accountUserMap.set(u.email.toLowerCase().trim(), u);
                }
            });
            
            log('📋 Account users map size:', accountUserMap.size);
            
            // Step 4: Update users at BOTH account AND project levels (PARALLEL PROCESSING)
            let successCount = 0;
            let failedUsers = [];
            let invalidRoleUsers = []; // Track users with invalid roles separately
            let processedCount = 0; // Track for progress bar
            let projectOnlyUsers = []; // Track users that exist in project but not in account
            
            // OPTIMIZATION: Helper function for parallel execution with concurrency limit
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
            
            // Update executor function
            const updateUser = async (user) => {
                // Update progress before processing each user
                this.updateProgress(processedCount, usersToUpdate.length, user.email);
                
                try {
                    const accountUser = accountUserMap.get(user.email.toLowerCase().trim());
                    
                    // NEW ACC BEHAVIOR: Users can exist in project but not in account
                    if (!accountUser) {
                        log(`⚠️ NEW ACC BEHAVIOR: User ${user.email} exists in project but NOT in account - skipping account update, updating project only`);
                        projectOnlyUsers.push(user.email);
                        
                        // Skip account update, but still update project if there are changes
                        // Continue to project update section below (accountUser will be null)
                    }
                    
                    let companyId = null;
                    
                    // Step 4a: Update account-level (HQ API) - ONLY IF USER EXISTS IN ACCOUNT
                    if (accountUser && (user.changes.company || user.changes.role)) {
                        const accountUpdatePayload = {};
                        
                        // Add company_id if company changed
                        if (user.changes.company) {
                            companyId = companyMap.get(user.company.toLowerCase().trim());
                            if (companyId) {
                                accountUpdatePayload.company_id = companyId;
                                log(`✓ Mapped "${user.company}" → ${companyId}`);
                            } else {
                                log(`⚠️ Company "${user.company}" not found in account`);
                                failedUsers.push({ email: user.email, error: `Company "${user.company}" not found` });
                                processedCount++;
                                return { success: false, email: user.email };
                            }
                        }
                        
                        // Add default_role if role changed
                        if (user.changes.role) {
                            accountUpdatePayload.default_role = user.role;
                        }
                        
                        log(`🔄 [1/2] Updating ACCOUNT user ${user.email}:`, accountUpdatePayload);
                        
                        // Use the global patchUser function from update_account_users.js
                        await patchUser(accountId, accountUser.id, twoLeggedToken, accountUpdatePayload);
                        
                        log(`✅ [1/2] Account update successful`);
                        
                        // BUG FIX: If role was updated, re-fetch the account user to get the NEW role ID
                        if (user.changes.role) {
                            log(`🔄 Re-fetching account user to get updated role ID...`);
                            const refetchResponse = await fetch(
                                `https://developer.api.autodesk.com/hq/v1/accounts/${accountId}/users/${accountUser.id}`,
                                {
                                    headers: {
                                        'Authorization': `Bearer ${twoLeggedToken}`,
                                        'Content-Type': 'application/json'
                                    }
                                }
                            );
                            
                            if (refetchResponse.ok) {
                                const updatedAccountUser = await refetchResponse.json();
                                // Update the cached version with new role ID
                                accountUserMap.set(user.email.toLowerCase().trim(), updatedAccountUser);
                                log(`✅ Updated role ID: ${updatedAccountUser.default_role_id}`);
                            } else {
                                log(`⚠️ Failed to re-fetch account user: ${refetchResponse.status}`);
                            }
                        }
                    }
                    
                    // Step 4b: Update project-level (Construction Admin API)
                    const projectUpdatePayload = {};
                    
                    if (user.changes.company) {
                        // Use the companyId from account update, or look it up again
                        if (!companyId) {
                            companyId = companyMap.get(user.company.toLowerCase().trim());
                        }
                        if (companyId) {
                            projectUpdatePayload.companyId = companyId;
                            projectUpdatePayload.companyName = user.company;
                        }
                    }
                    
                    if (user.changes.role) {
                        // Use role ID from account user (roles are account-level, not project-level)
                        // IMPORTANT: accountUserMap may have been updated with fresh data if role changed
                        const latestAccountUser = accountUserMap.get(user.email.toLowerCase().trim());
                        if (latestAccountUser && latestAccountUser.default_role_id) {
                            projectUpdatePayload.roleIds = [latestAccountUser.default_role_id];
                            log(`✓ Adding role ID ${latestAccountUser.default_role_id} for ${user.email}`);
                        }
                    }
                    
                    if (Object.keys(projectUpdatePayload).length > 0) {
                        log(`🔄 [2/2] Updating PROJECT user ${user.email}:`, projectUpdatePayload);
                        
                        const adminUserId = this.getAdminUserId();
                        
                        const headers = {
                            'Authorization': `Bearer ${this.currentAccessToken}`,
                            'Content-Type': 'application/json'
                        };
                        
                        if (adminUserId) {
                            headers['User-Id'] = adminUserId;
                        }
                        
                        const projectResponse = await fetch(
                            `https://developer.api.autodesk.com/construction/admin/v1/projects/${this.currentProjectId}/users/${user.id}`,
                            {
                                method: 'PATCH',
                                headers: headers,
                                body: JSON.stringify(projectUpdatePayload)
                            }
                        );
                        
                        if (!projectResponse.ok) {
                            const errorText = await projectResponse.text();
                            throw new Error(`Project update failed: ${projectResponse.status} - ${errorText}`);
                        }
                        
                        log(`✅ [2/2] Project update successful`);
                    }
                    
                    if (accountUser) {
                        log(`✅ Successfully updated ${user.email} at both account and project levels`);
                    } else {
                        log(`✅ Successfully updated ${user.email} at project level only (user not in account)`);
                    }
                    successCount++;
                    processedCount++;
                    
                    // OPTIMIZATION: Reduced delay from 100ms to 20ms
                    await new Promise(resolve => setTimeout(resolve, 20));
                    return { success: true, email: user.email };
                    
                } catch (error) {
                    log(`❌ Error updating ${user.email}:`, error);
                    
                    // Check if error is about invalid default_role
                    const errorMsg = error.message || '';
                    if (errorMsg.includes('default_role') && 
                        (errorMsg.includes('doesn\'t exist') || errorMsg.includes('does not exist') || 
                         errorMsg.includes('404') || errorMsg.includes('1004'))) {
                        // This is an invalid role error - but update succeeded without role
                        invalidRoleUsers.push({ 
                            email: user.email, 
                            role: user.role 
                        });
                        // Count as partial success (updated but without invalid role)
                        successCount++;
                    } else {
                        // Other type of error
                        failedUsers.push({ email: user.email, error: error.message });
                    }
                    processedCount++;
                    return { success: false, email: user.email, error: error.message };
                }
            };
            
            // OPTIMIZATION: Process 4 users in parallel (up from 1)
            log(`Processing ${usersToUpdate.length} user updates with concurrency=4`);
            await executeInParallel(usersToUpdate, 4, updateUser);
            
            // Update progress to 100%
            this.updateProgress(usersToUpdate.length, usersToUpdate.length, 'Complete');
            
            // Small delay to show 100% before closing
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Close progress modal
            this.closeProgressModal();
            
            // Step 5: Show results and reload data
            
            // NEW ACC BEHAVIOR: Inform user about project-only users
            if (projectOnlyUsers.length > 0) {
                log(`ℹ️ NEW ACC BEHAVIOR: ${projectOnlyUsers.length} user(s) exist in project but not in account:`, projectOnlyUsers);
                
                let infoHTML = '<div style="margin-bottom: 10px; font-weight: bold; color: #0288d1;">ℹ️ New ACC Behavior - Project-Only Users</div>';
                infoHTML += '<div style="margin-bottom: 10px; color: #333;">The following users exist in the project but NOT in the account. They were updated at the project level only:</div>';
                infoHTML += '<ul style="margin: 5px 0; padding-left: 20px; color: #333;">';
                projectOnlyUsers.forEach(email => {
                    infoHTML += `<li>${email}</li>`;
                });
                infoHTML += '</ul>';
                infoHTML += '<div style="margin-top: 15px; padding: 10px; background: #e3f2fd; border: 1px solid #2196f3; border-radius: 4px; font-size: 13px;">';
                infoHTML += '<strong>Note:</strong> This is a new Autodesk Construction Cloud feature that allows users to exist in projects without being in the account. Account-level updates (company, role) were skipped for these users.';
                infoHTML += '</div>';
                
                // Show info modal using the same modal component
                if (typeof window.showInvalidRolesModal === 'function') {
                    window.showInvalidRolesModal(infoHTML);
                } else {
                    this.showInvalidRolesModalInline(infoHTML);
                }
            }
            
            // Check if there were invalid role errors
            if (invalidRoleUsers.length > 0) {
                // Build error message HTML for modal (matching update_project_users.js style)
                let errorHTML = '<div style="margin-bottom: 10px; font-weight: bold; color: #ff9800;">⚠️ Invalid roles were found and automatically removed - users were processed without these roles:</div>';
                
                // Group by role name
                const roleGroups = new Map();
                invalidRoleUsers.forEach(({ email, role }) => {
                    if (!roleGroups.has(role)) {
                        roleGroups.set(role, []);
                    }
                    roleGroups.get(role).push(email);
                });
                
                for (const [roleName, emails] of roleGroups) {
                    errorHTML += `<div style="margin: 10px 0; padding: 10px; background: #fff3cd; border-left: 3px solid #ffc107;">`;
                    errorHTML += `<strong style="color: #856404;">Role "${roleName}" doesn't exist in this account</strong>`;
                    errorHTML += '<ul style="margin: 5px 0; padding-left: 20px; color: #856404;">';
                    emails.forEach(email => {
                        errorHTML += `<li>${email} - added/updated without this role (operation succeeded)</li>`;
                    });
                    errorHTML += '</ul></div>';
                }
                
                errorHTML += '<div style="margin-top: 15px; padding: 10px; background: #e3f2fd; border: 1px solid #2196f3; border-radius: 4px; font-size: 13px;">';
                errorHTML += '<strong>Action Required:</strong> Check your account settings to see which roles are configured, then update the "Project user list" with valid roles.';
                errorHTML += '</div>';
                
                // Show modal using global function from update_project_users.js
                if (typeof window.showInvalidRolesModal === 'function') {
                    window.showInvalidRolesModal(errorHTML);
                } else {
                    // Fallback to inline modal creation if global function not available
                    this.showInvalidRolesModalInline(errorHTML);
                }
            }
            
            // Reload users to verify changes persisted
            try {
                const allUsers = await this.fetchAllUsers(this.currentProjectId);
                
                // Update originalUsers with fresh data
                this.originalUsers = allUsers.map(user => {
                    let roleNames = 'N/A';
                    if (user.roles && Array.isArray(user.roles) && user.roles.length > 0) {
                        roleNames = user.roles.map(r => r.name).join(', ');
                    }
                    
                    return {
                        id: user.id,
                        email: user.email || 'N/A',
                        company: user.companyName || 'N/A',
                        role: roleNames
                    };
                });
                
                // Re-render table with fresh data
                this.renderTable();
                
                log('✅ Data reloaded successfully');
            } catch (error) {
                log('⚠️ Failed to reload data:', error);
            }
            
            // Show result summary only if there are failures
            if (failedUsers.length > 0) {
                let summaryMessage = `⚠️ Failed to update ${failedUsers.length} user(s):\n` +
                    failedUsers.map(f => `• ${f.email}: ${f.error}`).join('\n');
                
                this.showMessage(summaryMessage, 'warning');
            }
            // Success: No dialog shown, just logged
            
        } catch (error) {
            log('❌ Update failed:', error);
            this.closeProgressModal();
            this.showMessage(`❌ Update failed: ${error.message}`, 'error');
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

