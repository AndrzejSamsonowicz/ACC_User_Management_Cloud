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
    }

    /**
     * Initialize the user table manager
     */
    init() {
        this.setupEventListeners();
    }

    /**
     * Open the user management modal
     */
    openModal() {
        console.log('🎯 openModal() called in UserTableManager');
        const modal = document.getElementById(this.modalId);
        console.log('🎯 Modal element:', modal);
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
            const cell = this.createAccessCell(columnName, index + 3, tbody.children.length);
            row.appendChild(cell);
        });
        
        tbody.appendChild(row);
        console.log('➕ Row added to table, total rows:', tbody.rows.length);
        this.updateUserCount();
    }

    /**
     * Create a new table row (without appending it to the table)
     */
    createNewRow() {
        console.log('🔧 createNewRow() called');
        const row = document.createElement('tr');
        
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
            const cell = this.createAccessCell(columnName, index + 3, 0); // Use 0 for row index as placeholder
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
            const value = this.validateAccessValue(e.target, e.target.textContent);
            if (value !== false) {
                e.target.textContent = value;
                e.target.classList.toggle('administrator', value === 'administrator');
                
                // If this cell becomes "administrator", upgrade all other access cells in the same row
                if (value === 'administrator') {
                    this.upgradeAllAccessToAdministrator(e.target);
                }
            } else {
                e.target.textContent = e.target.getAttribute('data-previous-value') || 'none';
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
        
        // Find all access level cells in this row (columns 3-11: Project Admin through Take Off)
        const accessCells = Array.from(row.cells).slice(3); // Skip Email (0), Company (1), Role (2)
        
        console.log(`🔐 Upgrading ${accessCells.length} access cells to administrator`);
        
        accessCells.forEach((cell, index) => {
            const currentValue = cell.textContent.trim().toLowerCase();
            const columnIndex = parseInt(cell.getAttribute('data-column'));
            
            // Project Admin (column 3) can only be 'none' or 'administrator'
            if (columnIndex === 3) {
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
     * Get column name by index for logging
     */
    getColumnName(columnIndex) {
        const columnNames = {
            3: 'Project Admin',
            4: 'Insight', 
            5: 'Docs',
            6: 'Design Collaboration',
            7: 'Model Coordination',
            8: 'Build',
            9: 'Cost',
            10: 'Forma',
            11: 'Take Off'
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

        if (columnIndex === 3) { // Project Admin
            allowedValues = this.PROJECT_ADMIN_VALUES;
            errorMessage = 'Invalid value. Project Admin can only be none or administrator';
        } else if (columnIndex === 4) { // Insight
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
        
        // Check if this is an email cell
        if (cell.cellIndex !== 0) {
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
            
            // Check which column we're pasting into
            const isEmailCell = targetCell.cellIndex === 0;
            const isCompanyCell = targetCell.cellIndex === 1;
            const isRoleCell = targetCell.cellIndex === 2;
            
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
            
            emailCell = targetRow.cells[0];
            
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
            const emailCell = row.cells[0];
            return emailCell.textContent.trim() !== '' && 
                   !emailCell.classList.contains('modal-error-cell');
        });
        document.getElementById(this.tableSummaryId).textContent = 
            `Total Users: ${validRows.length}`;
    }

    /**
     * Delete the row containing the currently focused cell
     */
    deleteSelectedRows() {
        console.log('🗑️ deleteSelectedRows() called');
        const tbody = document.getElementById(this.tableBodyId);
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
            // Remove email from tracking if it exists
            const emailCell = rowToDelete.cells[0];
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
            
            this.updateUserCount();
        } else {
            console.log('🗑️ Error: Could not find row to delete');
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
     * Save table data to JSON file
     */
    saveTableToJson() {
        console.log('💾 saveTableToJson() called');
        const tbody = document.getElementById(this.tableBodyId);
        const users = [];
        
        Array.from(tbody.rows).forEach(row => {
            const cells = Array.from(row.cells);
            const email = cells[0].textContent.trim();
            
            if (email) {
                console.log(`💾 Processing user: ${email}`);
                const user = {
                    email: email,
                    metadata: {
                        company: cells[1].textContent.trim(),
                        role: cells[2].textContent.trim()
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
                    const access = cells[index + 3].textContent.trim();
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
        
        // Save to server (user_permissions_import.json)
        fetch('http://localhost:3000/save', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(jsonData)
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                console.log('✅ Data saved to server successfully');
                this.showTooltip(document.querySelector('button[onclick="saveModalTableToJson()"]'), 
                    '✓ Saved to user_permissions_import.json');
            } else {
                console.error('❌ Error saving to server:', data.message);
                this.showTooltip(document.querySelector('button[onclick="saveModalTableToJson()"]'), 
                    '✗ Error saving to server');
            }
        })
        .catch(error => {
            console.error('❌ Network error saving to server:', error);
            this.showTooltip(document.querySelector('button[onclick="saveModalTableToJson()"]'), 
                '✗ Network error saving to server');
        });
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
        fetch('http://localhost:3000/load')
            .then(response => response.json())
            .then(jsonData => {
                console.log('📊 Data loaded from server:', jsonData);
                if (jsonData.users) {
                    console.log('📊 Found users data, calling populateTableFromData');
                    this.populateTableFromData(jsonData.users);
                } else {
                    console.log('📊 No users data, adding default row');
                    this.addRow(); // Add default row if no saved data
                }
            })
            .catch(error => {
                console.error('❌ Error loading modal data:', error);
                console.log('📊 Adding default row due to error');
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
            const row = document.createElement('tr');
            
            // Email cell
            const emailCell = this.createEmailCell();
            emailCell.textContent = user.email;
            if (user.email) {
                this.existingEmails.add(user.email);
            }
            row.appendChild(emailCell);
            
            // Company cell
            const companyCell = this.createEditableCell();
            companyCell.textContent = (user.metadata && user.metadata.company) || '';
            row.appendChild(companyCell);

            // Role cell
            const roleCell = this.createEditableCell();
            roleCell.textContent = (user.metadata && user.metadata.role) || '';
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
                cell.setAttribute('data-column', index + 3);
                
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