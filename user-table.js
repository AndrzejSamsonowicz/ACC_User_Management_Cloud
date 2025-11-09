// Test that this file is loading
console.log('🎯🎯🎯 USER-TABLE.JS FILE IS LOADING! 🎯🎯🎯');
console.log('🎯🎯🎯 VERSION: 2024-10-28-09 🎯🎯🎯');
console.log('🎯🎯🎯 ADMINISTRATOR AUTO-UPGRADE FUNCTIONALITY 🎯🎯🎯');

// Global variable to hold the user table manager instance
let userTableManager = null;

/**
 * User Table Management Module
 * Handles all user management functionality within a modal dialog
 * 
 * @author ACC User Management System
 * @version 1.0.0
 */

class UserTableManager {
    constructor() {
        this.isSelecting = false;
        this.startCell = null;
        this.selectedCells = new Set();
        this.lastEditedValue = null;
        this.ALLOWED_VALUES = ['none', 'member', 'administrator'];
        this.INSIGHT_VALUES = ['member', 'administrator'];
        this.PROJECT_ADMIN_VALUES = ['none', 'administrator'];
        this.activeTooltip = null;
        this.emailRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
        this.existingEmails = new Set();
        this.modalId = 'userManagementModal';
        this.tableBodyId = 'modalTableBody';
        this.tableSummaryId = 'modalTableSummary';
        this.currentlyFocusedCell = null; // Track the currently focused cell for row deletion
        this.sortState = {
            columnIndex: null,
            ascending: true
        };
        // Drag-to-fill state
        this.isDragging = false;
        this.dragSourceCell = null;
        this.dragSourceValue = null;
        this.draggedCells = new Set();
        // Hub tracking for modal
        this.modalHubId = null;
        this.modalHubName = null;
    }

