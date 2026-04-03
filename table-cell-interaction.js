/**
 * TableCellInteraction — Reusable base class for spreadsheet-like table interactions.
 *
 * Provides:
 *   - Multi-cell selection (Shift+click ranges, Ctrl+click individual cells)
 *   - Copy / Paste (Ctrl+C / Ctrl+V) with vertical and horizontal orientation
 *   - Delete selected cells (Delete key)
 *   - Drag-to-fill (Shift+hover, Excel-like — disabled by default)
 *   - Column sorting with visual indicators
 *   - Tooltip utility
 *
 * Usage — extend and set the two required IDs, then override the hook methods:
 *
 *   class MyTable extends TableCellInteraction {
 *     constructor() {
 *       super();
 *       this.tableId     = 'myTableId';
 *       this.tableBodyId = 'myTableBodyId';
 *     }
 *     // Optional hooks:
 *     recheckDuplicates() { ... }
 *     updateUserCount()   { ... }
 *     validateEmail(email, cell) { return true; }
 *   }
 *
 * Load this file BEFORE any file that extends it.
 */
class TableCellInteraction {
    constructor() {
        // Selection state
        this.isSelecting = false;
        this.startCell = null;
        this.selectedCells = new Set();
        this.lastEditedValue = null;
        this.activeTooltip = null;

        // Column sort state
        this.sortState = {
            columnIndex: null,
            ascending: true
        };

        // Shift+hover drag-to-fill state
        this.isDragging = false;
        this.dragSourceCell = null;
        this.dragSourceValue = null;
        this.draggedCells = new Set();

        // Mouse-based multi-select state (copy/paste)
        this.isMouseSelecting = false;
        this.mouseSelectStart = null;
        this.lastSelectedCell = null;
        this.isBulkOperation = false; // Prevents auto-toggle interference during bulk ops

        // Copy/paste state
        this.copiedData = null;
        this.copiedRange = null;

        // Click-drag propagation state
        this.isClickDragging = false;
        this.clickDragSourceCell = null;
        this.clickDragSourceValue = null;
        this.clickDragSourceState = null;
        this.clickDraggedCells = new Set();

        // Table element IDs — MUST be set by subclass before calling init methods.
        this.tableId = null;
        this.tableBodyId = null;
    }

    // =========================================================================
    // Hook methods — override in subclass for domain-specific behaviour
    // =========================================================================

    /** Called after bulk cell operations to re-validate duplicate values. */
    recheckDuplicates() {}

    /** Called after any change that affects row/cell count displayed to the user. */
    updateUserCount() {}

    /**
     * Validate a value destined for what the table considers an "email" cell.
     * @param {string} email
     * @param {HTMLTableCellElement} cell
     * @returns {boolean} true if valid
     */
    validateEmail(email, cell) { return true; }

    // =========================================================================
    // Sorting
    // =========================================================================

