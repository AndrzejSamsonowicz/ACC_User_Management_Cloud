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
        // Shift+hover drag-to-fill state (for filling cells)
        this.isDragging = false;
        this.dragSourceCell = null;
        this.dragSourceValue = null;
        this.draggedCells = new Set();
        // Mouse-based multi-select state (for copy/paste)
        this.isMouseSelecting = false;
        this.mouseSelectStart = null;
        this.selectedCells = new Set();
        this.lastSelectedCell = null;
        this.isBulkOperation = false; // Flag to prevent auto-toggle logic during shift-select
        // Hub tracking for modal
        this.modalHubId = null;
        this.modalHubName = null;
        // Project tracking for modal
        this.modalProjectId = null;
        this.modalProjectName = null;
        // Copy/paste state
        this.copiedData = null;
        this.copiedRange = null;
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

    /**
     * Setup drag-to-fill listeners (Excel-like cell filling)
     */
    setupDragToFillListeners() {
        const tbody = document.getElementById(this.tableBodyId);
        
        // Track Shift key state
        let shiftPressed = false;
        
        // Listen for Shift key press/release globally
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Shift') {
                shiftPressed = true;
            }
        });
        
        document.addEventListener('keyup', (e) => {
            if (e.key === 'Shift') {
                shiftPressed = false;
                
                // If we were dragging, fill the cells before clearing
                if (this.isDragging && this.draggedCells.size > 1) {
                    log(`🖱️ Shift released, filling ${this.draggedCells.size} cells`);
                    
                    // Fill all dragged cells with source value
                    this.draggedCells.forEach(cell => {
                        if (cell !== this.dragSourceCell) {
                            // Skip toggle cells - they should not be filled with text content
                            if (cell.classList.contains('modal-access-cell')) {
                                cell.style.backgroundColor = ''; // Clear highlight
                                return;
                            }
                            
                            // Check if dragging to email column - validate format
                            if (cell.cellIndex === 1) { // Email column (index 1 after checkbox)
                                if (!this.emailRegex.test(this.dragSourceValue)) {
                                    log(`❌ Cannot drag non-email "${this.dragSourceValue}" to email column`);
                                    cell.style.backgroundColor = ''; // Clear highlight
                                    return; // Skip this cell
                                }
                            }
                            
                            // Remove highlight
                            cell.style.backgroundColor = '';
                            
                            // Fill with source value
                            const oldValue = cell.textContent.trim();
                            cell.textContent = this.dragSourceValue;
                            
                            log(`✏️ Filled cell: "${oldValue}" → "${this.dragSourceValue}"`);
                        }
                    });
                    
                    // Re-check duplicates if email column was modified
                    this.recheckDuplicates();
                    this.updateUserCount();
                    
                    log('🖱️ Drag fill completed!');
                }
                
                // Clear drag state when Shift is released
                this.isDragging = false;
                this.dragSourceCell = null;
                this.dragSourceValue = null;
                // Clear yellow highlights
                this.draggedCells.forEach(cell => {
                    cell.style.backgroundColor = '';
                });
                this.draggedCells.clear();
            }
        });
        
        // Use mousemove to detect hovering with Shift pressed
        tbody.addEventListener('mousemove', (e) => {
            const currentCell = e.target.closest('td');
            if (!currentCell) return;
            
            // Skip checkbox cells
            if (currentCell.cellIndex === 0 || e.target.type === 'checkbox') {
                return;
            }
            
            // Only work when Shift key is pressed
            if (!shiftPressed) return;
            
            // Skip toggle cells - they have their own drag propagation mechanism
            if (currentCell.classList.contains('modal-access-cell')) return;
            
            // If we don't have a source cell yet, set it
            if (!this.dragSourceCell) {
                this.dragSourceCell = currentCell;
                this.dragSourceValue = currentCell.textContent.trim();
                this.draggedCells.clear();
                this.draggedCells.add(currentCell);
                // Highlight the first cell immediately
                currentCell.style.backgroundColor = '#b3d9ff';
                log('🖱️ Source cell set (Shift hover):', this.dragSourceValue);
                return;
            }
            
            // Activate dragging mode on first move to different cell
            if (!this.isDragging && currentCell !== this.dragSourceCell) {
                this.isDragging = true;
                log('🖱️ Drag activated, started from cell:', this.dragSourceValue);
            }
            
            // Skip checkbox cells
            if (currentCell.cellIndex === 0) return;
            
            const sourceRow = this.dragSourceCell.parentElement;
            const targetRow = currentCell.parentElement;
            const sourceColIndex = this.dragSourceCell.cellIndex;
            const targetColIndex = currentCell.cellIndex;
            
            // Check if dragging vertically (same column) or horizontally (same row)
            const isVertical = sourceColIndex === targetColIndex;
            const isHorizontal = sourceRow === targetRow;
            
            if (isVertical || isHorizontal) {
                // Clear previous highlights except source cell
                this.draggedCells.forEach(cell => {
                    if (cell !== this.dragSourceCell) {
                        cell.style.backgroundColor = '';
                    }
                });
                this.draggedCells.clear();
                this.draggedCells.add(this.dragSourceCell);
                
                // Highlight all cells between source and current (inclusive)
                const tbody = document.getElementById(this.tableBodyId);
                const allRows = Array.from(tbody.rows);
                
                if (isVertical) {
                    // Vertical selection - fill all cells in column between source and current
                    const minRowIndex = Math.min(allRows.indexOf(sourceRow), allRows.indexOf(targetRow));
                    const maxRowIndex = Math.max(allRows.indexOf(sourceRow), allRows.indexOf(targetRow));
                    
                    for (let i = minRowIndex; i <= maxRowIndex; i++) {
                        const cell = allRows[i].cells[sourceColIndex];
                        if (cell && cell.cellIndex !== 0) {
                            this.draggedCells.add(cell);
                            cell.style.backgroundColor = '#b3d9ff';
                        }
                    }
                } else if (isHorizontal) {
                    // Horizontal selection - fill all cells in row between source and current
                    const minColIndex = Math.min(sourceColIndex, targetColIndex);
                    const maxColIndex = Math.max(sourceColIndex, targetColIndex);
                    
                    for (let i = minColIndex; i <= maxColIndex; i++) {
                        const cell = sourceRow.cells[i];
                        if (cell && cell.cellIndex !== 0) {
                            this.draggedCells.add(cell);
                            cell.style.backgroundColor = '#b3d9ff';
                        }
                    }
                }
                
                log(`🖱️ Highlighting ${this.draggedCells.size} cells (${isVertical ? 'vertical' : 'horizontal'})`);
            }
        });
    }

    /**
     * Setup mouse-based multi-cell selection (for copy/paste)
     */
    setupMouseSelectionListeners() {
        // Click outside table to deselect
        document.addEventListener('mousedown', (e) => {
            const table = document.getElementById('modalUserTable');
            const clickedInsideTable = table && table.contains(e.target);
            
            // If click is outside the table and we have selections, clear them
            if (!clickedInsideTable && this.selectedCells.size > 0) {
                this.selectedCells.forEach(c => {
                    c.classList.remove('selected');
                });
                this.selectedCells.clear();
                this.lastSelectedCell = null;
                log('🖱️ Selection cleared (clicked outside table)');
            }
        });
    }

    /**
     * Setup copy/paste listeners (Ctrl+C / Ctrl+V)
     */
    setupCopyPasteListeners() {
        document.addEventListener('keydown', (e) => {
            // Check if Ctrl+C (Copy)
            if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
                if (this.selectedCells.size > 0) {
                    e.preventDefault();
                    this.copySelectedCells();
                }
            }
            
            // Check if Ctrl+V (Paste)
            if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
                if (this.selectedCells.size > 0) {
                    e.preventDefault();
                    this.pasteToSelectedCells();
                }
            }
            
            // Check if Delete key
            if (e.key === 'Delete' || e.key === 'Del') {
                if (this.selectedCells.size > 0) {
                    e.preventDefault();
                    this.deleteSelectedCells();
                }
            }
        });
    }

    /**
     * Delete selected cells (clear content)
     */
    deleteSelectedCells() {
        if (this.selectedCells.size === 0) return;
        
        const table = document.getElementById('modalUserTable');
        const headers = Array.from(table.querySelectorAll('thead th'));
        
        this.selectedCells.forEach(cell => {
            const columnHeader = headers[cell.cellIndex]?.textContent.trim().toLowerCase();
            
            // Skip email column to avoid creating empty emails
            if (columnHeader !== 'email') {
                cell.textContent = '';
                
                // Visual feedback
                cell.style.backgroundColor = '#ffcccc';
                setTimeout(() => {
                    cell.style.backgroundColor = '#d4edff';
                }, 200);
            } else {
                log('⚠️ Cannot delete email column content');
            }
        });
        
        log(`🗑️ Deleted content from ${this.selectedCells.size} cells`);
        this.updateUserCount();
    }

    /**
     * Copy selected cells to clipboard
     */
    copySelectedCells() {
        if (this.selectedCells.size === 0) return;
        
        const cells = Array.from(this.selectedCells);
        const tbody = document.getElementById(this.tableBodyId);
        const allRows = Array.from(tbody.rows);
        
        // Determine if vertical or horizontal selection
        const firstCell = cells[0];
        const sourceRow = firstCell.parentElement;
        const sourceColIndex = firstCell.cellIndex;
        
        // Check if all cells are in same column (vertical) or same row (horizontal)
        const isVertical = cells.every(cell => cell.cellIndex === sourceColIndex);
        const isHorizontal = cells.every(cell => cell.parentElement === sourceRow);
        
        if (!isVertical && !isHorizontal) {
            log('⚠️ Cannot copy non-linear selection');
            return;
        }
        
        // Store the copied data
        this.copiedData = cells.map(cell => ({
            value: cell.textContent.trim(),
            columnIndex: cell.cellIndex
        }));
        
        this.copiedRange = {
            isVertical,
            isHorizontal,
            columnIndex: sourceColIndex,
            length: cells.length
        };
        
        // Also copy to system clipboard for external paste
        const textToCopy = cells.map(cell => cell.textContent.trim()).join('\n');
        navigator.clipboard.writeText(textToCopy).then(() => {
            log(`📋 Copied ${cells.length} cells to clipboard (${isVertical ? 'vertical' : 'horizontal'})`);
        }).catch(err => {
            log('⚠️ Failed to copy to system clipboard:', err);
        });
    }

    /**
     * Delete selected cells (clear content)
     */
    deleteSelectedCells() {
        if (this.selectedCells.size === 0) return;
        
        const table = document.getElementById('modalUserTable');
        const headers = Array.from(table.querySelectorAll('thead th'));
        
        this.selectedCells.forEach(cell => {
            const columnHeader = headers[cell.cellIndex]?.textContent.trim().toLowerCase();
            
            // Allow deleting all cells including email
            cell.textContent = '';
            
            // Visual feedback
            cell.style.backgroundColor = '#ffcccc';
            setTimeout(() => {
                cell.style.backgroundColor = '#d4edff';
            }, 200);
        });
        
        log(`🗑️ Deleted content from ${this.selectedCells.size} cells`);
        this.recheckDuplicates();
        this.updateUserCount();
    }

    /**
     * Paste copied cells to selected range
     * IMPROVED: Always paste multi-line clipboard data vertically, even from single cell selection
     */
    async pasteToSelectedCells() {
        if (this.selectedCells.size === 0) return;
        
        // Try to get data from system clipboard (silently fail if permission denied)
        let externalData = null;
        try {
            // Use clipboard API without triggering permission prompt
            const clipboardText = await navigator.clipboard.readText();
            if (clipboardText) {
                // Split by newlines (keep empty lines to preserve structure)
                externalData = clipboardText.split(/\r?\n/);
                // Only filter out the very last empty line if it exists (from trailing newline)
                if (externalData.length > 0 && externalData[externalData.length - 1].trim() === '') {
                    externalData.pop();
                }
                log(`📋 Got ${externalData.length} lines from system clipboard`);
            }
        } catch (err) {
            // Silently ignore clipboard permission errors
            // User can still paste using internal copy or grant permission
            if (err.name !== 'NotAllowedError') {
                log('⚠️ Could not read system clipboard:', err);
            }
        }
        
        // Use external data if available, otherwise use internal copiedData
        const dataSource = externalData || (this.copiedData ? this.copiedData.map(d => d.value) : null);
        
        if (!dataSource) return;
        
        const targetCells = Array.from(this.selectedCells);
        const tbody = document.getElementById(this.tableBodyId);
        const allRows = Array.from(tbody.rows);
        
        // Get the first cell in the target selection
        const firstTargetCell = targetCells[0];
        const targetRow = firstTargetCell.parentElement;
        const targetColIndex = firstTargetCell.cellIndex;
        
        // Get column names to check for email column
        const table = document.getElementById('modalUserTable');
        const headers = Array.from(table.querySelectorAll('thead th'));
        
        // Handle external data (from system clipboard)
        if (externalData) {
            // IMPROVED: Check if clipboard has multiple lines
            const hasMultipleLines = dataSource.length > 1;
            
            // If multiple lines, ALWAYS paste vertically (Excel-like behavior)
            if (hasMultipleLines) {
                const startRowIndex = allRows.indexOf(targetRow);
                let pastedCount = 0;
                
                for (let i = 0; i < dataSource.length && (startRowIndex + i) < allRows.length; i++) {
                    const cell = allRows[startRowIndex + i].cells[targetColIndex];
                    if (cell && cell.cellIndex !== 0) {
                        const columnHeader = headers[targetColIndex]?.textContent.trim().toLowerCase();
                        if (columnHeader !== 'email') {
                            cell.textContent = dataSource[i];
                            pastedCount++;
                        }
                    }
                }
                log(`✅ Pasted ${pastedCount} lines vertically from clipboard`);
                this.updateUserCount();
                return;
            }
            
            // Single line: paste to selected cell(s)
            if (targetCells.length === 1) {
                const cell = targetCells[0];
                if (cell.cellIndex !== 0) {
                    const columnHeader = headers[targetColIndex]?.textContent.trim().toLowerCase();
                    if (columnHeader !== 'email') {
                        cell.textContent = dataSource[0];
                        log('✅ Pasted single value from clipboard');
                    }
                }
                this.updateUserCount();
                return;
            }
            
            // Multiple cells selected: fill all selected cells with the single value
            targetCells.forEach(cell => {
                if (cell.cellIndex !== 0) {
                    const colIndex = cell.cellIndex;
                    const columnHeader = headers[colIndex]?.textContent.trim().toLowerCase();
                    if (columnHeader !== 'email') {
                        cell.textContent = dataSource[0];
                    }
                }
            });
            
            log(`✅ Pasted to ${targetCells.length} selected cells`);
            this.updateUserCount();
            return;
        }
        
        // Handle internal data (from copiedData with orientation check)
        if (!this.copiedData || !this.copiedRange) return;
        
        if (targetIsVertical && this.copiedRange.isVertical) {
            // Vertical paste - paste down column
            const startRowIndex = allRows.indexOf(targetRow);
            
            for (let i = 0; i < this.copiedData.length && (startRowIndex + i) < allRows.length; i++) {
                const cell = allRows[startRowIndex + i].cells[targetColIndex];
                if (cell && cell.cellIndex !== 0) {
                    const columnHeader = headers[targetColIndex]?.textContent.trim().toLowerCase();
                    
                    // Skip email column to avoid duplication
                    if (columnHeader !== 'email') {
                        const oldValue = cell.textContent.trim();
                        cell.textContent = this.copiedData[i].value;
                        
                        log(`📝 Pasted "${this.copiedData[i].value}" to cell (was: "${oldValue}")`);
                    } else {
                        log('⚠️ Skipped email column to avoid duplication');
                    }
                }
            }
        } else if (targetIsHorizontal && this.copiedRange.isHorizontal) {
            // Horizontal paste - paste across row
            const startColIndex = targetColIndex;
            
            for (let i = 0; i < this.copiedData.length; i++) {
                const colIndex = startColIndex + i;
                const cell = targetRow.cells[colIndex];
                
                if (cell && cell.cellIndex !== 0 && colIndex < targetRow.cells.length) {
                    const columnHeader = headers[colIndex]?.textContent.trim().toLowerCase();
                    
                    // Skip email column to avoid duplication
                    if (columnHeader !== 'email') {
                        const oldValue = cell.textContent.trim();
                        cell.textContent = this.copiedData[i].value;
                        
                        log(`📝 Pasted "${this.copiedData[i].value}" to cell (was: "${oldValue}")`);
                    } else {
                        log('⚠️ Skipped email column to avoid duplication');
                    }
                }
            }
        } else {
            log('⚠️ Copy/paste orientation mismatch (vertical vs horizontal)');
        }
        
        this.updateUserCount();
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
        log(`🔃 Sorting column ${columnIndex}`);
        
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
        
        log(`✅ Sorted column ${columnIndex} ${ascending ? 'ascending' : 'descending'}`);
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
    openModal(projectId, projectName) {
        log('🎯 openModal() called with projectId:', projectId, 'projectName:', projectName);
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
        
        modal.style.display = 'block';
        log('🎯 Calling loadTableData()...');
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
        
        // Access level cells (Insight hidden from UI, but included in JSON with access='member')
        const accessColumns = [
            'Project Admin', 'Docs', 
            'Design Collaboration', 'Model Coordination',
            'Preconstruction', 'Build', 'Cost', 'Forma'
        ];
        
        accessColumns.forEach((columnName, index) => {
            const cell = this.createAccessCell(columnName, index + 4, tbody.children.length);
            row.appendChild(cell);
        });
        
        tbody.appendChild(row);
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
        
        // Access level cells (Insight hidden from UI, but included in JSON with access='member')
        const accessColumns = [
            'Project Admin', 'Docs', 
            'Design Collaboration', 'Model Coordination',
            'Preconstruction', 'Build', 'Cost', 'Forma'
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
        } else if (columnName === 'Insight' || columnName === 'Docs') {
            defaultValue = 'member';
        } else if (columnName === 'Design Collaboration' || 
                   columnName === 'Model Coordination' || 
                   columnName === 'Build' || 
                   columnName === 'Cost' || 
                   columnName === 'Forma' ||
                   columnName === 'Preconstruction') {
            defaultValue = 'none';
        } else {
            // Default fallback
            defaultValue = 'member';
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
        } else if (columnName === 'Docs') {
            return value === 'administrator';
        } else {
            // Other products: checked = member or administrator
            return value === 'member' || value === 'administrator';
        }
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
        } else if (columnName === 'Docs') {
            newValue = isChecked ? 'administrator' : 'member';
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
                        if (otherColumnName === 'Docs') {
                            otherNewValue = 'member';
                        } else {
                            otherNewValue = 'none';
                        }
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
                        if (otherColumnName === 'Project Admin') {
                            otherNewValue = 'none';
                        } else if (otherColumnName === 'Docs') {
                            otherNewValue = 'member';
                        } else {
                            otherNewValue = 'none';
                        }
                        
                        otherCell.setAttribute('data-value', otherNewValue);
                        otherCell.classList.remove('administrator');
                        
                        log(`🔻 Auto-downgraded: ${otherColumnName} = ${otherNewValue}`);
                    }
                });
            }
        }
    }

    /**
     * Handle shift-click based cell selection (similar to folders table)
     */
    handleShiftClickSelection(cell, shiftPressed, ctrlPressed) {
        // Skip checkbox column
        if (cell.cellIndex === 0) return;
        
        log(`🖱️ handleShiftClickSelection called: cellIndex=${cell.cellIndex}, shift=${shiftPressed}, ctrl=${ctrlPressed}`);
        
        // Set bulk operation flag to prevent auto-toggle interference
        this.isBulkOperation = true;
        
        const row = cell.parentElement;
        const cellIndex = cell.cellIndex;
        const tbody = row.parentElement;
        const rowIndex = Array.from(tbody.rows).indexOf(row);
        
        // Determine what type of cell this is
        const isToggleCell = cell.classList.contains('modal-access-cell');
        const isEditableCell = cell.classList.contains('modal-editable');
        
        log(`  📦 Current cell: isToggle=${isToggleCell}, isEditable=${isEditableCell}, columnName="${cell.getAttribute('data-column-name') || 'N/A'}"`);
        
        // Get source value/state from clicked cell
        let sourceValue = null;
        let sourceState = null;
        
        if (isToggleCell) {
            const clickedCheckbox = cell.querySelector('input[type="checkbox"]');
            sourceState = clickedCheckbox ? clickedCheckbox.checked : false;
            log(`  🔘 Source toggle state: ${sourceState}`);
        } else if (isEditableCell) {
            sourceValue = cell.textContent.trim();
            log(`  ✏️ Source text value: "${sourceValue}"`);
        }
        
        if (!shiftPressed && !ctrlPressed) {
            // No modifier key - clear previous selection and select only this cell
            log(`  🎯 Regular click - setting as last selected cell`);
            this.selectedCells.forEach(c => c.classList.remove('selected'));
            this.selectedCells.clear();
            cell.classList.add('selected');
            this.selectedCells.add(cell);
            this.lastSelectedCell = cell;
        } else if (shiftPressed && this.lastSelectedCell) {
            // Shift pressed - select range
            log(`  ⚡ Shift-selection mode: lastSelectedCell exists`);
            
            const lastRow = this.lastSelectedCell.parentElement;
            const lastCellIndex = this.lastSelectedCell.cellIndex;
            const lastRowIndex = Array.from(tbody.rows).indexOf(lastRow);
            
            log(`  📍 Last cell: row=${lastRowIndex}, col=${lastCellIndex}`);
            log(`  📍 Current cell: row=${rowIndex}, col=${cellIndex}`);
            
            // Get source value/state from lastSelectedCell
            const lastIsToggle = this.lastSelectedCell.classList.contains('modal-access-cell');
            const lastIsEditable = this.lastSelectedCell.classList.contains('modal-editable');
            
            log(`  📦 Last cell type: isToggle=${lastIsToggle}, isEditable=${lastIsEditable}, columnName="${this.lastSelectedCell.getAttribute('data-column-name') || 'N/A'}"`);
            
            let lastSourceValue = null;
            let lastSourceState = null;
            
            if (lastIsToggle) {
                const sourceCheckbox = this.lastSelectedCell.querySelector('input[type="checkbox"]');
                lastSourceState = sourceCheckbox ? sourceCheckbox.checked : false;
                log(`  🔘 Last cell toggle state extracted: ${lastSourceState}`);
            } else if (lastIsEditable) {
                lastSourceValue = this.lastSelectedCell.textContent.trim();
                log(`  ✏️ Last cell text value extracted: "${lastSourceValue}"`);
            }
            
            // Clear current selection
            this.selectedCells.forEach(c => c.classList.remove('selected'));
            this.selectedCells.clear();
            
            // Determine selection type
            if (lastRowIndex === rowIndex) {
                // HORIZONTAL selection (same row)
                const startCol = Math.min(lastCellIndex, cellIndex);
                const endCol = Math.max(lastCellIndex, cellIndex);
                
                log(`🔄 HORIZONTAL selection: cols ${startCol} to ${endCol}, source state: ${lastSourceState}, source value: "${lastSourceValue}"`);
                
                for (let col = startCol; col <= endCol; col++) {
                    if (col > 0 && col < row.cells.length) { // Skip checkbox column
                        const targetCell = row.cells[col];
                        if (targetCell) {
                            const targetColumnName = targetCell.getAttribute('data-column-name') || 'N/A';
                            const oldValue = targetCell.getAttribute('data-value');
                            
                            log(`  📍 Col ${col} - ${targetColumnName}: Processing (current value: ${oldValue})...`);
                            
                            // targetCell.classList.add('selected'); // Disabled: no visual highlighting
                            this.selectedCells.add(targetCell);
                            
                            // Apply value based on cell type
                            if (targetCell.classList.contains('modal-access-cell') && lastSourceState !== null) {
                                // Apply toggle state and manually update data attributes
                                const targetCheckbox = targetCell.querySelector('input[type="checkbox"]');
                                if (targetCheckbox) {
                                    const oldCheckboxState = targetCheckbox.checked;
                                    targetCheckbox.checked = lastSourceState;
                                    
                                    log(`    🔘 Checkbox: ${oldCheckboxState} → ${lastSourceState}`);
                                    
                                    // Manually update cell data-value and class
                                    let newValue;
                                    if (targetColumnName === 'Project Admin') {
                                        newValue = lastSourceState ? 'administrator' : 'none';
                                    } else if (targetColumnName === 'Docs') {
                                        newValue = lastSourceState ? 'administrator' : 'member';
                                    } else {
                                        newValue = lastSourceState ? 'member' : 'none';
                                    }
                                    targetCell.setAttribute('data-value', newValue);
                                    
                                    if (newValue === 'administrator') {
                                        targetCell.classList.add('administrator');
                                    } else {
                                        targetCell.classList.remove('administrator');
                                    }
                                    
                                    log(`    ✅ Updated: data-value="${newValue}", admin class: ${newValue === 'administrator'}`);
                                }
                            } else if (targetCell.classList.contains('modal-editable') && lastSourceValue !== null) {
                                // Apply text value
                                targetCell.textContent = lastSourceValue;
                                // Re-validate if email column
                                if (col === 1) {
                                    this.validateEmail(lastSourceValue, targetCell);
                                }
                            }
                        }
                    }
                }
            } else if (lastCellIndex === cellIndex) {
                // VERTICAL selection (same column)
                const startRow = Math.min(lastRowIndex, rowIndex);
                const endRow = Math.max(lastRowIndex, rowIndex);
                const allRows = Array.from(tbody.rows);
                
                for (let r = startRow; r <= endRow; r++) {
                    const targetRow = allRows[r];
                    if (targetRow && cellIndex < targetRow.cells.length) {
                        const targetCell = targetRow.cells[cellIndex];
                        if (targetCell && cellIndex > 0) { // Skip checkbox column
                            // targetCell.classList.add('selected'); // Disabled: no visual highlighting
                            this.selectedCells.add(targetCell);
                            
                            // Apply value based on cell type
                            if (targetCell.classList.contains('modal-access-cell') && lastSourceState !== null) {
                                // Apply toggle state and manually update data attributes
                                const targetCheckbox = targetCell.querySelector('input[type="checkbox"]');
                                if (targetCheckbox) {
                                    targetCheckbox.checked = lastSourceState;
                                    
                                    // Manually update cell data-value and class
                                    const targetColumnName = targetCell.getAttribute('data-column-name');
                                    let newValue;
                                    if (targetColumnName === 'Project Admin') {
                                        newValue = lastSourceState ? 'administrator' : 'none';
                                    } else if (targetColumnName === 'Docs') {
                                        newValue = lastSourceState ? 'administrator' : 'member';
                                    } else {
                                        newValue = lastSourceState ? 'member' : 'none';
                                    }
                                    targetCell.setAttribute('data-value', newValue);
                                    
                                    if (newValue === 'administrator') {
                                        targetCell.classList.add('administrator');
                                    } else {
                                        targetCell.classList.remove('administrator');
                                    }
                                }
                            } else if (targetCell.classList.contains('modal-editable') && lastSourceValue !== null) {
                                // Apply text value
                                targetCell.textContent = lastSourceValue;
                                // Re-validate if email column
                                if (cellIndex === 1) {
                                    this.validateEmail(lastSourceValue, targetCell);
                                }
                            }
                        }
                    }
                }
            } else {
                // RECTANGULAR selection
                const startRow = Math.min(lastRowIndex, rowIndex);
                const endRow = Math.max(lastRowIndex, rowIndex);
                const startCol = Math.min(lastCellIndex, cellIndex);
                const endCol = Math.max(lastCellIndex, cellIndex);
                const allRows = Array.from(tbody.rows);
                
                for (let r = startRow; r <= endRow; r++) {
                    const targetRow = allRows[r];
                    if (targetRow) {
                        for (let col = startCol; col <= endCol; col++) {
                            if (col > 0 && col < targetRow.cells.length) { // Skip checkbox column
                                const targetCell = targetRow.cells[col];
                                if (targetCell) {
                                    // targetCell.classList.add('selected'); // Disabled: no visual highlighting
                                    this.selectedCells.add(targetCell);
                                    
                                    // Apply value based on cell type
                                    if (targetCell.classList.contains('modal-access-cell') && lastSourceState !== null) {
                                        // Apply toggle state and manually update data attributes
                                        const targetCheckbox = targetCell.querySelector('input[type="checkbox"]');
                                        if (targetCheckbox) {
                                            targetCheckbox.checked = lastSourceState;
                                            
                                            // Manually update cell data-value and class
                                            const targetColumnName = targetCell.getAttribute('data-column-name');
                                            let newValue;
                                            if (targetColumnName === 'Project Admin') {
                                                newValue = lastSourceState ? 'administrator' : 'none';
                                            } else if (targetColumnName === 'Docs') {
                                                newValue = lastSourceState ? 'administrator' : 'member';
                                            } else {
                                                newValue = lastSourceState ? 'member' : 'none';
                                            }
                                            targetCell.setAttribute('data-value', newValue);
                                            
                                            if (newValue === 'administrator') {
                                                targetCell.classList.add('administrator');
                                            } else {
                                                targetCell.classList.remove('administrator');
                                            }
                                        }
                                    } else if (targetCell.classList.contains('modal-editable') && lastSourceValue !== null) {
                                        // Apply text value
                                        targetCell.textContent = lastSourceValue;
                                        // Re-validate if email column
                                        if (col === 1) {
                                            this.validateEmail(lastSourceValue, targetCell);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
            
            log(`✅ Shift-selected ${this.selectedCells.size} cells and applied values`);
            
            // Re-check duplicates and update count after bulk operations
            this.recheckDuplicates();
            this.updateUserCount();
        } else if (shiftPressed && !this.lastSelectedCell) {
            // Shift pressed but no anchor cell yet - treat as regular selection
            log(`⚠️ Shift pressed but no lastSelectedCell anchor - treating as regular selection`);
            this.selectedCells.forEach(c => c.classList.remove('selected'));
            this.selectedCells.clear();
            // cell.classList.add('selected'); // Disabled: no visual highlighting
            this.selectedCells.add(cell);
            this.lastSelectedCell = cell;
        } else if (ctrlPressed) {
            // Ctrl pressed - toggle individual cell in selection
            if (this.selectedCells.has(cell)) {
                cell.classList.remove('selected');
                this.selectedCells.delete(cell);
                if (this.lastSelectedCell === cell) {
                    this.lastSelectedCell = this.selectedCells.size > 0 ? Array.from(this.selectedCells)[this.selectedCells.size - 1] : null;
                }
            } else {
                // cell.classList.add('selected'); // Disabled: no visual highlighting
                this.selectedCells.add(cell);
                this.lastSelectedCell = cell;
            }
        } else {
            // Just select this cell
            // cell.classList.add('selected'); // Disabled: no visual highlighting
            this.selectedCells.add(cell);
            this.lastSelectedCell = cell;
        }
        
        // Clear bulk operation flag
        log(`🏁 Clearing bulk operation flag`);
        this.isBulkOperation = false;
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
     * Insight and Docs become "member", all others become "none"
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
            
            // Docs (column 5) becomes "member"
            if (columnIndex === 5) {
                checkbox.checked = false; // OFF = 'member' for Docs
                cell.setAttribute('data-value', 'member');
                cell.classList.remove('administrator');
                log(`🔓 Downgraded ${this.getColumnName(columnIndex)} to member`);
            } 
            // All other products become "none"
            else {
                checkbox.checked = false; // OFF = 'none' for other products
                cell.setAttribute('data-value', 'none');
                cell.classList.remove('administrator');
                log(`🔓 Downgraded ${this.getColumnName(columnIndex)} to none`);
            }
        });
        
        log('🔓 All access levels downgraded from administrator');
    }

    /**
     * Get column name by index for logging
     */
    getColumnName(columnIndex) {
        const columnNames = {
            4: 'Project Admin',
            5: 'Docs',
            6: 'Design Collaboration',
            7: 'Model Coordination',
            8: 'Preconstruction',
            9: 'Build',
            10: 'Cost',
            11: 'Forma'
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
            
            // Skip rows that don't have enough cells (minimum: checkbox + email + company + role + 8 products = 12 cells)
            // Note: Insight is not shown in UI but always included with access='member' in backend
            if (cells.length < 12) {
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
                const productMapping = [
                    { key: 'projectAdministration', cellIndex: 4 },
                    { key: 'insight', cellIndex: null }, // Not in UI, will be determined based on other products
                    { key: 'docs', cellIndex: 5 },
                    { key: 'designCollaboration', cellIndex: 6 },
                    { key: 'modelCoordination', cellIndex: 7 },
                    { key: 'takeoff', cellIndex: 8 },
                    { key: 'build', cellIndex: 9 },
                    { key: 'cost', cellIndex: 10 },
                    { key: 'forma', cellIndex: 11 }
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
     * Show CSV import modal
     */
    showImportCSVModal() {
        // Remove existing modal if present
        const existingModal = document.getElementById('csvImportModal');
        if (existingModal) {
            existingModal.remove();
        }

        const modalHTML = `
            <div id="csvImportModal" style="position: fixed; z-index: 10000; left: 0; top: 0; width: 100%; height: 100%; background-color: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center;">
                <div style="background-color: white; padding: 30px; border-radius: 8px; width: 500px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                        <h2 style="margin: 0; font-family: 'Artifact Elements', Arial, sans-serif;">Import Users from CSV</h2>
                        <span class="csv-import-modal-close" style="color: #aaa; font-size: 28px; font-weight: bold; cursor: pointer; line-height: 1;">&times;</span>
                    </div>
                    
                    <div style="margin-bottom: 20px;">
                        <p style="margin: 0 0 15px 0; font-family: 'Artifact Elements', Arial, sans-serif; color: #666;">
                            Select a CSV file with one of the following formats:<br>
                            <code style="background: #f5f5f5; padding: 2px 6px; border-radius: 3px;">Email</code><br>
                            <code style="background: #f5f5f5; padding: 2px 6px; border-radius: 3px;">Email;Company</code> or <code style="background: #f5f5f5; padding: 2px 6px; border-radius: 3px;">Email;Role</code><br>
                            <code style="background: #f5f5f5; padding: 2px 6px; border-radius: 3px;">Email;Company;Role</code>
                        </p>
                        
                        <input type="file" id="csvFileInputModal" accept=".csv" style="width: 100%; padding: 10px; border: 2px dashed #0696D7; border-radius: 4px; font-family: 'Artifact Elements', Arial, sans-serif; cursor: pointer;" />
                    </div>
                    
                    <div style="display: flex; gap: 10px; justify-content: space-between;">
                        <button id="downloadSampleBtn" style="padding: 10px 20px; background-color: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer; font-family: 'Artifact Elements', Arial, sans-serif; font-size: 14px;">
                            Download CSV Sample
                        </button>
                        <button id="importCsvBtn" style="padding: 10px 20px; background-color: #0696D7; color: white; border: none; border-radius: 4px; cursor: pointer; font-family: 'Artifact Elements', Arial, sans-serif; font-size: 14px;">
                            Import CSV
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

        // Import CSV file
        importBtn.onclick = () => {
            const file = fileInput.files[0];
            if (!file) {
                alert('Please select a CSV file first');
                return;
            }

            log('📁 Processing CSV file:', file.name);
            
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
        };
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
            
            // Checkbox cell
            const checkboxCell = this.createCheckboxCell();
            row.appendChild(checkboxCell);
            
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
            
            // Access level cells with default values (Insight hidden from UI, but included in JSON with access='member')
            const accessColumns = [
                'Project Admin', 'Docs', 
                'Design Collaboration', 'Model Coordination',
                'Preconstruction', 'Build', 'Cost', 'Forma'
            ];
            
            accessColumns.forEach((columnName, index) => {
                const cell = this.createAccessCell(columnName, index + 4, tbody.children.length);
                row.appendChild(cell);
            });
            
            // CSV IMPORT ENHANCEMENT: Set Docs to 'administrator' by default for imported users
            const docsCell = row.cells[5]; // Column 5 is Docs (0=checkbox, 1=email, 2=company, 3=role, 4=Project Admin, 5=Docs)
            if (docsCell && docsCell.classList.contains('modal-access-cell')) {
                docsCell.setAttribute('data-value', 'administrator');
                docsCell.classList.add('administrator');
                const checkbox = docsCell.querySelector('input[type="checkbox"]');
                if (checkbox) {
                    checkbox.checked = true; // Check the toggle for administrator
                }
                log(`✅ CSV Import: Set Docs to 'administrator' for ${userData.email}`);
            }
            
            tbody.appendChild(row);
        });
        
        this.updateUserCount();
        
        // Show success message
        const message = errorCount > 0 ? 
            `✓ Imported ${validCount} users (${errorCount} errors)` : 
            `✓ Successfully imported ${validCount} users`;
        
        this.showTooltip(document.querySelector('button[onclick="importCSV()"]'), message);
        
        log('🎉 CSV import completed!');
    }

    /**
     * Load table data from server
     */
    async loadTableData() {
        log('📊 loadTableData() called');
        
        // Check if we have a project ID
        if (!this.modalProjectId) {
            console.error('❌ No project ID available for loading data');
            alert('Error: No project selected');
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
                'docs': 'Docs',
                'designCollaboration': 'Design Collaboration',
                'modelCoordination': 'Model Coordination',
                'build': 'Build',
                'cost': 'Cost',
                'forma': 'Forma',
                'takeoff': 'Preconstruction'
            };
            
            // Column order for UI display (Insight hidden but kept in backend)
            const columnOrder = [
                'Project Admin', 'Docs', 
                'Design Collaboration', 'Model Coordination',
                'Preconstruction', 'Build', 'Cost', 'Forma'
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

// ============================================================================
// IMPORT FROM OTHER PROJECT FUNCTIONALITY
// ============================================================================

let importProjectModal = null;
let selectedProjectUsers = [];
let importModalState = {
    selectedHubId: null,
    selectedHubName: null,
    selectedProjectId: null,
    selectedProjectName: null,
    allUsers: []
};

/**
 * Open the Import From Other Project modal
 */
function openImportFromProjectModal() {
    log('📥 Opening Import From Other Project modal');
    
    if (!importProjectModal) {
        createImportProjectModal();
    }
    
    // Reset state completely
    selectedProjectUsers = [];
    importModalState = {
        selectedHubId: null,
        selectedHubName: null,
        selectedProjectId: null,
        selectedProjectName: null,
        allUsers: []
    };
    
    // Clear projects and users lists (hubs will be reloaded)
    const projectsList = document.getElementById('importProjectsList');
    const usersList = document.getElementById('importUsersList');
    const hubsFilter = document.getElementById('importHubsFilter');
    const projectsFilter = document.getElementById('importProjectsFilter');
    
    if (projectsList) {
        projectsList.innerHTML = '<div style="text-align: center; padding: 20px; color: #999;">Select a hub first</div>';
    }
    
    if (usersList) {
        usersList.innerHTML = '<div style="text-align: center; padding: 40px; color: #999;">Select a project to view users</div>';
    }
    
    // Clear filter inputs
    if (hubsFilter) {
        hubsFilter.value = '';
    }
    
    if (projectsFilter) {
        projectsFilter.value = '';
    }
    
    importProjectModal.style.display = 'block';
    loadHubsForImport();
}

/**
 * Create the Import From Other Project modal
 */
function createImportProjectModal() {
    const modalHTML = `
        <div id="importProjectModal" class="import-project-modal" style="display: none;">
            <div class="import-project-modal-content">
                <div class="import-project-modal-header">
                    <h3>Import Users From Other Project</h3>
                    <span class="import-project-modal-close" onclick="closeImportProjectModal()">&times;</span>
                </div>
                <div class="import-project-modal-body">
                    <div class="import-project-split">
                        <!-- Left Column: Hubs and Projects -->
                        <div class="import-project-left">
                            <!-- Hubs Section (1/3 height) -->
                            <div class="import-hubs-section">
                                <h4>Select Hub</h4>
                                <input type="text" id="importHubsFilter" placeholder="Filter hubs..." class="import-filter-input" oninput="filterImportHubs()" />
                                <div id="importHubsList" class="import-list">
                                    <div style="text-align: center; padding: 20px; color: #666;">Loading hubs...</div>
                                </div>
                            </div>
                            
                            <!-- Projects Section (2/3 height) -->
                            <div class="import-projects-section">
                                <h4>Select Project</h4>
                                <input type="text" id="importProjectsFilter" placeholder="Filter projects..." class="import-filter-input" oninput="filterImportProjects()" />
                                <div id="importProjectsList" class="import-list">
                                    <div style="text-align: center; padding: 20px; color: #999;">Select a hub first</div>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Right Column: Project Users -->
                        <div class="import-project-right">
                            <div class="import-users-header">
                                <h4>Project Users</h4>
                                <div class="import-users-actions">
                                    <span style="font-size: 12px; color: #666; margin-right: 10px; font-style: italic;">💡 Press Shift to select multiple users</span>
                                    <button onclick="checkAllImportUsers()" class="import-btn-small">Check All</button>
                                    <button onclick="uncheckAllImportUsers()" class="import-btn-small">Uncheck All</button>
                                    <button onclick="importSelectedUsers()" class="import-btn-primary">Import Selected</button>
                                </div>
                            </div>
                            <div id="importUsersList" class="import-users-table-container">
                                <div style="text-align: center; padding: 40px; color: #999;">Select a project to view users</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    const styles = `
        <style>
            .import-project-modal {
                position: fixed;
                z-index: 4000;
                left: 0;
                top: 0;
                width: 100%;
                height: 100%;
                background-color: rgba(0,0,0,0.5);
                font-family: 'Artifact Elements', Arial, sans-serif;
            }
            
            .import-project-modal-content {
                background-color: #fefefe;
                margin: 2% auto;
                border: 1px solid #888;
                width: 95%;
                max-width: 1680px;
                height: 90vh;
                border-radius: 8px;
                box-shadow: 0 4px 8px rgba(0,0,0,0.1);
                display: flex;
                flex-direction: column;
            }
            
            .import-project-modal-header {
                padding: 15px 20px;
                background-color: #f8f9fa;
                border-bottom: 1px solid #ddd;
                border-radius: 8px 8px 0 0;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            
            .import-project-modal-header h3 {
                margin: 0;
                color: #333;
                font-size: 18px;
            }
            
            .import-project-modal-close {
                color: #aaa;
                font-size: 28px;
                font-weight: bold;
                cursor: pointer;
                line-height: 1;
            }
            
            .import-project-modal-close:hover,
            .import-project-modal-close:focus {
                color: #000;
            }
            
            .import-project-modal-body {
                flex: 1;
                overflow: hidden;
                padding: 20px;
            }
            
            .import-project-split {
                display: flex;
                gap: 20px;
                height: 100%;
            }
            
            .import-project-left {
                width: 30%;
                display: flex;
                flex-direction: column;
                gap: 15px;
            }
            
            .import-hubs-section {
                height: 33%;
                display: flex;
                flex-direction: column;
            }
            
            .import-projects-section {
                height: 67%;
                display: flex;
                flex-direction: column;
            }
            
            .import-hubs-section h4,
            .import-projects-section h4 {
                margin: 0 0 8px 0;
                color: #333;
                font-size: 14px;
                font-weight: 600;
            }
            
            .import-filter-input {
                width: 100%;
                padding: 6px 10px;
                margin-bottom: 8px;
                border: 1px solid #ddd;
                border-radius: 4px;
                font-size: 12px;
                box-sizing: border-box;
            }
            
            .import-filter-input:focus {
                outline: none;
                border-color: #0696D7;
            }
            
            .import-list {
                flex: 1;
                overflow-y: auto;
                border: 1px solid #ddd;
                border-radius: 4px;
                background: white;
            }
            
            .import-list-item {
                padding: 10px 12px;
                border-bottom: 1px solid #eee;
                cursor: pointer;
                transition: background-color 0.2s;
                font-size: 13px;
            }
            
            .import-list-item:hover {
                background-color: #f5f5f5;
            }
            
            .import-list-item.selected {
                background-color: #0696D7;
                color: white;
            }
            
            .import-list-item:last-child {
                border-bottom: none;
            }
            
            .import-project-right {
                width: 70%;
                display: flex;
                flex-direction: column;
            }
            
            .import-users-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 10px;
            }
            
            .import-users-header h4 {
                margin: 0;
                color: #333;
                font-size: 14px;
                font-weight: 600;
            }
            
            .import-users-actions {
                display: flex;
                gap: 8px;
                align-items: center;
            }
            
            .import-btn-small {
                padding: 6px 12px;
                font-size: 12px;
                background-color: #6c757d;
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                transition: background-color 0.2s;
            }
            
            .import-btn-small:hover {
                background-color: #5a6268;
            }
            
            .import-btn-primary {
                padding: 6px 16px;
                font-size: 13px;
                background-color: #0696D7;
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-weight: 500;
                transition: background-color 0.2s;
            }
            
            .import-btn-primary:hover {
                background-color: #0580C0;
            }
            
            .import-users-table-container {
                flex: 1;
                overflow-y: auto;
                border: 1px solid #ddd;
                border-radius: 4px;
                background: white;
            }
            
            .import-users-table {
                width: 100%;
                border-collapse: collapse;
                font-size: 12px;
            }
            
            .import-users-table th {
                position: sticky;
                top: 0;
                background-color: #f2f2f2;
                padding: 10px 6px;
                text-align: left;
                border-bottom: 2px solid #ddd;
                font-weight: 600;
                font-size: 10px;
                z-index: 10;
                white-space: normal;
                line-height: 1.2;
                vertical-align: middle;
            }
            
            /* Equal width for all service columns (Project Admin through Forma) */
            .import-users-table th:nth-child(5),
            .import-users-table th:nth-child(6),
            .import-users-table th:nth-child(7),
            .import-users-table th:nth-child(8),
            .import-users-table th:nth-child(9),
            .import-users-table th:nth-child(10),
            .import-users-table th:nth-child(11),
            .import-users-table th:nth-child(12) {
                width: 80px;
                min-width: 80px;
                max-width: 80px;
                text-align: center;
            }
            
            /* Center align service column data cells */
            .import-users-table td:nth-child(5),
            .import-users-table td:nth-child(6),
            .import-users-table td:nth-child(7),
            .import-users-table td:nth-child(8),
            .import-users-table td:nth-child(9),
            .import-users-table td:nth-child(10),
            .import-users-table td:nth-child(11),
            .import-users-table td:nth-child(12) {
                text-align: center;
            }
            
            .import-users-table th:first-child {
                width: 40px;
                text-align: center;
            }
            
            .import-users-table td {
                padding: 8px;
                border-bottom: 1px solid #eee;
            }
            
            .import-users-table tr:hover {
                background-color: #f9f9f9;
            }
            
            .import-users-table tbody tr:last-child td {
                border-bottom: none;
            }
            
            .import-user-checkbox {
                cursor: pointer;
                width: 16px;
                height: 16px;
            }
            
            /* Style for disabled toggles in import modal - 50% smaller */
            .import-users-table .toggle-switch {
                transform: scale(0.5);
                display: inline-block;
            }
            
            .import-users-table .toggle-switch input[type="checkbox"]:disabled + .toggle-slider {
                opacity: 0.7;
                cursor: not-allowed;
            }
        </style>
    `;
    
    document.head.insertAdjacentHTML('beforeend', styles);
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    importProjectModal = document.getElementById('importProjectModal');
    
    // Close on Escape key
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && importProjectModal && importProjectModal.style.display === 'block') {
            closeImportProjectModal();
        }
    });
}

/**
 * Close the Import From Other Project modal
 */
function closeImportProjectModal() {
    if (importProjectModal) {
        importProjectModal.style.display = 'none';
        
        // Reset state
        selectedProjectUsers = [];
        importModalState = {
            selectedHubId: null,
            selectedHubName: null,
            selectedProjectId: null,
            selectedProjectName: null,
            allUsers: []
        };
        
        // Clear and reset UI elements
        const hubsList = document.getElementById('importHubsList');
        const projectsList = document.getElementById('importProjectsList');
        const usersList = document.getElementById('importUsersList');
        const hubsFilter = document.getElementById('importHubsFilter');
        const projectsFilter = document.getElementById('importProjectsFilter');
        
        if (hubsList) {
            hubsList.innerHTML = '<div style="text-align: center; padding: 20px; color: #666;">Loading hubs...</div>';
        }
        
        if (projectsList) {
            projectsList.innerHTML = '<div style="text-align: center; padding: 20px; color: #999;">Select a hub first</div>';
        }
        
        if (usersList) {
            usersList.innerHTML = '<div style="text-align: center; padding: 40px; color: #999;">Select a project to view users</div>';
        }
        
        // Clear filter inputs
        if (hubsFilter) {
            hubsFilter.value = '';
        }
        
        if (projectsFilter) {
            projectsFilter.value = '';
        }
        
        // Reset check all checkbox if it exists
        const checkAllCheckbox = document.getElementById('checkAllImportCheckbox');
        if (checkAllCheckbox) {
            checkAllCheckbox.checked = false;
        }
        
        log('✅ Import modal closed and reset');
    }
}

/**
 * Load hubs for import modal
 */
async function loadHubsForImport() {
    log('📋 Loading hubs for import');
    const hubsList = document.getElementById('importHubsList');
    hubsList.innerHTML = '<div style="text-align: center; padding: 20px; color: #666;">Loading hubs...</div>';
    
    try {
        const accessToken = window.currentAccessToken;
        if (!accessToken) {
            hubsList.innerHTML = '<div style="text-align: center; padding: 20px; color: #dc3545;">No access token available</div>';
            return;
        }
        
        const response = await fetch('https://developer.api.autodesk.com/project/v1/hubs', {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });
        
        if (!response.ok) {
            throw new Error(`Failed to load hubs: ${response.statusText}`);
        }
        
        const hubsData = await response.json();
        const bim360Hubs = hubsData.data.filter(hub => {
            const extensionType = hub.attributes?.extension?.type;
            return extensionType === 'hubs:autodesk.bim360:Account';
        });
        
        if (bim360Hubs.length === 0) {
            hubsList.innerHTML = '<div style="text-align: center; padding: 20px; color: #999;">No BIM 360 hubs found</div>';
            return;
        }
        
        let hubsHTML = '';
        bim360Hubs.forEach(hub => {
            const hubId = hub.id.replace('b.', '');
            const hubName = escapeHtml(hub.attributes.name);
            hubsHTML += `
                <div class="import-list-item" onclick="selectHubForImport('${hubId}', '${hubName.replace(/'/g, "\\'")}', this)">
                    ${hubName}
                </div>
            `;
        });
        
        hubsList.innerHTML = hubsHTML;
        log(`✅ Loaded ${bim360Hubs.length} hubs`);
        
    } catch (error) {
        console.error('Error loading hubs:', error);
        hubsList.innerHTML = `<div style="text-align: center; padding: 20px; color: #dc3545;">Error: ${error.message}</div>`;
    }
}

/**
 * Select hub in import modal
 */
async function selectHubForImport(hubId, hubName, element) {
    log('🏢 Hub selected:', hubId, hubName);
    
    // Update selection state
    importModalState.selectedHubId = hubId;
    importModalState.selectedHubName = hubName;
    importModalState.selectedProjectId = null;
    importModalState.selectedProjectName = null;
    
    // Update UI - highlight selected hub
    document.querySelectorAll('#importHubsList .import-list-item').forEach(item => {
        item.classList.remove('selected');
    });
    element.classList.add('selected');
    
    // Clear users list
    document.getElementById('importUsersList').innerHTML = '<div style="text-align: center; padding: 40px; color: #999;">Select a project to view users</div>';
    
    // Clear projects filter
    const projectsFilter = document.getElementById('importProjectsFilter');
    if (projectsFilter) {
        projectsFilter.value = '';
    }
    
    // Load projects for this hub
    await loadProjectsForImport(hubId);
}

/**
 * Load projects for selected hub
 */
async function loadProjectsForImport(hubId) {
    log('📋 Loading projects for hub:', hubId);
    const projectsList = document.getElementById('importProjectsList');
    projectsList.innerHTML = '<div style="text-align: center; padding: 20px; color: #666;">Loading projects...</div>';
    
    try {
        const accessToken = window.currentAccessToken;
        if (!accessToken) {
            projectsList.innerHTML = '<div style="text-align: center; padding: 20px; color: #dc3545;">No access token available</div>';
            return;
        }
        
        // Fetch all projects with pagination and rate limiting
        let allProjects = [];
        let offset = 0;
        const limit = 100;
        let hasMoreData = true;
        
        while (hasMoreData) {
            // Add small delay between requests to avoid rate limiting (except first request)
            if (offset > 0) {
                await new Promise(resolve => setTimeout(resolve, 300));
            }
            
            const url = `https://developer.api.autodesk.com/project/v1/hubs/b.${hubId}/projects?page[limit]=${limit}&page[offset]=${offset}`;
            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            });
            
            if (!response.ok) {
                throw new Error(`Failed to load projects: ${response.status} ${response.statusText}`);
            }
            
            const data = await response.json();
            allProjects = allProjects.concat(data.data);
            
            if (data.data.length < limit) {
                hasMoreData = false;
            } else {
                offset += limit;
            }
        }
        
        if (allProjects.length === 0) {
            projectsList.innerHTML = '<div style="text-align: center; padding: 20px; color: #999;">No projects found</div>';
            return;
        }
        
        // Sort projects alphabetically
        allProjects.sort((a, b) => a.attributes.name.localeCompare(b.attributes.name));
        
        let projectsHTML = '';
        allProjects.forEach(project => {
            const projectId = project.id.replace('b.', '');
            const projectName = escapeHtml(project.attributes.name);
            projectsHTML += `
                <div class="import-list-item" onclick="selectProjectForImport('${projectId}', '${projectName.replace(/'/g, "\\'")}', this)">
                    ${projectName}
                </div>
            `;
        });
        
        projectsList.innerHTML = projectsHTML;
        log(`✅ Loaded ${allProjects.length} projects`);
        
    } catch (error) {
        console.error('Error loading projects:', error);
        projectsList.innerHTML = `<div style="text-align: center; padding: 20px; color: #dc3545;">Error: ${error.message}</div>`;
    }
}

/**
 * Select project in import modal
 */
async function selectProjectForImport(projectId, projectName, element) {
    log('📁 Project selected:', projectId, projectName);
    
    // Update selection state
    importModalState.selectedProjectId = projectId;
    importModalState.selectedProjectName = projectName;
    
    // Update UI - highlight selected project
    document.querySelectorAll('#importProjectsList .import-list-item').forEach(item => {
        item.classList.remove('selected');
    });
    element.classList.add('selected');
    
    // Load users for this project
    await loadUsersForImport(projectId);
}

/**
 * Load users for selected project
 */
async function loadUsersForImport(projectId) {
    log('👥 Loading users for project:', projectId);
    const usersList = document.getElementById('importUsersList');
    usersList.innerHTML = '<div style="text-align: center; padding: 40px; color: #666;">Loading users...</div>';
    
    try {
        const accessToken = window.currentAccessToken;
        if (!accessToken) {
            usersList.innerHTML = '<div style="text-align: center; padding: 40px; color: #dc3545;">No access token available</div>';
            return;
        }
        
        // Fetch all project users with pagination and rate limiting
        let allUsers = [];
        let offset = 0;
        const limit = 100;
        let hasMoreData = true;
        let pageCount = 0;
        
        while (hasMoreData) {
            pageCount++;
            // Use construction admin API (same as view_project_users.js and manage_project_users.js)
            const queryParams = new URLSearchParams({
                limit: limit.toString(),
                offset: offset.toString()
            });
            const url = `https://developer.api.autodesk.com/construction/admin/v1/projects/${projectId}/users?${queryParams}`;
            
            // Add retry logic with exponential backoff
            let retryCount = 0;
            const maxRetries = 3;
            let success = false;
            let data = null;
            
            while (!success && retryCount < maxRetries) {
                try {
                    // Add delay between requests to avoid rate limiting (except first request)
                    if (offset > 0 || retryCount > 0) {
                        const delay = retryCount > 0 ? Math.pow(2, retryCount) * 1000 : 500; // Exponential backoff or 500ms between pages
                        log(`⏳ Waiting ${delay}ms before request (page ${pageCount}, retry ${retryCount})...`);
                        await new Promise(resolve => setTimeout(resolve, delay));
                    }
                    
                    const response = await fetch(url, {
                        headers: {
                            'Authorization': `Bearer ${accessToken}`
                        }
                    });
                    
                    if (response.status === 429) {
                        // Rate limited - retry with exponential backoff
                        const retryAfter = response.headers.get('Retry-After');
                        const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : Math.pow(2, retryCount + 1) * 1000;
                        log(`⚠️ Rate limited (429). Retrying after ${waitTime}ms...`);
                        retryCount++;
                        continue;
                    }
                    
                    if (!response.ok) {
                        throw new Error(`Failed to load users: ${response.status} ${response.statusText}`);
                    }
                    
                    data = await response.json();
                    success = true;
                    
                } catch (error) {
                    retryCount++;
                    if (retryCount >= maxRetries) {
                        throw error;
                    }
                    log(`⚠️ Request failed, retry ${retryCount}/${maxRetries}: ${error.message}`);
                }
            }
            
            if (!success || !data) {
                throw new Error('Failed to load users after multiple retries');
            }
            
            // The API response has a 'results' array, not a plain array
            if (data.results && data.results.length > 0) {
                allUsers = allUsers.concat(data.results);
                log(`📊 Loaded page ${pageCount}: ${data.results.length} users (total: ${allUsers.length})`);
                
                // Update progress message
                usersList.innerHTML = `<div style="text-align: center; padding: 40px; color: #666;">Loading users... (${allUsers.length} loaded)</div>`;
                
                // Check pagination info to determine if there's more data
                if (data.pagination && data.pagination.totalResults) {
                    const totalResults = data.pagination.totalResults;
                    if (allUsers.length >= totalResults) {
                        hasMoreData = false;
                        log(`✅ Reached total results: ${totalResults}`);
                    } else {
                        offset += limit;
                    }
                } else {
                    // If no pagination info, check if we got less than limit
                    if (data.results.length < limit) {
                        hasMoreData = false;
                        log(`✅ Got fewer results than limit (${data.results.length} < ${limit}), stopping`);
                    } else {
                        offset += limit;
                    }
                }
            } else {
                hasMoreData = false;
                log('✅ No more results, stopping pagination');
            }
        }
        
        if (allUsers.length === 0) {
            usersList.innerHTML = '<div style="text-align: center; padding: 40px; color: #999;">No users found in this project</div>';
            return;
        }
        
        // Sort users by email
        allUsers.sort((a, b) => (a.email || '').localeCompare(b.email || ''));
        
        // Store users in state
        importModalState.allUsers = allUsers;
        
        // Render users table
        renderImportUsersTable(allUsers);
        log(`✅ Successfully loaded ${allUsers.length} users from ${pageCount} page(s)`);
        
    } catch (error) {
        console.error('Error loading users:', error);
        usersList.innerHTML = `<div style="text-align: center; padding: 40px; color: #dc3545;">Error loading users: ${error.message}<br><br>Try selecting the project again.</div>`;
    }
}

/**
 * Render users table with checkboxes
 */
function renderImportUsersTable(users) {
    const usersList = document.getElementById('importUsersList');
    
    let tableHTML = `
        <table class="import-users-table">
            <thead>
                <tr>
                    <th><input type="checkbox" id="checkAllImportCheckbox" onchange="toggleAllImportUsers(this)"></th>
                    <th>Email</th>
                    <th>Company</th>
                    <th>Role</th>
                    <th title="Project Administration">Project Admin</th>
                    <th title="Document Management">Docs</th>
                    <th title="Design Collaboration">Design Collaboration</th>
                    <th title="Model Coordination">Model Coordination</th>
                    <th title="Preconstruction">Preconstruction</th>
                    <th title="Build">Build</th>
                    <th title="Cost Management">Cost</th>
                    <th title="Forma">Forma</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    users.forEach((user, index) => {
        const email = escapeHtml(user.email || '');
        const company = escapeHtml(user.companyName || '');
        
        // Extract role names from roles array (same as view_project_users.js)
        let role = 'N/A';
        if (user.roles && Array.isArray(user.roles) && user.roles.length > 0) {
            role = user.roles.map(r => r.name).join(', ');
        }
        role = escapeHtml(role);
        
        // Get service access from products array (API returns array of {key, access} objects)
        const products = user.products || [];
        const projectAdmin = getServiceAccess(products, 'project_administration');
        const docs = getServiceAccess(products, 'document_management');
        const design = getServiceAccess(products, 'design_collaboration');
        const model = getServiceAccess(products, 'model_coordination');
        const precon = getServiceAccess(products, 'preconstruction');
        const build = getServiceAccess(products, 'build');
        const cost = getServiceAccess(products, 'cost_management');
        const forma = getServiceAccess(products, 'forma');
        
        tableHTML += `
            <tr data-user-index="${index}">
                <td style="text-align: center;">
                    <input type="checkbox" class="import-user-checkbox" data-user-index="${index}" onchange="toggleImportUser(${index}, this)">
                </td>
                <td>${email}</td>
                <td>${company}</td>
                <td>${role}</td>
                <td style="text-align: center;">${renderServiceIndicator(projectAdmin)}</td>
                <td style="text-align: center;">${renderServiceIndicator(docs)}</td>
                <td style="text-align: center;">${renderServiceIndicator(design)}</td>
                <td style="text-align: center;">${renderServiceIndicator(model)}</td>
                <td style="text-align: center;">${renderServiceIndicator(precon)}</td>
                <td style="text-align: center;">${renderServiceIndicator(build)}</td>
                <td style="text-align: center;">${renderServiceIndicator(cost)}</td>
                <td style="text-align: center;">${renderServiceIndicator(forma)}</td>
            </tr>
        `;
    });
    
    tableHTML += `
            </tbody>
        </table>
    `;
    
    usersList.innerHTML = tableHTML;
    
    // Add shift-click support for checkboxes
    setupImportCheckboxShiftClick();
}

/**
 * Get service access level from services/products
 * API returns products as array: [{key: "projectAdministration", access: "administrator"}, ...]
 */
function getServiceAccess(products, serviceKey, userObject = null) {
    if (!products) {
        return 'none';
    }
    
    // Map internal service keys to API product keys
    const keyMapping = {
        'project_administration': 'projectAdministration',
        'document_management': 'docs',
        'design_collaboration': 'designCollaboration',
        'model_coordination': 'modelCoordination',
        'preconstruction': 'preconstruction',
        'build': 'build',
        'cost_management': 'cost',
        'forma': 'forma'
    };
    
    // If products is an array (correct API structure)
    if (Array.isArray(products)) {
        // Map the service key to the API product key
        const apiKey = keyMapping[serviceKey] || serviceKey;
        
        // Find the product with matching key
        const product = products.find(p => p.key === apiKey);
        
        if (product && product.access) {
            return product.access;
        }
        
        return 'none';
    }
    
    // Legacy: Handle object structure (for backward compatibility)
    let service = products[serviceKey];
    
    // Try alternative key formats if not found
    if (!service) {
        const camelKey = serviceKey.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
        service = products[camelKey];
    }
    
    if (!service) {
        return 'none';
    }
    
    // If service has an 'access' property
    if (service.access) {
        return service.access;
    }
    
    // If service is a string (direct access level)
    if (typeof service === 'string') {
        return service;
    }
    
    // If service has 'accessLevel' property
    if (service.accessLevel) {
        return service.accessLevel;
    }
    
    return 'none';
}

/**
 * Render service indicator (toggle switch - read-only)
 */
function renderServiceIndicator(access) {
    const isChecked = (access === 'administrator' || access === 'member');
    return `
        <label class="toggle-switch">
            <input type="checkbox" ${isChecked ? 'checked' : ''} disabled style="cursor: not-allowed;">
            <span class="toggle-slider"></span>
        </label>
    `;
}

/**
 * Setup shift-click logic for import checkboxes
 */
function setupImportCheckboxShiftClick() {
    const checkboxes = document.querySelectorAll('.import-user-checkbox');
    let lastCheckedIndex = null;
    
    checkboxes.forEach((checkbox, currentIndex) => {
        checkbox.addEventListener('click', (e) => {
            if (e.shiftKey && lastCheckedIndex !== null && lastCheckedIndex !== currentIndex) {
                const start = Math.min(lastCheckedIndex, currentIndex);
                const end = Math.max(lastCheckedIndex, currentIndex);
                const checkState = checkbox.checked;
                
                for (let i = start; i <= end; i++) {
                    const targetCheckbox = checkboxes[i];
                    targetCheckbox.checked = checkState;
                    
                    // Update selected users array
                    const userIndex = parseInt(targetCheckbox.dataset.userIndex);
                    if (checkState) {
                        if (!selectedProjectUsers.includes(userIndex)) {
                            selectedProjectUsers.push(userIndex);
                        }
                    } else {
                        const idx = selectedProjectUsers.indexOf(userIndex);
                        if (idx > -1) {
                            selectedProjectUsers.splice(idx, 1);
                        }
                    }
                }
            }
            
            lastCheckedIndex = currentIndex;
        });
    });
}

/**
 * Toggle single import user
 */
function toggleImportUser(index, checkbox) {
    if (checkbox.checked) {
        if (!selectedProjectUsers.includes(index)) {
            selectedProjectUsers.push(index);
        }
    } else {
        const idx = selectedProjectUsers.indexOf(index);
        if (idx > -1) {
            selectedProjectUsers.splice(idx, 1);
        }
    }
    log(`User ${index} toggled, selected count: ${selectedProjectUsers.length}`);
}

/**
 * Toggle all import users
 */
function toggleAllImportUsers(checkbox) {
    const allCheckboxes = document.querySelectorAll('.import-user-checkbox');
    selectedProjectUsers = [];
    
    allCheckboxes.forEach((cb, index) => {
        cb.checked = checkbox.checked;
        if (checkbox.checked) {
            selectedProjectUsers.push(index);
        }
    });
    
    log(`All users toggled: ${checkbox.checked ? 'checked' : 'unchecked'}, count: ${selectedProjectUsers.length}`);
}

/**
 * Check all import users
 */
function checkAllImportUsers() {
    const checkAllCheckbox = document.getElementById('checkAllImportCheckbox');
    if (checkAllCheckbox) {
        checkAllCheckbox.checked = true;
        toggleAllImportUsers(checkAllCheckbox);
    }
}

/**
 * Uncheck all import users
 */
function uncheckAllImportUsers() {
    const checkAllCheckbox = document.getElementById('checkAllImportCheckbox');
    if (checkAllCheckbox) {
        checkAllCheckbox.checked = false;
        toggleAllImportUsers(checkAllCheckbox);
    }
}

/**
 * Filter hubs list
 */
function filterImportHubs() {
    const filterInput = document.getElementById('importHubsFilter');
    const filterText = filterInput ? filterInput.value.toLowerCase() : '';
    const hubsList = document.getElementById('importHubsList');
    const items = hubsList.querySelectorAll('.import-list-item');
    
    items.forEach(item => {
        const text = item.textContent.toLowerCase();
        if (text.includes(filterText)) {
            item.style.display = '';
        } else {
            item.style.display = 'none';
        }
    });
}

/**
 * Filter projects list
 */
function filterImportProjects() {
    const filterInput = document.getElementById('importProjectsFilter');
    const filterText = filterInput ? filterInput.value.toLowerCase() : '';
    const projectsList = document.getElementById('importProjectsList');
    const items = projectsList.querySelectorAll('.import-list-item');
    
    items.forEach(item => {
        const text = item.textContent.toLowerCase();
        if (text.includes(filterText)) {
            item.style.display = '';
        } else {
            item.style.display = 'none';
        }
    });
}

/**
 * Import selected users into main table
 */
function importSelectedUsers() {
    if (selectedProjectUsers.length === 0) {
        alert('Please select at least one user to import.');
        return;
    }
    
    if (!userTableManager) {
        alert('User table manager not initialized.');
        return;
    }
    
    log(`🚀 Importing ${selectedProjectUsers.length} users`);
    
    // Get current emails in the table to check for duplicates
    const tbody = document.getElementById('modalTableBody');
    const existingEmails = new Set();
    Array.from(tbody.rows).forEach(row => {
        const emailCell = row.cells[1]; // Email is column 1
        if (emailCell && emailCell.textContent) {
            existingEmails.add(emailCell.textContent.trim().toLowerCase());
        }
    });
    
    let importedCount = 0;
    let skippedCount = 0;
    const skippedEmails = [];
    
    // Import each selected user
    selectedProjectUsers.forEach(index => {
        const user = importModalState.allUsers[index];
        if (!user) return;
        
        const email = (user.email || '').trim();
        if (!email) return;
        
        // Skip if email already exists
        if (existingEmails.has(email.toLowerCase())) {
            skippedCount++;
            skippedEmails.push(email);
            log(`⚠️ Skipping duplicate email: ${email}`);
            return;
        }
        
        // Create new row
        const row = userTableManager.createNewRow();
        
        // Populate email
        const emailCell = row.cells[1];
        emailCell.textContent = email;
        
        // Populate company
        const companyCell = row.cells[2];
        companyCell.textContent = user.companyName || '';
        
        // Populate role - extract from roles array
        const roleCell = row.cells[3];
        let role = '';
        if (user.roles && Array.isArray(user.roles) && user.roles.length > 0) {
            role = user.roles.map(r => r.name).join(', ');
        }
        roleCell.textContent = role;
        
        // Populate service access (columns 4-11) - products is an array of {key, access} objects
        const products = user.products || [];
        
        // Column 4: Project Admin
        setImportedServiceAccess(row.cells[4], 'Project Admin', getServiceAccess(products, 'project_administration'), 4);
        
        // Column 5: Docs
        setImportedServiceAccess(row.cells[5], 'Docs', getServiceAccess(products, 'document_management'), 5);
        
        // Column 6: Design Collaboration
        setImportedServiceAccess(row.cells[6], 'Design Collaboration', getServiceAccess(products, 'design_collaboration'), 6);
        
        // Column 7: Model Coordination
        setImportedServiceAccess(row.cells[7], 'Model Coordination', getServiceAccess(products, 'model_coordination'), 7);
        
        // Column 8: Preconstruction
        setImportedServiceAccess(row.cells[8], 'Preconstruction', getServiceAccess(products, 'preconstruction'), 8);
        
        // Column 9: Build
        setImportedServiceAccess(row.cells[9], 'Build', getServiceAccess(products, 'build'), 9);
        
        // Column 10: Cost
        setImportedServiceAccess(row.cells[10], 'Cost', getServiceAccess(products, 'cost_management'), 10);
        
        // Column 11: Forma (if exists)
        const formaAccess = getServiceAccess(products, 'forma');
        if (row.cells[11]) {
            setImportedServiceAccess(row.cells[11], 'Forma', formaAccess, 11);
        }
        
        // Add row to table
        tbody.appendChild(row);
        existingEmails.add(email.toLowerCase());
        importedCount++;
    });
    
    // Update table
    userTableManager.updateUserCount();
    userTableManager.recheckDuplicates();
    
    // Show result message
    let message = `✅ Successfully imported ${importedCount} user(s).`;
    if (skippedCount > 0) {
        message += `\n\n⚠️ Skipped ${skippedCount} duplicate email(s):\n${skippedEmails.join('\n')}`;
    }
    alert(message);
    
    // Close modal
    closeImportProjectModal();
    
    log(`✅ Import complete: ${importedCount} imported, ${skippedCount} skipped`);
}

/**
 * Set service access for imported user
 */
function setImportedServiceAccess(cell, columnName, access, columnIndex) {
    if (!cell) return;
    
    // Set data attributes
    cell.setAttribute('data-value', access);
    cell.setAttribute('data-column-name', columnName);
    
    // Determine checkbox state
    const checkbox = cell.querySelector('input[type="checkbox"]');
    if (checkbox) {
        if (columnName === 'Project Admin') {
            checkbox.checked = (access === 'administrator');
        } else {
            checkbox.checked = (access === 'member' || access === 'administrator');
        }
        
        // Update cell classes
        if (access === 'administrator') {
            cell.classList.add('administrator');
        } else {
            cell.classList.remove('administrator');
        }
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', initUserTable);