# Folder Permissions Table — Logic & Architecture

## Overview

The folder permissions table is a dynamic, multi-level grid that displays ACC project folders as rows and users/roles/companies as columns. Permissions are fetched live from the ACC API, deduplicated, and inherited automatically from parent folders to all descendants at any depth.

---

## Key State Variables

| Variable | Purpose |
|---|---|
| `currentFolderDisplayDepth` | Number of visible folder columns (1-indexed). Reset to `1` on every modal open. |
| `currentHierarchy` | Array of flat hierarchy rows. Each row is an object `{ level2, level3, level4, ... }` where each value is `{ id, name }`. |
| `additionalColumnsCount` | Number of user-permission columns currently rendered. |
| `folderChildrenCache` | Cache of `parentId → [children]` — avoids re-fetching on collapse/re-expand. |

---

## Hierarchy Data Model

Each entry in `currentHierarchy` is a flat row representing one leaf path from root to the deepest visible folder:

```js
{
  level1: { id: "...", name: "Plans" },   // top container (ACC system folder)
  level2: { id: "...", name: "Folder 1" }, // first user folder (depth 0)
  level3: { id: "...", name: "sub folder 1.2" }, // depth 1
  level4: { id: "...", name: "sub folder 1.2.1" } // depth 2
}
```

The helper `levelKeyForDepth(d)` maps display depth `d` → hierarchy key:
- `d=0` → `'level2'`
- `d=1` → `'level3'`
- `d=2` → `'level4'`
- etc.

---

## Table Structure

```
| Folder col 0 | Folder col 1 | ... | Folder col N | User col 1 | User col 2 | ... |
```

- **Folder columns** `0 … currentFolderDisplayDepth-1`: show the folder name at the matching depth; other cells in that row are blank.
- **User columns** start at index `currentFolderDisplayDepth`.
- Each `<tr>` carries data attributes: `data-folder-id`, `data-folder-depth`, `data-parent-id`, `data-level1-id`, `data-level2-id`.

### Column Header Buttons

| Column | Condition | Button |
|---|---|---|
| `d = 0` | when `currentFolderDisplayDepth > 1` | `×` → `collapseFolderDepth(1)` (collapse all to root) |
| `0 < d < last` | always | `×` → `collapseFolderDepth(d)` (collapse to depth d) |
| last column | always | `+` → `expandFolderDepth()` |

---

## Lazy Expansion (`expandFolderDepth`)

1. Collect all unique leaf-folder IDs at the current deepest level.
2. Fetch their children from the ACC API (in parallel, results cached in `folderChildrenCache`).
3. Save existing cell data with `saveFolderCellData()` (keyed by `folderId`, relative column index).
4. Expand `currentHierarchy`: each parent row is cloned once per child, with the child appended as the next `levelN` key.
5. Increment `currentFolderDisplayDepth`.
6. Re-render with `displayFolderHierarchy()`.
7. Restore saved permissions with `restoreFolderCellData()`.
8. Call `loadExistingACCPermissions()` with the **full** `currentHierarchy` and `onlyFolderIds = newFolderIds` so only the new rows get populated in the DOM (but ancestor data is available for inheritance).
9. Call `propagatePermissionsToEmptyRows()` as a DOM-level fallback.

## Collapse (`collapseFolderDepth(targetDepth)`)

1. Save existing cell data.
2. Remove all `levelN` keys deeper than `targetDepth` from every hierarchy row.
3. Deduplicate rows that became identical after key removal.
4. Decrement `currentFolderDisplayDepth` to `targetDepth`.
5. Re-render and restore saved permissions.

Folder children remain in `folderChildrenCache` so re-expanding is instant.

---

## Permission Loading Pipeline

### Step 1 — Fetch from ACC API (`fetchAllFolderPermissions`)

Collects all unique folder IDs from `hierarchy` (all `levelN` keys), then batches API calls to:
```
GET /bim360/docs/v1/projects/{projectId}/folders/{folderId}/permissions
```
Returns `permissionsMap: { folderId → Array<permissionObject> }`.

Each `permissionObject` from the API contains:
- `subjectType`: `'USER'`, `'ROLE'`, or `'COMPANY'`
- `subjectId`, `name`, `autodeskId`
- `actions`: direct permission actions set on this folder
- `inheritActions`: actions inherited from ACC's own server-side logic

### Step 2 — Match to Project Members (`matchPermissionsToUsers`)

Converts raw ACC permission objects into a normalized map:
```js
userPermissionsMap: { folderId → { identifier → permObject } }
```

- **USER**: identifier = `"user_{autodeskId}"` or email
- **ROLE**: identifier = `"role_{subjectId}"`
- **COMPANY**: identifier = `"company_{subjectId}"`

Permission level (1–6) is derived from `actionsToPermissionLevel(actions, inheritActions)`:

| Level | Actions |
|---|---|
| 1 | VIEW, COLLABORATE |
| 2 | + DOWNLOAD |
| 3 | + PUBLISH_MARKUP |
| 4 | + PUBLISH |
| 5 | + EDIT |
| 6 | + CONTROL |

