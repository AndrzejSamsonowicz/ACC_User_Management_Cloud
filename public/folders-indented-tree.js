/**
 * Folder Permissions — Indented Tree
 *
 * The primary UI for managing folder access, launched by showFoldersModal()
 * (read_project_folders.js) when a user clicks "Manage Access to Folders".
 * It creates its own modal — including the left "Project Users" panel that's
 * the drag source for granting access — and owns editing: changing access
 * levels, dragging users/roles/companies onto folders, cleaning all
 * assignments, and syncing to ACC. This superseded an older single-table
 * view and a treemap visualization, both now retired. Modeled on the
 * "expandable indented tree" pattern from
 * https://observablehq.com/@d3/indented-tree — each row is indented by
 * depth, has a click-to-expand/collapse toggle, and an elbow connector back
 * to its parent, animated with D3 joins/transitions.
 *
 * Three switchable orientations of the SAME underlying data:
 *   - "folders"  Folder hierarchy -> the users/companies/roles assigned to each folder
 *                (the only orientation where dropping a user/role/company grants new access —
 *                the other two are read-only summaries of existing access)
 *   - "users"    Every project user -> the folders they can access (direct or inherited)
 *   - "subjects" Companies & Roles -> their member users -> the folders those users can access
 *                (this is the quick "who's in this role/company" lookup)
 *
 * Depends on globals defined in read_project_folders.js (loaded before this
 * file): currentHierarchy, currentProjectData, currentProjectUsers,
 * currentProjectUsersRaw, folderUserAssignments, selectedUsers,
 * levelKeyForDepth(), naturalSort(), getPermissionLevelColor(),
 * getSubjectColor(), fetchFolderHierarchy(), fetchProjectUsers(),
 * loadChildrenForFolder(), loadExistingACCPermissions(),
 * propagatePermissionsToEmptyRows(), addUserToFolder(),
 * getDescendantFolderIds(), displayUserList(), handleSyncPermissions(). Also
 * depends on escapeHtml() (shared/dom-utils.js) and the global d3 library.
 * All identifiers defined in THIS file are prefixed "it" to avoid colliding
 * with the many other classic scripts sharing this page's global scope.
 */

    // ===================== INDENTED TREE VISUALIZATION =====================

    let itMode = 'folders'; // 'folders' | 'users' | 'subjects'
    let itSearchQuery = '';
    let itExpandedKeys = new Set();
    let itLoadingKeys = new Set(); // folder node keys currently fetching deeper levels
    let itLastVisible = []; // cached from the last full render, reused for cheap column-resize redraws
    let itUserSortMode = null; // null | 'asc' | 'desc' — sorts "Users → Folders" roots by folder-access count
    let itEscHandlerAdded = false; // guards against attaching a new document keydown listener on every modal open
    let itSelectedKeys = new Set(); // __keys of the currently-selected deletable rows (multi-select via Ctrl/Shift)
    let itSelectionAnchorKey = null; // last plain/shift-clicked key — the anchor a Shift+Click range is measured from
    let itCleaned = false; // true once "Clean Folders" has wiped the local model — suppresses lazy re-loading of ACC permissions until the modal is reopened
    let itTreeBusy = false;
    let itTreeBusyLabel = 'Loading folders…';
    // Tombstones for this modal session: deleting a grant only removes it from
    // folders already loaded into the local model. A not-yet-expanded
    // descendant folder still gets its permissions fetched fresh from ACC the
    // first time it's revealed — which still has the deleted grant, since
    // deleting here is local-only until Sync runs — so without this, the
    // deleted user/role/company silently reappears the moment you expand
    // into an unvisited subfolder. { subjectType, subjectId, scopeFolderId }
    // — scopeFolderId null means "everywhere" (a whole Role/Company delete),
    // otherwise the grant is purged only within that folder's own subtree
    // (a single per-folder direct-assignment delete).
    let itDeletedGrants = [];
    let itPendingChangeCount = 0; // local edits not yet pushed to ACC — shown as a badge on Sync
    let itFocusedKey = null; // keyboard-navigation focus (Up/Down/Left/Right), independent of itSelectedKeys
    let itDeleteConfirmEl = null; // the pending "delete N entries?" toast, if one is showing
    let itContextMenuEl = null; // the open right-click menu, if any
    let itCopyTargetArmed = null; // Set of {folderId, entryUser} awaiting a folder click, from "Copy access to…"

    // User-resizable column widths (px). "Name" holds the indented tree itself
    // (toggle + icon + label); "Level" and "Users" are fixed-position columns
    // that line up across every row regardless of indent depth.
    let itColWidths = { name: 380, level: 90, users: 90 };
    const IT_COL_MIN = { name: 160, level: 50, users: 50 };
    let itUserListWidth = 352; // "Project Users" left panel width (px), user-resizable
    const IT_USER_LIST_MIN = 220;
    const IT_USER_LIST_MAX = 700;
    let itZoomLevel = 1.0; // Ctrl+scroll zoom on the tree itself (mirrors the old table's setupTableZoom)
    const IT_ZOOM_MIN = 0.5;
    const IT_ZOOM_MAX = 2.0;
    const IT_ZOOM_STEP = 0.1;

    /**
     * The 3rd column is repurposed per orientation: in "Folders → Users" it
     * shows how many subjects are assigned to each folder; in "Users →
     * Folders" it shows how many folders each user has access to (sortable
     * there — see itUserSortMode); in "Roles/Companies → Users → Folders" it
     * shows how many folders that role/company itself has access to (member
     * rows underneath stay blank — the count belongs to the group, not each
     * person).
     */
    function itUsersColumnVisible() {
        return itMode === 'folders' || itMode === 'users' || itMode === 'subjects';
    }

    function itLevelColumnVisible() {
        return true;
    }

    function itGetColBoundaries() {
        const levelStart = itColWidths.name;
        const levelWidth = itLevelColumnVisible() ? itColWidths.level : 0;
        const usersStart = levelStart + levelWidth;
        const usersWidth = itUsersColumnVisible() ? itColWidths.users : 0;
        const end = usersStart + usersWidth;
        return { nameStart: 0, levelStart, usersStart, end };
    }

    /**
     * True if a node should show a toggle — either it already has children,
     * or (folders mode) it's a folder whose subfolders haven't been fetched
     * yet but might exist (see itBuildFoldersNodes).
     */
    function itNodeHasChildren(n) {
        return !!(n.children && n.children.length) || !!n.expandable;
    }

    const IT_ROW_H = 24;
    const IT_INDENT = 20;
    const IT_ROW_X0 = 26; // left margin for depth-0 rows
    const IT_BOX = 12; // toggle square size
    const IT_BOX_HALF = IT_BOX / 2;
    const IT_LINK_RADIUS = 6; // corner radius of the connector curves

    function itTruncate(str, max) {
        if (!str) return '';
        return str.length > max ? str.slice(0, max - 1) + '…' : str;
    }

    // ---------- Icons ----------
    // Folders stay a plain monochrome outline. User/company/role circles are
    // colored by subject type using the app's existing getSubjectColor()
    // palette (blue=USER, green=ROLE, orange=COMPANY, shaded by access level)
    // — the same categorical colors already used for the Level badge, not a
    // per-person identity color (see the earlier note on why we don't try to
    // reproduce Forma's own per-user avatar color: it isn't exposed via the
    // API). The People/Building glyphs use stroke="currentColor" so they pick
    // up whatever contrast color itDrawIcon assigns via CSS `color`.

    // Classic two-tone folder: a darker gold back tab peeking above a
    // lighter yellow front body — the familiar filled folder glyph, in
    // place of the previous plain monochrome outline.
    const IT_FOLDER_ICON =
        '<path d="M3 7.5c0-1.1.9-2 2-2h3.5l1.5 1.5H19c1.1 0 2 .9 2 2V8H3v-.5z" fill="#F2A900"/>' +
        '<rect x="3" y="8" width="18" height="10.5" rx="1.5" fill="#FFC94D" stroke="#E29400" stroke-width="0.7"/>';

    const IT_PEOPLE_ICON =
        '<circle cx="8" cy="7" r="3" fill="none" stroke="currentColor" stroke-width="1.6"/>' +
        '<circle cx="16" cy="7" r="3" fill="none" stroke="currentColor" stroke-width="1.6"/>' +
        '<path d="M2 20c0-3.3 2.7-6 6-6s6 2.7 6 6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>' +
        '<path d="M14 14.3c.7-.2 1.3-.3 2-.3 3.3 0 6 2.7 6 6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>';

    const IT_BUILDING_ICON =
        '<path d="M5 21V5a1 1 0 011-1h8a1 1 0 011 1v16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>' +
        '<path d="M15 21v-6a1 1 0 011-1h3a1 1 0 011 1v6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>' +
        '<path d="M4 21h17" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>' +
        '<path d="M8 7.5h2M8 11h2M8 14.5h2M11 7.5h2M11 11h2M11 14.5h2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>';

    /**
     * "Bob Contractor" -> "BC". Falls back to the first two letters of the
     * email's local part when no multi-word name is available.
     */
    function itInitialsFor(name, email) {
        const source = (name && name.trim()) ? name.trim() : (email || '');
        if (!source) return '?';
        const parts = source.split(/\s+/).filter(Boolean);
        if (parts.length >= 2) {
            return (parts[0][0] + parts[1][0]).toUpperCase();
        }
        const base = parts[0].split('@')[0];
        return base.slice(0, 2).toUpperCase() || '?';
    }

    function itAppendMiniSvg(sel, x, y, size, innerMarkup) {
        const svgNode = sel.append('svg')
            .attr('x', x).attr('y', y)
            .attr('width', size).attr('height', size)
            .attr('viewBox', '0 0 24 24')
            // These icons (the folder glyph in particular) are fill="none"
            // outlined shapes — by default SVG only hit-tests the stroke
            // line itself, so hovering/dropping over the hollow interior
            // hits nothing and the dragover/drop event falls through to
            // whatever's behind it instead of reaching this row.
            // pointer-events: all makes the whole icon area — including the
            // "empty" middle — respond, regardless of fill.
            .style('pointer-events', 'all');
        svgNode.html(innerMarkup);
        return svgNode;
    }

    /**
     * Circle colors for a user/company/role node, reusing the app's existing
     * getSubjectColor(subjectType, level) gradient. Leaf permission entries
     * carry their own folder-access level (1-6); nodes without that context
     * (a role/company's member list, a "Users" mode root, etc.) fall back to
     * a representative mid-level shade so they still read as that type's color.
     */
    function itIconColorsFor(d) {
        const subjectType = d.type === 'company' ? 'COMPANY' : d.type === 'role' ? 'ROLE' : 'USER';
        return getSubjectColor(subjectType, d.level || 3);
    }

    /**
     * Recolor a row's already-drawn icon circle in place after a level edit —
     * called alongside the Level input's own live color update so the two
     * never fall out of sync (previously the circle only picked up the new
     * shade on the next full row rebuild, e.g. via expand/collapse).
     */
    function itUpdateIconColorsInPlace(rowEl, node) {
        if (!rowEl || (node.type !== 'user' && node.type !== 'company' && node.type !== 'role')) return;
        const iconGroup = rowEl.querySelector('.it-icon-group');
        if (!iconGroup) return;
        const colors = itIconColorsFor(node);
        const circle = iconGroup.querySelector('circle');
        if (circle) circle.setAttribute('fill', colors.background);
        if (node.type === 'user') {
            const text = iconGroup.querySelector('text');
            if (text) text.setAttribute('fill', colors.color);
        } else {
            const miniSvg = iconGroup.querySelector('svg');
            if (miniSvg) miniSvg.style.color = colors.color;
        }
    }

    /**
     * Draw the leading icon for a row at local x=offsetX (avatar circle for
     * user/company/role, plain monochrome icon for folders/groups). Returns
     * the absolute x where the icon's space ends, so the caller can position
     * the name label right after it.
     */
    function itDrawIcon(sel, d, offsetX, onToggleClick) {
        const g = sel.append('g').attr('class', 'it-icon-group').attr('transform', `translate(${offsetX},0)`);
        // For user/company/role rows, the icon (the "circle") is one of the
        // two designated expand triggers — text is reserved for selection.
        if (onToggleClick && (d.type === 'user' || d.type === 'company' || d.type === 'role') && itNodeHasChildren(d)) {
            g.style('cursor', 'pointer').on('click', (event) => {
                event.stopPropagation();
                onToggleClick();
            });
        }
        if (d.type === 'user') {
            const initials = itInitialsFor(d.realName || d.name, d.email);
            const colors = itIconColorsFor(d);
            g.append('circle').attr('cx', 11).attr('cy', -1).attr('r', 11).attr('fill', colors.background).attr('stroke', 'rgba(0,0,0,0.15)').attr('stroke-width', 1);
            g.append('text')
                .attr('x', 11).attr('y', 2.5)
                .attr('text-anchor', 'middle')
                .attr('font-size', '9px').attr('font-weight', 'bold')
                .attr('font-family', "'Artifact Elements', Arial, sans-serif")
                .attr('fill', colors.color)
                .text(initials);
            return offsetX + 24;
        }
        if (d.type === 'company' || d.type === 'role') {
            const colors = itIconColorsFor(d);
            g.append('circle').attr('cx', 11).attr('cy', -1).attr('r', 11).attr('fill', colors.background).attr('stroke', 'rgba(0,0,0,0.15)').attr('stroke-width', 1);
            itAppendMiniSvg(g, 3, -9, 16, d.type === 'company' ? IT_BUILDING_ICON : IT_PEOPLE_ICON)
                .style('color', colors.color);
            return offsetX + 24;
        }
        // folder / group / anything else — filled yellow folder, no circle,
        // drawn at 2x size (36px vs the 18px it used to be) so it doesn't
        // get lost next to the colored avatar circles.
        itAppendMiniSvg(g, -2, -18, 36, IT_FOLDER_ICON);
        return offsetX + 36;
    }

    /**
     * Rounded elbow connector, ported 1:1 from the makeLink() function in
     * https://observablehq.com/@laotzunami/collapsible-indented-tree — a
     * straight drop from the parent's toggle position, a quarter-circle-ish
     * bezier corner, then a straight run into the child's toggle position.
     */
    function itMakeLink(start, end, radius) {
        const path = d3.path();
        const dh = 4 / 3 * Math.tan(Math.PI / 8); // tangent handle offset

        let fx = (end[0] - start[0]) === 0 ? 0 : (end[0] - start[0] > 0 ? 1 : -1);
        let fy = (end[1] - start[1]) === 0 ? 0 : (end[1] - start[1] > 0 ? 1 : -1);

        if (radius === 0) {
            fx = 0; fy = 0;
        } else {
            fx *= Math.min(Math.abs(start[0] - end[0]), radius) / radius;
            fy *= Math.min(Math.abs(start[1] - end[1]), radius) / radius;
        }

        path.moveTo(start[0], start[1]);
        path.lineTo(start[0], end[1] - fy * radius);
        path.bezierCurveTo(
            start[0], end[1] + fy * radius * (dh - 1),
            start[0] + fx * radius * (1 - dh), end[1],
            start[0] + fx * radius, end[1]
        );
        path.lineTo(end[0], end[1]);
        return path.toString();
    }

    // ---------- Shared helpers ----------

    /**
     * Folder IDs a user has access to — direct, or effectively via their
     * company's or any of their roles' assignment on that folder.
     */
    function itCollectFolderIdsForUser(u) {
        const ids = new Set();
        const roleIds = u.roleIds || [];
        for (const [folderId, entries] of folderUserAssignments) {
            const has = entries.some(e => {
                if (e.subjectType === 'USER') return e.user === u.email;
                if (e.subjectType === 'COMPANY') return !!u.companyId && e.subjectId === u.companyId;
                if (e.subjectType === 'ROLE') return roleIds.includes(e.subjectId);
                return false;
            });
            if (has) ids.add(folderId);
        }
        return ids;
    }

    /**
     * A user's EFFECTIVE access at a folder: the highest-level grant among
     * their own direct entry, their company's entry, and any of their roles'
     * entries — mirroring how ACC itself resolves access from multiple
     * sources. Reports which one won (via: null | 'COMPANY' | 'ROLE') so the
     * UI can label it, and so editing targets the actual underlying entry —
     * when access comes from a role/company there's no separate per-user
     * entry to edit; editing there would edit that role/company's own level
     * and affect every member, so those are shown read-only instead.
     */
    function itEffectiveAccessForUser(u, folderId) {
        const entries = folderUserAssignments.get(folderId);
        if (!entries) return null;

        const candidates = [];
        const direct = entries.find(e => e.subjectType === 'USER' && e.user === u.email);
        if (direct) candidates.push({ entry: direct, via: null });
        if (u.companyId) {
            const viaCompany = entries.find(e => e.subjectType === 'COMPANY' && e.subjectId === u.companyId);
            if (viaCompany) candidates.push({ entry: viaCompany, via: 'COMPANY' });
        }
        (u.roleIds || []).forEach(rid => {
            const viaRole = entries.find(e => e.subjectType === 'ROLE' && e.subjectId === rid);
            if (viaRole) candidates.push({ entry: viaRole, via: 'ROLE' });
        });
        if (candidates.length === 0) return null;

        candidates.sort((a, b) => parseInt(b.entry.level) - parseInt(a.entry.level));
        const best = candidates[0];
        return {
            level: best.entry.level,
            isInherited: !!best.entry.isInherited,
            via: best.via,
            viaName: best.via ? (best.entry.displayName || best.entry.user) : null,
            entryUser: best.entry.user
        };
    }

    /**
     * Build a nested folder tree (mirroring currentHierarchy) containing only
     * folders in folderIds plus whatever ancestors are needed to reach them.
     */
    function itBuildFilteredFolderNodes(rows, depth, folderIds, user) {
        const key = levelKeyForDepth(depth);
        const nextKey = levelKeyForDepth(depth + 1);
        const groups = new Map();
        for (const row of rows) {
            const f = row[key];
            if (!f) continue;
            if (!groups.has(f.id)) groups.set(f.id, { folder: f, rows: [] });
            groups.get(f.id).rows.push(row);
        }
        const sorted = [...groups.values()].sort((a, b) => naturalSort(a.folder.name, b.folder.name));
        const nodes = [];
        for (const { folder, rows: groupRows } of sorted) {
            const hasChildren = groupRows.some(r => r[nextKey]);
            const childNodes = hasChildren ? itBuildFilteredFolderNodes(groupRows, depth + 1, folderIds, user) : [];
            const direct = folderIds.has(folder.id);
            if (direct || childNodes.length > 0) {
                const node = { name: folder.name, type: 'folder', folderId: folder.id };
                // Users column = distinct people with access anywhere in this
                // folder's subtree (see itBuildFoldersNodes for why).
                const emails = itDistinctUserEmails(folderUserAssignments.get(folder.id));
                childNodes.forEach(child => {
                    if (child.__userEmails) child.__userEmails.forEach(e => emails.add(e));
                });
                node.__userEmails = emails;
                node.userCount = emails.size;
                if (direct) {
                    const info = itEffectiveAccessForUser(user, folder.id);
                    if (info) {
                        node.level = info.level;
                        node.isInherited = info.isInherited;
                        node.email = user.email;
                        if (info.via) {
                            // Access via role/company membership, not a personal
                            // grant — badge takes that type's color, and it's
                            // editable only from the folder's own role/company
                            // row (editing here would silently change everyone
                            // in that role/company).
                            node.subjectType = info.via;
                            node.viaLabel = `via ${info.via === 'COMPANY' ? 'Company' : 'Role'}: ${info.viaName}`;
                        } else {
                            node.__folderId = folder.id;
                            node.__entryUser = info.entryUser;
                        }
                    }
                }
                if (childNodes.length > 0) node.children = childNodes;
                nodes.push(node);
            }
        }
        return nodes;
    }

    function itUserChildNode(u) {
        const folderIds = itCollectFolderIdsForUser(u);
        const node = {
            name: (u.name && u.name !== u.email) ? `${u.name} (${u.email})` : (u.email || u.name || 'Unknown user'),
            type: 'user',
            email: u.email,
            realName: u.name || null,
            accessCount: folderIds.size
        };
        const folderNodes = (currentHierarchy && currentHierarchy.length)
            ? itBuildFilteredFolderNodes(currentHierarchy, 0, folderIds, u)
            : [];
        if (folderNodes.length > 0) node.children = folderNodes;
        return node;
    }

    // ---------- Data builders (one per orientation) ----------

    /**
     * Project Admins have automatic full access in ACC regardless of any
     * explicit folder permission entry (the sync logic elsewhere already
     * skips creating/updating/deleting permissions for them for the same
     * reason) — so a numeric level next to their name would be misleading.
     */
    function itIsProjectAdmin(email) {
        if (!email || !currentProjectUsersRaw) return false;
        const u = currentProjectUsersRaw.find(pu => pu.email === email);
        if (!u || !u.products) return false;
        return u.products.some(p => p.key === 'projectAdministration' && p.access === 'administrator');
    }

    /**
     * currentProjectUsersRaw minus Project Admins, for every place users get
     * ENUMERATED for display (root user list, role/company member lists,
     * etc.) — Admins have automatic full access to every folder regardless
     * of any explicit entry, so they're excluded everywhere in this modal.
     * currentProjectUsersRaw itself stays untouched: itIsProjectAdmin() and
     * every subjectId lookup (lookupSubjectInfo, company/role resolution)
     * still need the complete list to work correctly.
     */
    function itNonAdminUsers() {
        return (currentProjectUsersRaw || []).filter(u => !itIsProjectAdmin(u.email));
    }

    /**
     * Project users belonging to a COMPANY or ROLE subject (by id) — used to
     * make a company/role leaf under a folder expandable into its members.
     */
    function itMembersOfSubject(subjectType, subjectId) {
        if (!currentProjectUsersRaw || !subjectId) return [];
        if (subjectType === 'COMPANY') {
            return itNonAdminUsers().filter(u => u.companyId === subjectId);
        }
        if (subjectType === 'ROLE') {
            return itNonAdminUsers().filter(u => (u.roleIds || []).includes(subjectId));
        }
        return [];
    }

    /**
     * Actual distinct people covered by a folder's OWN assignment entries (not
     * its subfolders) — a USER entry counts as 1, a COMPANY/ROLE entry expands
     * to its member users (deduped by email, so someone covered both directly
     * and via a role/company is only counted once).
     */
    function itDistinctUserEmails(entries) {
        const emails = new Set();
        if (!entries) return emails;
        for (const e of entries) {
            const subjectType = e.subjectType || 'USER';
            if (subjectType === 'USER') {
                if (!itIsProjectAdmin(e.user)) emails.add(e.user);
            } else {
                itMembersOfSubject(subjectType, e.subjectId).forEach(u => {
                    if (u.email) emails.add(u.email);
                });
            }
        }
        return emails;
    }

    function itCountDistinctUsers(entries) {
        return itDistinctUserEmails(entries).size;
    }

    function itMemberLeafNode(u) {
        return {
            name: (u.name && u.name !== u.email) ? `${u.name} (${u.email})` : (u.email || u.name || 'Unknown user'),
            type: 'user',
            email: u.email,
            realName: u.name || null
        };
    }

    function itUserLeafNode(entry, folderId) {
        const subjectType = entry.subjectType || 'USER';
        let realName = null;
        if (subjectType === 'USER' && currentProjectUsersRaw) {
            const pu = currentProjectUsersRaw.find(u => u.email === entry.user);
            if (pu && pu.name) realName = pu.name;
        }
        // Users are always shown as "Name (email)" regardless of what
        // entry.displayName happens to hold — that field's value depends on
        // whatever display mode was active whenever this entry was created
        // or last loaded from ACC, so it drifts between plain email and
        // plain name depending on history. Recomputing it fresh here keeps
        // it consistent no matter how the entry got here. Companies/roles
        // aren't people, so their stored name is used as-is.
        const displayName = subjectType === 'USER'
            ? (realName && realName !== entry.user ? `${realName} (${entry.user})` : entry.user)
            : (entry.displayName || entry.user);
        const node = {
            name: displayName,
            type: subjectType.toLowerCase(),
            subjectType,
            subjectId: entry.subjectId,
            email: subjectType === 'USER' ? entry.user : undefined,
            realName,
            level: entry.level,
            isInherited: !!entry.isInherited,
            // Identifies the underlying folderUserAssignments entry so the
            // Level column can edit it in place (see itCommitLevelChange).
            __folderId: folderId,
            __entryUser: entry.user
        };
        if (subjectType === 'COMPANY' || subjectType === 'ROLE') {
            const members = itMembersOfSubject(subjectType, entry.subjectId)
                .slice()
                .sort((a, b) => naturalSort(a.email || '', b.email || ''))
                .map(itMemberLeafNode);
            if (members.length > 0) node.children = members;
        }
        return node;
    }

    function itBuildFoldersNodes(rows, depth) {
        const key = levelKeyForDepth(depth);
        const nextKey = levelKeyForDepth(depth + 1);
        const groups = new Map();
        for (const row of rows) {
            const f = row[key];
            if (!f) continue;
            if (!groups.has(f.id)) groups.set(f.id, { folder: f, rows: [] });
            groups.get(f.id).rows.push(row);
        }
        const sorted = [...groups.values()].sort((a, b) => naturalSort(a.folder.name, b.folder.name));
        const nodes = [];
        for (const { folder, rows: groupRows } of sorted) {
            const node = { name: folder.name, type: 'folder', folderId: folder.id, children: [] };

            const users = folderUserAssignments.get(folder.id);

            let childFolderNodes = [];
            if (groupRows.some(r => r[nextKey])) {
                childFolderNodes = itBuildFoldersNodes(groupRows, depth + 1);
            } else if (folderChildrenCache[folder.id] === undefined) {
                // Subfolders here haven't been fetched yet (currentHierarchy only
                // holds whatever depth has been loaded so far). Mark it expandable
                // anyway so the user can click it to lazy-load deeper levels —
                // see itLoadFolderChildren / itHandleRowClick.
                node.expandable = true;
            }

            // Users column = distinct people with access ANYWHERE in this
            // folder's subtree, not just this folder's own direct entries. ACC
            // itself treats it this way — someone with access to a folder deep
            // inside "Project Files" still sees the whole ancestor chain down
            // to it, so "Project Files" itself should reflect that total.
            // Note: subfolders not yet fetched (lazy-loaded) can't be counted
            // until they're loaded, so this total grows as more gets expanded.
            const emails = itDistinctUserEmails(users);
            childFolderNodes.forEach(child => {
                if (child.__userEmails) child.__userEmails.forEach(e => emails.add(e));
            });
            node.__userEmails = emails;
            node.userCount = emails.size;

            // Users/companies/roles assigned directly to this folder come first,
            // subfolders after — so who has access is visible right away instead
            // of buried past the whole subfolder tree.
            if (users && users.length > 0) {
                const leaves = users
                    .filter(e => (e.subjectType || 'USER') !== 'USER' || !itIsProjectAdmin(e.user))
                    .sort((a, b) => {
                        if (!!a.isInherited !== !!b.isInherited) return a.isInherited ? 1 : -1;
                        return naturalSort(a.displayName || a.user, b.displayName || b.user);
                    })
                    .map(entry => itUserLeafNode(entry, folder.id));
                node.children.push(...leaves);
            }
            node.children.push(...childFolderNodes);

            if (node.children.length === 0 && !node.expandable) delete node.children;
            nodes.push(node);
        }
        return nodes;
    }

    function itBuildFoldersData() {
        return {
            name: 'All Folders',
            children: (currentHierarchy && currentHierarchy.length) ? itBuildFoldersNodes(currentHierarchy, 0) : []
        };
    }

    /**
     * Pre-fetch one level of grandchildren for a batch of newly-revealed
     * folder ids, purely so each one's toggle immediately reflects whether it
     * truly has subfolders — instead of the optimistic "might have children"
     * guess that would otherwise only resolve once the user clicks it. Runs
     * with limited concurrency so expanding a folder with many children
     * doesn't fire dozens of requests at once.
     */
    async function itPeekGrandchildren(folderIds) {
        const ids = Array.from(folderIds);
        const CONCURRENCY = 6;
        for (let i = 0; i < ids.length; i += CONCURRENCY) {
            const batch = ids.slice(i, i + CONCURRENCY);
            await Promise.all(batch.map(id =>
                loadChildrenForFolder(id).catch(err => {
                    console.error('[IndentedTree] look-ahead fetch failed for', id, err);
                })
            ));
        }
    }

    /**
     * Load ACC permissions for a batch of newly-visible folder ids, reusing
     * read_project_folders.js's loadExistingACCPermissions (same call
     * toggleFolderExpand makes for the main table).
     */
    /** Whether folderId falls within a tombstone's scope (null = everywhere, otherwise that folder's own subtree). */
    function itIsFolderInScope(folderId, scopeFolderId) {
        if (!scopeFolderId) return true;
        if (folderId === scopeFolderId) return true;
        return itGetDescendantFolderIds(scopeFolderId).has(folderId);
    }

    /**
     * Re-apply every deletion tombstoned so far to a batch of folders whose
     * permissions were JUST (re)loaded from ACC — undoing exactly the
     * "deleted grant reappears on lazy-load" gap described on itDeletedGrants.
     */
    function itPurgeTombstonedEntries(folderIds) {
        if (itDeletedGrants.length === 0) return;
        folderIds.forEach(folderId => {
            const entries = folderUserAssignments.get(folderId);
            if (!entries || entries.length === 0) return;
            for (let i = entries.length - 1; i >= 0; i--) {
                const e = entries[i];
                const tombstoned = itDeletedGrants.some(g =>
                    g.subjectType === e.subjectType && g.subjectId === e.subjectId && itIsFolderInScope(folderId, g.scopeFolderId)
                );
                if (tombstoned) entries.splice(i, 1);
            }
        });
    }

    async function itLoadPermissionsFor(folderIds) {
        if (!window.FolderPermissions?.fetchAllFolderPermissions) return;
        // Once "Clean Folders" has wiped the local model, expanding into a
        // folder that was never loaded yet must NOT reach back out to ACC —
        // loadExistingACCPermissions only skips folders that already have
        // model entries, so with an empty model it would silently repopulate
        // exactly what Clean just removed the moment you expand that deep.
        if (itCleaned) return;
        try {
            await loadExistingACCPermissions(
                currentProjectData.projectId, currentHierarchy,
                currentProjectUsers, currentProjectData.accessToken,
                { onlyFolderIds: folderIds }
            );
            itPurgeTombstonedEntries(Array.from(folderIds));
            propagatePermissionsToEmptyRows();
        } catch (err) {
            console.error('[IndentedTree] permission load error:', err);
        }
    }

    /**
     * Ensure folderId's own children are loaded (skipped if already known —
     * e.g. an ancestor's peek already fetched them), then — regardless of
     * whether THAT fetch was needed — peek one level further for whichever of
     * its children haven't themselves been peeked yet.
     *
     * This "regardless" part is the fix for a real gap: if folder B's children
     * were already discovered by folder A's peek (A -> B -> C, expanding A
     * peeks B and finds C, but never peeked C itself), then later expanding B
     * would find C already known and skip straight to revealing it — leaving
     * C's own toggle stuck on the optimistic "might have children" guess. By
     * always re-checking "which of my children are still unpeeked" on every
     * expand, C gets peeked at the point B is expanded, not just when B's own
     * children happen to be freshly fetched.
     */
    async function itFetchAndPeek(folderId) {
        if (!currentProjectData) return;

        // loadExistingACCPermissions only computes/inherits permissions for
        // folders buildVisibleFolderRows() considers "visible", which is
        // gated by this shared expandedFolderIds set from
        // read_project_folders.js. Without marking this folder expanded
        // here, permissions for anything past whatever's already been
        // expanded would silently never load, no matter how deep this tree goes.
        expandedFolderIds.add(folderId);

        const alreadyKnew = folderChildrenCache[folderId] !== undefined;
        if (!alreadyKnew) {
            await loadChildrenForFolder(folderId);
        }

        const childKey = getChildKeyForFolder(folderId);
        if (!childKey) return;

        const childIds = new Set();
        currentHierarchy.forEach(r => {
            if (r[childKey] && isFolderAncestor(r, folderId)) {
                childIds.add(r[childKey].id);
            }
        });
        if (childIds.size === 0) return;

        // Always (re)request permissions for the children about to be shown —
        // even if their subfolder LIST was already known from an earlier peek,
        // their permissions specifically were never fetched by that peek (peek
        // only checks expandability). loadExistingACCPermissions already skips
        // folders that already have model entries, so this is cheap when
        // redundant.
        await itLoadPermissionsFor(childIds);

        const toPeek = Array.from(childIds).filter(id => folderChildrenCache[id] === undefined);
        if (toPeek.length > 0) {
            await itPeekGrandchildren(toPeek);
        }
    }

    /**
     * Expand one more level of depth, everywhere at once: every folder
     * currently visible (all its ancestors already expanded) that has
     * children but isn't expanded yet gets expanded — lazily fetching its
     * contents first if they aren't already known. Clicking "Expand"
     * repeatedly walks the whole tree deeper one level at a time instead of
     * recursively fetching every remaining level in a single burst, which on
     * a large/complex project could take a very long time or hammer the API.
     * Returns false if there was nothing left to expand (already full depth).
     */
    async function itExpandNextLevel() {
        if (!currentProjectData || !currentHierarchy) return false;

        const data = itBuildData();
        itAssignKeys(data.children || [], '', []);
        const visible = itComputeVisible(data);
        const frontier = visible.filter(v => itNodeHasChildren(v.data) && !itExpandedKeys.has(v.data.__key));
        if (frontier.length === 0) return false;

        const folderNodes = frontier.filter(v => v.data.type === 'folder' && v.data.folderId);
        const CONCURRENCY = 4;
        for (let i = 0; i < folderNodes.length; i += CONCURRENCY) {
            const batch = folderNodes.slice(i, i + CONCURRENCY);
            await Promise.all(batch.map(v =>
                itFetchAndPeek(v.data.folderId).catch(err => {
                    console.error('[IndentedTree] expand-next-level fetch failed for', v.data.folderId, err);
                })
            ));
        }

        frontier.forEach(v => itExpandedKeys.add(v.data.__key));
        return true;
    }

    /**
     * A node can be deleted if it's either:
     *  - a direct (non-inherited) user/role/company assignment on a specific
     *    folder — only meaningful in "Folders → Users" mode, where each such
     *    row IS a real assignment rather than a read-only summary (effective
     *    access, subject members); or
     *  - a whole Role/Company group — only in "Roles/Companies → Users →
     *    Folders" mode. Deleting one removes that subject's access from
     *    every folder it's granted on; since the grant is inherently
     *    company/role-wide (no separate per-member rows to also clean up),
     *    this naturally takes every one of its members with it.
     */
    function itIsDeletableNode(node) {
        if (itMode === 'folders' && node.__folderId && node.__entryUser && !node.isInherited) return true;
        if (itMode === 'subjects' && node.subjectType && node.subjectId) return true;
        return false;
    }

    /** Clears the multi-selection, if any. Returns whether it actually changed anything. */
    function itClearSelection() {
        if (itSelectedKeys.size === 0) return false;
        itSelectedKeys = new Set();
        itSelectionAnchorKey = null;
        itDismissDeleteConfirm();
        return true;
    }

    /** Record N local edits not yet synced, and refresh the badge on Sync. */
    function itMarkDirty(n = 1) {
        if (n <= 0) return;
        itPendingChangeCount += n;
        itUpdateSyncBadge();
    }

    function itUpdateSyncBadge() {
        const btn = document.getElementById('itSyncBtn');
        if (!btn) return;
        let badge = btn.querySelector('.it-sync-badge');
        if (itPendingChangeCount > 0) {
            if (!badge) {
                badge = document.createElement('span');
                badge.className = 'it-sync-badge';
                btn.appendChild(badge);
            }
            badge.textContent = itPendingChangeCount > 99 ? '99+' : String(itPendingChangeCount);
        } else if (badge) {
            badge.remove();
        }
    }

    /**
     * Select (for deletion) on a node's TEXT — separate from expanding it.
     * Plain click selects just this one; Ctrl/Cmd+click toggles it into/out
     * of a multi-selection; Shift+click selects the contiguous range of
     * deletable rows between the last-clicked anchor and this one (same
     * conventions as the old table's row selection).
     */
    function itSelectNode(container, node, event) {
        if (!itIsDeletableNode(node)) return;
        const key = node.__key;
        itFocusedKey = key;
        itDismissDeleteConfirm();

        if (event && (event.ctrlKey || event.metaKey)) {
            if (itSelectedKeys.has(key)) itSelectedKeys.delete(key); else itSelectedKeys.add(key);
            itSelectionAnchorKey = key;
        } else if (event && event.shiftKey && itSelectionAnchorKey) {
            const deletableKeys = itLastVisible.filter(v => itIsDeletableNode(v.data)).map(v => v.data.__key);
            const anchorIdx = deletableKeys.indexOf(itSelectionAnchorKey);
            const currentIdx = deletableKeys.indexOf(key);
            if (anchorIdx >= 0 && currentIdx >= 0) {
                const [lo, hi] = anchorIdx < currentIdx ? [anchorIdx, currentIdx] : [currentIdx, anchorIdx];
                itSelectedKeys = new Set(deletableKeys.slice(lo, hi + 1));
            } else {
                itSelectedKeys = new Set([key]);
            }
        } else {
            itSelectedKeys = new Set([key]);
            itSelectionAnchorKey = key;
        }
        itRenderTree(container);
    }

    /**
     * Expand/collapse a node — lazy-loading deeper folder levels (and
     * peeking one level further) on demand. Triggered by the "+"/"−" toggle
     * or the icon ("the circle") for user/company/role rows, or by clicking
     * anywhere on the row for folder/group rows (nothing on those is
     * deletable, so there's no ambiguity to resolve).
     */
    async function itToggleExpandNode(container, node) {
        if (!itNodeHasChildren(node)) return;
        const key = node.__key;

        if (itExpandedKeys.has(key)) {
            itExpandedKeys.delete(key);
            itRenderTree(container);
            return;
        }

        if (itMode === 'folders' && node.type === 'folder' && node.folderId && !itLoadingKeys.has(key)) {
            itLoadingKeys.add(key);
            itTreeBusy = true;
            itTreeBusyLabel = 'Loading folders…';
            itRenderTree(container); // show a loading state immediately
            try {
                await itFetchAndPeek(node.folderId);
            } finally {
                itLoadingKeys.delete(key);
                itTreeBusy = itLoadingKeys.size > 0;
                itRenderTree(container);
            }
        }

        itExpandedKeys.add(key);
        itRenderTree(container);
    }

    /**
     * Full-row click handler. For folder/group rows this expands, as
     * always. For subject rows it's only reached via a click that landed on
     * the row background rather than the toggle/icon/text (those all
     * stopPropagation) — i.e. exactly the "clicked away" gesture that should
     * clear a multi-selection.
     */
    async function itHandleRowClick(container, node) {
        if (itCopyTargetArmed && itMode === 'folders' && node.type === 'folder' && node.folderId) {
            itPerformArmedCopy(container, node.folderId);
            return;
        }
        itFocusedKey = node.__key;
        if (node.type === 'user' || node.type === 'company' || node.type === 'role') {
            if (itClearSelection()) itRenderTree(container);
            return;
        }
        const hadSelection = itClearSelection();
        if (hadSelection && !itNodeHasChildren(node)) itRenderTree(container);
        await itToggleExpandNode(container, node);
    }

    /** Scroll a row into view by key, if it's currently rendered. */
    function itScrollRowIntoView(key) {
        const rows = document.querySelectorAll('#itContainer g.it-row');
        for (const el of rows) {
            if (el.__data__ && el.__data__.data.__key === key) {
                el.scrollIntoView({ block: 'nearest' });
                return;
            }
        }
    }

    /** Up/Down: move keyboard focus to the previous/next visible row. */
    function itMoveFocusVertical(delta) {
        if (itLastVisible.length === 0) return;
        let idx = itFocusedKey ? itLastVisible.findIndex(v => v.data.__key === itFocusedKey) : -1;
        if (idx < 0) idx = delta > 0 ? -1 : 0;
        idx = Math.max(0, Math.min(itLastVisible.length - 1, idx + delta));
        itFocusedKey = itLastVisible[idx].data.__key;
        const container = document.getElementById('itContainer');
        itRenderTree(container);
        itScrollRowIntoView(itFocusedKey);
    }

    /**
     * Right: expand the focused row if it has children and is collapsed,
     * else move focus into its first child if already expanded. Left is the
     * mirror — collapse if expanded, else move focus up to the parent.
     */
    async function itMoveFocusHorizontal(delta) {
        const container = document.getElementById('itContainer');
        if (!itFocusedKey) {
            if (itLastVisible.length) {
                itFocusedKey = itLastVisible[0].data.__key;
                itRenderTree(container);
                itScrollRowIntoView(itFocusedKey);
            }
            return;
        }
        const visNode = itLastVisible.find(v => v.data.__key === itFocusedKey);
        if (!visNode) return;
        const node = visNode.data;

        if (delta > 0) {
            if (!itNodeHasChildren(node)) return;
            if (!itExpandedKeys.has(node.__key)) {
                await itToggleExpandNode(container, node);
                itScrollRowIntoView(itFocusedKey);
            } else {
                const idx = itLastVisible.findIndex(v => v.data.__key === node.__key);
                if (idx >= 0 && itLastVisible[idx + 1]) {
                    itFocusedKey = itLastVisible[idx + 1].data.__key;
                    itRenderTree(container);
                    itScrollRowIntoView(itFocusedKey);
                }
            }
        } else {
            if (itNodeHasChildren(node) && itExpandedKeys.has(node.__key)) {
                itExpandedKeys.delete(node.__key);
                itRenderTree(container);
                itScrollRowIntoView(itFocusedKey);
            } else if (node.__ancestors && node.__ancestors.length > 0) {
                itFocusedKey = node.__ancestors[node.__ancestors.length - 1];
                itRenderTree(container);
                itScrollRowIntoView(itFocusedKey);
            }
        }
    }

    function itBuildUsersData() {
        const users = itNonAdminUsers()
            .sort((a, b) => naturalSort(a.email || '', b.email || ''));
        let nodes = users.map(itUserChildNode);
        if (itUserSortMode === 'asc' || itUserSortMode === 'desc') {
            const dir = itUserSortMode === 'asc' ? 1 : -1;
            nodes = nodes.sort((a, b) => (a.accessCount - b.accessCount) * dir || naturalSort(a.name, b.name));
        }
        return {
            name: 'All Users',
            children: nodes
        };
    }

    /** Folder IDs a ROLE or COMPANY subject has a direct entry on. */
    function itCollectFolderIdsForSubject(subjectType, subjectId) {
        const ids = new Set();
        for (const [folderId, entries] of folderUserAssignments) {
            if (entries.some(e => e.subjectType === subjectType && e.subjectId === subjectId)) ids.add(folderId);
        }
        return ids;
    }

    /**
     * Nested folder tree (mirroring currentHierarchy) containing only folders
     * a ROLE/COMPANY subject has access to, plus whatever ancestors are
     * needed to reach them. Folders where the subject has its own direct
     * entry carry that entry's level (editable, same as the "Folders →
     * Users" view) — pure pass-through ancestors (included only to reach a
     * deeper folder) don't have an entry here, so they show no level.
     */
    function itBuildSubjectFolderNodes(rows, depth, folderIds, subjectType, subjectId) {
        const key = levelKeyForDepth(depth);
        const nextKey = levelKeyForDepth(depth + 1);
        const groups = new Map();
        for (const row of rows) {
            const f = row[key];
            if (!f) continue;
            if (!groups.has(f.id)) groups.set(f.id, { folder: f, rows: [] });
            groups.get(f.id).rows.push(row);
        }
        const sorted = [...groups.values()].sort((a, b) => naturalSort(a.folder.name, b.folder.name));
        const nodes = [];
        for (const { folder, rows: groupRows } of sorted) {
            const hasChildren = groupRows.some(r => r[nextKey]);
            const childNodes = hasChildren ? itBuildSubjectFolderNodes(groupRows, depth + 1, folderIds, subjectType, subjectId) : [];
            if (folderIds.has(folder.id) || childNodes.length > 0) {
                const node = { name: folder.name, type: 'folder', folderId: folder.id };
                if (childNodes.length > 0) node.children = childNodes;

                const entry = (folderUserAssignments.get(folder.id) || [])
                    .find(e => e.subjectType === subjectType && e.subjectId === subjectId);
                if (entry) {
                    node.level = entry.level;
                    node.isInherited = !!entry.isInherited;
                    node.subjectType = subjectType;
                    node.__folderId = folder.id;
                    node.__entryUser = entry.user;
                }

                nodes.push(node);
            }
        }
        return nodes;
    }

    /**
     * A role/company's own subtree: its folder access first (expandable,
     * shared by the whole group instead of being repeated under every
     * member), then its members as a flat, non-expandable list — there's
     * nothing further to drill into per-member here since their access is
     * exactly what's already shown above.
     */
    function itBuildSubjectChildren(subjectType, subjectId) {
        const folderIds = itCollectFolderIdsForSubject(subjectType, subjectId);
        const folderNodes = (currentHierarchy && currentHierarchy.length)
            ? itBuildSubjectFolderNodes(currentHierarchy, 0, folderIds, subjectType, subjectId)
            : [];
        const memberNodes = itMembersOfSubject(subjectType, subjectId)
            .slice()
            .sort((a, b) => naturalSort(a.email || '', b.email || ''))
            .map(itMemberLeafNode);
        return { children: [...folderNodes, ...memberNodes], accessCount: folderIds.size };
    }

    function itBuildSubjectsData() {
        const users = itNonAdminUsers();

        const companyMap = new Map(); // companyId -> { name, users: [] }
        users.forEach(u => {
            if (!u.companyId) return;
            if (!companyMap.has(u.companyId)) companyMap.set(u.companyId, { name: u.companyName || 'Unknown Company', users: [] });
            companyMap.get(u.companyId).users.push(u);
        });

        const roleMap = new Map(); // roleId -> { name, users: [] }
        users.forEach(u => {
            (u.roles || []).forEach(r => {
                const rid = typeof r === 'string' ? r : (r.id || r.name);
                const rname = typeof r === 'string' ? r : (r.name || r.id);
                if (!rid) return;
                if (!roleMap.has(rid)) roleMap.set(rid, { name: rname, users: [] });
                roleMap.get(rid).users.push(u);
            });
        });

        const companyNodes = [...companyMap.entries()]
            .sort((a, b) => naturalSort(a[1].name, b[1].name))
            .map(([id, c]) => {
                const built = itBuildSubjectChildren('COMPANY', id);
                return { name: c.name, type: 'company', subjectType: 'COMPANY', subjectId: id, children: built.children, accessCount: built.accessCount };
            });

        const roleNodes = [...roleMap.entries()]
            .sort((a, b) => naturalSort(a[1].name, b[1].name))
            .map(([id, r]) => {
                const built = itBuildSubjectChildren('ROLE', id);
                return { name: r.name, type: 'role', subjectType: 'ROLE', subjectId: id, children: built.children, accessCount: built.accessCount };
            });

        return {
            name: 'Roles & Companies',
            children: [
                { name: `Companies (${companyNodes.length})`, type: 'group', children: companyNodes },
                { name: `Roles (${roleNodes.length})`, type: 'group', children: roleNodes }
            ]
        };
    }

    function itBuildData() {
        if (itMode === 'users') return itBuildUsersData();
        if (itMode === 'subjects') return itBuildSubjectsData();
        return itBuildFoldersData();
    }

    // ---------- Key assignment / search / visibility ----------

    /**
     * Assign a stable, order-independent key to every node so expand state
     * and D3's data-join can survive re-renders (mode stays the same;
     * folderUserAssignments/currentHierarchy content can still shift).
     */
    function itAssignKeys(nodes, parentKey, ancestors) {
        nodes.forEach(n => {
            const selfPart = `${n.type || 'n'}:${n.folderId || n.email || n.name}`;
            n.__key = parentKey ? `${parentKey}>${selfPart}` : selfPart;
            n.__ancestors = ancestors;
            if (n.children && n.children.length) itAssignKeys(n.children, n.__key, [...ancestors, n.__key]);
        });
    }

    function itCollectAllKeys(nodes, out) {
        nodes.forEach(n => {
            if (n.children && n.children.length) {
                out.push(n.__key);
                itCollectAllKeys(n.children, out);
            }
        });
    }

    function itMatchesQuery(node, q) {
        const hay = [node.name, node.email].filter(Boolean).join(' ').toLowerCase();
        return hay.includes(q);
    }

    /**
     * When searching, force-expand every ancestor of a match so it becomes
     * visible, and flag matched nodes for highlighting.
     */
    function itApplySearchExpansion(nodes) {
        if (!itSearchQuery) {
            nodes.forEach(n => { n.__matched = false; if (n.children) itApplySearchExpansion(n.children); });
            return;
        }
        const q = itSearchQuery.toLowerCase();
        nodes.forEach(n => {
            n.__matched = itMatchesQuery(n, q);
            if (n.__matched) n.__ancestors.forEach(k => itExpandedKeys.add(k));
            if (n.children) itApplySearchExpansion(n.children);
        });
    }

    function itComputeVisible(data) {
        const visible = [];
        function walk(nodes, depth) {
            for (const n of nodes) {
                visible.push({ data: n, depth });
                if (n.children && n.children.length && itExpandedKeys.has(n.__key)) {
                    walk(n.children, depth + 1);
                }
            }
        }
        walk(data.children || [], 0);
        return visible;
    }

    // ---------- Editing (access level) ----------
    // Mirrors read_project_folders.js's own level-editing logic (arrow keys,
    // typed digit 1-6, readonly for inherited entries, live inheritance
    // propagation) so editing here behaves identically to the main table. The
    // one deliberate difference: descendant lookup is done from currentHierarchy
    // (data) rather than the main table's DOM, since this tree can lazy-load
    // folders the main table was never expanded to — see the earlier fixes to
    // itFetchAndPeek for the same class of DOM-visibility gating bug.

    function itGetDescendantFolderIds(parentFolderId) {
        const ids = new Set();
        for (const row of currentHierarchy) {
            let foundDepth = -1;
            for (let d = 0; d < 20; d++) {
                if (row[levelKeyForDepth(d)]?.id === parentFolderId) { foundDepth = d; break; }
            }
            if (foundDepth < 0) continue;
            for (let d = foundDepth + 1; d < 20; d++) {
                const id = row[levelKeyForDepth(d)]?.id;
                if (id) ids.add(id);
            }
        }
        return ids;
    }

    /** Update one entry's level in the model (+ its own node object), returning its descendant folder ids. */
    function itUpdateEntryLevel(node, newLevel) {
        if (!node.__folderId || !node.__entryUser) return null;
        const entries = folderUserAssignments.get(node.__folderId);
        const entry = entries && entries.find(e => e.user === node.__entryUser);
        if (entry && entry.level !== newLevel) {
            entry.level = newLevel;
            itMarkDirty();
        }
        node.level = newLevel;
        return itGetDescendantFolderIds(node.__folderId);
    }

    /** Patch every currently-rendered inherited copy of entryUser on a descendant folder, in place. */
    function itPatchDescendantInheritedCopies(entryUser, descendantIds, newLevel) {
        // Update the model first — the DOM patch below only touches whatever
        // happens to be currently rendered, but the underlying entries are
        // what any FUTURE render (collapsing/re-expanding a folder, etc.)
        // actually rebuilds from. Without this, the change looks live for a
        // moment and then reverts the next time anything re-renders.
        descendantIds.forEach(descId => {
            const descEntries = folderUserAssignments.get(descId);
            if (!descEntries) return;
            const inheritedEntry = descEntries.find(e => e.user === entryUser && e.isInherited);
            if (inheritedEntry) inheritedEntry.level = newLevel;
        });

        document.querySelectorAll('#itContainer g.it-row').forEach(rowEl => {
            const bound = rowEl.__data__;
            const rowNode = bound && bound.data;
            if (!rowNode || !rowNode.isInherited) return;
            if (rowNode.__entryUser !== entryUser) return;
            if (!descendantIds.has(rowNode.__folderId)) return;
            rowNode.level = newLevel;
            const input = rowEl.querySelector('.it-level-input');
            if (input) {
                const colors = rowNode.subjectType ? getSubjectColor(rowNode.subjectType, newLevel) : getPermissionLevelColor(newLevel);
                input.value = newLevel;
                input.style.background = colors.background;
                input.style.color = colors.color;
            }
            itUpdateIconColorsInPlace(rowEl, rowNode);
        });
    }

    /** Patch a single direct entry's own currently-rendered row, in place. */
    function itPatchOwnRow(folderId, entryUser, newLevel) {
        document.querySelectorAll('#itContainer g.it-row').forEach(rowEl => {
            const bound = rowEl.__data__;
            const rowNode = bound && bound.data;
            if (!rowNode || rowNode.isInherited) return;
            if (rowNode.__folderId !== folderId || rowNode.__entryUser !== entryUser) return;
            rowNode.level = newLevel;
            const input = rowEl.querySelector('.it-level-input');
            if (input) {
                const colors = rowNode.subjectType ? getSubjectColor(rowNode.subjectType, newLevel) : getPermissionLevelColor(newLevel);
                input.value = newLevel;
                input.style.background = colors.background;
                input.style.color = colors.color;
            }
            itUpdateIconColorsInPlace(rowEl, rowNode);
        });
    }

    /**
     * Commit a new access level for a leaf entry: updates the shared
     * folderUserAssignments model (the same data the main table reads), then
     * patches every currently-rendered row in THIS tree that's an inherited
     * copy of the same entry — in place, no full re-render, so the input the
     * user is actively editing never loses focus.
     *
     * If this row is part of a multi-selection (2+ rows selected via
     * Ctrl/Shift), the same level is applied to every other selected row
     * too — editing one moves the whole selection together, regardless of
     * whether they're users, roles, or companies. Each of those rows needs
     * its own row patched as well as its descendants, since — unlike the
     * primary node, whose own input the caller patches itself — there's no
     * actively-focused input for the others.
     */
    function itCommitLevelChange(node, newLevel) {
        const descendantIds = itUpdateEntryLevel(node, newLevel);
        if (!descendantIds) return;
        itPatchDescendantInheritedCopies(node.__entryUser, descendantIds, newLevel);

        if (itSelectedKeys.size > 1 && itSelectedKeys.has(node.__key)) {
            itSelectedKeys.forEach(key => {
                if (key === node.__key) return;
                const visNode = itLastVisible.find(v => v.data.__key === key);
                const otherNode = visNode && visNode.data;
                if (!otherNode || !otherNode.__folderId || !otherNode.__entryUser || otherNode.isInherited) return;
                const otherDescendantIds = itUpdateEntryLevel(otherNode, newLevel);
                if (!otherDescendantIds) return;
                itPatchOwnRow(otherNode.__folderId, otherNode.__entryUser, newLevel);
                itPatchDescendantInheritedCopies(otherNode.__entryUser, otherDescendantIds, newLevel);
            });
        }
    }


    /**
     * Remove a Role/Company's access from every folder it's granted on,
     * direct or inherited — the whole point of "delete the group": there are
     * no separate per-member rows for a company/role grant, so wiping every
     * entry for this subjectId is equivalent to removing it (and, with it,
     * every one of its members' access) everywhere at once.
     */
    function itDeleteSubjectEverywhere(subjectType, subjectId) {
        for (const entries of folderUserAssignments.values()) {
            for (let i = entries.length - 1; i >= 0; i--) {
                if (entries[i].subjectType === subjectType && entries[i].subjectId === subjectId) {
                    entries.splice(i, 1);
                }
            }
        }
    }

    /**
     * Actually delete every currently-selected node: each one is either a
     * single direct folder assignment (removed along with every inherited
     * copy on descendant folders, reusing removeUserFromDescendants — same
     * routine the old table used) or a whole Role/Company group (removed
     * from every folder at once). Clears the selection and re-renders once
     * at the end. Only called after itShowDeleteConfirm's toast is
     * confirmed — see that function for the entry point.
     */
    function itPerformDeleteSelectedNodes(container) {
        if (itSelectedKeys.size === 0) return;
        let deletedCount = 0;

        itSelectedKeys.forEach(key => {
            const visNode = itLastVisible.find(v => v.data.__key === key);
            const node = visNode && visNode.data;
            if (!node || !itIsDeletableNode(node)) return;

            if (node.__folderId && node.__entryUser) {
                const entries = folderUserAssignments.get(node.__folderId);
                if (entries) {
                    const idx = entries.findIndex(e => e.user === node.__entryUser);
                    if (idx >= 0) entries.splice(idx, 1);
                }
                removeUserFromDescendants(node.__folderId, node.__entryUser);
                if (node.subjectType && node.subjectId) {
                    itDeletedGrants.push({ subjectType: node.subjectType, subjectId: node.subjectId, scopeFolderId: node.__folderId });
                }
                deletedCount++;
            } else if (node.subjectType && node.subjectId) {
                itDeleteSubjectEverywhere(node.subjectType, node.subjectId);
                itDeletedGrants.push({ subjectType: node.subjectType, subjectId: node.subjectId, scopeFolderId: null });
                deletedCount++;
            }
        });

        itSelectedKeys = new Set();
        itSelectionAnchorKey = null;
        itMarkDirty(deletedCount);
        itRenderTree(container);
    }

    function itDismissDeleteConfirm() {
        if (itDeleteConfirmEl) {
            itDeleteConfirmEl.remove();
            itDeleteConfirmEl = null;
        }
    }

    /**
     * Entry point for deleting the current selection — shows a "delete N
     * entries?" toast rather than deleting immediately, so a stray Delete
     * keypress on a multi-selection can't silently remove several
     * assignments at once with no way back.
     */
    function itShowDeleteConfirm(container) {
        if (itDeleteConfirmEl || itSelectedKeys.size === 0) return;
        const count = itSelectedKeys.size;
        const wrap = document.querySelector('#itOverlay .it-modal-body-wrap');
        if (!wrap) return;

        const toast = document.createElement('div');
        toast.className = 'it-confirm-toast';
        toast.innerHTML = `
            <span>Delete ${count} selected ${count === 1 ? 'entry' : 'entries'}? This can't be undone once synced.</span>
            <button type="button" class="it-confirm-cancel">Cancel</button>
            <button type="button" class="it-confirm-delete">Delete</button>
        `;
        wrap.appendChild(toast);
        itDeleteConfirmEl = toast;

        toast.querySelector('.it-confirm-cancel').addEventListener('click', itDismissDeleteConfirm);
        toast.querySelector('.it-confirm-delete').addEventListener('click', () => {
            itDismissDeleteConfirm();
            itPerformDeleteSelectedNodes(container);
        });
    }

    function itDismissContextMenu() {
        if (itContextMenuEl) {
            itContextMenuEl.remove();
            itContextMenuEl = null;
        }
    }

    /**
     * Right-click on a deletable row: "Set level to…" (applies to the whole
     * current selection via itCommitLevelChange's own multi-select
     * propagation), "Copy access to…" (arms a pending copy — see
     * itPerformArmedCopy, triggered by the next folder click), and Delete
     * (routes through the same confirm toast as the Delete key).
     */
    function itShowContextMenu(container, node, clientX, clientY) {
        itDismissContextMenu();
        if (!itIsDeletableNode(node)) return;

        if (!itSelectedKeys.has(node.__key)) {
            itSelectedKeys = new Set([node.__key]);
            itSelectionAnchorKey = node.__key;
            itRenderTree(container);
        }
        const count = itSelectedKeys.size;

        const menu = document.createElement('div');
        menu.className = 'it-ctx-menu';
        menu.innerHTML = `
            <div class="it-ctx-item" data-action="level">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 5v14l11-7z"/></svg>
                Set level to…
            </div>
            <div class="it-ctx-levels" style="display:none;">
                ${[1, 2, 3, 4, 5, 6].map(n => `<button type="button" data-level="${n}">${n}</button>`).join('')}
            </div>
            <div class="it-ctx-item" data-action="copy">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="10" height="10" rx="1"/><path d="M5 15V6a1 1 0 011-1h9"/></svg>
                Copy access to…
            </div>
            <div class="it-ctx-sep"></div>
            <div class="it-ctx-item it-ctx-danger" data-action="delete">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" stroke-linecap="round" stroke-linejoin="round"/></svg>
                Delete (${count} selected)
            </div>
        `;
        document.body.appendChild(menu);
        itContextMenuEl = menu;

        const rect = menu.getBoundingClientRect();
        menu.style.left = Math.min(clientX, window.innerWidth - rect.width - 8) + 'px';
        menu.style.top = Math.min(clientY, window.innerHeight - rect.height - 8) + 'px';

        menu.querySelector('[data-action="level"]').addEventListener('click', (e) => {
            e.stopPropagation();
            const levels = menu.querySelector('.it-ctx-levels');
            levels.style.display = levels.style.display === 'none' ? 'flex' : 'none';
        });
        menu.querySelectorAll('.it-ctx-levels button').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (node.__folderId && node.__entryUser && !node.isInherited) {
                    itCommitLevelChange(node, btn.dataset.level);
                }
                itDismissContextMenu();
            });
        });
        menu.querySelector('[data-action="copy"]').addEventListener('click', () => {
            const armed = [];
            itSelectedKeys.forEach(key => {
                const visNode = itLastVisible.find(v => v.data.__key === key);
                if (visNode && visNode.data.__folderId && visNode.data.__entryUser) {
                    armed.push({ folderId: visNode.data.__folderId, entryUser: visNode.data.__entryUser });
                }
            });
            itCopyTargetArmed = armed.length > 0 ? armed : null;
            itDismissContextMenu();
        });
        menu.querySelector('[data-action="delete"]').addEventListener('click', () => {
            itDismissContextMenu();
            itShowDeleteConfirm(container);
        });

        // Any click elsewhere dismisses the menu — scheduled for next tick so
        // the very click that opened it doesn't immediately close it.
        setTimeout(() => document.addEventListener('click', itDismissContextMenu, { once: true }), 0);
    }

    /** Apply a "Copy access to…" armed from the context menu onto the clicked folder. */
    function itPerformArmedCopy(container, folderId) {
        if (!itCopyTargetArmed) return;
        itCopyTargetArmed.forEach(({ folderId: sourceFolderId, entryUser }) => {
            copyEntryToFolder(sourceFolderId, folderId, entryUser);
        });
        itCopyTargetArmed = null;
        itSelectedKeys = new Set();
        itSelectionAnchorKey = null;
        itRenderTree(container);
    }

    // ---------- Rendering ----------

    function itBuildRowContent(sel, d, rowX, container) {
        const hasChildren = itNodeHasChildren(d);
        const expanded = itExpandedKeys.has(d.__key);
        const loading = itLoadingKeys.has(d.__key);
        // For these types, expand/collapse is via the "+"/circle only, and
        // the text is reserved for select-to-delete — split from the
        // folder/group default of "click anywhere on the row expands".
        const isSubjectRow = d.type === 'user' || d.type === 'company' || d.type === 'role';

        // Keyboard-navigation focus ring — a full-row band so Up/Down/Left/
        // Right always shows where you are, independent of any text
        // selection (which only highlights the label itself).
        if (d.__key === itFocusedKey) {
            sel.append('rect')
                .attr('class', 'it-focus-ring')
                .attr('x', -1000).attr('y', -11).attr('width', 3000).attr('height', 22)
                .attr('fill', 'rgba(6,150,215,0.08)')
                .attr('stroke', '#0696D7').attr('stroke-width', 1.5)
                .style('pointer-events', 'none');
        }

        // "+"/"−" square toggle, centered exactly on the row's anchor point
        // (à la https://observablehq.com/@laotzunami/collapsible-indented-tree)
        // — this anchor is also what the connector lines terminate at, so the
        // box and the lines always meet precisely. Leaves get no box at all,
        // matching the reference (the connector's rounded end is the only
        // marker for a leaf).
        if (hasChildren) {
            const toggleRect = sel.append('rect')
                .attr('class', 'it-toggle')
                .attr('x', -IT_BOX_HALF).attr('y', -IT_BOX_HALF)
                .attr('width', IT_BOX).attr('height', IT_BOX)
                .attr('rx', 2)
                .attr('fill', loading ? '#bdbdbd' : '#a8a8a8')
                .attr('stroke', '#7a7a7a')
                .attr('stroke-width', 1);
            if (isSubjectRow) {
                toggleRect.style('cursor', 'pointer').on('click', (event) => {
                    event.stopPropagation();
                    itClearSelection();
                    itToggleExpandNode(container, d);
                });
            }
            sel.append('text')
                .attr('x', 0).attr('y', 3.5)
                .attr('text-anchor', 'middle')
                .attr('font-size', loading ? '8px' : '11px').attr('font-weight', 'bold')
                .attr('font-family', "'Artifact Elements', Arial, sans-serif")
                .attr('fill', '#ffffff')
                .style('pointer-events', 'none')
                .text(loading ? '…' : (expanded ? '−' : '+'));
        }

        const iconWidth = itDrawIcon(sel, d, IT_BOX_HALF + 5, isSubjectRow ? () => { itClearSelection(); itToggleExpandNode(container, d); } : null);
        const nameX = iconWidth + 6;

        // Fit the label to whatever's left of the Name column at this depth
        // (rowX already accounts for indentation) — the resizer changes this
        // on every drag, so it's computed fresh each render rather than fixed.
        const boundaries = itGetColBoundaries();
        const availablePx = Math.max(boundaries.levelStart - rowX - nameX - 10, 40);
        const maxChars = Math.max(Math.floor(availablePx / 6.6), 3);
        const displayName = itTruncate(d.name, maxChars);
        const deletable = isSubjectRow && itIsDeletableNode(d);
        const label = sel.append('text')
            .attr('x', nameX).attr('y', 4)
            .attr('font-size', '12.5px')
            .attr('font-family', "'Artifact Elements', Arial, sans-serif")
            .attr('font-weight', (d.type === 'folder' || d.type === 'group') ? '600' : (d.__matched ? 'bold' : 'normal'))
            .attr('font-style', d.isInherited ? 'italic' : 'normal')
            .attr('fill', d.__matched ? '#ff6b00' : (d.type === 'folder' || d.type === 'group' ? '#5f6368' : (d.isInherited ? '#999' : '#222')))
            .style('cursor', deletable ? 'pointer' : null)
            .text(displayName);
        if (isSubjectRow) {
            label.on('click', (event) => {
                event.stopPropagation();
                itSelectNode(container, d, event);
            });
        }
        // Selection highlight is sized to the text itself (not the row) —
        // inserted just behind the label so the text paints on top of it.
        if (deletable && itSelectedKeys.has(d.__key)) {
            const bbox = label.node().getBBox();
            sel.insert('rect', () => label.node())
                .attr('class', 'it-select-highlight')
                .attr('x', bbox.x - 3).attr('y', bbox.y - 2)
                .attr('width', bbox.width + 6).attr('height', bbox.height + 4)
                .attr('rx', 3)
                .attr('fill', 'rgba(220,53,69,0.15)')
                .attr('stroke', 'rgba(220,53,69,0.5)').attr('stroke-width', 1)
                .style('pointer-events', 'none');
        }
        const accessCountText = typeof d.accessCount === 'number'
            ? `${d.accessCount} folder${d.accessCount === 1 ? '' : 's'}`
            : null;
        label.append('title').text(accessCountText ? `${d.name} — ${accessCountText}` : d.name);

        // ----- Level column: fixed x regardless of depth, so it lines up as
        // a real column instead of trailing the (variable-length) name. A
        // real <input> (via foreignObject) so editing behaves exactly like
        // the main table: arrow keys step 1-6, typed digits are clamped,
        // inherited entries are readonly. -----
        if (itLevelColumnVisible() && d.level && itIsProjectAdmin(d.email)) {
            // Project Admins have automatic full access regardless of any
            // explicit entry — a numeric level would be misleading here.
            const colX = boundaries.levelStart - rowX + 8;
            sel.append('text')
                .attr('x', colX).attr('y', 3)
                .attr('font-size', '10.5px')
                .attr('fill', '#aaa')
                .text('Admin');
        } else if (itLevelColumnVisible() && d.level) {
            const colX = boundaries.levelStart - rowX + 8;
            const colors = d.subjectType ? getSubjectColor(d.subjectType, d.level) : getPermissionLevelColor(d.level);
            const editable = !d.isInherited && !!d.__folderId;

            const input = sel.append('foreignObject')
                .attr('x', colX).attr('y', -9).attr('width', 22).attr('height', 18)
                .append('xhtml:input')
                .attr('type', 'text')
                .attr('maxlength', 1)
                .attr('class', 'it-level-input')
                .property('value', d.level)
                .property('readOnly', !editable)
                .property('title', !editable
                    ? (d.isInherited
                        ? 'Inherited from parent folder (read-only)'
                        : (d.viaLabel ? `${d.viaLabel} — edit it from the folder's own Role/Company row (read-only here)` : ''))
                    : '')
                .style('width', '20px').style('height', '16px')
                .style('box-sizing', 'border-box')
                .style('text-align', 'center')
                .style('font-size', '10px').style('font-weight', 'bold')
                .style('font-family', "'Artifact Elements', Arial, sans-serif")
                .style('border', 'none').style('border-radius', '3px').style('padding', '0')
                .style('background', colors.background).style('color', colors.color)
                .style('outline', 'none')
                .style('cursor', editable ? 'text' : 'default')
                .style('opacity', editable ? 1 : 0.85);

            if (editable) {
                const applyColors = (el, level) => {
                    const c = d.subjectType ? getSubjectColor(d.subjectType, level) : getPermissionLevelColor(level);
                    el.style.background = c.background;
                    el.style.color = c.color;
                };
                input
                    .on('click', (event) => event.stopPropagation())
                    .on('mousedown', (event) => event.stopPropagation())
                    .on('keydown', function(event) {
                        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
                        event.preventDefault();
                        let level = parseInt(this.value) || 1;
                        level = event.key === 'ArrowLeft' ? Math.max(1, level - 1) : Math.min(6, level + 1);
                        this.value = level;
                        applyColors(this, level);
                        itCommitLevelChange(d, String(level));
                        itUpdateIconColorsInPlace(this.closest('g.it-row'), d);
                    })
                    .on('input', function() {
                        const value = this.value;
                        if (value && (value < '1' || value > '6' || isNaN(value))) {
                            this.value = value.slice(0, -1);
                            return;
                        }
                        if (value && value >= '1' && value <= '6') {
                            applyColors(this, value);
                            itCommitLevelChange(d, value);
                            itUpdateIconColorsInPlace(this.closest('g.it-row'), d);
                        }
                    })
                    .on('change', function() {
                        const level = this.value || '6';
                        this.value = level;
                        applyColors(this, level);
                        itCommitLevelChange(d, level);
                        itUpdateIconColorsInPlace(this.closest('g.it-row'), d);
                    });
            }

            const noteParts = [];
            if (d.isInherited) noteParts.push('inherited');
            if (d.viaLabel) noteParts.push(d.viaLabel);
            if (noteParts.length > 0) {
                // Clip against whichever column comes next (Folders/Users if
                // shown, else the row's own right edge) instead of letting it
                // run on indefinitely and overlap that column's content.
                const noteFull = noteParts.join(' · ');
                const noteX = colX + 26;
                const clipBoundary = itUsersColumnVisible() ? boundaries.usersStart : boundaries.end;
                const availableForNote = clipBoundary - rowX - noteX - 6;
                const maxNoteChars = Math.floor(availableForNote / 6);
                if (maxNoteChars > 0) {
                    const noteDisplay = itTruncate(noteFull, maxNoteChars);
                    const noteText = sel.append('text')
                        .attr('x', noteX).attr('y', 3)
                        .attr('font-size', '9.5px').attr('font-style', 'italic')
                        .attr('fill', '#999')
                        .text(noteDisplay);
                    if (noteDisplay !== noteFull) noteText.append('title').text(noteFull);
                }
            }
        }

        // ----- 3rd column: subjects-per-folder ("Folders → Users") or
        // folders-per-user ("Users → Folders"). A user with 0 access is
        // flagged in orange — the whole point of being able to sort by this. -----
        if (itUsersColumnVisible() && typeof d.userCount === 'number') {
            // A folder with nobody's access doesn't need a "0" competing for
            // attention with every sibling that actually has people in it —
            // a faint dash reads as "nothing here" without shouting it.
            const colX = boundaries.usersStart - rowX + 8;
            sel.append('text')
                .attr('x', colX).attr('y', 3)
                .attr('font-size', '11px').attr('fill', d.userCount > 0 ? '#444' : '#ccc')
                .text(d.userCount > 0 ? d.userCount : '—');
        } else if (itUsersColumnVisible() && accessCountText) {
            const colX = boundaries.usersStart - rowX + 8;
            sel.append('text')
                .attr('x', colX).attr('y', 3)
                .attr('font-size', '11px')
                .attr('font-weight', d.accessCount === 0 ? 'bold' : 'normal')
                .attr('fill', d.accessCount === 0 ? '#e67e22' : '#444')
                .text(accessCountText);
        }
    }

    /**
     * Accept drops from the "Project Users" panel (setupUserListDrag() in
     * read_project_folders.js — unchanged, still the drag source) onto
     * folder rows, adding each dropped user/role/company as a direct, level-1
     * assignment. Only meaningful in "Folders → Users" mode, where a row
     * genuinely represents a folder you can assign access to; the folder
     * nodes shown in the other two orientations are read-only summaries of
     * someone's existing access, not a place to grant new access.
     */
    // Native HTML5 drag-and-drop on SVG content is unreliable across
    // browsers (in particular, initiating a drag from an SVG <text> element
    // — the most prominent grabbable part of a row — is a known problem
    // area), so dragging a selected row onto another folder uses a custom
    // press-move-release gesture on top of plain mouse events instead, which
    // sidesteps all of that entirely. Only one such drag is ever active.
    let itRowDragState = null; // { keys, startX, startY, dragging, ghostEl, hoverRowEl, container }

    function itUpdateDragGhostPosition(event) {
        if (!itRowDragState || !itRowDragState.ghostEl) return;
        itRowDragState.ghostEl.style.left = (event.clientX + 14) + 'px';
        itRowDragState.ghostEl.style.top = (event.clientY + 10) + 'px';
    }

    function itSetDragHoverRow(rowEl) {
        if (itRowDragState.hoverRowEl === rowEl) return;
        if (itRowDragState.hoverRowEl) {
            itRowDragState.hoverRowEl.querySelector('rect.it-drop-highlight')?.remove();
        }
        itRowDragState.hoverRowEl = rowEl;
        if (rowEl) {
            d3.select(rowEl).insert('rect', ':first-child')
                .attr('class', 'it-drop-highlight')
                .attr('x', -1000).attr('y', -12).attr('width', 3000).attr('height', 24)
                .attr('fill', 'rgba(6,150,215,0.12)')
                .style('pointer-events', 'none');
        }
    }

    function itHandleRowDragMove(event) {
        if (!itRowDragState) return;
        const dx = event.clientX - itRowDragState.startX;
        const dy = event.clientY - itRowDragState.startY;
        if (!itRowDragState.dragging) {
            if (Math.hypot(dx, dy) < 4) return; // movement threshold — don't hijack plain clicks
            itRowDragState.dragging = true;
            const ghost = document.createElement('div');
            ghost.className = 'it-drag-ghost';
            ghost.textContent = itRowDragState.keys.length === 1
                ? itRowDragState.keys[0].name
                : `${itRowDragState.keys.length} items`;
            document.body.appendChild(ghost);
            itRowDragState.ghostEl = ghost;
        }
        itUpdateDragGhostPosition(event);

        const el = document.elementFromPoint(event.clientX, event.clientY);
        const rowEl = el && el.closest && el.closest('g.it-row');
        const bound = rowEl && rowEl.__data__;
        const isFolderTarget = itMode === 'folders' && bound && bound.data.type === 'folder' && !!bound.data.folderId;
        itSetDragHoverRow(isFolderTarget ? rowEl : null);
    }

    function itHandleRowDragEnd() {
        document.removeEventListener('mousemove', itHandleRowDragMove);
        document.removeEventListener('mouseup', itHandleRowDragEnd);
        if (!itRowDragState) return;

        const { dragging, keys, hoverRowEl, ghostEl, container } = itRowDragState;
        if (ghostEl) ghostEl.remove();
        if (hoverRowEl) hoverRowEl.querySelector('rect.it-drop-highlight')?.remove();
        itRowDragState = null;

        if (!dragging || !hoverRowEl) return;
        const targetFolderId = hoverRowEl.__data__?.data?.folderId;
        if (!targetFolderId) return;

        keys.forEach(({ folderId: sourceFolderId, entryUser }) => {
            copyEntryToFolder(sourceFolderId, targetFolderId, entryUser);
        });
        itSelectedKeys = new Set();
        itSelectionAnchorKey = null;
        itRenderTree(container);
    }

    /**
     * Starts a custom drag gesture on mousedown over a selected direct entry
     * (user/role/company) — only entries you've explicitly selected (plain
     * click, or Ctrl/Shift multi-select) can be dragged at all, and dragging
     * one drags the whole current selection together. Copies each onto
     * whatever folder the gesture ends over — the "Project Users" panel's
     * own drop-onto-folder handling is untouched and still native-DnD-based.
     */
    function itWireRowDragSource(rowSelection, container) {
        rowSelection.on('mousedown.itdrag', function(event, d) {
            if (event.button !== 0) return; // left button only
            if (event.target.closest('.it-level-input')) return; // let level editing work normally
            if (!itIsDeletableNode(d.data) || !itSelectedKeys.has(d.data.__key)) return;

            const keys = [];
            itSelectedKeys.forEach(key => {
                const visNode = itLastVisible.find(v => v.data.__key === key);
                const node = visNode && visNode.data;
                if (node && itIsDeletableNode(node) && node.__folderId && node.__entryUser) {
                    keys.push({ folderId: node.__folderId, entryUser: node.__entryUser, name: node.name });
                }
            });
            if (keys.length === 0) return;

            itRowDragState = { keys, startX: event.clientX, startY: event.clientY, dragging: false, ghostEl: null, hoverRowEl: null, container };
            document.addEventListener('mousemove', itHandleRowDragMove);
            document.addEventListener('mouseup', itHandleRowDragEnd);
        });
    }

    function itWireRowDropTargets(rowSelection, container) {
        rowSelection
            .on('dragover', function(event, d) {
                const g = d3.select(this);
                const isValidTarget = itMode === 'folders' && d.data.type === 'folder';
                if (isValidTarget) {
                    event.preventDefault();
                    g.select('rect.it-drop-invalid').remove();
                    if (g.select('rect.it-drop-highlight').empty()) {
                        g.insert('rect', ':first-child')
                            .attr('class', 'it-drop-highlight')
                            .attr('x', -1000).attr('y', -12).attr('width', 3000).attr('height', 24)
                            .attr('fill', 'rgba(6,150,215,0.12)')
                            .style('pointer-events', 'none');
                    }
                } else {
                    // Not a valid drop target here — a soft red wash instead
                    // of staying ambiguous about whether dropping will do
                    // anything. Deliberately not calling preventDefault, so
                    // the browser's own "no-drop" cursor shows too.
                    g.select('rect.it-drop-highlight').remove();
                    if (g.select('rect.it-drop-invalid').empty()) {
                        g.insert('rect', ':first-child')
                            .attr('class', 'it-drop-invalid')
                            .attr('x', -1000).attr('y', -12).attr('width', 3000).attr('height', 24)
                            .attr('fill', 'rgba(220,53,69,0.08)')
                            .style('pointer-events', 'none');
                    }
                }
            })
            .on('dragleave', function(event, d) {
                const g = d3.select(this);
                g.select('rect.it-drop-highlight').remove();
                g.select('rect.it-drop-invalid').remove();
            })
            .on('drop', function(event, d) {
                d3.select(this).select('rect.it-drop-invalid').remove();
                if (itMode !== 'folders' || d.data.type !== 'folder') return;
                event.preventDefault();
                d3.select(this).select('rect.it-drop-highlight').remove();

                const folderId = d.data.folderId;
                if (!folderId) return;

                let usersToAssign = [];
                const multiData = event.dataTransfer.getData('application/json');
                if (multiData) {
                    try { usersToAssign = JSON.parse(multiData); } catch (err) { /* ignore malformed payload */ }
                }
                if (usersToAssign.length === 0) {
                    const single = event.dataTransfer.getData('text/plain');
                    if (single) usersToAssign = [single];
                }
                if (usersToAssign.length === 0) return;

                usersToAssign.forEach(userName => addUserToFolder(folderId, userName, '1', false));
                itRenderTree(container);

                selectedUsers = [];
                document.querySelectorAll('.user-list-item').forEach(item => item.classList.remove('user-selected'));
            });
    }

    function itDrawTree(container, visible) {
        const boundaries = itGetColBoundaries();
        const width = Math.max(boundaries.end, container.clientWidth || 500);
        const height = Math.max(visible.length * IT_ROW_H + 30, 80);

        let svg = d3.select(container).select('svg.it-svg');
        if (svg.empty()) {
            svg = d3.select(container).append('svg').attr('class', 'it-svg').style('display', 'block');
            svg.append('g').attr('class', 'it-col-lines').attr('stroke', '#e8e8e8').attr('stroke-width', 1);
            svg.append('g').attr('class', 'it-links').attr('fill', 'none').attr('stroke', '#aaa').attr('stroke-width', 0.9);
            svg.append('g').attr('class', 'it-rows');
        }
        svg.attr('width', width).attr('height', height);

        // Column divider lines behind the rows, spanning the full row height —
        // purely visual, they don't affect hit-testing or row positions.
        const colLineX = [];
        if (itLevelColumnVisible()) colLineX.push(boundaries.levelStart);
        if (itUsersColumnVisible()) colLineX.push(boundaries.usersStart);
        const colLines = svg.select('g.it-col-lines').selectAll('line').data(colLineX);
        colLines.enter().append('line').merge(colLines)
            .attr('x1', x => x).attr('x2', x => x)
            .attr('y1', 0).attr('y2', height);
        colLines.exit().remove();

        const rowsG = svg.select('g.it-rows');
        const linksG = svg.select('g.it-links');
        const t = d3.transition().duration(220);

        const yOf = new Map(visible.map((v, i) => [v.data.__key, (i + 1) * IT_ROW_H]));
        const xOf = new Map(visible.map(v => [v.data.__key, IT_ROW_X0 + v.depth * IT_INDENT]));
        const transformOf = d => `translate(${xOf.get(d.data.__key)}, ${yOf.get(d.data.__key)})`;

        // --- Rows ---
        const rowSel = rowsG.selectAll('g.it-row').data(visible, d => d.data.__key);

        rowSel.exit().transition(t).style('opacity', 0).remove();

        // Subject rows (user/company/role) delegate their click zones to the
        // toggle box, icon, and text individually (see itBuildRowContent) —
        // the row itself carries no cursor/click of its own for those.
        const rowCursor = node => {
            if (node.type === 'user' || node.type === 'company' || node.type === 'role') return 'default';
            return itNodeHasChildren(node) ? 'pointer' : 'default';
        };

        const rowEnter = rowSel.enter().append('g')
            .attr('class', 'it-row')
            .attr('transform', transformOf)
            .style('opacity', 0)
            .style('cursor', d => rowCursor(d.data))
            .on('click', (event, d) => {
                itHandleRowClick(container, d.data);
            });

        const rowMerge = rowEnter.merge(rowSel);
        rowMerge.style('cursor', d => rowCursor(d.data));
        rowMerge.classed('it-row-zebra', (d, i) => i % 2 === 1);
        rowMerge.classed('it-row-focused', d => d.data.__key === itFocusedKey);
        rowMerge.each(function(d) {
            const g = d3.select(this);
            g.selectAll('*').remove();
            itBuildRowContent(g, d.data, xOf.get(d.data.__key), container);
        });
        rowMerge.transition(t)
            .attr('transform', transformOf)
            .style('opacity', 1);

        itWireRowDropTargets(rowMerge, container);
        itWireRowDragSource(rowMerge, container);
        rowMerge.on('contextmenu', function(event, d) {
            if (!itIsDeletableNode(d.data)) return;
            event.preventDefault();
            itShowContextMenu(container, d.data, event.clientX, event.clientY);
        });

        // --- Connectors back to parent — same rounded-elbow shape as the
        // reference (see itMakeLink): a straight drop at the parent's toggle
        // x, a rounded corner, then a straight run into the child's toggle x.
        // Leaves have no visible box, so their end point nudges right by
        // IT_BOX_HALF (matching the reference's `target.y + boxSize/2` for
        // leaf targets) so the line still lands right before the label.
        const linkData = visible.filter(v => v.data.__ancestors.length > 0);
        const linkSel = linksG.selectAll('path.it-link').data(linkData, d => d.data.__key);

        linkSel.exit().transition(t).style('opacity', 0).remove();

        const linkEnter = linkSel.enter().append('path')
            .attr('class', 'it-link')
            .style('opacity', 0);

        linkEnter.merge(linkSel)
            .attr('d', d => {
                const parentKey = d.data.__ancestors[d.data.__ancestors.length - 1];
                const px = xOf.get(parentKey), py = yOf.get(parentKey);
                if (px === undefined || py === undefined) return '';
                const cx = xOf.get(d.data.__key) + (itNodeHasChildren(d.data) ? 0 : IT_BOX_HALF);
                const cy = yOf.get(d.data.__key);
                return itMakeLink([px, py], [cx, cy], IT_LINK_RADIUS);
            })
            .transition(t)
            .style('opacity', 1);
    }

    function itUpdateStatusBar(count) {
        const el = document.getElementById('itStatusBar');
        if (!el) return;
        const modeLabel = itMode === 'folders' ? 'Folders → Users'
            : itMode === 'users' ? 'Users → Folders'
            : 'Roles/Companies → Users → Folders';
        const selCount = itSelectedKeys.size;
        const isBusy = itTreeBusy || itLoadingKeys.size > 0;
        const busyMarkup = isBusy
            ? '<div class="it-progress-wrap" aria-live="polite"><div class="it-progress-bar"></div></div><div class="it-status-line"><span class="it-status-busy"><span class="it-busy-dot"></span>' + (itTreeBusyLabel || 'Loading folders…') + '</span></div>'
            : '';
        const items = [
            `<span>${modeLabel} — ${count} row${count === 1 ? '' : 's'} visible</span>`,
            selCount > 0 ? `<span class="it-status-sel">${selCount} selected</span>` : ''
        ].filter(Boolean);
        el.innerHTML = busyMarkup + '<div class="it-status-line">' + items.join(' ') + '</div>';
    }

    /**
     * Auto-expand the top level so the next level down is visible immediately
     * instead of requiring a click — mirrors ACC's own folder browser, which
     * always opens with the root expanded. In "folders" mode that's the
     * top-level folder(s) ("Project Files" etc.); in "subjects" mode it's the
     * "Companies (N)" / "Roles (N)" group headers, so the actual company/role
     * list is visible right away. Doesn't apply to "users" mode — there the
     * top level is every project user, and auto-expanding all of them at
     * once would mean fetching everyone's folder access up front.
     */
    function itAutoExpandFirstLevel() {
        if (itMode !== 'folders' && itMode !== 'subjects') return;
        const data = itBuildData();
        itAssignKeys(data.children || [], '', []);
        (data.children || []).forEach(n => itExpandedKeys.add(n.__key));
    }

    function itUpdateSearchMatchCount(visible) {
        const el = document.getElementById('itSearchMatchCount');
        if (!el) return;
        if (!itSearchQuery) { el.style.display = 'none'; return; }
        const count = visible.filter(v => v.data.__matched).length;
        el.textContent = `${count} match${count === 1 ? '' : 'es'}`;
        el.style.display = 'inline-flex';
    }

    function itRenderTree(container) {
        const data = itBuildData();
        itAssignKeys(data.children || [], '', []);
        itApplySearchExpansion(data.children || []);
        const visible = itComputeVisible(data);
        itLastVisible = visible;
        if (itSelectedKeys.size > 0) {
            const visibleKeys = new Set(visible.map(v => v.data.__key));
            itSelectedKeys.forEach(key => { if (!visibleKeys.has(key)) itSelectedKeys.delete(key); });
        }
        itDrawTree(container, visible);
        itUpdateStatusBar(visible.length);
        itUpdateSearchMatchCount(visible);
    }

    /**
     * Cheap redraw for column-width changes (dragging a resizer): reuses the
     * already-computed visible-row list instead of rebuilding the tree data,
     * since resizing never changes which rows are expanded/visible.
     */
    function itRedrawColumnsOnly(container) {
        itDrawTree(container, itLastVisible);
    }

    /** Sync the header cell widths (and total header width) to itColWidths. */
    function itApplyColumnWidths(overlay) {
        const header = overlay.querySelector('#itColHeader');
        if (!header) return;
        header.querySelectorAll('.it-col-cell').forEach(cell => {
            const col = cell.dataset.col;
            cell.style.width = itColWidths[col] + 'px';
        });
    }

    /** Show/hide the Users/Level header cells to match their visibility functions. */
    function itUpdateColumnVisibility(overlay) {
        const usersCell = overlay.querySelector('.it-col-cell[data-col="users"]');
        if (usersCell) usersCell.style.display = itUsersColumnVisible() ? '' : 'none';
        const levelCell = overlay.querySelector('.it-col-cell[data-col="level"]');
        if (levelCell) levelCell.style.display = itLevelColumnVisible() ? '' : 'none';
        const levelLabel = overlay.querySelector('#itLevelColLabel');
        if (levelLabel) levelLabel.textContent = itMode === 'users' ? 'Accessed' : 'Level';
        itUpdateUsersColumnHeader(overlay);
    }

    /**
     * Label + sort indicator for the 3rd column, and whether it's clickable —
     * sorting only applies in "Users → Folders" (sorting "assigned per
     * folder" in the other mode wouldn't mean much since row order there is
     * the folder tree itself).
     */
    function itUpdateUsersColumnHeader(overlay) {
        const cell = overlay.querySelector('#itUsersColHeader');
        const label = overlay.querySelector('#itUsersColLabel');
        if (!cell || !label) return;
        if (itMode === 'users') {
            const arrow = itUserSortMode === 'asc' ? ' ↑' : itUserSortMode === 'desc' ? ' ↓' : '';
            label.textContent = 'Folders' + arrow;
            cell.style.cursor = 'pointer';
            cell.title = 'Click to sort by folder access count — ascending shows users with no access first';
        } else if (itMode === 'subjects') {
            label.textContent = 'Folders';
            cell.style.cursor = 'default';
            cell.title = '';
        } else {
            label.textContent = 'Users';
            cell.style.cursor = 'default';
            cell.title = '';
        }
    }

    /**
     * Drag-to-resize for the Name/Level column boundaries. Live-updates
     * itColWidths and redraws both the header and the tree (via the cheap
     * itRedrawColumnsOnly path — resizing never changes row visibility).
     */
    function itSetupColumnResize(overlay) {
        let dragCol = null;
        let dragStartX = 0;
        let dragStartWidth = 0;
        let rafPending = false;

        overlay.querySelectorAll('.it-col-resizer').forEach(handle => {
            handle.addEventListener('mousedown', (e) => {
                e.preventDefault();
                dragCol = handle.dataset.col;
                dragStartX = e.clientX;
                dragStartWidth = itColWidths[dragCol];
                handle.classList.add('it-col-resizing');
                document.body.style.cursor = 'col-resize';
            });
        });

        document.addEventListener('mousemove', (e) => {
            if (!dragCol) return;
            const delta = e.clientX - dragStartX;
            itColWidths[dragCol] = Math.max(IT_COL_MIN[dragCol], dragStartWidth + delta);
            if (!rafPending) {
                rafPending = true;
                requestAnimationFrame(() => {
                    rafPending = false;
                    itApplyColumnWidths(overlay);
                    const container = document.getElementById('itContainer');
                    if (container) itRedrawColumnsOnly(container);
                });
            }
        });

        document.addEventListener('mouseup', () => {
            if (!dragCol) return;
            dragCol = null;
            document.body.style.cursor = '';
            overlay.querySelectorAll('.it-col-resizer').forEach(h => h.classList.remove('it-col-resizing'));
        });
    }

    /** Apply the current itUserListWidth to the "Project Users" panel. */
    function itApplyUserListWidth(overlay) {
        const panel = overlay.querySelector('#foldersUserList');
        if (panel) panel.style.width = itUserListWidth + 'px';
    }

    /**
     * Drag-to-resize for the "Project Users" left panel, same pattern as
     * itSetupColumnResize but for a single flex-basis width rather than the
     * tree's internal column boundaries.
     */
    function itSetupUserListResize(overlay) {
        const handle = overlay.querySelector('#itUserListResizer');
        if (!handle) return;

        let dragging = false;
        let dragStartX = 0;
        let dragStartWidth = 0;
        let rafPending = false;

        handle.addEventListener('mousedown', (e) => {
            e.preventDefault();
            dragging = true;
            dragStartX = e.clientX;
            dragStartWidth = itUserListWidth;
            handle.classList.add('it-userlist-resizing');
            document.body.style.cursor = 'col-resize';
        });

        document.addEventListener('mousemove', (e) => {
            if (!dragging) return;
            const delta = e.clientX - dragStartX;
            itUserListWidth = Math.min(IT_USER_LIST_MAX, Math.max(IT_USER_LIST_MIN, dragStartWidth + delta));
            if (!rafPending) {
                rafPending = true;
                requestAnimationFrame(() => {
                    rafPending = false;
                    itApplyUserListWidth(overlay);
                });
            }
        });

        document.addEventListener('mouseup', () => {
            if (!dragging) return;
            dragging = false;
            document.body.style.cursor = '';
            handle.classList.remove('it-userlist-resizing');
        });
    }

    /** Apply the current itZoomLevel to the tree's SVG (persists across re-renders — itDrawTree reuses the same svg node rather than recreating it). */
    function itApplyZoom(container) {
        const svg = container.querySelector('svg.it-svg');
        if (!svg) return;
        svg.style.transform = `scale(${itZoomLevel})`;
        svg.style.transformOrigin = 'top left';
    }

    /**
     * Ctrl+Scroll to zoom the tree, same interaction as the old table's
     * setupTableZoom(). Scales the SVG visually via CSS transform; the
     * container keeps its normal scrollbars for panning around at any zoom.
     */
    function itSetupZoom(container) {
        container.addEventListener('wheel', (e) => {
            if (!e.ctrlKey) return;
            e.preventDefault();
            itZoomLevel = e.deltaY < 0
                ? Math.min(itZoomLevel + IT_ZOOM_STEP, IT_ZOOM_MAX)
                : Math.max(itZoomLevel - IT_ZOOM_STEP, IT_ZOOM_MIN);
            itApplyZoom(container);
        }, { passive: false });
    }

    // ---------- Modal shell ----------

    function itInjectStyles() {
        if (document.getElementById('itStyles')) return;
        const style = document.createElement('style');
        style.id = 'itStyles';
        style.textContent = `
            .it-overlay {
                position: fixed; top: 0; left: 0; right: 0; bottom: 0;
                background: rgba(0,0,0,0.6); z-index: 10150;
                display: flex; align-items: center; justify-content: center;
            }
            .it-drag-ghost {
                position: fixed; z-index: 10300; top: 0; left: 0;
                background: #333; color: #fff; padding: 4px 10px; border-radius: 4px;
                font-size: 12px; font-family: 'Artifact Elements', Arial, sans-serif;
                pointer-events: none; white-space: nowrap;
                box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            }
            .it-modal {
                background: #fff; width: 100vw; height: 100vh;
                display: flex; flex-direction: column;
                overflow: hidden;
                font-family: 'Artifact Elements', Arial, sans-serif;
            }
            .it-modal-header {
                display: flex; align-items: center; gap: 14px; flex-wrap: wrap;
                padding: 12px 20px 18px; background: #f5f5f5; border-bottom: 1px solid #ddd; flex-shrink: 0;
            }
            .it-modal-header h3 { margin: 0; font-size: 17px; }
            .it-modal-header h3 .it-proj { color: #888; font-weight: 500; }
            .it-mode-wrap { position: relative; }
            .it-mode-subtitle {
                position: absolute; top: 100%; left: 3px; margin-top: 4px; font-size: 10.5px; color: #999;
                white-space: nowrap; pointer-events: none;
            }

            /* ---- Segmented control — replaces plain radio buttons for both
               the view-orientation switcher here and the Users/Company/Role
               switcher in the left rail. ---- */
            /* index.html has a site-wide "button, .btn { ... !important }"
               rule (blue fill, 200px min-width, 44px height, 4px margin) —
               every button below has to explicitly beat that with its own
               !important on the same properties, or it wins regardless of
               how specific our class selectors are. */
            .it-segmented {
                display: inline-flex !important; padding: 3px !important; background: #eef0f2 !important;
                border: 1px solid #dcdcdc !important; border-radius: 999px !important; gap: 2px;
                min-width: 0 !important; height: auto !important; margin: 0 !important;
            }
            .it-seg-btn {
                border: 0 !important; background: transparent !important; padding: 6px 13px !important;
                font-size: 12.5px !important; font-weight: 600 !important; color: #555 !important;
                border-radius: 999px !important; cursor: pointer; font-family: inherit !important; white-space: nowrap;
                min-width: 0 !important; height: auto !important; margin: 0 !important;
                display: inline-flex !important; align-items: center; justify-content: center;
            }
            .it-seg-btn.active { background: #0696D7 !important; color: #fff !important; }
            .it-seg-btn:not(.active):hover { background: #e2e4e7 !important; color: #222 !important; }

            .it-search-wrap { position: relative; }
            .it-search-wrap svg { position: absolute; left: 9px; top: 50%; transform: translateY(-50%); opacity: .48; pointer-events: none; }
            .it-search {
                padding: 6px 26px 6px 28px; font-size: 12.5px; border: 1px solid #ccc; border-radius: 4px;
                width: 220px; height: auto; outline: none; font-family: inherit; margin: 0;
            }
            .it-search-wrap.has-value .it-search { padding-right: 92px; }
            .it-search:focus { border-color: #0696D7; box-shadow: 0 0 0 3px rgba(6,150,215,0.14); }
            .it-search-match-count {
                position: absolute; right: 26px; top: 50%; transform: translateY(-50%);
                font-size: 10px; font-weight: 700; color: #0696D7; background: #e3f3fb;
                padding: 2px 6px; border-radius: 999px; white-space: nowrap;
            }
            .it-search-clear {
                position: absolute !important; right: 5px; top: 50%; transform: translateY(-50%);
                border: 0 !important; background: none !important; color: #999 !important; cursor: pointer;
                font-size: 15px !important; line-height: 1; padding: 3px !important; display: none; border-radius: 3px !important;
                min-width: 0 !important; height: auto !important; margin: 0 !important;
            }
            .it-search-clear:hover { background: #e2e4e7 !important; color: #333 !important; }
            .it-search-wrap.has-value .it-search-clear { display: block !important; }

            .it-small-btn {
                padding: 6px 12px !important; background: transparent !important; color: #555 !important;
                border: 1px solid #ccc !important; border-radius: 4px !important;
                cursor: pointer; font-size: 12.5px !important; font-weight: 600 !important; font-family: inherit !important;
                display: inline-flex !important; align-items: center; justify-content: center; gap: 5px;
                min-width: 0 !important; height: auto !important; margin: 0 !important;
            }
            .it-small-btn:hover { background: #eef0f2 !important; color: #222 !important; border-color: #b8b8b8 !important; }
            .it-small-btn:disabled { opacity: .55; cursor: default; background: transparent !important; }
            .it-danger-btn { background: #dc3545 !important; color: #fff !important; border-color: #dc3545 !important; }
            .it-danger-btn:hover { background: #c82333 !important; border-color: #c82333 !important; }
            .it-sync-btn { background: #0696D7 !important; color: #fff !important; border-color: #0696D7 !important; font-weight: bold !important; position: relative; }
            .it-sync-btn:hover { background: #0057A0 !important; border-color: #0057A0 !important; }
            .it-sync-badge {
                position: absolute; top: -7px; right: -7px; background: #F2A900; color: #3a2c00; font-size: 10px; font-weight: 800;
                min-width: 18px !important; height: 18px !important; border-radius: 999px !important; display: flex !important;
                align-items: center; justify-content: center; padding: 0 4px !important; margin: 0 !important;
                border: 2px solid #f5f5f5; font-variant-numeric: tabular-nums; line-height: 1;
            }
            .it-error-message {
                padding: 20px; margin: 15px 20px; background: #fff3cd; color: #856404;
                border: 2px solid #ffc107; border-radius: 8px; text-align: center; flex-shrink: 0;
            }
            .it-content-row { display: flex; flex: 1; overflow: hidden; }
            .it-close {
                color: #666; font-size: 28px; font-weight: bold; cursor: pointer;
                margin-left: auto; line-height: 1; padding: 0 8px; transition: all 0.2s;
            }
            .it-close:hover { color: #dc3545; transform: scale(1.2); }
            .it-modal-body-wrap { flex: 1; overflow: auto; position: relative; }
            .it-modal-body {
                padding: 10px 0;
                /* Shift/Ctrl+click for multi-select would otherwise also
                   trigger the browser's native text selection drag. */
                user-select: none; -webkit-user-select: none; -moz-user-select: none;
            }
            .it-col-header {
                display: flex; position: sticky; top: 0; left: 0; z-index: 5;
                background: #f0f0f0; border-bottom: 2px solid #ccc;
                font-size: 11.5px; font-weight: 700; letter-spacing: .02em; color: #666; user-select: none;
            }
            .it-col-cell {
                position: relative; padding: 6px 8px; box-sizing: border-box;
                border-right: 1px solid #ddd; white-space: nowrap; overflow: hidden; flex-shrink: 0;
            }
            .it-col-cell[data-col="name"] {
                padding-left: 26px;
            }
            .it-col-cell[data-col="level"] { overflow: visible; display: flex; align-items: center; gap: 5px; }
            .it-help-dot {
                position: relative; width: 14px; height: 14px; border-radius: 50%; background: #c7cdd6; color: #fff;
                font-size: 9px; font-weight: 800; display: inline-flex; align-items: center; justify-content: center;
                cursor: help; flex-shrink: 0;
            }
            .it-help-tooltip {
                display: none; position: absolute; left: 18px; top: -6px; width: 210px; background: #211e29; color: #fff;
                font-size: 11px; font-weight: 500; text-transform: none; letter-spacing: 0; padding: 9px 11px;
                border-radius: 6px; line-height: 1.7; box-shadow: 0 6px 18px rgba(0,0,0,.25); z-index: 20; white-space: normal;
            }
            .it-help-dot:hover .it-help-tooltip, .it-help-dot:focus .it-help-tooltip { display: block; }
            .it-col-resizer {
                position: absolute; top: 0; right: -4px; width: 8px; height: 100%;
                cursor: col-resize; z-index: 6;
            }
            .it-col-resizer:hover, .it-col-resizer.it-col-resizing { background: rgba(6,150,215,0.25); }
            .it-row:hover { background: rgba(6,150,215,0.045); }
            .it-row.it-row-zebra { background: rgba(0,0,0,0.014); }
            .it-row.it-row-zebra:hover { background: rgba(6,150,215,0.045); }
            .it-row.it-row-focused rect.it-focus-ring { pointer-events: none; }

            .it-confirm-toast {
                position: absolute; bottom: 16px; left: 50%; transform: translateX(-50%);
                background: #211e29; color: #fff; padding: 9px 10px 9px 14px; border-radius: 8px;
                box-shadow: 0 8px 24px rgba(0,0,0,.28); font-size: 12px; display: flex; align-items: center; gap: 10px;
                z-index: 20; white-space: nowrap;
            }
            .it-confirm-toast button {
                border-radius: 5px !important; padding: 5px 10px !important; font-size: 11.5px !important;
                font-weight: 700 !important; min-width: 0 !important; height: auto !important; margin: 0 !important;
                display: inline-flex !important;
            }
            .it-confirm-toast .it-confirm-cancel { background: transparent !important; color: #fff !important; border: 1px solid rgba(255,255,255,.3) !important; }
            .it-confirm-toast .it-confirm-delete { background: #dc3545 !important; color: #fff !important; border: 0 !important; }

            .it-ctx-menu {
                position: fixed; width: 190px; background: #fff; border: 1px solid #ddd; border-radius: 8px;
                box-shadow: 0 8px 24px rgba(0,0,0,.18); padding: 5px; z-index: 10160;
                font-family: 'Artifact Elements', Arial, sans-serif;
            }
            .it-ctx-item {
                padding: 7px 10px; font-size: 12px; border-radius: 5px; display: flex; align-items: center; gap: 8px;
                color: #222; cursor: pointer;
            }
            .it-ctx-item:hover { background: #e3f3fb; }
            .it-ctx-item.it-ctx-danger { color: #dc3545; }
            .it-ctx-item.it-ctx-danger:hover { background: #fdecee; }
            .it-ctx-sep { height: 1px; background: #e5e5e5; margin: 4px 2px; }
            .it-ctx-levels { display: flex; gap: 3px; padding: 4px 6px; }
            .it-ctx-levels button {
                flex: 1; min-width: 0 !important; height: 22px !important; padding: 0 !important; margin: 0 !important;
                border-radius: 4px !important; border: 1px solid #ddd !important; background: #fff !important; color: #555 !important;
                font-size: 11px !important; font-weight: 700 !important;
            }
            .it-ctx-levels button:hover { background: #e3f3fb !important; border-color: #0696D7 !important; color: #0696D7 !important; }
            #itStatusBar {
                padding: 6px 20px 8px; font-size: 11px; color: #888; border-top: 1px solid #eee; background: #fafafa;
                flex-shrink: 0; display: flex; flex-direction: column; gap: 5px;
            }
            .it-status-line {
                display: flex; align-items: center; justify-content: space-between; gap: 8px;
                min-height: 16px;
            }
            .it-status-sel { color: #0696D7; font-weight: 700; }
            .it-progress-wrap {
                position: relative; width: 100%; height: 4px; border-radius: 999px; background: rgba(6, 150, 215, 0.12);
                overflow: hidden;
            }
            .it-progress-bar {
                position: absolute; inset: 0 auto 0 0; width: 36%; border-radius: inherit;
                background: linear-gradient(90deg, rgba(6,150,215,0.2), rgba(6,150,215,0.85), rgba(6,150,215,0.2));
                animation: itBusyPulse 1.25s ease-in-out infinite;
            }
            .it-status-busy {
                display: inline-flex; align-items: center; gap: 6px; color: #4f6477; font-weight: 600;
            }
            .it-busy-dot {
                width: 7px; height: 7px; border-radius: 50%; background: #0696D7; box-shadow: 0 0 0 2px rgba(6,150,215,0.18);
                animation: itBusyDotPulse 1.1s ease-in-out infinite alternate;
            }
            @keyframes itBusyPulse {
                0% { transform: translateX(-30%); }
                50% { transform: translateX(150%); }
                100% { transform: translateX(240%); }
            }
            @keyframes itBusyDotPulse {
                from { opacity: 0.5; transform: scale(0.9); }
                to { opacity: 1; transform: scale(1.1); }
            }

            /* ---- Project Users panel (drag source) — displayUserList()/
               setupUserListDrag() in read_project_folders.js render into and
               drive #foldersUserList unchanged, they just need these class
               names to exist somewhere on the page. ---- */
            .folders-user-list {
                background-color: #f8f9fa;
                overflow-y: auto; flex-shrink: 0; display: flex; flex-direction: column;
            }
            .it-userlist-resizer {
                width: 6px; flex-shrink: 0; cursor: col-resize; background: transparent;
                border-right: 2px solid #ddd; margin-right: -6px; position: relative; z-index: 3;
            }
            .user-list-header {
                padding: 14px 16px; background-color: #fff; border-bottom: 1px solid #ddd;
                position: sticky; top: 0; z-index: 10; display: flex; flex-direction: column; gap: 10px;
            }
            .user-list-header .pu-title { font-size: 14.5px; font-weight: 700; color: #222; }
            .pu-controls { display: flex; align-items: center; gap: 8px; }
            .pu-controls .it-segmented { flex: 1; }
            .pu-controls .it-seg-btn { flex: 1 !important; padding: 6px 8px !important; }
            .pu-icon-btn {
                display: inline-flex !important; align-items: center; justify-content: center;
                width: 30px !important; height: 30px !important; min-width: 0 !important; margin: 0 !important;
                border-radius: 4px !important; border: 1px solid #ccc !important; background: #fff !important;
                color: #666 !important; cursor: pointer; flex-shrink: 0; padding: 0 !important;
            }
            .pu-icon-btn:hover { color: #222 !important; border-color: #999 !important; background: #f5f5f5 !important; }

            .pu-help { border-bottom: 1px solid #ddd; background: #fff; }
            .pu-help summary {
                list-style: none; cursor: pointer; padding: 10px 16px; font-size: 12px; font-weight: 600;
                color: #0696D7; display: flex; align-items: center; gap: 6px; user-select: none;
            }
            .pu-help summary::-webkit-details-marker { display: none; }
            .pu-help summary .pu-chev { transition: transform .15s; font-size: 9px; display: inline-block; }
            .pu-help[open] summary .pu-chev { transform: rotate(90deg); }
            .pu-help-body { padding: 0 16px 14px; font-size: 12px; color: #555; line-height: 1.7; }
            .pu-help-body kbd {
                font-family: inherit; font-size: 11px; font-weight: 700; color: #333;
                background: #f0f0f0; border: 1px solid #ddd; border-radius: 4px; padding: 1px 5px;
            }
            .pu-legend-row { display: flex; gap: 6px; margin-top: 10px; flex-wrap: wrap; }
            .pu-chip { font-size: 11px; font-weight: 700; padding: 3px 9px; border-radius: 999px; }
            .pu-chip-user { background: #dceafd; color: #1560c4; }
            .pu-chip-company { background: #ffe6c2; color: #a86a10; }
            .pu-chip-role { background: #ddf2de; color: #297a37; }

            .user-list-items { padding: 8px; display: flex; flex-direction: column; gap: 3px; }
            .user-list-item {
                display: flex; align-items: center; gap: 8px; padding: 7px 9px; border-radius: 5px;
                border: 1px solid transparent; font-size: 12.5px; color: #222; cursor: grab; transition: background .12s, border-color .12s;
            }
            .user-list-item:hover { background: #fff; border-color: #ddd; }
            .user-list-item.user-selected { background-color: #0696D7; border-color: #0057A0; color: #fff; }
            .user-list-item.user-selected .pu-item-email, .user-list-item.user-selected .pu-handle { color: rgba(255,255,255,0.75); }
            .user-list-item.dragging { opacity: 0.5; cursor: grabbing; }
            .pu-handle { color: #b7b7b7; font-size: 11px; letter-spacing: -2px; flex-shrink: 0; }
            .pu-avatar {
                width: 24px; height: 24px; border-radius: 50%; flex-shrink: 0; display: flex; align-items: center;
                justify-content: center; font-size: 10px; font-weight: 700; background: #dceafd; color: #1560c4;
            }
            .user-list-item.user-selected .pu-avatar { background: rgba(255,255,255,0.25); color: #fff; }
            .pu-item-text { min-width: 0; display: flex; flex-direction: column; }
            .pu-item-name { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .pu-item-email { font-size: 11px; color: #999; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        `;
        document.head.appendChild(style);
    }

    /**
     * Open the indented-tree modal. Entry point called from
     * read_project_folders.js — the only symbol this file exposes.
     */
    function openIndentedTreeModal() {
        const existing = document.getElementById('itOverlay');
        if (existing) existing.remove();

        itInjectStyles();
        itMode = 'folders';
        itSearchQuery = '';
        itExpandedKeys = new Set();
        itSelectedKeys = new Set();
        itSelectionAnchorKey = null;
        itZoomLevel = 1.0;
        itCleaned = false;
        itDeletedGrants = [];
        itPendingChangeCount = 0;
        itFocusedKey = null;
        itDeleteConfirmEl = null;
        itContextMenuEl = null;
        itCopyTargetArmed = null;
        itAutoExpandFirstLevel();

        const overlay = document.createElement('div');
        overlay.id = 'itOverlay';
        overlay.className = 'it-overlay';
        overlay.innerHTML = `
            <div class="it-modal">
                <div class="it-modal-header">
                    <h3 id="itModalTitle">Folder Access</h3>
                    <div class="it-mode-wrap">
                        <div class="it-segmented" id="itModeSegmented" role="tablist" aria-label="View orientation">
                            <button type="button" class="it-seg-btn active" data-mode="folders">Folders → Users</button>
                            <button type="button" class="it-seg-btn" data-mode="users">Users → Folders</button>
                            <button type="button" class="it-seg-btn" data-mode="subjects">Roles/Companies → Users → Folders</button>
                        </div>
                        <div class="it-mode-subtitle" id="itModeSubtitle">See who has access to each folder</div>
                    </div>
                    <div class="it-search-wrap">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3" stroke-linecap="round"/></svg>
                        <input type="text" id="itSearch" class="it-search" placeholder="Search name or email..." autocomplete="off" />
                        <span class="it-search-match-count" id="itSearchMatchCount" style="display:none;"></span>
                        <button type="button" class="it-search-clear" id="itSearchClear" title="Clear search">&times;</button>
                    </div>
                    <button id="itExpandAllBtn" class="it-small-btn" type="button">Expand</button>
                    <button id="itCollapseAllBtn" class="it-small-btn" type="button">Collapse All</button>
                    <button id="itCleanBtn" class="it-small-btn it-danger-btn" type="button">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" stroke-linecap="round" stroke-linejoin="round"/></svg>
                        Clean Folders
                    </button>
                    <button id="itSyncBtn" class="it-small-btn it-sync-btn" type="button">Sync with the project</button>
                    <span class="it-close">&times;</span>
                </div>
                <div id="itErrorMessage" class="it-error-message" style="display:none;"></div>
                <div class="it-content-row">
                    <div id="foldersUserList" class="folders-user-list"></div>
                    <div class="it-userlist-resizer" id="itUserListResizer" title="Drag to resize"></div>
                    <div class="it-modal-body-wrap">
                        <div class="it-col-header" id="itColHeader">
                            <div class="it-col-cell" data-col="name">Name<span class="it-col-resizer" data-col="name"></span></div>
                            <div class="it-col-cell" data-col="level">
                                <span id="itLevelColLabel">Level</span>
                                <span class="it-help-dot" tabindex="0">?
                                    <span class="it-help-tooltip"><strong>Access levels</strong><br>1 View Only &middot; 2 +Download &middot; 3 +Markups<br>4 +Upload &middot; 5 +Edit &middot; 6 Full control</span>
                                </span>
                                <span class="it-col-resizer" data-col="level"></span>
                            </div>
                            <div class="it-col-cell" data-col="users" id="itUsersColHeader"><span id="itUsersColLabel">Users</span></div>
                        </div>
                        <div class="it-modal-body" id="itContainer"></div>
                    </div>
                </div>
                <div id="itStatusBar"></div>
            </div>
        `;
        document.body.appendChild(overlay);

        document.getElementById('itCleanBtn').addEventListener('click', () => {
            let clearedCount = 0;
            folderUserAssignments.forEach(entries => { clearedCount += entries.length; });
            folderUserAssignments.clear();
            itSelectedKeys = new Set();
            itSelectionAnchorKey = null;
            itCleaned = true;
            itMarkDirty(clearedCount);
            const container = document.getElementById('itContainer');
            if (container) itRenderTree(container);
        });

        document.getElementById('itSyncBtn').addEventListener('click', async () => {
            await handleSyncPermissions();
            // Whatever was pending has now been pushed (or the sync surfaced
            // its own errors in its own modal) — either way, the local model
            // and ACC should agree again, so the badge resets.
            itPendingChangeCount = 0;
            itUpdateSyncBadge();
        });

        itApplyColumnWidths(overlay);
        itUpdateColumnVisibility(overlay);
        itSetupColumnResize(overlay);
        itApplyUserListWidth(overlay);
        itSetupUserListResize(overlay);
        itSetupZoom(overlay.querySelector('#itContainer'));

        // Clicking truly empty space (below the last row, or beside it once
        // zoomed/scrolled) clears a multi-selection too — row clicks handle
        // themselves via itHandleRowClick, this catches everything else.
        const itContainerEl = overlay.querySelector('#itContainer');
        itContainerEl.addEventListener('click', (event) => {
            if (event.target.closest('g.it-row')) return;
            if (itClearSelection()) itRenderTree(itContainerEl);
        });

        overlay.querySelector('#itUsersColHeader').addEventListener('click', () => {
            if (itMode !== 'users') return;
            itUserSortMode = itUserSortMode === null ? 'asc' : itUserSortMode === 'asc' ? 'desc' : null;
            itUpdateUsersColumnHeader(overlay);
            const container = document.getElementById('itContainer');
            if (container) itRenderTree(container);
        });

        const itModeSubtitles = {
            folders: 'See who has access to each folder',
            users: 'See where each person has access',
            subjects: 'See what each role or company can access'
        };
        overlay.querySelectorAll('#itModeSegmented .it-seg-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                if (btn.classList.contains('active')) return;
                overlay.querySelectorAll('#itModeSegmented .it-seg-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                itMode = btn.dataset.mode;
                itExpandedKeys = new Set();
                itUserSortMode = null;
                itSelectedKeys = new Set();
                itSelectionAnchorKey = null;
                itFocusedKey = null;
                const subtitleEl = document.getElementById('itModeSubtitle');
                if (subtitleEl) subtitleEl.textContent = itModeSubtitles[itMode] || '';
                itAutoExpandFirstLevel();
                itUpdateColumnVisibility(overlay);
                const container = document.getElementById('itContainer');
                if (container) itRenderTree(container);
            });
        });

        const searchInput = document.getElementById('itSearch');
        const searchWrap = searchInput.closest('.it-search-wrap');
        const searchClearBtn = document.getElementById('itSearchClear');
        let itSearchTimeout = null;
        searchInput.addEventListener('input', () => {
            searchWrap.classList.toggle('has-value', searchInput.value.length > 0);
            clearTimeout(itSearchTimeout);
            itSearchTimeout = setTimeout(() => {
                itSearchQuery = searchInput.value.trim();
                const container = document.getElementById('itContainer');
                if (container) itRenderTree(container);
                if (itSearchQuery) {
                    const firstMatch = itLastVisible.find(v => v.data.__matched);
                    if (firstMatch) itScrollRowIntoView(firstMatch.data.__key);
                }
            }, 200);
        });
        searchClearBtn.addEventListener('click', () => {
            searchInput.value = '';
            searchWrap.classList.remove('has-value');
            itSearchQuery = '';
            const container = document.getElementById('itContainer');
            if (container) itRenderTree(container);
            searchInput.focus();
        });

        // "Expand" reveals one more level of depth per click (every
        // currently-visible collapsed folder gets expanded at once) rather
        // than recursively fetching the entire remaining tree in one shot —
        // on a large/deep project the old "Expand All" could take a very
        // long time or hammer the API. Clicking repeatedly still gets you
        // to full depth, just at a pace the API and the UI can keep up with.
        const expandAllBtn = document.getElementById('itExpandAllBtn');
        let expandInFlight = false;
        expandAllBtn.addEventListener('click', async () => {
            if (expandInFlight) return;
            expandInFlight = true;
            const originalLabel = expandAllBtn.textContent;
            expandAllBtn.disabled = true;
            expandAllBtn.textContent = 'Expanding…';
            itTreeBusy = true;
            itTreeBusyLabel = 'Expanding tree…';
            const container = document.getElementById('itContainer');
            if (container) itRenderTree(container);

            try {
                await itExpandNextLevel();
            } finally {
                expandAllBtn.textContent = originalLabel;
                expandAllBtn.disabled = false;
                expandInFlight = false;
                itTreeBusy = false;
                if (container) itRenderTree(container);
            }
        });

        document.getElementById('itCollapseAllBtn').addEventListener('click', () => {
            itExpandedKeys.clear();
            const container = document.getElementById('itContainer');
            if (container) itRenderTree(container);
        });

        const closeIt = () => overlay.remove();
        overlay.querySelector('.it-close').addEventListener('click', closeIt);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) closeIt(); });

        if (!itEscHandlerAdded) {
            document.addEventListener('keydown', async (event) => {
                const openOverlay = document.getElementById('itOverlay');
                if (!openOverlay) return;

                if (event.key === 'Escape') {
                    // Escape backs out one layer at a time: dismiss whatever
                    // transient UI is open first, only close the modal itself
                    // once none of that is showing.
                    if (itContextMenuEl) { itDismissContextMenu(); return; }
                    if (itDeleteConfirmEl) { itDismissDeleteConfirm(); return; }
                    if (itCopyTargetArmed) { itCopyTargetArmed = null; return; }
                    openOverlay.remove();
                    return;
                }

                const active = document.activeElement;
                const inTextField = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA');

                if ((event.key === 'Delete' || event.key === 'Backspace') && itSelectedKeys.size > 0) {
                    // Only when focus isn't inside a text input/foreignObject
                    // (Level column, search box) — those need Backspace for
                    // normal text editing.
                    if (inTextField) return;
                    event.preventDefault();
                    const container = document.getElementById('itContainer');
                    if (container) itShowDeleteConfirm(container);
                    return;
                }

                if (!inTextField && (event.key === 'ArrowUp' || event.key === 'ArrowDown' || event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
                    event.preventDefault();
                    if (event.key === 'ArrowUp') itMoveFocusVertical(-1);
                    else if (event.key === 'ArrowDown') itMoveFocusVertical(1);
                    else if (event.key === 'ArrowLeft') await itMoveFocusHorizontal(-1);
                    else await itMoveFocusHorizontal(1);
                }
            });
            itEscHandlerAdded = true;
        }

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                const container = document.getElementById('itContainer');
                if (container) itRenderTree(container);
            });
        });
    }

    // ===================== END INDENTED TREE =====================