    /**
     * Initialize the user table manager
     */
    init() {
        this.setupEventListeners();
        this.setupSortingListeners();
        this.setupCheckboxListeners();
        this.setupDragToFillListeners();
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
                console.log(`✅ ${e.target.checked ? 'Selected' : 'Deselected'} all rows`);
            });
        }
    }

    /**
     * Setup drag-to-fill listeners (Excel-like cell filling)
     */
    setupDragToFillListeners() {
        const tbody = document.getElementById(this.tableBodyId);
        
        // Use event delegation for dynamic rows
        tbody.addEventListener('mousedown', (e) => {
            const cell = e.target.closest('td');
            if (!cell) return;
            
            // Don't start drag if clicking on checkbox cell or checkbox
            if (cell.cellIndex === 0 || e.target.type === 'checkbox') {
                return;
            }
            
            // Only start drag on left mouse button
            if (e.button !== 0) return;
            
            // Prepare for potential drag (but don't prevent default yet - allow editing)
            this.dragSourceCell = cell;
            this.dragSourceValue = cell.textContent.trim();
            this.draggedCells.clear();
            this.draggedCells.add(cell);
            
            console.log('🖱️ Drag ready from cell:', this.dragSourceValue);
        });
        
        tbody.addEventListener('mousemove', (e) => {
            // Only activate drag if we have a source cell and mouse is moving
            if (!this.dragSourceCell) return;
            
            // Activate dragging mode on first move
            if (!this.isDragging) {
                this.isDragging = true;
                console.log('🖱️ Drag activated, started from cell:', this.dragSourceValue);
            }
            
            const cell = e.target.closest('td');
            if (!cell) return;
            
            // Skip checkbox cells
            if (cell.cellIndex === 0) return;
            
            const sourceRow = this.dragSourceCell.parentElement;
            const targetRow = cell.parentElement;
            const sourceColIndex = this.dragSourceCell.cellIndex;
            const targetColIndex = cell.cellIndex;
            
            // Check if dragging vertically (same column) or horizontally (same row)
            const isVertical = sourceColIndex === targetColIndex;
            const isHorizontal = sourceRow === targetRow;
            
            if (isVertical || isHorizontal) {
                // Add to dragged cells
                this.draggedCells.add(cell);
                
                // Visual feedback - highlight cell
                cell.style.backgroundColor = '#ffffcc';
                
                console.log(`🖱️ Dragging over cell (${isVertical ? 'vertical' : 'horizontal'})`);
            }
        });
        
        document.addEventListener('mouseup', (e) => {
            // Only process if we were dragging
            if (!this.isDragging && !this.dragSourceCell) {
                return;
            }
            
            // If we were dragging, fill the cells
            if (this.isDragging && this.draggedCells.size > 1) {
                console.log(`🖱️ Drag ended, filling ${this.draggedCells.size} cells`);
                
                // Fill all dragged cells with source value
                this.draggedCells.forEach(cell => {
                    if (cell !== this.dragSourceCell) {
                        // Check if dragging to email column - validate format
                        if (cell.cellIndex === 1) { // Email column (index 1 after checkbox)
                            if (!this.emailRegex.test(this.dragSourceValue)) {
                                console.log(`❌ Cannot drag non-email "${this.dragSourceValue}" to email column`);
                                cell.style.backgroundColor = ''; // Clear highlight
                                return; // Skip this cell
                            }
                        }
                        
                        // Remove highlight
                        cell.style.backgroundColor = '';
                        
                        // Fill with source value
                        const oldValue = cell.textContent.trim();
                        cell.textContent = this.dragSourceValue;
                        
                        console.log(`✏️ Filled cell: "${oldValue}" → "${this.dragSourceValue}"`);
                        
                        // If this is an access cell, apply administrator class if needed
                        if (cell.classList.contains('modal-access-cell')) {
                            cell.classList.toggle('administrator', this.dragSourceValue === 'administrator');
                            
                            // Trigger auto-upgrade if filled with administrator
                            if (this.dragSourceValue === 'administrator') {
                                this.upgradeAllAccessToAdministrator(cell);
                            }
                        }
                    }
                });
                
                // Re-check duplicates if email column was modified
                this.recheckDuplicates();
                this.updateUserCount();
            }
            
            // Clear any remaining yellow highlights on mouseup
            this.draggedCells.forEach(cell => {
                cell.style.backgroundColor = '';
            });
            
            // Reset drag state
            this.isDragging = false;
            this.dragSourceCell = null;
            this.dragSourceValue = null;
            this.draggedCells.clear();
        });
    }

    /**
     * Setup row selection listeners for multi-select
     */


    /**
     * Setup sorting listeners for table headers
     */
    setupSortingListeners() {
        const table = document.getElementById('modalUserTable');
        const headers = table.querySelectorAll('thead th');
        
        headers.forEach((header, index) => {
            header.style.cursor = 'pointer';
            header.style.userSelect = 'none';
            header.style.position = 'relative';
            
            // Add sort indicator container
            const sortIndicator = document.createElement('span');
            sortIndicator.className = 'sort-indicator';
            sortIndicator.style.marginLeft = '5px';
            sortIndicator.style.fontSize = '10px';
            sortIndicator.style.opacity = '0.5';
            header.appendChild(sortIndicator);
            
            header.addEventListener('click', () => {
                this.sortTable(index);
            });
        });
    }

    /**
     * Sort table by column index
     */
    sortTable(columnIndex) {
        console.log(`🔃 Sorting column ${columnIndex}`);
        
        const tbody = document.getElementById(this.tableBodyId);
        const rows = Array.from(tbody.rows);
        
        // Determine sort direction
        const ascending = this.sortState.columnIndex === columnIndex ? !this.sortState.ascending : true;
        
        // Sort rows
        rows.sort((rowA, rowB) => {
            const cellA = rowA.cells[columnIndex].textContent.trim().toLowerCase();
            const cellB = rowB.cells[columnIndex].textContent.trim().toLowerCase();
            
            // Handle empty values - push to bottom
            if (!cellA && cellB) return 1;
            if (cellA && !cellB) return -1;
            if (!cellA && !cellB) return 0;
            
            // For access level columns (index >= 3), sort by priority: administrator > member > none
            if (columnIndex >= 3) {
                const accessOrder = { 'administrator': 3, 'member': 2, 'none': 1, '': 0 };
                const orderA = accessOrder[cellA] || 0;
                const orderB = accessOrder[cellB] || 0;
                
                if (orderA !== orderB) {
                    return ascending ? orderA - orderB : orderB - orderA;
                }
            }
            
            // Default alphabetical comparison
            if (cellA < cellB) return ascending ? -1 : 1;
            if (cellA > cellB) return ascending ? 1 : -1;
            return 0;
        });
        
        // Clear and re-append sorted rows
        tbody.innerHTML = '';
        rows.forEach(row => tbody.appendChild(row));
        
        // Update sort state
        this.sortState.columnIndex = columnIndex;
        this.sortState.ascending = ascending;
        
        // Update sort indicators
        this.updateSortIndicators();
        
        console.log(`✅ Sorted column ${columnIndex} ${ascending ? 'ascending' : 'descending'}`);
    }

    /**
     * Update sort indicators in table headers
     */
    updateSortIndicators() {
        const table = document.getElementById('modalUserTable');
        const headers = table.querySelectorAll('thead th');
        
        headers.forEach((header, index) => {
            const indicator = header.querySelector('.sort-indicator');
            if (indicator) {
                if (index === this.sortState.columnIndex) {
                    indicator.textContent = this.sortState.ascending ? '▲' : '▼';
                    indicator.style.opacity = '1';
                } else {
                    indicator.textContent = '▲';
                    indicator.style.opacity = '0.3';
                }
            }
        });
    }

    /**
     * Open the user management modal
     */
    openModal() {
        console.log('🎯 openModal() called in UserTableManager');
        const modal = document.getElementById(this.modalId);
        console.log('🎯 Modal element:', modal);
        
        // Store the current hub info when modal opens
        if (window.currentHubId) {
            this.modalHubId = window.currentHubId;
            this.modalHubName = window.currentHubName || 'Unknown Hub';
            console.log('🎯 Stored hub info:', this.modalHubId, this.modalHubName);
        } else {
            this.modalHubId = null;
            this.modalHubName = null;
            console.warn('⚠️ No hub selected when opening modal');
        }
        
        // Update hub info display
        this.updateHubInfoDisplay();
        
        modal.style.display = 'block';
        console.log('🎯 Calling loadTableData()...');
        this.loadTableData();
        
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
        
        if (this.modalHubId) {
            if (hubNameEl) hubNameEl.textContent = this.modalHubName;
            if (hubIdEl) hubIdEl.textContent = `(${this.modalHubId})`;
        } else {
            if (hubNameEl) hubNameEl.textContent = 'Not selected';
            if (hubIdEl) hubIdEl.textContent = '';
        }
    }

    /**
     * Close the user management modal
     */
    closeModal() {
        const modal = document.getElementById(this.modalId);
        modal.style.display = 'none';
    }

    /**
     * Setup modal event listeners
     */
    setupEventListeners() {
        const modal = document.getElementById(this.modalId);
        const closeBtn = modal.querySelector('.user-modal-close');
        
        closeBtn.onclick = () => this.closeModal();
        
        // Removed: Close modal when clicking outside
        // Modal now only closes with the "X" button or Escape key
        
        // Close modal with Escape key
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && modal.style.display === 'block') {
                this.closeModal();
            }
        });
    }

    /**
     * Add a new row to the table
     */
    addRow() {
        console.log('➕ addRow() called');
        const tbody = document.getElementById(this.tableBodyId);
        const row = document.createElement('tr');
        
        // Checkbox cell
        const checkboxCell = this.createCheckboxCell();
        row.appendChild(checkboxCell);
        
        // Email cell
        console.log('➕ Creating email cell...');
        const emailCell = this.createEmailCell();
        row.appendChild(emailCell);
        
        // Company cell
        const companyCell = this.createEditableCell();
        row.appendChild(companyCell);
        
        // Role cell
        const roleCell = this.createEditableCell();
        row.appendChild(roleCell);
        
        // Access level cells
        const accessColumns = [
            'Project Admin', 'Insight', 'Docs', 
            'Design Collaboration', 'Model Coordination',
            'Build', 'Cost', 'Forma', 'Take Off'
        ];
        
        accessColumns.forEach((columnName, index) => {
            const cell = this.createAccessCell(columnName, index + 4, tbody.children.length);
            row.appendChild(cell);
        });
        
        tbody.appendChild(row);
        console.log('➕ Row added to table, total rows:', tbody.rows.length);
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
        console.log('🔧 createNewRow() called');
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
        
        // Access level cells
        const accessColumns = [
            'Project Admin', 'Insight', 'Docs', 
            'Design Collaboration', 'Model Coordination',
            'Build', 'Cost', 'Forma', 'Take Off'
        ];
        
        accessColumns.forEach((columnName, index) => {
            const cell = this.createAccessCell(columnName, index + 4, 0); // Use 0 for row index as placeholder, +4 for checkbox column
            row.appendChild(cell);
        });
        
        console.log('🔧 New row created (not yet appended)');
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
            console.log('🔥🔥🔥 PASTE EVENT TRIGGERED ON EMAIL CELL! 🔥🔥🔥');
            this.handlePaste(e);
        }, true);
        
        // Also listen for input events (fired after paste)
        emailCell.addEventListener('input', (e) => {
            console.log('📝📝📝 INPUT EVENT TRIGGERED ON EMAIL CELL! 📝📝📝');
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
            console.log('🎯 Email cell focused, row tracked for deletion');
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
            console.log('🎯 Editable cell focused, row tracked for deletion');
        });
        return cell;
    }

    /**
     * Create an access level cell with validation
     */
    createAccessCell(columnName, columnIndex, rowIndex) {
        const cell = document.createElement('td');
        cell.className = 'modal-access-cell';
        cell.contentEditable = true;
        cell.setAttribute('data-column', columnIndex);
        cell.setAttribute('data-row', rowIndex);
        
        // Set default values based on service type
        if (columnName === 'Project Admin') {
            cell.textContent = 'none';
        } else if (columnName === 'Insight' || columnName === 'Docs') {
            cell.textContent = 'member';
        } else if (columnName === 'Design Collaboration' || 
                   columnName === 'Model Coordination' || 
                   columnName === 'Build' || 
                   columnName === 'Cost' || 
                   columnName === 'Forma' ||
                   columnName === 'Take Off') {
            cell.textContent = 'none';
        } else {
            // Default fallback (should not be reached with current services)
            cell.textContent = 'member';
        }
        
        this.initializeAccessCell(cell);
        return cell;
    }

    /**
     * Initialize access cell with validation events
     */
    initializeAccessCell(cell) {
        cell.addEventListener('blur', (e) => {
            const previousValue = e.target.getAttribute('data-previous-value') || 'none';
            const value = this.validateAccessValue(e.target, e.target.textContent);
            
            console.log(`🔍 Access cell blur - Previous: "${previousValue}", New: "${value}"`);
            
            if (value !== false) {
                e.target.textContent = value;
                e.target.classList.toggle('administrator', value === 'administrator');
                
                // If this cell becomes "administrator", upgrade all other access cells in the same row
                if (value === 'administrator') {
                    console.log('⬆️ Triggering upgrade to administrator');
                    this.upgradeAllAccessToAdministrator(e.target);
                }
                // If this cell was "administrator" and becomes something else, downgrade all other cells
                else if (previousValue === 'administrator' && value !== 'administrator') {
                    console.log('⬇️ Triggering downgrade from administrator');
                    this.downgradeAllAccessFromAdministrator(e.target);
                }
            } else {
                console.log('❌ Validation failed, reverting to previous value');
                e.target.textContent = previousValue;
            }
        });
        
        cell.addEventListener('focus', (e) => {
            e.target.setAttribute('data-previous-value', e.target.textContent.trim());
            this.currentlyFocusedCell = e.target; // Track the currently focused cell
            console.log('🎯 Access cell focused, row tracked for deletion');
        });
    }

    /**
     * Upgrade all access level cells in a row to "administrator"
     * When any product becomes "administrator", all products must be "administrator"
     */
    upgradeAllAccessToAdministrator(triggerCell) {
        console.log('🔐 upgradeAllAccessToAdministrator() called');
        const row = triggerCell.parentElement;
        
        // Find all access level cells in this row (columns 4-12: Project Admin through Take Off)
        const accessCells = Array.from(row.cells).slice(4); // Skip Checkbox (0), Email (1), Company (2), Role (3)
        
        console.log(`🔐 Upgrading ${accessCells.length} access cells to administrator`);
        
        accessCells.forEach((cell, index) => {
            const currentValue = cell.textContent.trim().toLowerCase();
            const columnIndex = parseInt(cell.getAttribute('data-column'));
            
            // Only upgrade cells that have the modal-access-cell class (skip any non-product cells)
            if (!cell.classList.contains('modal-access-cell')) {
                console.log(`⏭️ Skipping non-access cell at index ${cell.cellIndex}`);
                return;
            }
            
            // Project Admin (column 4) can only be 'none' or 'administrator'
            if (columnIndex === 4) {
                if (currentValue !== 'administrator') {
                    cell.textContent = 'administrator';
                    cell.classList.add('administrator');
                    console.log(`🔐 Upgraded Project Admin to administrator`);
                }
            } else {
                // All other products can be upgraded to administrator
                if (currentValue !== 'administrator') {
                    cell.textContent = 'administrator';
                    cell.classList.add('administrator');
                    console.log(`🔐 Upgraded ${this.getColumnName(columnIndex)} to administrator`);
                }
            }
        });
        
        console.log('🔐 All access levels upgraded to administrator');
    }

    /**
     * Downgrade all access level cells in a row from "administrator"
     * When any product is downgraded from "administrator", all products must be downgraded
     * Insight and Docs become "member", all others become "none"
     */
    downgradeAllAccessFromAdministrator(triggerCell) {
        console.log('🔓 downgradeAllAccessFromAdministrator() called');
        const row = triggerCell.parentElement;
        
        // Find all access level cells in this row (columns 4-12: Project Admin through Take Off)
        const accessCells = Array.from(row.cells).slice(4); // Skip Checkbox (0), Email (1), Company (2), Role (3)
        
        console.log(`🔓 Downgrading ${accessCells.length} access cells from administrator`);
        
        accessCells.forEach((cell, index) => {
            const currentValue = cell.textContent.trim().toLowerCase();
            const columnIndex = parseInt(cell.getAttribute('data-column'));
            
            // Only downgrade cells that have the modal-access-cell class (skip any non-product cells)
            if (!cell.classList.contains('modal-access-cell')) {
                console.log(`⏭️ Skipping non-access cell at index ${cell.cellIndex}`);
                return;
            }
            
            // Skip the trigger cell (it's already been changed)
            if (cell === triggerCell) {
                return;
            }
            
            // Insight (column 5) and Docs (column 6) become "member"
            if (columnIndex === 5 || columnIndex === 6) {
                cell.textContent = 'member';
                cell.classList.remove('administrator');
                console.log(`🔓 Downgraded ${this.getColumnName(columnIndex)} to member`);
            } 
            // All other products become "none"
            else {
                cell.textContent = 'none';
                cell.classList.remove('administrator');
                console.log(`🔓 Downgraded ${this.getColumnName(columnIndex)} to none`);
            }
        });
        
        console.log('🔓 All access levels downgraded from administrator');
    }

    /**
     * Get column name by index for logging
     */
    getColumnName(columnIndex) {
        const columnNames = {
            4: 'Project Admin',
            5: 'Insight', 
            6: 'Docs',
            7: 'Design Collaboration',
            8: 'Model Coordination',
            9: 'Build',
            10: 'Cost',
            11: 'Forma',
            12: 'Take Off'
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
        } else if (columnIndex === 5) { // Insight (column 5 after checkbox)
            allowedValues = this.INSIGHT_VALUES;
            errorMessage = 'Invalid value. Allowed values: member or administrator';
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
     * Show validation tooltip
     */
    showTooltip(cell, message) {
        this.removeTooltip();

        const tooltip = document.createElement('div');
        tooltip.className = 'modal-tooltip';
        tooltip.textContent = message;
        document.body.appendChild(tooltip);

        const rect = cell.getBoundingClientRect();
        tooltip.style.top = rect.bottom + window.scrollY + 5 + 'px';
        tooltip.style.left = rect.left + window.scrollX + 'px';

        this.activeTooltip = tooltip;
        setTimeout(() => this.removeTooltip(), 3000);
    }

    /**
     * Remove active tooltip
     */
    removeTooltip() {
        if (this.activeTooltip) {
            this.activeTooltip.remove();
            this.activeTooltip = null;
        }
    }

    /**
     * Handle input events to detect multi-email pastes that bypassed paste handler
     */
    handleInputForMultiEmail(cell) {
        console.log('Input event triggered, checking for multi-emails');
        
        const content = cell.textContent || cell.innerText || '';
        console.log('Cell content:', JSON.stringify(content));
        
        // Check if this is an email cell (index 1 after checkbox)
        if (cell.cellIndex !== 1) {
            console.log('Not an email cell, skipping');
            return;
        }
        
        // Look for multiple emails in the content
        let emails = [];
        
        // First try line breaks
        if (content.includes('\n') || content.includes('\r')) {
            emails = content.split(/[\r\n]+/).map(line => line.trim()).filter(line => line);
            console.log('Found line breaks, split into:', emails);
        } 
        // Then try spaces
        else if (content.includes(' ')) {
            const potentialEmails = content.split(/\s+/).map(item => item.trim()).filter(item => item);
            // Only consider as multi-email if multiple items look like emails
            const emailLike = potentialEmails.filter(item => this.emailRegex.test(item));
            if (emailLike.length > 1) {
                emails = potentialEmails;
                console.log('Found spaces with multiple emails:', emails);
            }
        }
        
        if (emails.length > 1) {
            // Filter to valid emails
            const validEmails = emails.filter(email => this.emailRegex.test(email.trim()));
            console.log('Valid emails found:', validEmails);
            
            if (validEmails.length > 1) {
                console.log('Processing multi-email input');
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
        console.log('🔥🔥🔥 PASTE EVENT HANDLER CALLED! 🔥🔥🔥');
        console.log('🔥 Event object:', e);
        console.log('🔥 Event target:', e.target);
        console.log('🔥 Event type:', e.type);
        
        try {
            const pastedText = (e.clipboardData || window.clipboardData).getData('text');
            const targetCell = e.target;
            
            console.log('📋 Pasted text:', JSON.stringify(pastedText));
            console.log('📋 Target cell:', targetCell);
            console.log('📋 Target cell index:', targetCell.cellIndex);
            
            // Check which column we're pasting into (account for checkbox at index 0)
            const isEmailCell = targetCell.cellIndex === 1;
            const isCompanyCell = targetCell.cellIndex === 2;
            const isRoleCell = targetCell.cellIndex === 3;
            
            console.log('📧 Is email cell:', isEmailCell);
            console.log('🏢 Is company cell:', isCompanyCell);
            console.log('👤 Is role cell:', isRoleCell);
            
            if ((isEmailCell || isCompanyCell || isRoleCell) && pastedText) {
                // Check for multiple items (split by lines)
                let items = [];
                
                if (pastedText.includes('\n') || pastedText.includes('\r')) {
                    items = pastedText.split(/[\r\n]+/).map(line => line.trim()).filter(line => line);
                    console.log('� Split by lines:', items);
                } else if (isEmailCell && pastedText.includes(' ')) {
                    // Only check for space-separated emails in email column
                    const parts = pastedText.split(/\s+/).map(item => item.trim()).filter(item => item);
                    const emailLike = parts.filter(item => this.emailRegex.test(item));
                    if (emailLike.length > 1) {
                        items = parts;
                        console.log('📧 Split by spaces (emails):', items);
                    }
                }
                
                console.log('� Total items found:', items.length);
                
                if (items.length > 1) {
                    console.log('🚀 PREVENTING DEFAULT PASTE - MULTIPLE ITEMS DETECTED');
                    e.preventDefault();
                    e.stopPropagation();
                    
                    if (isEmailCell) {
                        // Email column: validate emails
                        const validEmails = items.filter(email => this.emailRegex.test(email.trim()));
                        console.log('✅ Valid emails:', validEmails);
                        console.log('✅ Valid email count:', validEmails.length);
                        
                        if (validEmails.length > 1) {
                            console.log('🚀 Calling handleMultiEmailPaste...');
                            this.handleMultiEmailPaste(validEmails, targetCell);
                            return;
                        }
                    } else {
                        // Company or Role column: no validation needed, accept all items
                        console.log('🚀 Calling handleMultiTextPaste...');
                        this.handleMultiTextPaste(items, targetCell);
                        return;
                    }
                }
            }
            
            console.log('➡️ Allowing default paste behavior');
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
        console.log('🚀🚀🚀 HANDLE MULTI-EMAIL PASTE CALLED! 🚀🚀🚀');
        console.log('📧 Emails to paste:', emails);
        console.log('🎯 Target cell:', targetCell);
        
        const tbody = document.getElementById(this.tableBodyId);
        const currentRow = targetCell.parentElement;
        const currentRowIndex = Array.from(tbody.rows).indexOf(currentRow);
        
        console.log(`📊 Pasting ${emails.length} emails starting at row ${currentRowIndex}`);
        console.log('📊 Current tbody rows:', tbody.rows.length);
        
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
            console.log(`📧 Processing email ${i+1}/${emails.length}: "${email}"`);
            
            if (!email || !this.emailRegex.test(email)) {
                console.log(`❌ Skipping invalid email: "${email}"`);
                continue;
            }
            
            let targetRow;
            let emailCell;
            
            // Use existing row or create new one
            if (currentRowIndex + i < tbody.rows.length) {
                // Use existing row
                targetRow = tbody.rows[currentRowIndex + i];
                console.log(`♻️ Using existing row ${currentRowIndex + i}`);
            } else {
                // Create new row
                console.log(`➕ Creating new row for email ${i+1}`);
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
            console.log(`✅ Set email "${email}" in row ${currentRowIndex + i}`);
            
            // Add to tracking (bypassing validation since this is a bulk operation)
            this.existingEmails.add(email);
        }
        
        console.log('🎉 Multi-email paste completed!');
        this.updateUserCount();
    }

    /**
     * Handle pasting multiple text items (for Company and Role columns)
     */
    handleMultiTextPaste(items, targetCell) {
        console.log('🚀🚀🚀 HANDLE MULTI-TEXT PASTE CALLED! 🚀🚀🚀');
        console.log('📄 Items to paste:', items);
        console.log('🎯 Target cell:', targetCell);
        console.log('🎯 Target cell index (column):', targetCell.cellIndex);
        
        const tbody = document.getElementById(this.tableBodyId);
        const currentRow = targetCell.parentElement;
        const currentRowIndex = Array.from(tbody.rows).indexOf(currentRow);
        const columnIndex = targetCell.cellIndex;
        
        console.log(`📊 Pasting ${items.length} items starting at row ${currentRowIndex}, column ${columnIndex}`);
        console.log('📊 Current tbody rows:', tbody.rows.length);
        
        // Process each item
        for (let i = 0; i < items.length; i++) {
            const item = items[i].trim();
            console.log(`📄 Processing item ${i+1}/${items.length}: "${item}"`);
            
            if (!item) {
                console.log(`❌ Skipping empty item: "${item}"`);
                continue;
            }
            
            let targetRow;
            let targetCellInRow;
            
            // Use existing row or create new one
            if (currentRowIndex + i < tbody.rows.length) {
                // Use existing row
                targetRow = tbody.rows[currentRowIndex + i];
                console.log(`♻️ Using existing row ${currentRowIndex + i}`);
            } else {
                // Create new row
                console.log(`➕ Creating new row for item ${i+1}`);
                targetRow = this.createNewRow();
                tbody.appendChild(targetRow);
            }
            
            targetCellInRow = targetRow.cells[columnIndex];
            targetCellInRow.textContent = item;
            console.log(`✅ Set "${item}" in row ${currentRowIndex + i}, column ${columnIndex}`);
        }
        
        console.log('🎉 Multi-text paste completed!');
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
        console.log('🗑️ deleteSelectedRows() called');
        const tbody = document.getElementById(this.tableBodyId);
        
        // Find all checked checkboxes
        const checkedCheckboxes = tbody.querySelectorAll('input[type="checkbox"].row-checkbox:checked');
        
        if (checkedCheckboxes.length > 0) {
            console.log(`🗑️ Deleting ${checkedCheckboxes.length} checked rows`);
            
            // Delete all rows with checked checkboxes
            checkedCheckboxes.forEach(checkbox => {
                const row = checkbox.closest('tr');
                if (row && tbody.contains(row)) {
                    // Remove email from tracking if it exists (email is now in cell[1], not cell[0])
                    const emailCell = row.cells[1];
                    const email = emailCell.textContent.trim();
                    if (email) {
                        this.existingEmails.delete(email);
                        console.log(`🗑️ Removed email "${email}" from tracking`);
                    }
                    
                    // Remove the row
                    tbody.removeChild(row);
                }
            });
            
            console.log('🗑️ All checked rows deleted successfully');
            
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
            console.log('🗑️ No rows to delete');
            return;
        }
        
        let rowToDelete = null;
        
        // If we have a currently focused cell, find its row
        if (this.currentlyFocusedCell) {
            rowToDelete = this.currentlyFocusedCell.parentElement;
            console.log('🗑️ Found focused cell, deleting its row');
        } else {
            // Fallback: delete the last row if no focused cell
            rowToDelete = rows[rows.length - 1];
            console.log('🗑️ No focused cell, deleting last row as fallback');
        }
        
        if (rowToDelete && tbody.contains(rowToDelete)) {
            // Remove email from tracking if it exists (email is now in cell[1], not cell[0])
            const emailCell = rowToDelete.cells[1];
            const email = emailCell.textContent.trim();
            if (email) {
                this.existingEmails.delete(email);
                console.log(`🗑️ Removed email "${email}" from tracking`);
            }
            
            // Remove the row
            tbody.removeChild(rowToDelete);
            console.log('🗑️ Row deleted successfully');
            
            // Clear the focused cell reference if it was in the deleted row
            if (this.currentlyFocusedCell && this.currentlyFocusedCell.parentElement === rowToDelete) {
                this.currentlyFocusedCell = null;
                console.log('🗑️ Cleared focused cell reference');
            }
            
            // Re-check for duplicates and update highlighting
            this.recheckDuplicates();
            
            this.updateUserCount();
        } else {
            console.log('🗑️ Error: Could not find row to delete');
        }
    }

    /**
     * Re-check for duplicate emails and update highlighting
     */
    recheckDuplicates() {
        console.log('🔍 Rechecking for duplicates...');
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
            console.log('🔍 Duplicates still exist:', duplicateEmails);
            duplicateEmails.forEach(duplicateEmail => {
                const rowIndices = emailsFound.get(duplicateEmail);
                rowIndices.forEach(rowIndex => {
                    const row = tbody.rows[rowIndex];
                    const emailCell = row.cells[1]; // Email is now in cell[1]
                    emailCell.classList.add('modal-error-cell');
                });
            });
        } else {
            console.log('✅ No duplicates found, all clear!');
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
        console.log('🔄 updateAccountUsersBeforeSave called with accountId:', accountId);
        
        // Show progress bar
        this.showSaveProgress('Updating account users...', 10);
        
        try {
            // Check if updateAccountUsersForAccount function is available
            if (typeof updateAccountUsersForAccount !== 'function') {
                throw new Error('updateAccountUsersForAccount function not available');
            }
            
            // Run the update silently (no preview, no confirmation)
            this.showSaveProgress('Analyzing users...', 20);
            const results = await updateAccountUsersForAccount(accountId, { performOps: true });
            
            console.log('✅ Account update results:', results);
            
            // Check for invalid roles - users were SKIPPED
            const invalidRoleCount = results.invalidRoles?.size || 0;
            if (invalidRoleCount > 0) {
                console.warn('⚠️ Invalid roles detected - users were SKIPPED:', results.invalidRoles);
                
                // Build error message HTML
                let errorHTML = '<div style="margin-bottom: 10px; font-weight: bold; color: #d32f2f;">⚠️ Invalid roles found - users were SKIPPED:</div>';
                for (const [role, emails] of results.invalidRoles) {
                    errorHTML += `<div style="margin: 10px 0; padding: 10px; background: #fff3cd; border-left: 3px solid #ffc107;">`;
                    errorHTML += `<strong style="color: #856404;">Role "${role}" doesn't exist in this account</strong>`;
                    errorHTML += '<ul style="margin: 5px 0; padding-left: 20px; color: #856404;">';
                    emails.forEach(email => {
                        errorHTML += `<li>${email}, this role doesn't exist: Provide the valid user role</li>`;
                    });
                    errorHTML += '</ul></div>';
                }
                errorHTML += '<div style="margin-top: 15px; padding: 10px; background: #e3f2fd; border: 1px solid #2196f3; border-radius: 4px; font-size: 13px;">';
                errorHTML += '<strong>Action Required:</strong> Check your account settings to see which roles are configured, then update the JSON file with valid roles.';
                errorHTML += '</div>';
                
                // Show error below progress bar
                this.showInvalidRolesWarning(errorHTML);
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
                    <span id="saveProgressMessage">${message}</span>
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
            if (messageEl) messageEl.textContent = message;
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
        // Remove existing warning if any
        let warningDiv = document.getElementById('invalidRolesWarning');
        if (warningDiv) {
            warningDiv.remove();
        }

        // Create warning div
        warningDiv = document.createElement('div');
        warningDiv.id = 'invalidRolesWarning';
        warningDiv.style.cssText = `
            position: fixed;
            top: calc(50% + 80px);
            left: 50%;
            transform: translate(-50%, 0);
            background: #fff3cd;
            border: 2px solid #ffc107;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            z-index: 10001;
            min-width: 400px;
            max-width: 600px;
            max-height: 400px;
            overflow-y: auto;
            font-family: 'Artifact Elements', Arial, sans-serif;
            color: #856404;
        `;
        
        // Add content and OK button
        warningDiv.innerHTML = htmlContent + `
            <div style="margin-top: 20px; text-align: center;">
                <button id="closeInvalidRolesWarning" style="
                    padding: 10px 30px;
                    background: #ffc107;
                    border: none;
                    border-radius: 4px;
                    color: #856404;
                    font-weight: bold;
                    cursor: pointer;
                    font-size: 14px;
                    font-family: 'Artifact Elements', Arial, sans-serif;
                ">OK</button>
            </div>
        `;
        
        document.body.appendChild(warningDiv);
        
        // Add click handler for OK button
        const okButton = document.getElementById('closeInvalidRolesWarning');
        if (okButton) {
            okButton.addEventListener('click', () => {
                warningDiv.remove();
            });
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
                ${errorMessage}
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
        console.log('💾 saveTableToJson() called, skipAccountUpdate:', skipAccountUpdate);
        
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
                    console.log('⚠️ User cancelled save due to hub mismatch');
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
            console.log('❌ Duplicate emails found:', duplicateEmails);
            
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
            const email = cells[1].textContent.trim(); // Email is now in cell[1], cell[0] is checkbox
            
            if (email) {
                console.log(`💾 Processing user: ${email}`);
                const user = {
                    email: email,
                    metadata: {
                        company: cells[2].textContent.trim(), // Company is now in cell[2]
                        role: cells[3].textContent.trim() // Role is now in cell[3]
                    },
                    products: []
                };
                
                console.log(`💾 Company: "${user.metadata.company}", Role: "${user.metadata.role}"`);
                
                const productKeys = [
                    'projectAdministration', 'insight', 'docs', 
                    'designCollaboration', 'modelCoordination',
                    'build', 'cost', 'forma', 'takeoff'
                ];
                
                productKeys.forEach((key, index) => {
                    const access = cells[index + 4].textContent.trim(); // Products now start at cell[4] (0=checkbox, 1=email, 2=company, 3=role)
                    user.products.push({
                        key: key,
                        access: access
                    });
                });
                
                users.push(user);
            }
        });
        
        const jsonData = {
            users: users,
            exportDate: new Date().toISOString()
        };
        
        console.log(`💾 Saving ${users.length} users to server`);
        console.log('💾 Sample user data:', users[0]);
        
        // Update progress if account update will run
        if (!skipAccountUpdate) {
            this.showSaveProgress('Saving to JSON file...', 30);
        }
        
        // Save to server (user_permissions_import.json)
        try {
            const response = await fetch('http://localhost:3000/save', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(jsonData)
            });
            
            const data = await response.json();
            
            if (data.success) {
                console.log('✅ Data saved to JSON successfully');
                
                // Now update account users AFTER JSON is saved
                if (!skipAccountUpdate) {
                    const currentHubId = window.currentHubId;
                    const currentHubName = window.currentHubName || 'Unknown Hub';
                    
                    // Check for hub mismatch
                    if (this.modalHubId && currentHubId && this.modalHubId !== currentHubId) {
                        console.warn('⚠️ Hub mismatch detected!');
                        console.warn('  Modal opened with:', this.modalHubName, '(', this.modalHubId, ')');
                        console.warn('  Current hub is:', currentHubName, '(', currentHubId, ')');
                        
                        this.hideSaveProgress();
                        
                        // Show warning dialog
                        const continueUpdate = confirm(
                            `⚠️ HUB MISMATCH WARNING\n\n` +
                            `This Users Main List was opened for:\n` +
                            `  "${this.modalHubName}" (${this.modalHubId})\n\n` +
                            `But the currently selected hub is:\n` +
                            `  "${currentHubName}" (${currentHubId})\n\n` +
                            `Do you want to update account users in "${currentHubName}"?\n\n` +
                            `Click OK to update "${currentHubName}"\n` +
                            `Click Cancel to skip account update (JSON will still be saved)`
                        );
                        
                        if (!continueUpdate) {
                            console.log('⚠️ User cancelled account update due to hub mismatch');
                            this.showTooltip(document.querySelector('button[onclick="saveModalTableToJson()"]'), 
                                '✓ Saved to JSON (account update skipped)');
                            return;
                        }
                    }
                    
                    if (currentHubId) {
                        console.log('🔄 Now updating account users from saved JSON...');
                        console.log('🔄 Target hub:', currentHubName, '(', currentHubId, ')');
                        try {
                            await this.updateAccountUsersBeforeSave(currentHubId);
                            console.log('✅ Account users updated successfully!');
                            
                            // Show completion
                            this.showSaveProgress('All operations completed!', 100);
                            setTimeout(() => this.hideSaveProgress(), 1500);
                            
                            this.showTooltip(document.querySelector('button[onclick="saveModalTableToJson()"]'), 
                                '✓ Saved and account updated');
                        } catch (error) {
                            console.error('❌ Account update failed:', error);
                            this.hideSaveProgress();
                            this.showSaveError(`JSON saved but account update failed: ${error.message}`);
                            return;
                        }
                    } else {
                        console.warn('⚠️ No accountId available, skipping account update');
                        this.showSaveProgress('Save completed!', 100);
                        setTimeout(() => this.hideSaveProgress(), 1000);
                        this.showTooltip(document.querySelector('button[onclick="saveModalTableToJson()"]'), 
                            '✓ Saved to JSON (no account update)');
                    }
                } else {
                    // No account update requested
                    this.showTooltip(document.querySelector('button[onclick="saveModalTableToJson()"]'), 
                        '✓ Saved to user_permissions_import.json');
                }
            } else {
                console.error('❌ Error saving to server:', data.message);
                this.hideSaveProgress();
                this.showTooltip(document.querySelector('button[onclick="saveModalTableToJson()"]'), 
                    '✗ Error saving to server');
            }
        } catch (error) {
            console.error('❌ Network error saving to server:', error);
            this.hideSaveProgress();
            this.showTooltip(document.querySelector('button[onclick="saveModalTableToJson()"]'), 
                '✗ Network error saving to server');
        }
    }

    /**
     * Import user data from CSV file
     */
    importFromCSV() {
        console.log('📁 importFromCSV() called');
        const fileInput = document.getElementById('csvFileInput');
        
        // Trigger file selection dialog
        fileInput.click();
        
        // Handle file selection
        fileInput.onchange = (event) => {
            const file = event.target.files[0];
            if (!file) {
                console.log('📁 No file selected');
                return;
            }
            
            console.log('📁 Processing CSV file:', file.name);
            
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const csvContent = e.target.result;
                    console.log('📁 CSV content loaded');
                    this.parseAndImportCSV(csvContent);
                } catch (error) {
                    console.error('💥 Error reading CSV file:', error);
                    this.showTooltip(document.querySelector('button[onclick="importCSV()"]'), 
                        '✗ Error reading CSV file');
                }
            };
            
            reader.readAsText(file);
            
            // Reset file input for future use
            fileInput.value = '';
        };
    }

    /**
     * Parse CSV content and import user data
     */
    parseAndImportCSV(csvContent) {
        console.log('📊 parseAndImportCSV() called');
        
        // Split into lines and filter out empty lines
        const lines = csvContent.split(/\r?\n/).filter(line => line.trim());
        console.log(`📊 Found ${lines.length} lines in CSV`);
        
        if (lines.length === 0) {
            this.showTooltip(document.querySelector('button[onclick="importCSV()"]'), 
                '✗ CSV file is empty');
            return;
        }
        
        const importedUsers = [];
        let validCount = 0;
        let errorCount = 0;
        
        lines.forEach((line, index) => {
            const trimmedLine = line.trim();
            if (!trimmedLine) return;
            
            // Split by semicolon (format: email;company;role)
            const parts = trimmedLine.split(';');
            
            if (parts.length !== 3) {
                console.warn(`⚠️ Line ${index + 1}: Invalid format, expected 3 parts separated by semicolons`);
                errorCount++;
                return;
            }
            
            const email = parts[0].trim();
            const company = parts[1].trim();
            const role = parts[2].trim();
            
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
            
            console.log(`✅ Line ${index + 1}: ${email} | ${company} | ${role}`);
        });
        
        console.log(`📊 Import summary: ${validCount} valid users, ${errorCount} errors`);
        
        if (importedUsers.length === 0) {
            this.showTooltip(document.querySelector('button[onclick="importCSV()"]'), 
                '✗ No valid users found in CSV');
            return;
        }
        
        // Clear existing table and import new data
        const tbody = document.getElementById(this.tableBodyId);
        tbody.innerHTML = '';
        this.existingEmails.clear();
        
        // Import each user
        importedUsers.forEach(userData => {
            const row = document.createElement('tr');
            
            // Email cell
            const emailCell = this.createEmailCell();
            emailCell.textContent = userData.email;
            emailCell.setAttribute('data-previous-value', userData.email);
            this.existingEmails.add(userData.email);
            row.appendChild(emailCell);
            
            // Company cell
            const companyCell = this.createEditableCell();
            companyCell.textContent = userData.company;
            row.appendChild(companyCell);
            
            // Role cell
            const roleCell = this.createEditableCell();
            roleCell.textContent = userData.role;
            row.appendChild(roleCell);
            
            // Access level cells with default values
            const accessColumns = [
                'Project Admin', 'Insight', 'Docs', 
                'Design Collaboration', 'Model Coordination',
                'Build', 'Cost', 'Forma', 'Take Off'
            ];
            
            accessColumns.forEach((columnName, index) => {
                const cell = this.createAccessCell(columnName, index + 3, tbody.children.length);
                row.appendChild(cell);
            });
            
            tbody.appendChild(row);
        });
        
        this.updateUserCount();
        
        // Show success message
        const message = errorCount > 0 ? 
            `✓ Imported ${validCount} users (${errorCount} errors)` : 
            `✓ Successfully imported ${validCount} users`;
        
        this.showTooltip(document.querySelector('button[onclick="importCSV()"]'), message);
        
        console.log('🎉 CSV import completed!');
    }

    /**
     * Load table data from server
     */
    loadTableData() {
        console.log('📊 loadTableData() called');
        console.log('📊 Fetching from: http://localhost:3000/load');
        
        fetch('http://localhost:3000/load')
            .then(response => {
                console.log('📊 Response status:', response.status);
                console.log('📊 Response OK:', response.ok);
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                return response.json();
            })
            .then(jsonData => {
                console.log('📊 Data loaded from server:', jsonData);
                console.log('📊 Number of users:', jsonData.users ? jsonData.users.length : 0);
                
                if (jsonData.users && jsonData.users.length > 0) {
                    console.log('📊 Found', jsonData.users.length, 'users, calling populateTableFromData');
                    this.populateTableFromData(jsonData.users);
                } else {
                    console.log('📊 No users data in JSON, adding default row');
                    this.addRow(); // Add default row if no saved data
                }
            })
            .catch(error => {
                console.error('❌ Error loading modal data:', error);
                console.error('❌ Error name:', error.name);
                console.error('❌ Error message:', error.message);
                console.error('❌ Error stack:', error.stack);
                console.log('📊 Adding default row due to error');
                
                // Show user-friendly error message
                alert(`Failed to load user data from server:\n${error.message}\n\nPlease make sure the server is running (npm start or node server.js)`);
                
                this.addRow(); // Add default row if loading fails
            });
    }

    /**
     * Populate table from JSON data
     */
    populateTableFromData(users) {
        console.log('📋 populateTableFromData called with:', users);
        const tbody = document.getElementById(this.tableBodyId);
        tbody.innerHTML = '';
        this.existingEmails.clear();
        
        users.forEach(user => {
            console.log('📋 Populating row for user:', user.email);
            console.log('📋   Company:', user.metadata?.company);
            console.log('📋   Role:', user.metadata?.role);
            
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
            console.log('📋   Setting company cell to:', companyValue);
            row.appendChild(companyCell);

            // Role cell
            const roleCell = this.createEditableCell();
            const roleValue = (user.metadata && user.metadata.role) || '';
            roleCell.textContent = roleValue;
            console.log('📋   Setting role cell to:', roleValue);
            row.appendChild(roleCell);
            
            // Access level cells
            const productKeyMap = {
                'projectAdministration': 'Project Admin',
                'insight': 'Insight',
                'docs': 'Docs',
                'designCollaboration': 'Design Collaboration',
                'modelCoordination': 'Model Coordination',
                'build': 'Build',
                'cost': 'Cost',
                'forma': 'Forma',
                'takeoff': 'Take Off'
            };
            
            const columnOrder = [
                'Project Admin', 'Insight', 'Docs', 
                'Design Collaboration', 'Model Coordination',
                'Build', 'Cost', 'Forma', 'Take Off'
            ];
            
            columnOrder.forEach((columnName, index) => {
                const cell = document.createElement('td');
                cell.className = 'modal-access-cell';
                cell.contentEditable = true;
                cell.setAttribute('data-column', index + 4);
                
                const product = user.products.find(p => 
                    productKeyMap[p.key] === columnName
                );
                
                // Set default values based on service type (same logic as createAccessCell)
                let defaultValue;
                if (columnName === 'Project Admin') {
                    defaultValue = 'none';
                } else if (columnName === 'Insight' || columnName === 'Docs') {
                    defaultValue = 'member';
                } else if (columnName === 'Design Collaboration' || 
                           columnName === 'Model Coordination' || 
                           columnName === 'Build' || 
                           columnName === 'Cost' || 
                           columnName === 'Forma' ||
                           columnName === 'Take Off') {
                    defaultValue = 'none';
                } else {
                    // Default fallback (should not be reached with current services)
                    defaultValue = 'member';
                }
                
                cell.textContent = product ? product.access : defaultValue;
                
                this.initializeAccessCell(cell);
                cell.classList.toggle('administrator', cell.textContent === 'administrator');
                row.appendChild(cell);
            });
            
            tbody.appendChild(row);
        });
        this.updateUserCount();
    }
}

// Global instance for the user table manager
// let userTableManager = null; // Moved to top of file

/**
 * Initialize the user table manager
 */
function initUserTable() {
    console.log('🚀🚀🚀 initUserTable called - user-table.js is loading! 🚀🚀🚀');
    try {
        userTableManager = new UserTableManager();
        console.log('✅ UserTableManager created:', userTableManager);
        userTableManager.init();
        console.log('✅ UserTableManager initialized successfully');
    } catch (error) {
        console.error('💥 Error initializing UserTableManager:', error);
        console.error('💥 Stack trace:', error.stack);
    }
}

/**
 * Test function to verify the module is working
 */
function testUserTableModule() {
    console.log('🧪 Testing user table module...');
    console.log('🧪 userTableManager:', userTableManager);
    if (userTableManager) {
        console.log('🧪 UserTableManager exists and is initialized');
        return true;
    } else {
        console.log('🧪 UserTableManager is not initialized');
        return false;
    }
}

/**
 * Global functions to maintain compatibility with existing HTML
 */
function openUserManagementModal() {
    console.log('🚀 openUserManagementModal called');
    if (userTableManager) {
        console.log('✅ userTableManager exists, calling openModal()');
        userTableManager.openModal();
    } else {
        console.error('❌ userTableManager not initialized!');
    }
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

function saveModalTableToJson() {
    if (userTableManager) {
        userTableManager.saveTableToJson();
    }
}

function importCSV() {
    if (userTableManager) {
        userTableManager.importFromCSV();
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', initUserTable);