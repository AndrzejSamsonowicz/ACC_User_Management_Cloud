// Security: HTML escape function to prevent XSS
function escapeHtml(text) {
    if (typeof text !== 'string') return text;
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Global variable to hold the user table manager instance
let userTableManager = null;

/**
 * User Table Management Module
 * Handles all user management functionality within a modal dialog
 * 
 * @author ACC User Management System
 * @version 1.0.0
 */

class UserTableManager extends TableCellInteraction {
    constructor() {
        super(); // Initialises selection, sort, drag-to-fill, and copy/paste state.
        // Domain constants
        this.ALLOWED_VALUES = ['none', 'member', 'administrator'];
        this.INSIGHT_VALUES = ['member', 'administrator'];
        this.PROJECT_ADMIN_VALUES = ['none', 'administrator'];
        // Email validation (also consumed by TableCellInteraction drag-to-fill guard)
        this.emailRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
        this.existingEmails = new Set();
        // Table element IDs — required by TableCellInteraction base class
        this.tableId = 'modalUserTable';
        this.tableBodyId = 'modalTableBody';
        // Modal element IDs
        this.modalId = 'userManagementModal';
        this.tableSummaryId = 'modalTableSummary';
        this.currentlyFocusedCell = null; // Track the currently focused cell for row deletion
        // Hub tracking for modal
        this.modalHubId = null;
        this.modalHubName = null;
        // Project tracking for modal
        this.modalProjectId = null;
        this.modalProjectName = null;
    }

    /**
     * Initialize the user table manager
     */
    init() {
        this.setupEventListeners();
        this.setupSortingListeners();
        this.setupCheckboxListeners();
        // this.setupDragToFillListeners(); // Disabled: Now using click-based shift selection
        this.setupMouseSelectionListeners();
        this.setupCopyPasteListeners();
        this.setupClickDragPropagationListeners();
    }

    /**
     * Setup checkbox listeners for row deletion
     */
    setupCheckboxListeners() {
        // Select All checkbox in header
        const selectAllCheckbox = document.getElementById('selectAllCheckbox');
        if (selectAllCheckbox) {
            selectAllCheckbox.addEventListener('change', (e) => {
                const tbody = document.getElementById(this.tableBodyId);
                const checkboxes = tbody.querySelectorAll('input[type="checkbox"].row-checkbox');
                checkboxes.forEach(checkbox => {
                    checkbox.checked = e.target.checked;
                });
                log(`✅ ${e.target.checked ? 'Selected' : 'Deselected'} all rows`);
            });
        }
        
        // Shift+click range selection for checkboxes
        const tbody = document.getElementById(this.tableBodyId);
        let lastCheckedIndex = null;
        
        tbody.addEventListener('click', (e) => {
            const checkbox = e.target;
            if (checkbox.type !== 'checkbox' || !checkbox.classList.contains('row-checkbox')) return;
            
            const checkboxes = Array.from(tbody.querySelectorAll('input[type="checkbox"].row-checkbox'));
            const currentIndex = checkboxes.indexOf(checkbox);
            
            if (e.shiftKey && lastCheckedIndex !== null && lastCheckedIndex !== currentIndex) {
                // Shift+click: select range between last and current
                const start = Math.min(lastCheckedIndex, currentIndex);
                const end = Math.max(lastCheckedIndex, currentIndex);
                const checkState = checkbox.checked;
                
                for (let i = start; i <= end; i++) {
                    checkboxes[i].checked = checkState;
                }
                
                log(`✅ Shift-selected checkboxes from ${start} to ${end}`);
            }
            
            lastCheckedIndex = currentIndex;
        });
        
        // OLD VERTICAL-ONLY shift-select for product toggles - DISABLED
        // Now using unified handleShiftClickSelection() that supports both horizontal and vertical
        /*
        // Shift+click range selection for product toggle columns
        let lastProductToggle = null; // Store {rowIndex, columnIndex, checked}
        
        tbody.addEventListener('click', (e) => {
            // Check if clicked on a product toggle checkbox
            const checkbox = e.target;
            if (checkbox.type !== 'checkbox') return;
            
            const cell = checkbox.closest('.modal-access-cell');
            if (!cell) return; // Not a product toggle
            
            const row = cell.parentElement;
            const rows = Array.from(tbody.querySelectorAll('tr'));
            const currentRowIndex = rows.indexOf(row);
            const currentColumnIndex = Array.from(row.cells).indexOf(cell);
            
            if (e.shiftKey && lastProductToggle !== null && 
                lastProductToggle.columnIndex === currentColumnIndex &&
                lastProductToggle.rowIndex !== currentRowIndex) {
                
                // Shift+click: apply toggle state to range in same column
                const start = Math.min(lastProductToggle.rowIndex, currentRowIndex);
                const end = Math.max(lastProductToggle.rowIndex, currentRowIndex);
                const checkState = checkbox.checked;
                
                log(`🔵 Shift-selecting product toggles from row ${start} to ${end}, column ${currentColumnIndex}`);
                
                for (let i = start; i <= end; i++) {
                    const targetRow = rows[i];
                    const targetCell = targetRow.cells[currentColumnIndex];
                    const targetCheckbox = targetCell?.querySelector('input[type="checkbox"]');
                    
                    if (targetCheckbox && targetCell.classList.contains('modal-access-cell')) {
                        // Set the checkbox state
                        targetCheckbox.checked = checkState;
                        
                        // Trigger the change event to update the cell properly
                        const changeEvent = new Event('change', { bubbles: true });
                        targetCheckbox.dispatchEvent(changeEvent);
                    }
                }
                
                log(`✅ Shift-selected product toggles in column ${currentColumnIndex} from row ${start} to ${end}`);
            }
            
            // Update last clicked toggle info
            lastProductToggle = {
                rowIndex: currentRowIndex,
                columnIndex: currentColumnIndex,
                checked: checkbox.checked
            };
        }, true); // Use capture phase to get the event before 'change'
        */
    }

    // setupDragToFillListeners, setupMouseSelectionListeners, setupCopyPasteListeners
    // are inherited from TableCellInteraction.

    // deleteSelectedCells, copySelectedCells, pasteToSelectedCells
    // are inherited from TableCellInteraction.


    // setupSortingListeners, sortTable, updateSortIndicators
    // are inherited from TableCellInteraction.

    /**
     * Open the user management modal
     */
    openModal(projectId, projectName, mode = 'new') {
        log('🎯 openModal() called with projectId:', projectId, 'projectName:', projectName, 'mode:', mode);
        const modal = document.getElementById(this.modalId);
        log('🎯 Modal element:', modal);
        
        // Store the project info when modal opens
        if (projectId && projectName) {
            this.modalProjectId = projectId;
            this.modalProjectName = projectName;
            log('🎯 Stored project info:', this.modalProjectId, this.modalProjectName);
        } else {
            console.error('❌ No project info provided when opening modal');
            alert('Error: No project selected. Please select a project first.');
            return;
        }
        
        // Store the current hub info when modal opens
        if (window.currentHubId) {
            this.modalHubId = window.currentHubId;
            this.modalHubName = window.currentHubName || 'Unknown Hub';
            log('🎯 Stored hub info:', this.modalHubId, this.modalHubName);
        } else {
            this.modalHubId = null;
            this.modalHubName = null;
            console.warn('⚠️ No hub selected when opening modal');
        }
        
        // Update hub info display
        this.updateHubInfoDisplay();
        
        // Apply mode: toggle CSS class and set title before making modal visible
        const titleEl = document.getElementById('modalTitle');
        const saveSyncBtn = document.getElementById('modalSaveSyncBtn');
        
        if (mode === 'manage') {
            this.modalMode = 'manage';
            modal.classList.add('modal-manage-mode');
            if (titleEl) titleEl.textContent = 'Manage Existing Users - ' + projectName;
            if (saveSyncBtn) { saveSyncBtn.textContent = 'Sync'; saveSyncBtn.onclick = () => syncOnly(); }
        } else if (mode === 'multi-new') {
            this.modalMode = 'multi-new';
            modal.classList.remove('modal-manage-mode');
            const count = this.modalProjectIds ? this.modalProjectIds.length : 1;
            if (titleEl) titleEl.textContent = count > 1
                ? `Add New Users — ${count} projects selected`
                : `Add New Users — ${projectName}`;
            if (saveSyncBtn) { saveSyncBtn.textContent = 'Save & Sync'; saveSyncBtn.onclick = () => saveAndSync(); }
        } else {
            this.modalMode = 'new';
            modal.classList.remove('modal-manage-mode');
            if (titleEl) titleEl.textContent = 'User Management';
            if (saveSyncBtn) { saveSyncBtn.textContent = 'Save & Sync'; saveSyncBtn.onclick = () => saveAndSync(); }
        }
        
        modal.style.display = 'block';
        log('🎯 Calling loadTableData()...');
        // In multi-new mode start with a blank table (no existing data to load)
        if (mode === 'multi-new') {
            const tbody = document.getElementById(this.tableBodyId);
            tbody.innerHTML = '';
            this.existingEmails.clear();
            this.updateUserCount();
        } else {
            this.loadTableData();
        }
        
        // Focus on the modal for better accessibility
        setTimeout(() => {
            const firstButton = modal.querySelector('button');
            if (firstButton) firstButton.focus();
        }, 100);
    }

    /**
     * Update the hub info display in the modal
     */
    updateHubInfoDisplay() {
        const hubNameEl = document.getElementById('modalHubName');
        const hubIdEl = document.getElementById('modalHubId');
        const projectNameEl = document.getElementById('modalProjectName');
        const projectIdEl = document.getElementById('modalProjectId');
        const modalTitleEl = document.getElementById('modalTitle');
        
        // Update hub info
        if (this.modalHubId) {
            if (hubNameEl) hubNameEl.textContent = this.modalHubName;
            if (hubIdEl) hubIdEl.textContent = '';
        } else {
            if (hubNameEl) hubNameEl.textContent = 'Not selected';
            if (hubIdEl) hubIdEl.textContent = '';
        }
        
        // Update project info
        if (this.modalProjectId) {
            if (projectNameEl) projectNameEl.textContent = this.modalProjectName;
            if (projectIdEl) projectIdEl.textContent = '';
            if (modalTitleEl) modalTitleEl.textContent = 'Project users list';
        } else {
            if (projectNameEl) projectNameEl.textContent = 'Not selected';
            if (projectIdEl) projectIdEl.textContent = '';
            if (modalTitleEl) modalTitleEl.textContent = 'User Management';
        }
    }

    /**
     * Close the user management modal
     */
    closeModal() {
        const modal = document.getElementById(this.modalId);
        modal.style.display = 'none';

        // Uncheck all project checkboxes when closing the multi-new modal
        if (this.modalMode === 'multi-new') {
            document.querySelectorAll('.project-select-cb').forEach(cb => cb.checked = false);
            if (window.checkedProjectIds) window.checkedProjectIds.clear();
            const btn = document.getElementById('addNewUsersBtn');
            const warning = document.getElementById('addNewUsersBtnWarning');
            if (btn) btn.disabled = true;
            if (warning) warning.style.visibility = 'visible';
        }
    }

    /**
     * Setup modal event listeners
     */
    setupEventListeners() {
        const modal = document.getElementById(this.modalId);
        const closeBtn = modal.querySelector('.user-modal-close');
        
        closeBtn.onclick = () => this.closeModal();
        
        // Modal closes ONLY via the X button — Escape and backdrop click are intentionally disabled
    }

    /**
     * Add a new row to the table
     */
    addRow() {
        log('➕ addRow() called');
        const tbody = document.getElementById(this.tableBodyId);
        const row = document.createElement('tr');
        
        // Checkbox cell
        const checkboxCell = this.createCheckboxCell();
        row.appendChild(checkboxCell);
        
        // Email cell
        log('➕ Creating email cell...');
        const emailCell = this.createEmailCell();
        row.appendChild(emailCell);
        
        // Company cell
        const companyCell = this.createEditableCell();
        row.appendChild(companyCell);
        
        // Role cell
        const roleCell = this.createEditableCell();
        row.appendChild(roleCell);
        
        // Access level cells (Insight hidden from UI; Data Management auto-granted by ACC)
        const accessColumns = [
            'Project Admin',
            'Design Collaboration', 'Model Coordination',
            'Preconstruction', 'Build', 'Cost Management', 'Design'
        ];
        
        accessColumns.forEach((columnName, index) => {
            const cell = this.createAccessCell(columnName, index + 4, tbody.children.length);
            row.appendChild(cell);
        });
        
        tbody.appendChild(row);
        this._syncProjectAdminLock(row);
        log('➕ Row added to table, total rows:', tbody.rows.length);
        this.updateUserCount();
    }

    /**
     * Create a checkbox cell for row selection
     */
    createCheckboxCell() {
        const cell = document.createElement('td');
        cell.style.textAlign = 'center';
        cell.style.width = '40px';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'row-checkbox';
        checkbox.style.cursor = 'pointer';
        
        cell.appendChild(checkbox);
        return cell;
    }

    /**
     * Create a new table row (without appending it to the table)
     */
    createNewRow() {
        log('🔧 createNewRow() called');
        const row = document.createElement('tr');
        
        // Checkbox cell
        const checkboxCell = this.createCheckboxCell();
        row.appendChild(checkboxCell);
        
        // Email cell
        const emailCell = this.createEmailCell();
        row.appendChild(emailCell);
        
        // Company cell
        const companyCell = this.createEditableCell();
        row.appendChild(companyCell);
        
        // Role cell
        const roleCell = this.createEditableCell();
        row.appendChild(roleCell);
        
        // Access level cells (Insight hidden from UI; Data Management auto-granted by ACC)
        const accessColumns = [
            'Project Admin',
            'Design Collaboration', 'Model Coordination',
            'Preconstruction', 'Build', 'Cost Management', 'Design'
        ];
        
        accessColumns.forEach((columnName, index) => {
            const cell = this.createAccessCell(columnName, index + 4, 0); // Use 0 for row index as placeholder, +4 for checkbox column
            row.appendChild(cell);
        });
        
        log('🔧 New row created (not yet appended)');
        return row;
    }

    /**
     * Create an email cell with validation
     */
    createEmailCell() {
        const emailCell = document.createElement('td');
        emailCell.contentEditable = true;
        emailCell.className = 'modal-editable';
        
        // Use both paste and input events for better coverage
        emailCell.addEventListener('paste', (e) => {
            log('🔥🔥🔥 PASTE EVENT TRIGGERED ON EMAIL CELL! 🔥🔥🔥');
            this.handlePaste(e);
        }, true);
        
        // Also listen for input events (fired after paste)
        emailCell.addEventListener('input', (e) => {
            log('📝📝📝 INPUT EVENT TRIGGERED ON EMAIL CELL! 📝📝📝');
            setTimeout(() => {
                this.handleInputForMultiEmail(e.target);
            }, 10);
        });
        
        emailCell.addEventListener('blur', (e) => {
            const email = e.target.textContent.trim();
            if (email !== '') {
                if (!this.validateEmail(email, e.target)) {
                    e.target.textContent = e.target.getAttribute('data-previous-value') || '';
                } else {
                    e.target.setAttribute('data-previous-value', email);
                }
            }
            this.updateUserCount();
        });
        emailCell.addEventListener('focus', (e) => {
            e.target.setAttribute('data-previous-value', e.target.textContent.trim());
            this.currentlyFocusedCell = e.target; // Track the currently focused cell
            log('🎯 Email cell focused, row tracked for deletion');
        });
        return emailCell;
    }

    /**
     * Create a standard editable cell
     */
    createEditableCell() {
        const cell = document.createElement('td');
        cell.contentEditable = true;
        cell.className = 'modal-editable';
        cell.addEventListener('paste', (e) => this.handlePaste(e));
        cell.addEventListener('focus', (e) => {
            this.currentlyFocusedCell = e.target; // Track the currently focused cell
            log('🎯 Editable cell focused, row tracked for deletion');
        });
        
        // Add click handler for shift-select
        cell.addEventListener('click', (e) => {
            if (e.shiftKey || e.ctrlKey) {
                e.preventDefault();
                this.handleShiftClickSelection(cell, e.shiftKey, e.ctrlKey);
            } else {
                // Normal click - track as last selected
                this.selectedCells.forEach(c => c.classList.remove('selected'));
                this.selectedCells.clear();
                // cell.classList.add('selected'); // Disabled: no visual highlighting
                this.selectedCells.add(cell);
                this.lastSelectedCell = cell;
            }
        });
        
        return cell;
    }

    /**
     * Create an access level cell with toggle switch
     */
    createAccessCell(columnName, columnIndex, rowIndex) {
        log(`🏗️ createAccessCell called: ${columnName} (col=${columnIndex}, row=${rowIndex}) - NEW CODE VERSION`);
        
        const cell = document.createElement('td');
        cell.className = 'modal-access-cell';
        cell.setAttribute('data-column', columnIndex);
        cell.setAttribute('data-row', rowIndex);
        
        // Set default values based on service type
        let defaultValue;
        if (columnName === 'Project Admin') {
            defaultValue = 'none';
        } else if (columnName === 'Insight') {
            defaultValue = 'member';
        } else {
            defaultValue = 'none';
        }
        
        // Store the value in data attribute
        cell.setAttribute('data-value', defaultValue);
        cell.setAttribute('data-column-name', columnName);
        
        // Create toggle switch HTML
        const toggleHtml = `
            <label class="toggle-switch">
                <input type="checkbox" ${this.isToggleChecked(columnName, defaultValue) ? 'checked' : ''}>
                <span class="toggle-slider"></span>
            </label>
        `;
        cell.innerHTML = toggleHtml;
        
        // Add click handler to cell for shift/ctrl-select (capture phase to intercept before checkbox)
        cell.addEventListener('click', (e) => {
            log(`🖱️ ACCESS CELL CLICK: columnName="${columnName}", shiftKey=${e.shiftKey}, ctrlKey=${e.ctrlKey}, hasLastSelected=${!!this.lastSelectedCell}`);
            
            // Handle shift-click for range selection
            if (e.shiftKey && this.lastSelectedCell) {
                log(`  ✅ Shift condition met - calling handleShiftClickSelection`);
                e.preventDefault();
                e.stopPropagation();
                this.handleShiftClickSelection(cell, true, false);
                return false;
            }
            // Handle ctrl-click for multi-select
            else if (e.ctrlKey) {
                log(`  ✅ Ctrl condition met - calling handleShiftClickSelection`);
                e.preventDefault();
                e.stopPropagation();
                this.handleShiftClickSelection(cell, false, true);
                return false;
            }
            // Regular click - let checkbox toggle normally but track cell
            else {
                log(`  ℹ️ Regular click - will set as lastSelectedCell after checkbox toggles`);
                // This will execute after checkbox toggles
                setTimeout(() => {
                    this.selectedCells.forEach(c => c.classList.remove('selected'));
                    this.selectedCells.clear();
                    // cell.classList.add('selected'); // Disabled: no visual highlighting
                    this.selectedCells.add(cell);
                    this.lastSelectedCell = cell;
                    log(`  ✅ lastSelectedCell set to: ${cell.getAttribute('data-column-name')}`);
                }, 0);
            }
        }, true); // Use capture phase to intercept early
        
        // Add click handler for toggle
        const checkbox = cell.querySelector('input[type="checkbox"]');
        checkbox.addEventListener('change', (e) => this.handleToggleChange(e, cell, columnName, columnIndex));
        
        return cell;
    }
    
    /**
     * Determine if toggle should be checked based on column and value
     */
    isToggleChecked(columnName, value) {
        if (columnName === 'Project Admin') {
            return value === 'administrator';
        } else {
            // Other products: checked = member or administrator
            return value === 'member' || value === 'administrator';
        }
    }
    
    /**
     * Lock or unlock service toggles based on whether Project Admin is ON.
     * When Project Admin is ON: all service cells are set to 'administrator', toggles disabled.
     * When Project Admin is OFF: all service cells are re-enabled.
     */
    _syncProjectAdminLock(row) {
        const accessCells = Array.from(row.cells).slice(4);
        const projectAdminCell = accessCells.find(c =>
            c.classList.contains('modal-access-cell') &&
            c.getAttribute('data-column-name') === 'Project Admin'
        );
        if (!projectAdminCell) return;

        const isAdmin = projectAdminCell.getAttribute('data-value') === 'administrator';

        accessCells.forEach(otherCell => {
            if (otherCell === projectAdminCell) return;
            if (!otherCell.classList.contains('modal-access-cell')) return;

            const checkbox = otherCell.querySelector('input[type="checkbox"]');
            if (!checkbox) return;

            if (isAdmin) {
                // Force ON and lock
                checkbox.checked = true;
                checkbox.disabled = true;
                otherCell.setAttribute('data-value', 'administrator');
                otherCell.classList.add('administrator');
                otherCell.style.opacity = '0.6';
                otherCell.style.cursor = 'not-allowed';
            } else {
                // Unlock
                checkbox.disabled = false;
                otherCell.style.opacity = '';
                otherCell.style.cursor = '';
            }
        });
    }

    /**
     * Handle toggle switch change
     */
    handleToggleChange(event, cell, columnName, columnIndex) {
        const checkbox = event.target;
        const isChecked = checkbox.checked;
        const row = cell.parentElement;
        
        // Determine new value based on column and toggle state
        let newValue;
        if (columnName === 'Project Admin') {
            newValue = isChecked ? 'administrator' : 'none';
        } else {
            // Other products
            newValue = isChecked ? 'member' : 'none';
        }
        
        // Update cell data
        cell.setAttribute('data-value', newValue);
        
        // Update administrator class for visual feedback
        if (newValue === 'administrator') {
            cell.classList.add('administrator');
        } else {
            cell.classList.remove('administrator');
        }
        
        log(`🔘 Toggle changed: ${columnName} = ${newValue}`);
        
        // Skip auto-toggle logic during bulk operations (shift-select)
        if (this.isBulkOperation) {
            return;
        }
        
        // Special handling for Project Admin: toggle all other columns
        if (columnName === 'Project Admin') {
            const accessCells = Array.from(row.cells).slice(4); // Skip first 4 columns
            accessCells.forEach((otherCell) => {
                if (otherCell === cell) return; // Skip self
                if (!otherCell.classList.contains('modal-access-cell')) return;
                
                const otherCheckbox = otherCell.querySelector('input[type="checkbox"]');
                const otherColumnName = otherCell.getAttribute('data-column-name');
                
                if (otherCheckbox) {
                    otherCheckbox.checked = isChecked;
                    
                    // Update value based on the other column's rules
                    let otherNewValue;
                    if (isChecked) {
                        otherNewValue = 'administrator';
                    } else {
                        // When unchecking, revert to defaults
                        otherNewValue = 'none';
                    }
                    
                    otherCell.setAttribute('data-value', otherNewValue);
                    
                    if (otherNewValue === 'administrator') {
                        otherCell.classList.add('administrator');
                    } else {
                        otherCell.classList.remove('administrator');
                    }
                    
                    log(`🔘 Auto-toggled: ${otherColumnName} = ${otherNewValue}`);
                }
            });
            // Apply lock/unlock after toggling
            this._syncProjectAdminLock(row);
        }
        // Critical: If ANY product column is toggled OFF while Project Admin is ON
        // Then turn OFF Project Admin and downgrade ALL other columns
        else if (!isChecked) {
            const accessCells = Array.from(row.cells).slice(4); // Skip first 4 columns
            // Find Project Admin cell
            const projectAdminCell = accessCells.find(c => 
                c.classList.contains('modal-access-cell') && 
                c.getAttribute('data-column-name') === 'Project Admin'
            );
            
            // Check if Project Admin is currently ON
            if (projectAdminCell && projectAdminCell.getAttribute('data-value') === 'administrator') {
                log('🚨 Product column toggled OFF while Project Admin is ON → Downgrading ALL columns including Project Admin');
                
                // Downgrade all columns including Project Admin
                accessCells.forEach((otherCell) => {
                    if (!otherCell.classList.contains('modal-access-cell')) return;
                    
                    const otherCheckbox = otherCell.querySelector('input[type="checkbox"]');
                    const otherColumnName = otherCell.getAttribute('data-column-name');
                    
                    if (otherCheckbox) {
                        otherCheckbox.checked = false; // Turn OFF all toggles
                        
                        // Set to default values
                        let otherNewValue;
                        otherNewValue = 'none';
                        
                        otherCell.setAttribute('data-value', otherNewValue);
                        otherCell.classList.remove('administrator');
                        
                        log(`🔻 Auto-downgraded: ${otherColumnName} = ${otherNewValue}`);
                    }
                });
            }
        }
    }

    /**
     * Initialize access cell with validation events
     */
    initializeAccessCell(cell) {
        cell.addEventListener('blur', (e) => {
            const previousValue = e.target.getAttribute('data-previous-value') || 'none';
            const value = this.validateAccessValue(e.target, e.target.textContent);
            
            log(`🔍 Access cell blur - Previous: "${previousValue}", New: "${value}"`);
            
            if (value !== false) {
                e.target.textContent = value;
                e.target.classList.toggle('administrator', value === 'administrator');
                
                // If this cell becomes "administrator", upgrade all other access cells in the same row
                if (value === 'administrator') {
                    log('⬆️ Triggering upgrade to administrator');
                    this.upgradeAllAccessToAdministrator(e.target);
                }
                // If this cell was "administrator" and becomes something else, downgrade all other cells
                else if (previousValue === 'administrator' && value !== 'administrator') {
                    log('⬇️ Triggering downgrade from administrator');
                    this.downgradeAllAccessFromAdministrator(e.target);
                }
            } else {
                log('❌ Validation failed, reverting to previous value');
                e.target.textContent = previousValue;
            }
        });
        
        cell.addEventListener('focus', (e) => {
            e.target.setAttribute('data-previous-value', e.target.textContent.trim());
            this.currentlyFocusedCell = e.target; // Track the currently focused cell
            log('🎯 Access cell focused, row tracked for deletion');
        });
    }

    /**
     * Upgrade all access level cells in a row to "administrator"
     * When any product becomes "administrator", all products must be "administrator"
     */
    upgradeAllAccessToAdministrator(triggerCell) {
        log('🔐 upgradeAllAccessToAdministrator() called');
        const row = triggerCell.parentElement;
        
        // Find all access level cells in this row (columns 4-12: Project Admin through Preconstruction)
        const accessCells = Array.from(row.cells).slice(4); // Skip Checkbox (0), Email (1), Company (2), Role (3)
        
        log(`🔐 Upgrading ${accessCells.length} access cells to administrator`);
        
        accessCells.forEach((cell, index) => {
            const currentValue = cell.getAttribute('data-value') || 'none';
            const columnIndex = parseInt(cell.getAttribute('data-column'));
            
            // Only upgrade cells that have the modal-access-cell class (skip any non-product cells)
            if (!cell.classList.contains('modal-access-cell')) {
                log(`⏭️ Skipping non-access cell at index ${cell.cellIndex}`);
                return;
            }
            
            // Get the checkbox input from the toggle switch
            const checkbox = cell.querySelector('input[type="checkbox"]');
            if (!checkbox) {
                console.warn(`⚠️ No checkbox found in cell at column ${columnIndex}`);
                return;
            }
            
            // Project Admin (column 4) can only be 'none' or 'administrator'
            if (columnIndex === 4) {
                if (currentValue !== 'administrator') {
                    checkbox.checked = true;
                    cell.setAttribute('data-value', 'administrator');
                    cell.classList.add('administrator');
                    log(`🔐 Upgraded Project Admin to administrator`);
                }
            } else {
                // All other products can be upgraded to administrator
                if (currentValue !== 'administrator') {
                    checkbox.checked = true;
                    cell.setAttribute('data-value', 'administrator');
                    cell.classList.add('administrator');
                    log(`🔐 Upgraded ${this.getColumnName(columnIndex)} to administrator`);
                }
            }
        });
        
        log('🔐 All access levels upgraded to administrator');
    }

    /**
     * Downgrade all access level cells in a row from "administrator"
     * When any product is downgraded from "administrator", all products must be downgraded
     * All products become "none" (Data Management is auto-granted by ACC)
     */
    downgradeAllAccessFromAdministrator(triggerCell) {
        log('🔓 downgradeAllAccessFromAdministrator() called');
        const row = triggerCell.parentElement;
        
        // Find all access level cells in this row (columns 4-12: Project Admin through Preconstruction)
        const accessCells = Array.from(row.cells).slice(4); // Skip Checkbox (0), Email (1), Company (2), Role (3)
        
        log(`🔓 Downgrading ${accessCells.length} access cells from administrator`);
        
        accessCells.forEach((cell, index) => {
            const currentValue = cell.getAttribute('data-value') || 'none';
            const columnIndex = parseInt(cell.getAttribute('data-column'));
            
            // Only downgrade cells that have the modal-access-cell class (skip any non-product cells)
            if (!cell.classList.contains('modal-access-cell')) {
                log(`⏭️ Skipping non-access cell at index ${cell.cellIndex}`);
                return;
            }
            
            // Skip the trigger cell (it's already been changed)
            if (cell === triggerCell) {
                return;
            }
            
            // Get the checkbox input from the toggle switch
            const checkbox = cell.querySelector('input[type="checkbox"]');
            if (!checkbox) {
                console.warn(`⚠️ No checkbox found in cell at column ${columnIndex}`);
                return;
            }
            
            // All products become "none"
            checkbox.checked = false;
            cell.setAttribute('data-value', 'none');
            cell.classList.remove('administrator');
            log(`🔓 Downgraded ${this.getColumnName(columnIndex)} to none`);
        });
        
        log('🔓 All access levels downgraded from administrator');
    }

    /**
     * Get column name by index for logging
     */
    getColumnName(columnIndex) {
        const columnNames = {
            4: 'Project Admin',
            5: 'Design Collaboration',
            6: 'Model Coordination',
            7: 'Preconstruction',
            8: 'Build',
            9: 'Cost Management',
            10: 'Design'
        };
        return columnNames[columnIndex] || `Column ${columnIndex}`;
    }

    /**
     * Validate email format and uniqueness
     */
    validateEmail(email, cell) {
        email = email.trim();
        if (!this.emailRegex.test(email)) {
            cell.classList.add('modal-error-cell');
            this.showTooltip(cell, 'Invalid email format');
            return false;
        }
        
        const previousValue = cell.getAttribute('data-previous-value');
        if (previousValue) this.existingEmails.delete(previousValue);
        
        if (this.existingEmails.has(email)) {
            cell.classList.add('modal-error-cell');
            this.showTooltip(cell, 'Duplicate email address');
            return false;
        }
        
        cell.classList.remove('modal-error-cell');
        this.existingEmails.add(email);
        return true;
    }

    /**
     * Validate access level values
     */
    validateAccessValue(cell, value) {
        const trimmedValue = value.trim().toLowerCase();
        if (!trimmedValue) return false;

        const columnIndex = parseInt(cell.getAttribute('data-column'));
        let allowedValues, errorMessage;

        if (columnIndex === 4) { // Project Admin (column 4 after checkbox)
            allowedValues = this.PROJECT_ADMIN_VALUES;
            errorMessage = 'Invalid value. Project Admin can only be none or administrator';
        } else {
            allowedValues = this.ALLOWED_VALUES;
            errorMessage = 'Invalid value. Allowed values: none, member, or administrator';
        }

        if (!allowedValues.includes(trimmedValue)) {
            cell.classList.add('modal-error');
            this.showTooltip(cell, errorMessage);
            return false;
        }
        
        cell.classList.remove('modal-error');
        return trimmedValue;
    }

    /**
     * Handle input events to detect multi-email pastes that bypassed paste handler
     */
    handleInputForMultiEmail(cell) {
        log('Input event triggered, checking for multi-emails');
        
        const content = cell.textContent || cell.innerText || '';
        log('Cell content:', JSON.stringify(content));
        
        // Check if this is an email cell (index 1 after checkbox)
        if (cell.cellIndex !== 1) {
            log('Not an email cell, skipping');
            return;
        }
        
        // Look for multiple emails in the content
        let emails = [];
        
        // First try line breaks
        if (content.includes('\n') || content.includes('\r')) {
            emails = content.split(/[\r\n]+/).map(line => line.trim()).filter(line => line);
            log('Found line breaks, split into:', emails);
        } 
        // Then try spaces
        else if (content.includes(' ')) {
            const potentialEmails = content.split(/\s+/).map(item => item.trim()).filter(item => item);
            // Only consider as multi-email if multiple items look like emails
            const emailLike = potentialEmails.filter(item => this.emailRegex.test(item));
            if (emailLike.length > 1) {
                emails = potentialEmails;
                log('Found spaces with multiple emails:', emails);
            }
        }
        
        if (emails.length > 1) {
            // Filter to valid emails
            const validEmails = emails.filter(email => this.emailRegex.test(email.trim()));
            log('Valid emails found:', validEmails);
            
            if (validEmails.length > 1) {
                log('Processing multi-email input');
                // Clear the cell first
                cell.textContent = '';
                // Process the emails
                this.handleMultiEmailPaste(validEmails, cell);
            }
        }
    }

    /**
     * Handle paste events with smart multi-email detection
     */
    handlePaste(e) {
        // Add this as the very first line to ensure we see it
        log('🔥🔥🔥 PASTE EVENT HANDLER CALLED! 🔥🔥🔥');
        log('🔥 Event object:', e);
        log('🔥 Event target:', e.target);
        log('🔥 Event type:', e.type);
        
        try {
            const pastedText = (e.clipboardData || window.clipboardData).getData('text');
            const targetCell = e.target;
            
            log('📋 Pasted text:', JSON.stringify(pastedText));
            log('📋 Target cell:', targetCell);
            log('📋 Target cell index:', targetCell.cellIndex);
            
            // Check which column we're pasting into (account for checkbox at index 0)
            const isEmailCell = targetCell.cellIndex === 1;
            const isCompanyCell = targetCell.cellIndex === 2;
            const isRoleCell = targetCell.cellIndex === 3;
            
            log('📧 Is email cell:', isEmailCell);
            log('🏢 Is company cell:', isCompanyCell);
            log('👤 Is role cell:', isRoleCell);
            
            if ((isEmailCell || isCompanyCell || isRoleCell) && pastedText) {
                // Check for multiple items (split by lines)
                let items = [];
                
                if (pastedText.includes('\n') || pastedText.includes('\r')) {
                    items = pastedText.split(/[\r\n]+/).map(line => line.trim()).filter(line => line);
                    log('� Split by lines:', items);
                } else if (isEmailCell && pastedText.includes(' ')) {
                    // Only check for space-separated emails in email column
                    const parts = pastedText.split(/\s+/).map(item => item.trim()).filter(item => item);
                    const emailLike = parts.filter(item => this.emailRegex.test(item));
                    if (emailLike.length > 1) {
                        items = parts;
                        log('📧 Split by spaces (emails):', items);
                    }
                }
                
                log('� Total items found:', items.length);
                
                if (items.length > 1) {
                    log('🚀 PREVENTING DEFAULT PASTE - MULTIPLE ITEMS DETECTED');
                    e.preventDefault();
                    e.stopPropagation();
                    
                    if (isEmailCell) {
                        // Email column: validate emails
                        const validEmails = items.filter(email => this.emailRegex.test(email.trim()));
                        log('✅ Valid emails:', validEmails);
                        log('✅ Valid email count:', validEmails.length);
                        
                        if (validEmails.length > 1) {
                            log('🚀 Calling handleMultiEmailPaste...');
                            this.handleMultiEmailPaste(validEmails, targetCell);
                            return;
                        }
                    } else {
                        // Company or Role column: no validation needed, accept all items
                        log('🚀 Calling handleMultiTextPaste...');
                        this.handleMultiTextPaste(items, targetCell);
                        return;
                    }
                }
            }
            
            log('➡️ Allowing default paste behavior');
            // Let default paste behavior happen for single items or non-supported cells
            
        } catch (error) {
            console.error('💥 Error in handlePaste:', error);
            console.error('💥 Stack trace:', error.stack);
            console.error('💥 Error name:', error.name);
            console.error('💥 Error message:', error.message);
        }
    }

    /**
     * Handle pasting multiple emails by using existing rows and creating new ones as needed
     */
    handleMultiEmailPaste(emails, targetCell) {
        log('🚀🚀🚀 HANDLE MULTI-EMAIL PASTE CALLED! 🚀🚀🚀');
        log('📧 Emails to paste:', emails);
        log('🎯 Target cell:', targetCell);
        
        const tbody = document.getElementById(this.tableBodyId);
        const currentRow = targetCell.parentElement;
        const currentRowIndex = Array.from(tbody.rows).indexOf(currentRow);
        
        log(`📊 Pasting ${emails.length} emails starting at row ${currentRowIndex}`);
        log('📊 Current tbody rows:', tbody.rows.length);
        
        // Clear the existing emails from our tracking (we'll re-add valid ones)
        const existingRows = Array.from(tbody.rows);
        existingRows.forEach(row => {
            const emailCell = row.cells[0];
            const email = emailCell.textContent.trim();
            if (email) {
                this.existingEmails.delete(email);
            }
        });
        
        // Process each email
        for (let i = 0; i < emails.length; i++) {
            const email = emails[i].trim();
            log(`📧 Processing email ${i+1}/${emails.length}: "${email}"`);
            
            if (!email || !this.emailRegex.test(email)) {
                log(`❌ Skipping invalid email: "${email}"`);
                continue;
            }
            
            let targetRow;
            let emailCell;
            
            // Use existing row or create new one
            if (currentRowIndex + i < tbody.rows.length) {
                // Use existing row
                targetRow = tbody.rows[currentRowIndex + i];
                log(`♻️ Using existing row ${currentRowIndex + i}`);
            } else {
                // Create new row
                log(`➕ Creating new row for email ${i+1}`);
                targetRow = this.createNewRow();
                tbody.appendChild(targetRow);
            }
            
            emailCell = targetRow.cells[1]; // Email is at index 1 (after checkbox)
            
            // Remove any previous error styling and tracking
            emailCell.classList.remove('modal-error-cell');
            const previousValue = emailCell.getAttribute('data-previous-value');
            if (previousValue) {
                this.existingEmails.delete(previousValue);
            }
            
            // Set the email content directly
            emailCell.textContent = email;
            emailCell.setAttribute('data-previous-value', email);
            log(`✅ Set email "${email}" in row ${currentRowIndex + i}`);
            
            // Add to tracking (bypassing validation since this is a bulk operation)
            this.existingEmails.add(email);
        }
        
        log('🎉 Multi-email paste completed!');
        this.updateUserCount();
    }

    /**
     * Handle pasting multiple text items (for Company and Role columns)
     */
    handleMultiTextPaste(items, targetCell) {
        log('🚀🚀🚀 HANDLE MULTI-TEXT PASTE CALLED! 🚀🚀🚀');
        log('📄 Items to paste:', items);
        log('🎯 Target cell:', targetCell);
        log('🎯 Target cell index (column):', targetCell.cellIndex);
        
        const tbody = document.getElementById(this.tableBodyId);
        const currentRow = targetCell.parentElement;
        const currentRowIndex = Array.from(tbody.rows).indexOf(currentRow);
        const columnIndex = targetCell.cellIndex;
        
        log(`📊 Pasting ${items.length} items starting at row ${currentRowIndex}, column ${columnIndex}`);
        log('📊 Current tbody rows:', tbody.rows.length);
        
        // Process each item
        for (let i = 0; i < items.length; i++) {
            const item = items[i].trim();
            log(`📄 Processing item ${i+1}/${items.length}: "${item}"`);
            
            if (!item) {
                log(`❌ Skipping empty item: "${item}"`);
                continue;
            }
            
            let targetRow;
            let targetCellInRow;
            
            // Use existing row or create new one
            if (currentRowIndex + i < tbody.rows.length) {
                // Use existing row
                targetRow = tbody.rows[currentRowIndex + i];
                log(`♻️ Using existing row ${currentRowIndex + i}`);
            } else {
                // Create new row
                log(`➕ Creating new row for item ${i+1}`);
                targetRow = this.createNewRow();
                tbody.appendChild(targetRow);
            }
            
            targetCellInRow = targetRow.cells[columnIndex];
            targetCellInRow.textContent = item;
            log(`✅ Set "${item}" in row ${currentRowIndex + i}, column ${columnIndex}`);
        }
        
        log('🎉 Multi-text paste completed!');
        this.updateUserCount();
    }

    /**
     * Update user count display
     */
    updateUserCount() {
        const tbody = document.getElementById(this.tableBodyId);
        const validRows = Array.from(tbody.rows).filter(row => {
            const emailCell = row.cells[1]; // Email is now in cell[1], cell[0] is checkbox
            return emailCell.textContent.trim() !== '' && 
                   !emailCell.classList.contains('modal-error-cell');
        });
        document.getElementById(this.tableSummaryId).textContent = 
            `Total Users: ${validRows.length}`;
    }

    /**
     * Delete selected rows (supports multi-selection)
     */
    /**
     * Delete rows with checked checkboxes
     */
    deleteSelectedRows() {
        log('🗑️ deleteSelectedRows() called');
        const tbody = document.getElementById(this.tableBodyId);
        
        // Find all checked checkboxes
        const checkedCheckboxes = tbody.querySelectorAll('input[type="checkbox"].row-checkbox:checked');
        
        if (checkedCheckboxes.length > 0) {
            log(`🗑️ Deleting ${checkedCheckboxes.length} checked rows`);
            
            // Delete all rows with checked checkboxes
            checkedCheckboxes.forEach(checkbox => {
                const row = checkbox.closest('tr');
                if (row && tbody.contains(row)) {
                    // Remove email from tracking if it exists (email is now in cell[1], not cell[0])
                    const emailCell = row.cells[1];
                    const email = emailCell.textContent.trim();
                    if (email) {
                        this.existingEmails.delete(email);
                        log(`🗑️ Removed email "${email}" from tracking`);
                    }
                    
                    // Remove the row
                    tbody.removeChild(row);
                }
            });
            
            log('🗑️ All checked rows deleted successfully');
            
            // Uncheck "Select All" checkbox
            const selectAllCheckbox = document.getElementById('selectAllCheckbox');
            if (selectAllCheckbox) {
                selectAllCheckbox.checked = false;
            }
            
            // Re-check for duplicates and update highlighting
            this.recheckDuplicates();
            
            this.updateUserCount();
            return;
        }
        
        // Fallback: if no rows checked, delete based on focused cell or last row
        const rows = Array.from(tbody.rows);
        
        if (rows.length === 0) {
            log('🗑️ No rows to delete');
            return;
        }
        
        let rowToDelete = null;
        
        // If we have a currently focused cell, find its row
        if (this.currentlyFocusedCell) {
            rowToDelete = this.currentlyFocusedCell.parentElement;
            log('🗑️ Found focused cell, deleting its row');
        } else {
            // Fallback: delete the last row if no focused cell
            rowToDelete = rows[rows.length - 1];
            log('🗑️ No focused cell, deleting last row as fallback');
        }
        
        if (rowToDelete && tbody.contains(rowToDelete)) {
            // Remove email from tracking if it exists (email is now in cell[1], not cell[0])
            const emailCell = rowToDelete.cells[1];
            const email = emailCell.textContent.trim();
            if (email) {
                this.existingEmails.delete(email);
                log(`🗑️ Removed email "${email}" from tracking`);
            }
            
            // Remove the row
            tbody.removeChild(rowToDelete);
            log('🗑️ Row deleted successfully');
            
            // Clear the focused cell reference if it was in the deleted row
            if (this.currentlyFocusedCell && this.currentlyFocusedCell.parentElement === rowToDelete) {
                this.currentlyFocusedCell = null;
                log('🗑️ Cleared focused cell reference');
            }
            
            // Re-check for duplicates and update highlighting
            this.recheckDuplicates();
            
            this.updateUserCount();
        } else {
            log('🗑️ Error: Could not find row to delete');
        }
    }

    /**
     * Re-check for duplicate emails and update highlighting
     */
    recheckDuplicates() {
        log('🔍 Rechecking for duplicates...');
        const tbody = document.getElementById(this.tableBodyId);
        
        // First, clear all error highlighting (email is now in cell[1], not cell[0])
        Array.from(tbody.rows).forEach(row => {
            row.cells[1].classList.remove('modal-error-cell');
        });
        
        // Check for duplicates
        const emailsFound = new Map();
        const duplicateEmails = [];
        
        Array.from(tbody.rows).forEach((row, rowIndex) => {
            const emailCell = row.cells[1]; // Email is now in cell[1]
            const email = emailCell.textContent.trim().toLowerCase();
            
            if (email) {
                if (!emailsFound.has(email)) {
                    emailsFound.set(email, [rowIndex]);
                } else {
                    emailsFound.get(email).push(rowIndex);
                    if (!duplicateEmails.includes(email)) {
                        duplicateEmails.push(email);
                    }
                }
            }
        });
        
        // If duplicates still exist, re-highlight them
        if (duplicateEmails.length > 0) {
            log('🔍 Duplicates still exist:', duplicateEmails);
            duplicateEmails.forEach(duplicateEmail => {
                const rowIndices = emailsFound.get(duplicateEmail);
                rowIndices.forEach(rowIndex => {
                    const row = tbody.rows[rowIndex];
                    const emailCell = row.cells[1]; // Email is now in cell[1]
                    emailCell.classList.add('modal-error-cell');
                });
            });
        } else {
            log('✅ No duplicates found, all clear!');
            // Hide the duplicate alert if showing
            const alertDiv = document.getElementById('duplicateEmailAlert');
            if (alertDiv) {
                alertDiv.style.display = 'none';
            }
        }
    }

    /**
     * Clear all table data
     */
    clearTable() {
        if (confirm('Are you sure you want to clear all data?')) {
            document.getElementById(this.tableBodyId).innerHTML = '';
            this.existingEmails.clear();
            this.updateUserCount();
        }
    }

    /**
     * Update account users before saving to JSON (silent mode with progress bar)
     */
    async updateAccountUsersBeforeSave(accountId) {
        log('🔄 updateAccountUsersBeforeSave called with accountId:', accountId, 'projectId:', this.modalProjectId);
        
        // Validate we have a project ID
        if (!this.modalProjectId) {
            throw new Error('Project ID is required for updating account users');
        }
        
        // Show progress bar
        this.showSaveProgress('Updating account users...', 10);
        
        try {
            // Check if updateAccountUsersForAccount function is available
            if (typeof updateAccountUsersForAccount !== 'function') {
                throw new Error('updateAccountUsersForAccount function not available');
            }
            
            // Get fresh user data from the table that was just collected in saveTableToJson
            // This ensures we use the latest edited data, not stale data from server
            const userDataFromTable = this.lastCollectedUserData || null;
            
            // Run the update silently (no preview, no confirmation) with projectId and fresh data
            this.showSaveProgress('Analyzing users...', 20);
            const results = await updateAccountUsersForAccount(accountId, { performOps: true }, this.modalProjectId, userDataFromTable);
            
            log('✅ Account update results:', results);
            
            // Check for invalid roles - users were processed without invalid roles
            const invalidRoleCount = results.invalidRoles?.size || 0;
            if (invalidRoleCount > 0) {
                console.warn('⚠️ Invalid roles detected - users were processed without roles:', results.invalidRoles);
                
                // Build error message HTML
                let errorHTML = '<div style="margin-bottom: 10px; font-weight: bold; color: #ff9800;">⚠️ Invalid roles were found and automatically removed - users were processed without these roles:</div>';
                for (const [role, emails] of results.invalidRoles) {
                    errorHTML += `<div style="margin: 10px 0; padding: 10px; background: #fff3cd; border-left: 3px solid #ffc107;">`;
                    errorHTML += `<strong style="color: #856404;">Role "${role}" doesn't exist in this account</strong>`;
                    errorHTML += '<ul style="margin: 5px 0; padding-left: 20px; color: #856404;">';
                    emails.forEach(email => {
                        errorHTML += `<li>${email} - added/updated without this role (operation succeeded)</li>`;
                    });
                    errorHTML += '</ul></div>';
                }
                errorHTML += '<div style="margin-top: 15px; padding: 10px; background: #e3f2fd; border: 1px solid #2196f3; border-radius: 4px; font-size: 13px;">';
                errorHTML += '<strong>Action Required:</strong> Check your account settings to see which roles are configured, then update the "Project user list" with valid roles.';
                errorHTML += '</div>';
                
                // Show error below progress bar
                this.showInvalidRolesWarning(errorHTML);
            } else {
                // No invalid roles - clear any existing warning from previous save
                const existingWarning = document.getElementById('invalidRolesWarning');
                if (existingWarning) {
                    existingWarning.remove();
                    log('✅ Cleared previous invalid roles warning (all roles are now valid)');
                }
            }
            
            // Update progress based on results
            const totalOps = (results.patched?.length || 0) + (results.added?.length || 0);
            const errors = results.errors?.length || 0;
            
            if (errors > 0) {
                console.warn(`⚠️ Account update completed with ${errors} errors`);
                this.showSaveProgress(`Account updated (${errors} errors)`, 50);
                // Continue anyway - we'll still save to JSON
            } else if (invalidRoleCount > 0) {
                this.showSaveProgress(`Account updated (${invalidRoleCount} users SKIPPED - invalid roles)`, 50);
            } else {
                this.showSaveProgress(`Account updated (${totalOps} operations)`, 50);
            }
            
            return results;
            
        } catch (error) {
            console.error('❌ Error updating account users:', error);
            this.hideSaveProgress();
            throw error; // Re-throw to be caught by saveTableToJson
        }
    }

    /**
     * Check if the JSON data has changed compared to the current file
     * This detects changes to product access levels
     */
    hasJsonDataChanged(newJsonData) {
        try {
            // If we don't have the original data loaded, assume it changed
            if (!this.originalJsonData || !this.originalJsonData.users) {
                log('📊 No original data to compare - assuming changed');
                return true;
            }
            
            const oldUsers = this.originalJsonData.users;
            const newUsers = newJsonData.users;
            
            // Different number of users means changed
            if (oldUsers.length !== newUsers.length) {
                log('📊 User count changed:', oldUsers.length, '→', newUsers.length);
                return true;
            }
            
            // Compare each user's product access
            for (let i = 0; i < newUsers.length; i++) {
                const newUser = newUsers[i];
                const oldUser = oldUsers.find(u => u.email === newUser.email);
                
                if (!oldUser) {
                    log('📊 New user found:', newUser.email);
                    return true;
                }
                
                // Compare products
                if (newUser.products && oldUser.products) {
                    for (let j = 0; j < newUser.products.length; j++) {
                        const newProduct = newUser.products[j];
                        const oldProduct = oldUser.products.find(p => p.key === newProduct.key);
                        
                        if (!oldProduct || oldProduct.access !== newProduct.access) {
                            log(`📊 Product access changed for ${newUser.email}:`, 
                                newProduct.key, oldProduct?.access || 'none', '→', newProduct.access);
                            return true;
                        }
                    }
                }
            }
            
            log('📊 No JSON data changes detected');
            return false;
            
        } catch (error) {
            console.error('Error comparing JSON data:', error);
            // If comparison fails, assume it changed to be safe
            return true;
        }
    }

    /**
     * Show save progress bar
     */
    showSaveProgress(message, percentage) {
        // Create progress bar if it doesn't exist
        let progressDiv = document.getElementById('saveProgressBar');
        if (!progressDiv) {
            const modal = document.getElementById(this.modalId);
            const modalBody = modal.querySelector('.user-modal-body');
            
            progressDiv = document.createElement('div');
            progressDiv.id = 'saveProgressBar';
            progressDiv.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: white;
                padding: 30px;
                border-radius: 8px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                z-index: 10000;
                min-width: 400px;
                font-family: 'Artifact Elements', Arial, sans-serif;
            `;
            
            progressDiv.innerHTML = `
                <div style="margin-bottom: 15px; font-size: 16px; color: #333;">
                    <span id="saveProgressMessage">Saving...</span>
                </div>
                <div style="width: 100%; height: 20px; background: #f0f0f0; border-radius: 10px; overflow: hidden;">
                    <div id="saveProgressBarFill" style="height: 100%; background: #0696D7; width: ${percentage}%; transition: width 0.3s ease;"></div>
                </div>
            `;
            
            document.body.appendChild(progressDiv);
        } else {
            // Update existing
            const messageEl = document.getElementById('saveProgressMessage');
            const barEl = document.getElementById('saveProgressBarFill');
            // Keep message as "Saving..." - don't update it
            if (barEl) barEl.style.width = percentage + '%';
        }
    }

    /**
     * Hide save progress bar
     */
    hideSaveProgress() {
        const progressDiv = document.getElementById('saveProgressBar');
        if (progressDiv) {
            progressDiv.remove();
        }
        // Don't automatically remove invalid roles warning - user must click OK
    }

    /**
     * Show invalid roles warning below progress bar
     */
    showInvalidRolesWarning(htmlContent) {
        // Delegate to the centered backdrop version if available
        if (typeof window.showInvalidRolesModal === 'function') {
            window.showInvalidRolesModal(htmlContent);
        }
    }

    /**
     * Show save error message
     */
    showSaveError(errorMessage) {
        this.hideSaveProgress();
        
        // Create error modal
        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: white;
            padding: 30px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            z-index: 10000;
            min-width: 400px;
            font-family: 'Artifact Elements', Arial, sans-serif;
            border: 2px solid #d32f2f;
        `;
        
        errorDiv.innerHTML = `
            <div style="margin-bottom: 15px; font-size: 18px; color: #d32f2f; font-weight: bold;">
                ❌ Save Failed
            </div>
            <div style="margin-bottom: 20px; font-size: 14px; color: #666;">
                ${escapeHtml(errorMessage)}
            </div>
            <button onclick="this.parentElement.remove()" style="
                background: #d32f2f;
                color: white;
                border: none;
                padding: 10px 20px;
                border-radius: 4px;
                cursor: pointer;
                font-family: 'Artifact Elements', Arial, sans-serif;
            ">Close</button>
        `;
        
        document.body.appendChild(errorDiv);
    }

    /**
     * Save table data to JSON file (with optional account update)
     */
    async saveTableToJson(skipAccountUpdate = false) {
        log('💾 saveTableToJson() called, skipAccountUpdate:', skipAccountUpdate);
        
        const tbody = document.getElementById(this.tableBodyId);
        
        // Check if hub has changed since modal was opened
        if (!skipAccountUpdate && this.modalHubId && window.currentHubId) {
            if (this.modalHubId !== window.currentHubId) {
                const currentHubName = window.currentHubName || 'Unknown Hub';
                const proceed = confirm(
                    `⚠️ HUB MISMATCH DETECTED\n\n` +
                    `This Users Main List was loaded from:\n` +
                    `  "${this.modalHubName}" (${this.modalHubId})\n\n` +
                    `But the currently selected hub is:\n` +
                    `  "${currentHubName}" (${window.currentHubId})\n\n` +
                    `The data in this table may be from "${this.modalHubName}" with roles that don't exist in "${currentHubName}".\n\n` +
                    `RECOMMENDED: Close this modal, switch to "${this.modalHubName}", and reopen the Users Main List.\n\n` +
                    `Do you want to continue saving anyway?\n` +
                    `(This will save the current table data and try to update "${currentHubName}")`
                );
                
                if (!proceed) {
                    log('⚠️ User cancelled save due to hub mismatch');
                    return;
                }
            }
        }
        
        // Show initial progress if account update will run
        if (!skipAccountUpdate) {
            this.showSaveProgress('Validating data...', 5);
        }
        
        // First, check for duplicate emails (email is now in cell[1], not cell[0])
        const emailsFound = new Map(); // Map of email -> array of row indices
        const duplicateEmails = [];
        
        Array.from(tbody.rows).forEach((row, rowIndex) => {
            const emailCell = row.cells[1]; // Email is now in cell[1]
            const email = emailCell.textContent.trim().toLowerCase();
            
            if (email) {
                if (!emailsFound.has(email)) {
                    emailsFound.set(email, [rowIndex]);
                } else {
                    emailsFound.get(email).push(rowIndex);
                    if (!duplicateEmails.includes(email)) {
                        duplicateEmails.push(email);
                    }
                }
            }
        });
        
        // If duplicates found, highlight them and show alert in modal
        if (duplicateEmails.length > 0) {
            log('❌ Duplicate emails found:', duplicateEmails);
            
            // Hide progress bar if showing
            this.hideSaveProgress();
            
            // Clear all previous error highlighting
            Array.from(tbody.rows).forEach(row => {
                row.cells[1].classList.remove('modal-error-cell');
            });
            
            // Highlight all duplicate email cells
            duplicateEmails.forEach(duplicateEmail => {
                const rowIndices = emailsFound.get(duplicateEmail);
                rowIndices.forEach(rowIndex => {
                    const row = tbody.rows[rowIndex];
                    const emailCell = row.cells[1]; // Email is now in cell[1]
                    emailCell.classList.add('modal-error-cell');
                });
            });
            
            // Show alert in modal
            const alertDiv = document.getElementById('duplicateEmailAlert');
            const alertList = document.getElementById('duplicateEmailList');
            
            if (alertDiv && alertList) {
                // Build duplicate email list
                const displayEmails = duplicateEmails.slice(0, 10);
                let listHTML = `<strong>Duplicate emails (${duplicateEmails.length}):</strong><br>`;
                listHTML += displayEmails.map(email => `• ${email}`).join('<br>');
                if (duplicateEmails.length > 10) {
                    listHTML += `<br>... and ${duplicateEmails.length - 10} more`;
                }
                
                alertList.innerHTML = listHTML;
                alertDiv.style.display = 'block';
                
                // Scroll to alert
                alertDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
            
            return; // Stop save operation
        }
        
        // Hide duplicate alert if it was showing
        const alertDiv = document.getElementById('duplicateEmailAlert');
        if (alertDiv) {
            alertDiv.style.display = 'none';
        }
        
        // No duplicates - proceed with save
        const users = [];
        
        Array.from(tbody.rows).forEach(row => {
            const cells = Array.from(row.cells);
            
            // Skip rows that don't have enough cells (minimum: checkbox + email + company + role + 7 products = 11 cells)
            // Note: Insight is not shown in UI but always included with access='member' in backend
            if (cells.length < 11) {
                console.warn('⚠️ Skipping row with insufficient cells:', cells.length);
                return;
            }
            
            const emailCell = cells[1];
            if (!emailCell) {
                console.warn('⚠️ Skipping row without email cell');
                return;
            }
            
            const email = (emailCell.textContent || emailCell.innerText || '').trim();
            
            if (email) {
                log(`💾 Processing user: ${email}`);
                const user = {
                    email: email.toLowerCase(), // Always save email in lowercase for consistency
                    metadata: {
                        company: (cells[2]?.textContent || cells[2]?.innerText || '').trim(),
                        role: (cells[3]?.textContent || cells[3]?.innerText || '').trim()
                    },
                    products: []
                };
                
                log(`💾 Company: "${user.metadata.company}", Role: "${user.metadata.role}"`);
                
                // Product keys and their corresponding cell indices
                // Note: 'insight' is not in the UI but access level matches other products to avoid mixing
                // Note: 'docs' (Data Management) is auto-granted by ACC — not in UI, not saved to JSON
                const productMapping = [
                    { key: 'projectAdministration', cellIndex: 4 },
                    { key: 'insight', cellIndex: null }, // Not in UI, will be determined based on other products
                    { key: 'designCollaboration', cellIndex: 5 },
                    { key: 'modelCoordination', cellIndex: 6 },
                    { key: 'takeoff', cellIndex: 7 },
                    { key: 'build', cellIndex: 8 },
                    { key: 'cost', cellIndex: 9 },
                    { key: 'forma', cellIndex: 10 }
                ];
                
                // First pass: collect all product access levels (except insight)
                const productAccesses = [];
                productMapping.forEach(({ key, cellIndex }) => {
                    if (key === 'insight') return; // Skip insight for now
                    
                    const cell = cells[cellIndex];
                    const access = cell?.getAttribute('data-value') || 'none';
                    productAccesses.push(access);
                });
                
                // Determine insight access: if ANY product is 'administrator', insight must also be 'administrator'
                // API constraint: cannot mix 'member' and 'administrator' levels
                const hasAdministrator = productAccesses.some(access => access === 'administrator');
                const insightAccess = hasAdministrator ? 'administrator' : 'member';
                
                // Second pass: build products array with correct insight access
                productMapping.forEach(({ key, cellIndex }) => {
                    let access;
                    if (key === 'insight') {
                        access = insightAccess;
                    } else {
                        const cell = cells[cellIndex];
                        access = cell?.getAttribute('data-value') || 'none';
                    }
                    user.products.push({
                        key: key,
                        access: access
                    });
                });
                
                users.push(user);
            }
        });
        
        // Store the collected user data so updateAccountUsersBeforeSave can use fresh data
        this.lastCollectedUserData = users;
        
        const jsonData = {
            users: users,
            exportDate: new Date().toISOString()
        };
        
        log(`💾 Saving ${users.length} users to server`);
        log('💾 Sample user data:', users[0]);
        
        // Update progress if account update will run
        if (!skipAccountUpdate) {
            this.showSaveProgress('Saving...', 30);
        }
        
        // Check if we have a project ID
        if (!this.modalProjectId) {
            console.error('❌ No project ID available for saving data');
            alert('Error: No project selected');
            this.hideSaveProgress();
            return;
        }
        
        // Run account update AND project update BEFORE saving to JSON (if not skipped)
        if (!skipAccountUpdate && this.modalHubId && this.modalProjectId) {
            try {
                // STEP 1: Update ACCOUNT users (company_id, default_role)
                log('🔄 Step 1: Starting account user update...');
                const accountId = this.modalHubId; // Hub ID is the account ID
                await this.updateAccountUsersBeforeSave(accountId);
                log('✅ Account users updated successfully');
                
                // Progress at 50% after account update
                this.showSaveProgress('Updating project users...', 50);
                
                // STEP 2: Update PROJECT users (companyId, companyName, roleIds, products)
                log('🔄 Step 2: Starting project user update...');
                
                // Check if updateProjectUsers function is available
                if (typeof updateProjectUsers !== 'function') {
                    throw new Error('updateProjectUsers function not available');
                }
                
                // Get current access token
                const accessToken = window.currentAccessToken || (window.getAuthToken && window.getAuthToken());
                if (!accessToken) {
                    throw new Error('Access token not available for project update');
                }
                
                // Call project users update (this syncs company/role from account to project)
                await updateProjectUsers(this.modalProjectId, accountId, accessToken, null);
                log('✅ Project users updated successfully');
                
                // Continue at 70% progress after both updates
                this.showSaveProgress('Saving to database...', 70);
            } catch (error) {
                console.error('❌ User update failed:', error);
                // Show error to user
                this.showSaveError(`User update failed: ${error.message}\n\nData was NOT saved to prevent inconsistency.`);
                return; // Stop save operation if update fails
            }
        }
        
        // Save to server (project-specific users list in Firestore)
        try {
            // Get auth token from global scope (set by Firebase auth in index.html)
            const headers = {
                'Content-Type': 'application/json'
            };
            
            // Refresh token before saving (Firebase tokens expire after 1 hour)
            let token = null;
            if (window.refreshAuthToken) {
                log('🔄 Refreshing auth token before save...');
                token = await window.refreshAuthToken();
            } else {
                token = window.getAuthToken && window.getAuthToken();
            }
            
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            } else {
                console.error('❌ No authentication token available');
                this.hideSaveProgress();
                this.showSaveError('Authentication required. Please log in again.');
                return;
            }
            
            log('💾 Sending save request to server...');
            const response = await fetch(`${window.location.origin}/save-project-users/${this.modalProjectId}`, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(jsonData)
            });
            
            log('💾 Server response status:', response.status, response.statusText);
            
            // Check HTTP status first
            if (!response.ok) {
                const errorData = await response.json();
                const errorMessage = errorData.error || errorData.message || `Server error: ${response.status}`;
                console.error('❌ Server returned error:', response.status, errorMessage);
                this.hideSaveProgress();
                
                // Show specific error based on status
                if (response.status === 401) {
                    this.showSaveError('Authentication failed. Please log in again.');
                } else if (response.status === 403) {
                    this.showSaveError('Permission denied. You do not have access to save this data.');
                } else {
                    this.showSaveError(`Failed to save: ${errorMessage}`);
                }
                return;
            }
            
            // Parse successful response
            const data = await response.json();
            
            if (data.success) {
                log('✅ Data saved to JSON successfully for project:', this.modalProjectId);
                
                // Show final success message
                this.showSaveProgress('Complete!', 100);
                setTimeout(() => {
                    this.hideSaveProgress();
                }, 1500);
            } else {
                // Should not happen if response.ok is true, but handle it anyway
                const errorMessage = data.message || 'Unknown error';
                console.error('❌ Save failed:', errorMessage);
                this.hideSaveProgress();
                this.showSaveError(`Failed to save: ${errorMessage}`);
            }
        } catch (error) {
            console.error('❌ Network error saving to server:', error);
            this.hideSaveProgress();
            this.showSaveError(`Network error: ${error.message}`);
        }
    }

    /**
     * Import user data from CSV file
     */
    importFromCSV() {
        log('📁 importFromCSV() called');
        
        // Create import modal
        this.showImportCSVModal();
    }

    /**
     * Show Import From File modal (CSV or Excel)
     */
    showImportCSVModal() {
        // Remove existing modal if present
        const existingModal = document.getElementById('csvImportModal');
        if (existingModal) {
            existingModal.remove();
        }

        const modalHTML = `
            <div id="csvImportModal" style="position: fixed; z-index: 10000; left: 0; top: 0; width: 100%; height: 100%; background-color: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center;">
                <div style="background-color: white; padding: 30px; border-radius: 8px; width: 560px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                        <h2 style="margin: 0; font-family: 'Artifact Elements', Arial, sans-serif;">Import Users From File</h2>
                        <span class="csv-import-modal-close" style="color: #aaa; font-size: 28px; font-weight: bold; cursor: pointer; line-height: 1;">&times;</span>
                    </div>
                    
                    <div style="margin-bottom: 20px;">
                        <div style="font-family: 'Artifact Elements', Arial, sans-serif; color: #666; font-size: 14px; line-height: 1.8;">
                            <div style="margin-bottom: 10px;">Select a <strong>CSV</strong> file with one of the following formats:</div>
                            <div style="background: #f5f5f5; padding: 8px 12px; border-radius: 4px; font-family: monospace; margin-bottom: 12px;">
                                Email<br>
                                Email;Company &nbsp;<em style="font-family: sans-serif;">or</em>&nbsp; Email;;Role<br>
                                Email;Company;Role
                            </div>
                            <div style="text-align: center; color: #999; margin-bottom: 12px; font-weight: bold;">OR</div>
                            <div style="margin-bottom: 10px;">Select an <strong>Excel (.xlsx)</strong> file with 3 columns (no headers):</div>
                            <div style="background: #f5f5f5; padding: 8px 12px; border-radius: 4px; font-family: monospace;">
                                email &nbsp;|&nbsp; company &nbsp;|&nbsp; role
                            </div>
                        </div>
                        
                        <div id="fileDropZone" style="width: 100%; margin-top: 16px; padding: 20px 10px; border: 2px dashed #0696D7; border-radius: 4px; box-sizing: border-box; text-align: center; cursor: pointer; font-family: 'Artifact Elements', Arial, sans-serif; color: #555; transition: background 0.2s;">
                            <div id="fileDropLabel" style="pointer-events: none;">
                                📂 <strong>Drop file here</strong> or <span style="color:#0696D7; text-decoration:underline;">click to browse</span><br>
                                <small style="color:#888;">Tip: drag &amp; drop works even if the file is open in Excel</small>
                            </div>
                            <div id="fileDropSelected" style="margin-top: 6px; font-size: 13px; color: #0696D7; display: none;"></div>
                            <input type="file" id="csvFileInputModal" accept=".csv,.xlsx" style="position:absolute; width:1px; height:1px; opacity:0; pointer-events:none;" />
                        </div>
                    </div>
                    
                    <div style="display: flex; gap: 10px; justify-content: space-between;">
                        <button id="downloadSampleBtn" style="padding: 10px 20px; background-color: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer; font-family: 'Artifact Elements', Arial, sans-serif; font-size: 14px;">
                            Download CSV Sample
                        </button>
                        <button id="importCsvBtn" style="padding: 10px 20px; background-color: #0696D7; color: white; border: none; border-radius: 4px; cursor: pointer; font-family: 'Artifact Elements', Arial, sans-serif; font-size: 14px;">
                            Import
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);

        // Setup event listeners
        const modal = document.getElementById('csvImportModal');
        const closeBtn = modal.querySelector('.csv-import-modal-close');
        const downloadBtn = document.getElementById('downloadSampleBtn');
        const importBtn = document.getElementById('importCsvBtn');
        const fileInput = document.getElementById('csvFileInputModal');
        const dropZone = document.getElementById('fileDropZone');
        const dropSelected = document.getElementById('fileDropSelected');

        // Tracks the file chosen via drop or picker
        let selectedFile = null;

        const markFileSelected = (file) => {
            selectedFile = file;
            dropSelected.textContent = '✔ ' + file.name;
            dropSelected.style.display = 'block';
            dropZone.style.background = '#eaf6ff';
        };

        // Click on drop zone → open file picker
        dropZone.addEventListener('click', () => fileInput.click());

        // File picker fallback
        fileInput.addEventListener('change', () => {
            if (fileInput.files[0]) markFileSelected(fileInput.files[0]);
        });

        // Drag-and-drop — bypasses Windows file-lock check
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.style.background = '#d9ecff';
        });
        dropZone.addEventListener('dragleave', () => {
            dropZone.style.background = selectedFile ? '#eaf6ff' : '';
        });
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            const file = e.dataTransfer.files[0];
            if (file) markFileSelected(file);
            dropZone.style.background = '#eaf6ff';
        });

        // Close modal
        closeBtn.onclick = () => modal.remove();
        modal.onclick = (e) => {
            if (e.target === modal) modal.remove();
        };

        // Download sample CSV
        downloadBtn.onclick = () => {
            const sampleCSV = `Email;Company;Role
andrew.architect@Lecorbu.com;LeCorbusier & Associates;BIM Manager
bob.contractor@gi.com;GoldenInvestment Inc;General Contractor
carl.architect@Lecorbu.om;LeCorbusier & Associates;Architect
john.engineer@solst.com;Solid Structures Inc;Structural Engineer
luise.investor@gi.com;GoldenInvestment Inc;Investor
sam.electric@ge.com;General Electric Inc;Electrical Engineer`;

            const blob = new Blob([sampleCSV], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'SampleUsers.csv';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            log('✅ Sample CSV downloaded');
        };

        // Import file (CSV or Excel)
        importBtn.onclick = () => {
            const file = selectedFile || fileInput.files[0];
            if (!file) {
                alert('Please select or drop a file first');
                return;
            }

            const ext = file.name.split('.').pop().toLowerCase();
            log('📁 Processing file:', file.name, 'ext:', ext);

            if (ext === 'xlsx' || ext === 'xls') {
                // Use file.arrayBuffer() (modern API) — works better with files open in Excel
                // because it requests a read-only byte snapshot rather than a full file handle.
                const readBuffer = file.arrayBuffer
                    ? file.arrayBuffer()
                    : new Promise((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = e => resolve(e.target.result);
                        reader.onerror = reject;
                        reader.readAsArrayBuffer(file);
                    });

                readBuffer.then(buffer => {
                    try {
                        this.parseAndImportExcel(buffer);
                        modal.remove();
                    } catch (error) {
                        console.error('💥 Error parsing Excel file:', error);
                        alert('Error parsing Excel file: ' + error.message);
                    }
                }).catch(error => {
                    console.error('💥 Could not read Excel file:', error);
                    alert(
                        'Could not read the file.\n\n' +
                        'The file may be exclusively locked by Excel.\n' +
                        'Try one of these workarounds:\n' +
                        '  • In Excel: File → Save a Copy → import that copy\n' +
                        '  • Or close the file in Excel, import it here, then re-open it.'
                    );
                });
            } else {
                // Default: treat as CSV
                const reader = new FileReader();
                reader.onload = (e) => {
                    try {
                        const csvContent = e.target.result;
                        log('📁 CSV content loaded');
                        this.parseAndImportCSV(csvContent);
                        modal.remove();
                    } catch (error) {
                        console.error('💥 Error reading CSV file:', error);
                        alert('Error reading CSV file: ' + error.message);
                    }
                };
                reader.readAsText(file);
            }
        };
    }

    /**
     * Parse Excel (.xlsx) file and import users.
     * Expected format: 3 columns (email, company, role), no header row.
     */
    parseAndImportExcel(arrayBuffer) {
        log('📊 parseAndImportExcel() called');

        if (typeof XLSX === 'undefined') {
            alert('Excel library not loaded. Please refresh the page and try again.');
            return;
        }

        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];

        // Convert to array-of-arrays (no header row expected)
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
        log(`📊 Excel rows found: ${rows.length}`);

        if (rows.length === 0) {
            alert('The Excel file appears to be empty.');
            return;
        }

        const importedUsers = [];
        let validCount = 0;
        let errorCount = 0;

        rows.forEach((row, index) => {
            // Skip completely blank rows
            if (!row || row.every(cell => String(cell).trim() === '')) return;

            const email   = String(row[0] || '').trim();
            const company = String(row[1] || '').trim();
            const role    = String(row[2] || '').trim();

            if (!email) {
                log(`⚠️ Excel row ${index + 1}: empty email, skipping`);
                return;
            }

            if (!this.emailRegex.test(email)) {
                console.warn(`⚠️ Excel row ${index + 1}: invalid email "${email}"`);
                errorCount++;
                return;
            }

            importedUsers.push({ email, company, role });
            validCount++;
            log(`✅ Excel row ${index + 1}: ${email} | ${company} | ${role}`);
        });

        log(`📊 Excel import summary: ${validCount} valid, ${errorCount} errors`);

        if (importedUsers.length === 0) {
            alert('No valid users found in the Excel file. Make sure column A contains email addresses.');
            return;
        }

        this._applyImportedUsers(importedUsers);

        const message = errorCount > 0
            ? `✓ Imported ${validCount} users (${errorCount} skipped)`
            : `✓ Successfully imported ${validCount} users`;
        log('🎉 Excel import completed! ' + message);
    }

    /**
     * Parse CSV content and import user data
     */
    parseAndImportCSV(csvContent) {
        log('📊 parseAndImportCSV() called');
        
        // Split into lines and filter out empty lines
        const lines = csvContent.split(/\r?\n/).filter(line => line.trim());
        log(`📊 Found ${lines.length} lines in CSV`);
        
        if (lines.length === 0) {
            alert('CSV file is empty.');
            return;
        }
        
        const importedUsers = [];
        let validCount = 0;
        let errorCount = 0;
        
        lines.forEach((line, index) => {
            const trimmedLine = line.trim();
            if (!trimmedLine) return;
            
            // Skip first line (header row)
            if (index === 0) {
                log(`📊 Skipping header row: ${trimmedLine}`);
                return;
            }
            
            // Split by semicolon (format: email OR email;company OR email;role OR email;company;role)
            const parts = trimmedLine.split(';');
            
            // Validate format: 1, 2, or 3 columns
            if (parts.length < 1 || parts.length > 3) {
                console.warn(`⚠️ Line ${index + 1}: Invalid format, expected 1-3 columns separated by semicolons`);
                errorCount++;
                return;
            }
            
            const email = parts[0].trim();
            let company = '';
            let role = '';
            
            // Determine if second column is company or role based on header (if available)
            // For 2 columns: check if it looks more like a company (has common company words) or role
            if (parts.length === 2) {
                const secondColumn = parts[1].trim();
                // Simple heuristic: if it contains common company suffixes, treat as company
                if (/\b(Inc|LLC|Ltd|GmbH|Corp|Corporation|Company|Associates|Group)\b/i.test(secondColumn)) {
                    company = secondColumn;
                } else {
                    // Otherwise treat as role
                    role = secondColumn;
                }
            } else if (parts.length === 3) {
                company = parts[1].trim();
                role = parts[2].trim();
            }
            
            // Validate email
            if (!this.emailRegex.test(email)) {
                console.warn(`⚠️ Line ${index + 1}: Invalid email format: ${email}`);
                errorCount++;
                return;
            }
            
            importedUsers.push({
                email: email,
                company: company,
                role: role
            });
            validCount++;
            
            if (parts.length === 3) {
                log(`✅ Line ${index + 1}: ${email} | ${company} | ${role}`);
            } else if (parts.length === 2) {
                log(`✅ Line ${index + 1}: ${email} | ${company || role}`);
            } else {
                log(`✅ Line ${index + 1}: ${email}`);
            }
        });
        
        log(`📊 Import summary: ${validCount} valid users, ${errorCount} errors`);
        
        if (importedUsers.length === 0) {
            alert('No valid users found in CSV file.');
            return;
        }
        
        this._applyImportedUsers(importedUsers);
        
        const message = errorCount > 0 ? 
            `✓ Imported ${validCount} users (${errorCount} errors)` : 
            `✓ Successfully imported ${validCount} users`;
        log('🎉 CSV import completed! ' + message);
    }

    /**
     * Populate the table from an array of {email, company, role} objects.
     * Shared by both CSV and Excel import paths.
     */
    _applyImportedUsers(importedUsers) {
        const tbody = document.getElementById(this.tableBodyId);
        tbody.innerHTML = '';
        this.existingEmails.clear();

        const accessColumns = [
            'Project Admin',
            'Design Collaboration', 'Model Coordination',
            'Preconstruction', 'Build', 'Cost Management', 'Design'
        ];

        importedUsers.forEach(userData => {
            const row = document.createElement('tr');

            row.appendChild(this.createCheckboxCell());

            const emailCell = this.createEmailCell();
            emailCell.textContent = userData.email;
            emailCell.setAttribute('data-previous-value', userData.email);
            this.existingEmails.add(userData.email);
            row.appendChild(emailCell);

            const companyCell = this.createEditableCell();
            companyCell.textContent = userData.company;
            row.appendChild(companyCell);

            const roleCell = this.createEditableCell();
            roleCell.textContent = userData.role;
            row.appendChild(roleCell);

            accessColumns.forEach((columnName, index) => {
                const cell = this.createAccessCell(columnName, index + 4, tbody.children.length);
                row.appendChild(cell);
            });

            tbody.appendChild(row);
        });

        this.updateUserCount();
    }

    /**
     * Load table data from server
     */
    async loadTableData() {
        log('📊 loadTableData() called, mode:', this.modalMode);
        
        // Check if we have a project ID
        if (!this.modalProjectId) {
            console.error('❌ No project ID available for loading data');
            alert('Error: No project selected');
            return;
        }

        // In "manage" mode, load live data directly from the ACC API
        if (this.modalMode === 'manage') {
            await this._loadTableDataFromAPI();
            return;
        }
        
        const loadUrl = `${window.location.origin}/load-project-users/${this.modalProjectId}`;
        log('📊 Fetching from:', loadUrl);
        
        // Prepare headers with refreshed auth token
        const headers = {};
        let token = null;
        if (window.refreshAuthToken) {
            log('🔄 Refreshing auth token before load...');
            token = await window.refreshAuthToken();
        } else {
            token = window.getAuthToken && window.getAuthToken();
        }
        
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        
        fetch(loadUrl, { headers })
            .then(response => {
                log('📊 Response status:', response.status);
                log('📊 Response OK:', response.ok);
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                return response.json();
            })
            .then(jsonData => {
                log('📊 Data loaded from server:', jsonData);
                log('📊 Number of users:', jsonData.users ? jsonData.users.length : 0);
                
                // Store original data for comparison later
                this.originalJsonData = JSON.parse(JSON.stringify(jsonData)); // Deep copy
                
                if (jsonData.users && jsonData.users.length > 0) {
                    log('📊 Found', jsonData.users.length, 'users, calling populateTableFromData');
                    this.populateTableFromData(jsonData.users);
                } else {
                    log('📊 No users data in JSON, adding default row');
                    this.addRow(); // Add default row if no saved data
                }
            })
            .catch(error => {
                console.error('❌ Error loading modal data:', error);
                console.error('❌ Error name:', error.name);
                console.error('❌ Error message:', error.message);
                console.error('❌ Error stack:', error.stack);
                log('📊 Adding default row due to error');
                
                // Show user-friendly error message
                alert(`Failed to load user data from server:\n${error.message}\n\nPlease make sure the server is running (npm start or node server.js)`);
                
                this.addRow(); // Add default row if loading fails
            });
    }

    /**
     * Populate table from JSON data
     */
    populateTableFromData(users) {
        log('📋 populateTableFromData called with:', users);
        const tbody = document.getElementById(this.tableBodyId);
        tbody.innerHTML = '';
        this.existingEmails.clear();
        
        users.forEach((user, rowIndex) => {
            log('📋 Populating row for user:', user.email);
            log('📋   Company:', user.metadata?.company);
            log('📋   Role:', user.metadata?.role);
            
            const row = document.createElement('tr');
            
            // Checkbox cell
            const checkboxCell = this.createCheckboxCell();
            row.appendChild(checkboxCell);
            
            // Email cell
            const emailCell = this.createEmailCell();
            emailCell.textContent = user.email;
            if (user.email) {
                this.existingEmails.add(user.email);
            }
            row.appendChild(emailCell);
            
            // Company cell
            const companyCell = this.createEditableCell();
            const companyValue = (user.metadata && user.metadata.company) || '';
            companyCell.textContent = companyValue;
            log('📋   Setting company cell to:', companyValue);
            row.appendChild(companyCell);

            // Role cell
            const roleCell = this.createEditableCell();
            const roleValue = (user.metadata && user.metadata.role) || '';
            roleCell.textContent = roleValue;
            log('📋   Setting role cell to:', roleValue);
            row.appendChild(roleCell);
            
            // Access level cells
            const productKeyMap = {
                'projectAdministration': 'Project Admin',
                'insight': 'Insight',
                'designCollaboration': 'Design Collaboration',
                'modelCoordination': 'Model Coordination',
                'build': 'Build',
                'cost': 'Cost Management',
                'forma': 'Design',
                'takeoff': 'Preconstruction'
            };
            
            // Column order for UI display (Insight and Data Management hidden; Data Management auto-granted by ACC)
            const columnOrder = [
                'Project Admin',
                'Design Collaboration', 'Model Coordination',
                'Preconstruction', 'Build', 'Cost Management', 'Design'
            ];
            
            columnOrder.forEach((columnName, index) => {
                // Use createAccessCell to get proper event handlers
                const cell = this.createAccessCell(columnName, index + 4, rowIndex);
                
                // Find the product data for this column
                const product = user.products.find(p => 
                    productKeyMap[p.key] === columnName
                );
                
                if (product) {
                    // Update cell with loaded value
                    const accessValue = product.access;
                    cell.setAttribute('data-value', accessValue);
                    
                    // Update checkbox state
                    const checkbox = cell.querySelector('input[type="checkbox"]');
                    if (checkbox) {
                        const isChecked = this.isToggleChecked(columnName, accessValue);
                        checkbox.checked = isChecked;
                    }
                    
                    // Update administrator class
                    if (accessValue === 'administrator') {
                        cell.classList.add('administrator');
                    } else {
                        cell.classList.remove('administrator');
                    }
                }
                
                row.appendChild(cell);
            });
            
            tbody.appendChild(row);
            // Lock service toggles if this user is a Project Admin
            this._syncProjectAdminLock(row);
        });
        this.updateUserCount();
    }

    /**
     * Load table data directly from ACC API (used in manage/Existing Users mode).
     * Maps the raw API user format → populateTableFromData format.
     */
    async _loadTableDataFromAPI() {
        log('📡 _loadTableDataFromAPI() called for project:', this.modalProjectId);

        const accessToken = window.currentAccessToken;
        if (!accessToken) {
            alert('Error: No access token available. Please refresh the page.');
            this.addRow();
            return;
        }

        try {
            const projectUsers = await fetchAllProjectUsers(this.modalProjectId, accessToken);
            log(`📡 Fetched ${projectUsers.length} live project users from ACC API`);

            if (!projectUsers.length) {
                log('📡 No live project users found, adding empty row');
                this.addRow();
                return;
            }

            // Map ACC API format → populateTableFromData format
            const users = projectUsers.map(u => {
                // Role: use the first named role, or empty string
                const roleName = (u.roles && u.roles.length > 0)
                    ? u.roles[0].name || ''
                    : '';

                return {
                    email: u.email || '',
                    metadata: {
                        company: u.companyName || '',
                        role: roleName
                    },
                    products: Array.isArray(u.products) ? u.products : []
                };
            }).filter(u => u.email);

            this.populateTableFromData(users);
        } catch (error) {
            console.error('❌ Error loading live project users from API:', error);
            alert(`Failed to load existing project users:\n${error.message}`);
            this.addRow();
        }
    }

    /**
     * Collect current table data as user objects (without saving to Firestore).
     * Returns the same format as saveTableToJson so sync can use live table state.
     */
    collectTableUsers() {
        const tbody = document.getElementById(this.tableBodyId);
        const users = [];

        Array.from(tbody.rows).forEach(row => {
            const cells = Array.from(row.cells);
            if (cells.length < 11) return;

            const emailCell = cells[1];
            if (!emailCell) return;

            const email = (emailCell.textContent || emailCell.innerText || '').trim();
            if (!email) return;

            const user = {
                email: email.toLowerCase(),
                metadata: {
                    company: (cells[2]?.textContent || cells[2]?.innerText || '').trim(),
                    role: (cells[3]?.textContent || cells[3]?.innerText || '').trim()
                },
                products: []
            };

            const productMapping = [
                { key: 'projectAdministration', cellIndex: 4 },
                { key: 'insight', cellIndex: null },
                { key: 'designCollaboration', cellIndex: 5 },
                { key: 'modelCoordination', cellIndex: 6 },
                { key: 'takeoff', cellIndex: 7 },
                { key: 'build', cellIndex: 8 },
                { key: 'cost', cellIndex: 9 },
                { key: 'forma', cellIndex: 10 }
            ];

            const productAccesses = productMapping
                .filter(({ key }) => key !== 'insight')
                .map(({ cellIndex }) => cells[cellIndex]?.getAttribute('data-value') || 'none');

            const hasAdministrator = productAccesses.some(a => a === 'administrator');
            const insightAccess = hasAdministrator ? 'administrator' : 'member';

            productMapping.forEach(({ key, cellIndex }) => {
                const access = key === 'insight'
                    ? insightAccess
                    : (cells[cellIndex]?.getAttribute('data-value') || 'none');
                user.products.push({ key, access });
            });

            users.push(user);
        });

        return users;
    }
}

// Global instance for the user table manager
// let userTableManager = null; // Moved to top of file

/**
 * Initialize the user table manager
 */
function initUserTable() {
    log('🚀🚀🚀 initUserTable called - user-table.js is loading! 🚀🚀🚀');
    try {
        userTableManager = new UserTableManager();
        log('✅ UserTableManager created:', userTableManager);
        userTableManager.init();
        log('✅ UserTableManager initialized successfully');
    } catch (error) {
        console.error('💥 Error initializing UserTableManager:', error);
        console.error('💥 Stack trace:', error.stack);
    }
}

/**
 * Test function to verify the module is working
 */
function testUserTableModule() {
    log('🧪 Testing user table module...');
    log('🧪 userTableManager:', userTableManager);
    if (userTableManager) {
        log('🧪 UserTableManager exists and is initialized');
        return true;
    } else {
        log('🧪 UserTableManager is not initialized');
        return false;
    }
}

/**
 * Global functions to maintain compatibility with existing HTML
 */
function openUserManagementModal(projectId, projectName) {
    log('🚀 openUserManagementModal called with projectId:', projectId, 'projectName:', projectName);
    if (userTableManager) {
        log('✅ userTableManager exists, calling openModal()');
        userTableManager.openModal(projectId, projectName);
    } else {
        console.error('❌ userTableManager not initialized!');
    }
}

function openManageExistingUsersModal(projectId, projectName) {
    log('🚀 openManageExistingUsersModal called with projectId:', projectId, 'projectName:', projectName);
    if (!userTableManager) {
        console.error('❌ userTableManager not initialized!');
        return;
    }
    userTableManager.openModal(projectId, projectName, 'manage');
}

function openMultiProjectNewUsersModal() {
    log('🚀 openMultiProjectNewUsersModal called');
    if (!userTableManager) {
        console.error('❌ userTableManager not initialized!');
        return;
    }
    const checkboxes = Array.from(document.querySelectorAll('.project-select-cb:checked'));
    if (!checkboxes.length) {
        alert('Please select at least one project first.');
        return;
    }
    const projects = checkboxes.map(cb => ({
        id: cb.dataset.projectId,
        name: cb.dataset.projectName
    }));
    // Store the list for multi-project save & sync
    userTableManager.modalProjectIds = projects;
    // Use first project as the primary context
    userTableManager.openModal(projects[0].id, projects[0].name, 'multi-new');
}

function addModalRow() {
    if (userTableManager) {
        userTableManager.addRow();
    }
}

function deleteSelectedModalRows() {
    if (userTableManager) {
        userTableManager.deleteSelectedRows();
    }
}

function clearModalTable() {
    if (userTableManager) {
        userTableManager.clearTable();
    }
}

async function saveModalTableToJson() {
    if (userTableManager) {
        return await userTableManager.saveTableToJson();
    }
}

function importCSV() {
    if (userTableManager) {
        userTableManager.importFromCSV();
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', initUserTable);