Only added to the map if the folder has at least one permission entry.

### Step 3 — Deduplication (per-folder)

Within each folder's entry, if the same identifier appears multiple times (ACC API quirk), keep only the highest-level entry.

### Step 4 — Two-Pass Transitive Dedup

This removes entries from child folders that are already set on an ancestor, so each permission is only shown **editable on the folder that directly owns it**.

**Pass 1 — Build `transitiveAncestorIds` map:**
Walk every hierarchy row from root (`d=0`) to deepest level. For each folder at `d > 0`, accumulate the set of ALL identifiers present at any ancestor depth above it. This pass reads the original data before any deletions.

**Pass 2 — Remove inherited identifiers from children:**
For every child folder in `transitiveAncestorIds`, delete from `userPermissionsMap[childId]` any identifier that appears in its ancestor set. If the child's map becomes empty, delete the child's entry entirely.

**Why two passes?** A single in-order pass would fail for depth-2+ folders: deleting from an intermediate folder (depth 1) before processing its children (depth 2) would make the depth-2 walk unable to find what was removed.

**Example:**
```
Folder 1        → { Bau AG }   ← kept (depth 0, no ancestors)
sub folder 1.2  → { Bau AG, "s" }  →  after dedup: { "s" }  (Bau AG removed, inherited from Folder 1)
sub folder 1.2.1 → { Bau AG }  →  after dedup: {}  (removed, inherited from Folder 1)
```

---

## Inheritance Rendering

### Root-level folders (`data-folder-depth = 0`)

Use their own `userPermissionsMap` entry directly.  
Cells are **editable** (coloured background, no `↓` indicator).  
A `parentColumnMaps` entry is saved: `folderId → Map(identifier → columnIndex)`.

### Subfolder rows (`data-folder-depth > 0`)

**`effectivePermissions` is built by walking ALL ancestors, root → parent:**

```js
for (let ad = 0; ad <= folderDepth - 1; ad++) {
    const aid = ancestorHRow[levelKeyForDepth(ad)]?.id;
    if (aid && userPermissionsMap[aid]) {
        // merge — deeper ancestor overrides shallower for same identifier
        Object.values(userPermissionsMap[aid]).forEach(perm => {
            effectivePermissions.set(perm.identifier, { ...perm, isInherited: true });
        });
    }
}
// Then add own orphan perms (not in any ancestor) as direct/editable
```

This is **critical**: a subfolder's direct parent may only have its *unique* permissions after dedup (e.g., only `"s"`). Walking from root ensures ancestor permissions like `Bau AG` from `Folder 1` are not missed.

**Inherited cells** are rendered as:
- `readonly` input
- `↓` indicator span
- `data-is-inherited="true"`
- `class="inherited-permission"` (grey styling)

**Column alignment:** inherited permissions are placed in the **same column index** as their ancestor row (looked up via `parentColumnMaps`). This ensures vertical alignment across parent/child rows.

### DOM Fallback — `propagatePermissionsToEmptyRows()`

Called after every `loadExistingACCPermissions()` pass. Catches any row that still has zero user cells:

1. Walks `data-parent-id` chain upward, collecting all ancestor DOM rows root-first.
2. Merges their user cells (nearest ancestor wins per column index).
3. Writes inherited cells into the empty target row.

This is a safety net for cases where the ACC API returns no permissions at all for a folder (even inherited ones are not always returned by ACC).

---

## Live Level Propagation (`updateInheritedPermissions`)

When a user changes the permission level on a **direct** (non-inherited) cell:

- `keydown` (arrow keys), `input` (typing), and `change` (blur) events all call `updateInheritedPermissions(parentFolderId, identifier, newLevel)`.
- The function walks every table row, checks if `parentFolderId` is a transitive ancestor (via `data-parent-id` chain), and updates the input value and colours on any matching inherited cell.
- Guard: only fires when `data-is-inherited !== 'true'` on the source cell.

---

## Data Attributes on `<tr>` Rows

| Attribute | Value |
|---|---|
| `data-folder-id` | ACC folder URN |
| `data-folder-depth` | 0 = root-level folder, 1 = first subfolder, 2 = second, … |
| `data-parent-id` | Direct parent folder URN (used for ancestry walks) |
| `data-level1-id` | Top ACC container ID |
| `data-level2-id` | Same as `data-parent-id` (legacy, kept for compatibility) |

## Data Attributes on `<td>` Permission Cells

| Attribute | Value |
|---|---|
| `data-user` | Unique identifier (`user_…`, `role_…`, `company_…`) |
| `data-display-name` | Human-readable name shown in the cell |
| `data-permission-level` | `1`–`6` |
| `data-subject-type` | `USER`, `ROLE`, or `COMPANY` |
| `data-subject-id` | ACC subject UUID |
| `data-is-inherited` | `"true"` if inherited from ancestor; absent/`"false"` if direct |
| `class="has-content"` | Present on all populated cells |
| `class="inherited-permission"` | Present on inherited cells (grey styling) |