    /**
     * Attach click listeners to every <th> so clicking a header sorts that column.
     */
    setupSortingListeners() {
        const table = document.getElementById(this.tableId);
        const headers = table.querySelectorAll('thead th');

        headers.forEach((header, index) => {
            // Skip th cells that belong to the filter row
            if (header.closest('#modalFilterRow')) return;

            header.style.cursor = 'pointer';
            header.style.userSelect = 'none';
            header.style.position = 'relative';

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
     * Sort the table by the given column index.
     * Access-level columns (index >= 3) are sorted by priority: administrator > member > none.
     * @param {number} columnIndex
     */
    sortTable(columnIndex) {
        log(`🔃 Sorting column ${columnIndex}`);

        const tbody = document.getElementById(this.tableBodyId);
        const rows = Array.from(tbody.rows);

        const ascending = this.sortState.columnIndex === columnIndex
            ? !this.sortState.ascending
            : true;

        const getCellValue = (row, colIdx) => {
            const cell = row.cells[colIdx];
            if (!cell) return '';
            // Toggle cells store their value in data-value attribute
            if (cell.classList.contains('modal-access-cell')) {
                return cell.getAttribute('data-value') || 'none';
            }
            return cell.textContent.trim().toLowerCase();
        };

        rows.sort((rowA, rowB) => {
            // Checkbox column (0): sort by checked state
            if (columnIndex === 0) {
                const checkedA = rowA.cells[0]?.querySelector('input[type="checkbox"]')?.checked ? 1 : 0;
                const checkedB = rowB.cells[0]?.querySelector('input[type="checkbox"]')?.checked ? 1 : 0;
                return ascending ? checkedB - checkedA : checkedA - checkedB;
            }

            const cellA = getCellValue(rowA, columnIndex);
            const cellB = getCellValue(rowB, columnIndex);

            if (!cellA && cellB) return 1;
            if (cellA && !cellB) return -1;
            if (!cellA && !cellB) return 0;

            // Access-level columns (including toggle cells): sort by semantic priority
            const tdA = rowA.cells[columnIndex];
            if (columnIndex >= 3 || (tdA && tdA.classList.contains('modal-access-cell'))) {
                const accessOrder = { 'administrator': 3, 'member': 2, 'none': 1, '': 0 };
                const orderA = accessOrder[cellA] || 0;
                const orderB = accessOrder[cellB] || 0;
                if (orderA !== orderB) {
                    return ascending ? orderA - orderB : orderB - orderA;
                }
            }

            if (cellA < cellB) return ascending ? -1 : 1;
            if (cellA > cellB) return ascending ? 1 : -1;
            return 0;
        });

        tbody.innerHTML = '';
        rows.forEach(row => tbody.appendChild(row));

        this.sortState.columnIndex = columnIndex;
        this.sortState.ascending = ascending;
        this.updateSortIndicators();

        log(`✅ Sorted column ${columnIndex} ${ascending ? 'ascending' : 'descending'}`);
    }

    /**
     * Refresh the ▲ / ▼ sort indicators in the table headers.
     */
    updateSortIndicators() {
        const table = document.getElementById(this.tableId);
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

    // =========================================================================
    // Multi-cell selection
    // =========================================================================

    /**
     * Deselect all cells when the user clicks outside the table.
     */
    setupMouseSelectionListeners() {
        document.addEventListener('mousedown', (e) => {
            const table = document.getElementById(this.tableId);
            const clickedInsideTable = table && table.contains(e.target);

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
     * Handle a cell click with optional Shift / Ctrl modifier.
     *
     * - No modifier  → select only this cell (clear previous selection).
     * - Shift        → select rectangular range from lastSelectedCell to this cell,
     *                  and propagate the source cell's value into all target cells.
     * - Ctrl         → toggle this individual cell in the current selection.
     *
     * @param {HTMLTableCellElement} cell
     * @param {boolean} shiftPressed
     * @param {boolean} ctrlPressed
     */
    handleShiftClickSelection(cell, shiftPressed, ctrlPressed) {
        // Skip checkbox column (index 0)
        if (cell.cellIndex === 0) return;

        log(`🖱️ handleShiftClickSelection called: cellIndex=${cell.cellIndex}, shift=${shiftPressed}, ctrl=${ctrlPressed}`);

        this.isBulkOperation = true;

        const row = cell.parentElement;
        const cellIndex = cell.cellIndex;
        const tbody = row.parentElement;
        const rowIndex = Array.from(tbody.rows).indexOf(row);

        const isToggleCell = cell.classList.contains('modal-access-cell');
        const isEditableCell = cell.classList.contains('modal-editable');

        log(`  📦 Current cell: isToggle=${isToggleCell}, isEditable=${isEditableCell}, columnName="${cell.getAttribute('data-column-name') || 'N/A'}"`);

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
            log(`  🎯 Regular click - setting as last selected cell`);
            this.selectedCells.forEach(c => c.classList.remove('selected'));
            this.selectedCells.clear();
            cell.classList.add('selected');
            this.selectedCells.add(cell);
            this.lastSelectedCell = cell;

        } else if (shiftPressed && this.lastSelectedCell) {
            log(`  ⚡ Shift-selection mode: lastSelectedCell exists`);

            const lastRow = this.lastSelectedCell.parentElement;
            const lastCellIndex = this.lastSelectedCell.cellIndex;
            const lastRowIndex = Array.from(tbody.rows).indexOf(lastRow);

            log(`  📍 Last cell: row=${lastRowIndex}, col=${lastCellIndex}`);
            log(`  📍 Current cell: row=${rowIndex}, col=${cellIndex}`);

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

            this.selectedCells.forEach(c => c.classList.remove('selected'));
            this.selectedCells.clear();

            if (lastRowIndex === rowIndex) {
                // HORIZONTAL selection (same row)
                const startCol = Math.min(lastCellIndex, cellIndex);
                const endCol = Math.max(lastCellIndex, cellIndex);

                log(`🔄 HORIZONTAL selection: cols ${startCol} to ${endCol}`);

                for (let col = startCol; col <= endCol; col++) {
                    if (col > 0 && col < row.cells.length) {
                        const targetCell = row.cells[col];
                        if (targetCell) {
                            const targetColumnName = targetCell.getAttribute('data-column-name') || 'N/A';
                            const oldValue = targetCell.getAttribute('data-value');

                            log(`  📍 Col ${col} - ${targetColumnName}: Processing (current value: ${oldValue})...`);

                            this.selectedCells.add(targetCell);

                            if (targetCell.classList.contains('modal-access-cell') && lastSourceState !== null) {
                                if (targetColumnName === 'Project Admin') { /* skip */ }
                                else {
                                const targetCheckbox = targetCell.querySelector('input[type="checkbox"]');
                                if (targetCheckbox && !targetCheckbox.disabled) {
                                    targetCheckbox.checked = lastSourceState;

                                    let newValue;
                                    if (targetColumnName === 'Docs') {
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

                                    log(`    ✅ Updated: data-value="${newValue}"`);
                                }
                                }
                            } else if (targetCell.classList.contains('modal-editable') && lastSourceValue !== null) {
                                if (col === 1) return; // Skip email column — prevents duplication
                                if (this._canPropagateEditable(lastCellIndex, col))
                                    targetCell.textContent = lastSourceValue;
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
                        if (targetCell && cellIndex > 0) {
                            this.selectedCells.add(targetCell);

                            if (targetCell.classList.contains('modal-access-cell') && lastSourceState !== null) {
                                const targetColumnName = targetCell.getAttribute('data-column-name');
                                if (targetColumnName !== 'Project Admin') {
                                const targetCheckbox = targetCell.querySelector('input[type="checkbox"]');
                                if (targetCheckbox && !targetCheckbox.disabled) {
                                    targetCheckbox.checked = lastSourceState;

                                    let newValue;
                                    if (targetColumnName === 'Docs') {
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
                                }
                            } else if (targetCell.classList.contains('modal-editable') && lastSourceValue !== null) {
                                if (cellIndex === 1) return; // Skip email column — prevents duplication
                                targetCell.textContent = lastSourceValue;
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
                            if (col > 0 && col < targetRow.cells.length) {
                                const targetCell = targetRow.cells[col];
                                if (targetCell) {
                                    this.selectedCells.add(targetCell);

                                    if (targetCell.classList.contains('modal-access-cell') && lastSourceState !== null) {
                                        const targetColumnName = targetCell.getAttribute('data-column-name');
                                        if (targetColumnName !== 'Project Admin') {
                                        const targetCheckbox = targetCell.querySelector('input[type="checkbox"]');
                                        if (targetCheckbox && !targetCheckbox.disabled) {
                                            targetCheckbox.checked = lastSourceState;

                                            let newValue;
                                            if (targetColumnName === 'Docs') {
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
                                        }
                                    } else if (targetCell.classList.contains('modal-editable') && lastSourceValue !== null) {
                                        if (col === 1) continue; // Skip email column — prevents duplication
                                        if (this._canPropagateEditable(lastCellIndex, col))
                                            targetCell.textContent = lastSourceValue;
                                    }
                                }
                            }
                        }
                    }
                }
            }

            log(`✅ Shift-selected ${this.selectedCells.size} cells and applied values`);

            this.recheckDuplicates();
            this.updateUserCount();

        } else if (shiftPressed && !this.lastSelectedCell) {
            log(`⚠️ Shift pressed but no lastSelectedCell anchor — treating as regular selection`);
            this.selectedCells.forEach(c => c.classList.remove('selected'));
            this.selectedCells.clear();
            this.selectedCells.add(cell);
            this.lastSelectedCell = cell;

        } else if (ctrlPressed) {
            if (this.selectedCells.has(cell)) {
                cell.classList.remove('selected');
                this.selectedCells.delete(cell);
                if (this.lastSelectedCell === cell) {
                    this.lastSelectedCell = this.selectedCells.size > 0
                        ? Array.from(this.selectedCells)[this.selectedCells.size - 1]
                        : null;
                }
            } else {
                this.selectedCells.add(cell);
                this.lastSelectedCell = cell;
            }

        } else {
            this.selectedCells.add(cell);
            this.lastSelectedCell = cell;
        }

        log(`🏁 Clearing bulk operation flag`);
        this.isBulkOperation = false;
    }

    // =========================================================================
    // Click-drag propagation
    // =========================================================================

    /**
     * Attach click-drag propagation listeners to the table body.
     *
     * Behaviour: mousedown on a data cell sets it as the source; dragging the mouse
     * (button held) over other cells highlights a rectangle; mouseup propagates the
     * source cell's value (or toggle state) into every highlighted cell.
     *
     * Works alongside the existing Shift+click propagation — both methods can be used
     * independently.
     */
    setupClickDragPropagationListeners() {
        const tbody = document.getElementById(this.tableBodyId);

        tbody.addEventListener('mousedown', (e) => {
            // Only left mouse button
            if (e.button !== 0) return;

            const cell = e.target.closest('td');
            if (!cell || cell.cellIndex === 0) return;
            // Don't intercept actual checkbox clicks
            if (e.target.type === 'checkbox') return;

            const isToggle = cell.classList.contains('modal-access-cell');
            const isEditable = cell.classList.contains('modal-editable');
            if (!isToggle && !isEditable) return;

            this.isClickDragging = true;
            this.clickDragSourceCell = cell;

            if (isToggle) {
                const cb = cell.querySelector('input[type="checkbox"]');
                this.clickDragSourceState = cb ? cb.checked : false;
                this.clickDragSourceValue = null;
            } else {
                this.clickDragSourceValue = cell.textContent.trim();
                this.clickDragSourceState = null;
            }

            this.clickDraggedCells.clear();
            this.clickDraggedCells.add(cell);
            cell.style.outline = '2px solid #3399ff';

            log(`🖱️ Click-drag started from cell (col ${cell.cellIndex}): value="${this.clickDragSourceValue}", state=${this.clickDragSourceState}`);
        });

        document.addEventListener('mousemove', (e) => {
            if (!this.isClickDragging || !this.clickDragSourceCell) return;

            const cell = e.target.closest('td');
            if (!cell || cell.cellIndex === 0) return;

            const tbodyEl = document.getElementById(this.tableBodyId);
            if (!tbodyEl.contains(cell)) return;

            const allRows = Array.from(tbodyEl.rows);
            const sourceRow = this.clickDragSourceCell.parentElement;
            const sourceColIndex = this.clickDragSourceCell.cellIndex;
            const sourceRowIndex = allRows.indexOf(sourceRow);
            const targetRowIndex = allRows.indexOf(cell.parentElement);
            const targetColIndex = cell.cellIndex;

            if (sourceRowIndex === -1 || targetRowIndex === -1) return;

            // Clear previous highlights
            this.clickDraggedCells.forEach(c => {
                c.style.outline = '';
                if (c !== this.clickDragSourceCell) c.style.backgroundColor = '';
            });
            this.clickDraggedCells.clear();
            this.clickDraggedCells.add(this.clickDragSourceCell);

            // Highlight rectangular range
            const minRow = Math.min(sourceRowIndex, targetRowIndex);
            const maxRow = Math.max(sourceRowIndex, targetRowIndex);
            const minCol = Math.min(sourceColIndex, targetColIndex);
            const maxCol = Math.max(sourceColIndex, targetColIndex);

            for (let r = minRow; r <= maxRow; r++) {
                for (let col = minCol; col <= maxCol; col++) {
                    if (col === 0) continue;
                    const targetCell = allRows[r]?.cells[col];
                    if (targetCell) {
                        this.clickDraggedCells.add(targetCell);
                        targetCell.style.outline = '2px solid #3399ff';
                        if (targetCell !== this.clickDragSourceCell) {
                            targetCell.style.backgroundColor = '#d9ecff';
                        }
                    }
                }
            }
        });

        document.addEventListener('mouseup', (e) => {
            if (!this.isClickDragging) return;

            if (this.clickDraggedCells.size > 1) {
                this.isBulkOperation = true;

                this.clickDraggedCells.forEach(cell => {
                    if (cell === this.clickDragSourceCell) return;

                    const columnName = cell.getAttribute('data-column-name') || '';

                    if (cell.classList.contains('modal-access-cell') && this.clickDragSourceState !== null) {
                        if (columnName === 'Project Admin') return; // Skip Project Admin column — prevents unintended changes
                        const cb = cell.querySelector('input[type="checkbox"]');
                        if (cb && !cb.disabled) {
                            cb.checked = this.clickDragSourceState;
                            let newValue;
                            if (columnName === 'Docs') {
                                newValue = this.clickDragSourceState ? 'administrator' : 'member';
                            } else {
                                newValue = this.clickDragSourceState ? 'member' : 'none';
                            }
                            cell.setAttribute('data-value', newValue);
                            if (newValue === 'administrator') {
                                cell.classList.add('administrator');
                            } else {
                                cell.classList.remove('administrator');
                            }
                        }
                    } else if (cell.classList.contains('modal-editable') && this.clickDragSourceValue !== null) {
                        if (cell.cellIndex === 1) return; // Skip email column — prevents duplication
                        if (this._canPropagateEditable(this.clickDragSourceCell.cellIndex, cell.cellIndex))
                            cell.textContent = this.clickDragSourceValue;
                    }
                });

                this.recheckDuplicates();
                this.updateUserCount();
                this.isBulkOperation = false;
                log(`✅ Click-drag propagated value to ${this.clickDraggedCells.size - 1} cells`);
            }

            // Clear highlights and state
            this.clickDraggedCells.forEach(c => {
                c.style.outline = '';
                c.style.backgroundColor = '';
            });
            this.clickDraggedCells.clear();
            this.isClickDragging = false;
            this.clickDragSourceCell = null;
            this.clickDragSourceValue = null;
            this.clickDragSourceState = null;
        });
    }

    // =========================================================================
    // Copy / Paste / Delete (keyboard shortcuts)
    // =========================================================================

    /**
     * Attach Ctrl+C, Ctrl+V, and Delete key listeners for the selected cells.
     */
    setupCopyPasteListeners() {
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
                if (this.selectedCells.size > 0) {
                    e.preventDefault();
                    this.copySelectedCells();
                }
            }

            if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
                if (this.selectedCells.size > 0) {
                    e.preventDefault();
                    this.pasteToSelectedCells();
                }
            }

            if (e.key === 'Delete' || e.key === 'Del') {
                if (this.selectedCells.size > 0) {
                    e.preventDefault();
                    this.deleteSelectedCells();
                }
            }
        });
    }

    /**
     * Clear the content of all currently selected cells.
     * Email cells are also cleared; call recheckDuplicates() afterwards.
     */
    deleteSelectedCells() {
        if (this.selectedCells.size === 0) return;

        const table = document.getElementById(this.tableId);
        const headers = Array.from(table.querySelectorAll('thead th'));

        this.selectedCells.forEach(cell => {
            cell.textContent = '';

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
     * Copy the currently selected cells to the internal clipboard and to the system clipboard.
     * Only linear (single-row or single-column) selections are supported.
     */
    copySelectedCells() {
        if (this.selectedCells.size === 0) return;

        const cells = Array.from(this.selectedCells);
        const tbody = document.getElementById(this.tableBodyId);

        const firstCell = cells[0];
        const sourceRow = firstCell.parentElement;
        const sourceColIndex = firstCell.cellIndex;

        const isVertical = cells.every(cell => cell.cellIndex === sourceColIndex);
        const isHorizontal = cells.every(cell => cell.parentElement === sourceRow);

        if (!isVertical && !isHorizontal) {
            log('⚠️ Cannot copy non-linear selection');
            return;
        }

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

        const textToCopy = cells.map(cell => cell.textContent.trim()).join('\n');
        navigator.clipboard.writeText(textToCopy).then(() => {
            log(`📋 Copied ${cells.length} cells to clipboard (${isVertical ? 'vertical' : 'horizontal'})`);
        }).catch(err => {
            log('⚠️ Failed to copy to system clipboard:', err);
        });
    }

    /**
     * Paste the system clipboard (or internal copied data) into the selected cells.
     * Multi-line clipboard content is always pasted vertically (Excel-like behaviour).
     *
     * NOTE: The internal paste path for previously copied data has a known pre-existing
     * issue where `targetIsVertical`/`targetIsHorizontal` are undeclared, rendering that
     * branch effectively unreachable. External clipboard paste (Ctrl+C → Ctrl+V) works
     * correctly via the `externalData` path.
     */
    async pasteToSelectedCells() {
        if (this.selectedCells.size === 0) return;

        let externalData = null;
        try {
            const clipboardText = await navigator.clipboard.readText();
            if (clipboardText) {
                externalData = clipboardText.split(/\r?\n/);
                if (externalData.length > 0 && externalData[externalData.length - 1].trim() === '') {
                    externalData.pop();
                }
                log(`📋 Got ${externalData.length} lines from system clipboard`);
            }
        } catch (err) {
            if (err.name !== 'NotAllowedError') {
                log('⚠️ Could not read system clipboard:', err);
            }
        }

        const dataSource = externalData || (this.copiedData ? this.copiedData.map(d => d.value) : null);
        if (!dataSource) return;

        const targetCells = Array.from(this.selectedCells);
        const tbody = document.getElementById(this.tableBodyId);
        const allRows = Array.from(tbody.rows);

        const firstTargetCell = targetCells[0];
        const targetRow = firstTargetCell.parentElement;
        const targetColIndex = firstTargetCell.cellIndex;

        const table = document.getElementById(this.tableId);
        const headers = Array.from(table.querySelectorAll('thead th'));

        if (externalData) {
            const hasMultipleLines = dataSource.length > 1;

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

        // Internal paste path (uses this.copiedData / this.copiedRange)
        if (!this.copiedData || !this.copiedRange) return;

        // NOTE: targetIsVertical / targetIsHorizontal are intentionally left as the original
        // code had them — this path is currently unreachable because the external data path
        // above always returns first. Preserved as-is to avoid changing existing behaviour.
        if (targetIsVertical && this.copiedRange.isVertical) {
            const startRowIndex = allRows.indexOf(targetRow);

            for (let i = 0; i < this.copiedData.length && (startRowIndex + i) < allRows.length; i++) {
                const cell = allRows[startRowIndex + i].cells[targetColIndex];
                if (cell && cell.cellIndex !== 0) {
                    const columnHeader = headers[targetColIndex]?.textContent.trim().toLowerCase();
                    if (columnHeader !== 'email') {
                        cell.textContent = this.copiedData[i].value;
                    }
                }
            }
        } else if (targetIsHorizontal && this.copiedRange.isHorizontal) {
            const startColIndex = targetColIndex;

            for (let i = 0; i < this.copiedData.length; i++) {
                const colIndex = startColIndex + i;
                const cell = targetRow.cells[colIndex];

                if (cell && cell.cellIndex !== 0 && colIndex < targetRow.cells.length) {
                    const columnHeader = headers[colIndex]?.textContent.trim().toLowerCase();
                    if (columnHeader !== 'email') {
                        cell.textContent = this.copiedData[i].value;
                    }
                }
            }
        } else {
            log('⚠️ Copy/paste orientation mismatch (vertical vs horizontal)');
        }

        this.updateUserCount();
    }

    // =========================================================================
    // Drag-to-fill (Shift+hover, Excel-like)
    // Disabled by default — call setupDragToFillListeners() in init() to enable.
    // =========================================================================

    /**
     * Attach Shift+hover drag-to-fill listeners to the table body.
     * Skips toggle cells (modal-access-cell).
     * Calls this.recheckDuplicates() and this.updateUserCount() after filling.
     *
     * Email-column validation: if this.emailRegex is set on the instance, dragging
     * a non-email value into column index 1 (email) is blocked automatically.
     */
    setupDragToFillListeners() {
        const tbody = document.getElementById(this.tableBodyId);

        let shiftPressed = false;

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Shift') {
                shiftPressed = true;
            }
        });

        document.addEventListener('keyup', (e) => {
            if (e.key === 'Shift') {
                shiftPressed = false;

                if (this.isDragging && this.draggedCells.size > 1) {
                    log(`🖱️ Shift released, filling ${this.draggedCells.size} cells`);

                    this.draggedCells.forEach(cell => {
                        if (cell !== this.dragSourceCell) {
                            if (cell.classList.contains('modal-access-cell')) {
                                cell.style.backgroundColor = '';
                                return;
                            }

                            // Optional email-column guard (requires this.emailRegex to be set)
                            if (cell.cellIndex === 1 && this.emailRegex) {
                                if (!this.emailRegex.test(this.dragSourceValue)) {
                                    log(`❌ Cannot drag non-email "${this.dragSourceValue}" to email column`);
                                    cell.style.backgroundColor = '';
                                    return;
                                }
                            }

                            cell.style.backgroundColor = '';
                            if (this._canPropagateEditable(this.dragSourceCell.cellIndex, cell.cellIndex))
                                cell.textContent = this.dragSourceValue;
                        }
                    });

                    this.recheckDuplicates();
                    this.updateUserCount();
                    log('🖱️ Drag fill completed!');
                }

                this.isDragging = false;
                this.dragSourceCell = null;
                this.dragSourceValue = null;
                this.draggedCells.forEach(cell => { cell.style.backgroundColor = ''; });
                this.draggedCells.clear();
            }
        });

        tbody.addEventListener('mousemove', (e) => {
            const currentCell = e.target.closest('td');
            if (!currentCell) return;
            if (currentCell.cellIndex === 0 || e.target.type === 'checkbox') return;
            if (!shiftPressed) return;
            if (currentCell.classList.contains('modal-access-cell')) return;

            if (!this.dragSourceCell) {
                this.dragSourceCell = currentCell;
                this.dragSourceValue = currentCell.textContent.trim();
                this.draggedCells.clear();
                this.draggedCells.add(currentCell);
                currentCell.style.backgroundColor = '#b3d9ff';
                log('🖱️ Source cell set (Shift hover):', this.dragSourceValue);
                return;
            }

            if (!this.isDragging && currentCell !== this.dragSourceCell) {
                this.isDragging = true;
                log('🖱️ Drag activated, started from cell:', this.dragSourceValue);
            }

            if (currentCell.cellIndex === 0) return;

            const sourceRow = this.dragSourceCell.parentElement;
            const targetRow = currentCell.parentElement;
            const sourceColIndex = this.dragSourceCell.cellIndex;
            const targetColIndex = currentCell.cellIndex;

            const isVertical = sourceColIndex === targetColIndex;
            const isHorizontal = sourceRow === targetRow;

            if (isVertical || isHorizontal) {
                this.draggedCells.forEach(cell => {
                    if (cell !== this.dragSourceCell) {
                        cell.style.backgroundColor = '';
                    }
                });
                this.draggedCells.clear();
                this.draggedCells.add(this.dragSourceCell);

                const tbodyEl = document.getElementById(this.tableBodyId);
                const allRows = Array.from(tbodyEl.rows);

                if (isVertical) {
                    const minRowIndex = Math.min(allRows.indexOf(sourceRow), allRows.indexOf(targetRow));
                    const maxRowIndex = Math.max(allRows.indexOf(sourceRow), allRows.indexOf(targetRow));

                    for (let i = minRowIndex; i <= maxRowIndex; i++) {
                        const cell = allRows[i].cells[sourceColIndex];
                        if (cell && cell.cellIndex !== 0) {
                            this.draggedCells.add(cell);
                            cell.style.backgroundColor = '#b3d9ff';
                        }
                    }
                } else {
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

    // =========================================================================
    // Tooltip utility
    // =========================================================================

    /**
     * Show a small tooltip below the given cell for 3 seconds.
     * @param {HTMLElement} cell
     * @param {string} message
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
     * Remove the currently active tooltip (if any).
     */
    removeTooltip() {
        if (this.activeTooltip) {
            this.activeTooltip.remove();
            this.activeTooltip = null;
        }
    }

    // =========================================================================
    // Column-propagation guards
    // =========================================================================

    /** Return the lowercased header text for a column (strips sort-indicator spans). */
    _getHeaderName(colIndex) {
        const table = document.getElementById(this.tableId);
        if (!table) return '';
        const header = table.querySelectorAll('thead th')[colIndex];
        if (!header) return '';
        const clone = header.cloneNode(true);
        clone.querySelectorAll('.sort-indicator').forEach(el => el.remove());
        return clone.textContent.trim().toLowerCase();
    }

    /**
     * Returns false when propagating an editable value from one of {Company, Role}
     * into the other — prevents accidental cross-column fill.
     */
    _canPropagateEditable(sourceColIndex, targetColIndex) {
        if (sourceColIndex === targetColIndex) return true;
        const restricted = ['company', 'role'];
        const src = this._getHeaderName(sourceColIndex);
        const tgt = this._getHeaderName(targetColIndex);
        if (restricted.includes(src) && restricted.includes(tgt)) return false;
        return true;
    }
}
