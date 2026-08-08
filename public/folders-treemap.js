/**
 * Folder Permissions — Treemap Visualization
 * Split out of read_project_folders.js (phase 2 refactor). Depends on globals
 * defined in read_project_folders.js — must be loaded AFTER that script:
 * currentProjectData, currentHierarchy, currentProjectUsers, currentProjectUsersRaw,
 * folderChildrenCache, expandedFolderIds, folderUserAssignments, levelKeyForDepth(),
 * loadChildrenForFolder(), loadExistingACCPermissions(), propagatePermissionsToEmptyRows().
 * Also depends on escapeHtml() (shared/dom-utils.js) and the global d3 library.
 * openTreemapModal() is this file's only export used from outside it (called from
 * read_project_folders.js).
 */

    // ===================== TREEMAP VISUALIZATION =====================

    let treemapMode = 'folders'; // 'folders' or 'users'
    let treemapFullData = null; // cached full hierarchy data
    let treemapZoomNode = null; // currently zoomed-into d3 hierarchy node (null = root)
    let treemapSubjectFilter = 'names'; // 'names', 'emails', 'COMPANY', 'ROLE'

    /**
     * Build a flat list of all folders in the hierarchy with their full path names.
     */
    function getAllFolders(hierarchy) {
        const folders = [];
        function walk(rows, depth) {
            const key = levelKeyForDepth(depth);
            const nextKey = levelKeyForDepth(depth + 1);
            const groups = new Map();
            for (const row of rows) {
                const f = row[key];
                if (!f) continue;
                if (!groups.has(f.id)) groups.set(f.id, { folder: f, rows: [] });
                groups.get(f.id).rows.push(row);
            }
            for (const { folder, rows } of groups.values()) {
                // Build path from hierarchy row
                const pathParts = [];
                for (let d = 0; d <= depth; d++) {
                    const k = levelKeyForDepth(d);
                    if (rows[0][k]) pathParts.push(rows[0][k].name);
                }
                folders.push({ id: folder.id, name: folder.name, path: pathParts.join(' / '), depth });
                if (rows.some(r => r[nextKey])) {
                    walk(rows, depth + 1);
                }
            }
        }
        if (hierarchy && hierarchy.length > 0) walk(hierarchy, 0);
        return folders;
    }

    /**
     * Get the base subject color (mid-level shade) for treemap cells.
     */
    function treemapSubjectColor(subjectType) {
        if (subjectType === 'ROLE') return '#a5d6a7';
        if (subjectType === 'COMPANY') return '#ffcc80';
        if (subjectType === 'EMPTY') return '#e0e0e0';
        return '#90caf9'; // USER
    }

    /**
     * Resolve folder permission entries based on treemapSubjectFilter.
     * For names/emails: expands COMPANY/ROLE to individual project users.
     * For COMPANY: shows company name for all. For ROLE: shows role for all.
     * Returns array of { name, subjectType }.
     */
    function resolveTreemapEntries(entries) {
        const resolved = [];
        const useEmail = treemapSubjectFilter === 'emails';

        function lookupExtra(pu) {
            let roleName = '';
            if (pu?.roles?.length > 0) {
                roleName = typeof pu.roles[0] === 'string' ? pu.roles[0] : (pu.roles[0].name || '');
            }
            return { email: pu?.email || '', companyName: pu?.companyName || '', roleName };
        }

        for (const u of entries) {
            const st = u.subjectType || 'USER';

            if (treemapSubjectFilter === 'names' || treemapSubjectFilter === 'emails') {
                if (st === 'COMPANY' && currentProjectUsersRaw) {
                    const members = currentProjectUsersRaw.filter(pu =>
                        pu.companyId === u.subjectId || pu.companyName === (u.displayName || u.user)
                    );
                    if (members.length > 0) {
                        for (const m of members) {
                            const extra = lookupExtra(m);
                            extra.companyName = extra.companyName || u.displayName || u.user;
                            resolved.push({ name: useEmail ? m.email : (m.name || m.email), subjectType: 'COMPANY', ...extra });
                        }
                    } else {
                        resolved.push({ name: u.displayName || u.user, subjectType: 'COMPANY', email: u.user || '', companyName: u.displayName || u.user, roleName: '' });
                    }
                } else if (st === 'ROLE' && currentProjectUsersRaw) {
                    const members = currentProjectUsersRaw.filter(pu =>
                        (pu.roleIds && pu.roleIds.includes(u.subjectId)) ||
                        (pu.roles && pu.roles.some(r =>
                            (r.id && r.id === u.subjectId) ||
                            (r.name && r.name === (u.displayName || u.user))
                        ))
                    );
                    if (members.length > 0) {
                        for (const m of members) {
                            const extra = lookupExtra(m);
                            extra.roleName = extra.roleName || u.displayName || u.user;
                            resolved.push({ name: useEmail ? m.email : (m.name || m.email), subjectType: 'ROLE', ...extra });
                        }
                    } else {
                        resolved.push({ name: u.displayName || u.user, subjectType: 'ROLE', email: u.user || '', companyName: '', roleName: u.displayName || u.user });
                    }
                } else {
                    let displayName;
                    const pu = currentProjectUsersRaw?.find(p => p.email === u.user);
                    if (pu) {
                        displayName = useEmail ? pu.email : (pu.name || pu.email);
                    } else {
                        displayName = useEmail ? (u.user || u.displayName) : (u.displayName || u.user);
                    }
                    const extra = lookupExtra(pu);
                    extra.email = extra.email || u.user || '';
                    resolved.push({ name: displayName, subjectType: st, ...extra });
                }
            } else if (treemapSubjectFilter === 'COMPANY') {
                if (st === 'COMPANY') {
                    resolved.push({ name: u.displayName || u.user, subjectType: 'COMPANY', email: u.user || '', companyName: u.displayName || u.user, roleName: '' });
                } else if (st === 'USER' && currentProjectUsersRaw) {
                    const pu = currentProjectUsersRaw.find(p => p.email === u.user);
                    const extra = lookupExtra(pu);
                    extra.email = extra.email || u.user || '';
                    resolved.push({ name: pu?.companyName || 'No Company', subjectType: 'USER', ...extra });
                } else if (st === 'ROLE') {
                    resolved.push({ name: u.displayName || u.user, subjectType: 'ROLE', email: u.user || '', companyName: '', roleName: u.displayName || u.user });
                } else {
                    resolved.push({ name: u.displayName || u.user, subjectType: st, email: u.user || '', companyName: '', roleName: '' });
                }
            } else if (treemapSubjectFilter === 'ROLE') {
                if (st === 'ROLE') {
                    resolved.push({ name: u.displayName || u.user, subjectType: 'ROLE', email: u.user || '', companyName: '', roleName: u.displayName || u.user });
                } else if (st === 'USER' && currentProjectUsersRaw) {
                    const pu = currentProjectUsersRaw.find(p => p.email === u.user);
                    const extra = lookupExtra(pu);
                    extra.email = extra.email || u.user || '';
                    let roleName = extra.roleName || 'No Role';
                    resolved.push({ name: roleName, subjectType: 'USER', ...extra, roleName });
                } else if (st === 'COMPANY') {
                    resolved.push({ name: u.displayName || u.user, subjectType: 'COMPANY', email: u.user || '', companyName: u.displayName || u.user, roleName: '' });
                } else {
                    resolved.push({ name: u.displayName || u.user, subjectType: st, email: u.user || '', companyName: '', roleName: '' });
                }
            }
        }
        return resolved;
    }

    /**
     * Build D3 hierarchy data for "Folders with users" mode.
     * Reflects the actual folder hierarchy: Root → Level1 → Level2 → ... → Users as leaves.
     */
    function buildFoldersTreeData() {
        console.log('[Treemap] folderUserAssignments size:', folderUserAssignments.size, 'filter:', treemapSubjectFilter);

        function buildNode(rows, depth) {
            const key = levelKeyForDepth(depth);
            const nextKey = levelKeyForDepth(depth + 1);
            const groups = new Map();
            for (const row of rows) {
                const f = row[key];
                if (!f) continue;
                if (!groups.has(f.id)) groups.set(f.id, { folder: f, rows: [] });
                groups.get(f.id).rows.push(row);
            }
            const nodes = [];
            for (const { folder, rows: groupRows } of groups.values()) {
                const hasChildren = groupRows.some(r => r[nextKey]);
                const node = { name: folder.name, folderId: folder.id };

                if (hasChildren) {
                    node.children = buildNode(groupRows, depth + 1);
                }

                // Add users assigned to this folder, resolved by filter
                const users = folderUserAssignments.get(folder.id);
                if (users && users.length > 0) {
                    const userLeaves = resolveTreemapEntries(users).map(r => ({
                        ...r, folderName: folder.name, value: 1
                    }));
                    if (userLeaves.length > 0) {
                        if (node.children) {
                            node.children = node.children.concat(userLeaves);
                        } else {
                            node.children = userLeaves;
                        }
                    }
                }

                // If folder has no children at all, show it as an empty leaf
                if (!node.children || node.children.length === 0) {
                    node.subjectType = 'EMPTY';
                    node.value = 1;
                }

                nodes.push(node);
            }
            return nodes;
        }

        const children = (currentHierarchy && currentHierarchy.length > 0)
            ? buildNode(currentHierarchy, 0)
            : [];
        console.log('[Treemap] top-level nodes:', children.length);
        return { name: 'root', children };
    }

    /**
     * Build D3 hierarchy data for "Users with folders" mode.
     * Root -> Users -> nested folder hierarchy (only folders where user has access).
     */
    function buildUsersTreeData() {
        const allFolders = getAllFolders(currentHierarchy);
        // Collect folder IDs per resolved user key
        const groupMap = new Map();
        for (const f of allFolders) {
            const users = folderUserAssignments.get(f.id);
            if (!users || users.length === 0) continue;
            const resolved = resolveTreemapEntries(users);
            for (const r of resolved) {
                const key = r.name + '_' + r.subjectType;
                if (!groupMap.has(key)) {
                    groupMap.set(key, {
                        name: r.name,
                        subjectType: r.subjectType,
                        folderIds: new Set()
                    });
                }
                groupMap.get(key).folderIds.add(f.id);
            }
        }

        // Build nested folder subtree for a given set of folder IDs
        function buildFilteredTree(rows, depth, folderIds) {
            const key = levelKeyForDepth(depth);
            const nextKey = levelKeyForDepth(depth + 1);
            const groups = new Map();
            for (const row of rows) {
                const f = row[key];
                if (!f) continue;
                if (!groups.has(f.id)) groups.set(f.id, { folder: f, rows: [] });
                groups.get(f.id).rows.push(row);
            }
            const nodes = [];
            for (const { folder, rows: groupRows } of groups.values()) {
                const hasChildren = groupRows.some(r => r[nextKey]);
                let childNodes = [];
                if (hasChildren) {
                    childNodes = buildFilteredTree(groupRows, depth + 1, folderIds);
                }
                const directMatch = folderIds.has(folder.id);
                if (directMatch || childNodes.length > 0) {
                    const node = { name: folder.name, folderId: folder.id };
                    if (childNodes.length > 0) {
                        node.children = childNodes;
                        if (directMatch) {
                            // Also add a leaf to represent direct assignment at this level
                            node.children.push({ name: '(this folder)', folderId: folder.id, value: 1, subjectType: 'FOLDER_SELF' });
                        }
                    } else {
                        node.value = 1;
                    }
                    nodes.push(node);
                }
            }
            return nodes;
        }

        const children = [];
        for (const entry of groupMap.values()) {
            const folderTree = (currentHierarchy && currentHierarchy.length > 0)
                ? buildFilteredTree(currentHierarchy, 0, entry.folderIds)
                : [];
            if (folderTree.length > 0) {
                children.push({
                    name: entry.name,
                    subjectType: entry.subjectType,
                    children: folderTree
                });
            }
        }
        return { name: 'root', children };
    }

    /**
     * Render the treemap using D3 into the given container element.
     * If zoomNode is provided, render only that subtree.
     */
    function renderTreemap(container) {
        container.innerHTML = '';

        // Use parent modal size to compute available area
        const modal = container.closest('.treemap-modal');
        const header = modal ? modal.querySelector('.treemap-modal-header') : null;
        const modalRect = modal ? modal.getBoundingClientRect() : null;
        const headerH = header ? header.getBoundingClientRect().height : 50;
        const width = modalRect ? Math.floor(modalRect.width) : 900;
        const height = modalRect ? Math.floor(modalRect.height - headerH) : 600;

        // Build full data tree once, cache it
        const fullData = treemapMode === 'folders' ? buildFoldersTreeData() : buildUsersTreeData();
        treemapFullData = fullData;

        // Build full hierarchy to find the zoom target
        const fullRoot = d3.hierarchy(fullData)
            .sum(d => d.value || 0)
            .sort((a, b) => b.value - a.value);

        // Find the zoom target node in the full hierarchy
        let displayRoot = fullRoot;
        if (treemapZoomNode) {
            const target = fullRoot.descendants().find(d =>
                d.data === treemapZoomNode.data ||
                (d.data.folderId && d.data.folderId === treemapZoomNode.data.folderId)
            );
            if (target && target.children) {
                displayRoot = target;
            } else {
                treemapZoomNode = null; // reset if not found
            }
        }

        // Build breadcrumb path
        const breadcrumbPath = [];
        let bcNode = displayRoot;
        while (bcNode) {
            breadcrumbPath.unshift(bcNode);
            bcNode = bcNode.parent;
        }

        if (!displayRoot.children || displayRoot.children.length === 0) {
            container.innerHTML = '<div style="text-align:center;padding:60px;color:#666;font-size:18px;font-weight:bold;">No data to display at this level.</div>';
            return;
        }

        // Reserve space for breadcrumb bar
        const breadcrumbH = treemapZoomNode ? 30 : 0;
        const treemapH = height - breadcrumbH;

        // Re-layout the subtree into the available space
        const subRoot = d3.hierarchy(displayRoot.data)
            .sum(d => d.value || 0)
            .sort((a, b) => b.value - a.value);

        d3.treemap()
            .size([width, treemapH])
            .paddingTop(22)
            .paddingRight(2)
            .paddingBottom(2)
            .paddingLeft(2)
            .paddingInner(2)
            (subRoot);

        // Breadcrumb bar
        if (treemapZoomNode) {
            const bcDiv = document.createElement('div');
            bcDiv.style.cssText = 'height:30px;display:flex;align-items:center;padding:0 12px;background:#f5f5f5;border-bottom:1px solid #ddd;font-family:Arial,sans-serif;font-size:13px;gap:4px;';

            // Root link
            const rootLink = document.createElement('span');
            rootLink.textContent = '\u2302 Root';
            rootLink.style.cssText = 'cursor:pointer;color:#6f42c1;font-weight:bold;';
            rootLink.addEventListener('click', () => {
                treemapZoomNode = null;
                renderTreemap(container);
            });
            bcDiv.appendChild(rootLink);

            // Intermediate breadcrumbs
            for (let i = 1; i < breadcrumbPath.length; i++) {
                const sep = document.createElement('span');
                sep.textContent = ' / ';
                sep.style.color = '#999';
                bcDiv.appendChild(sep);

                const crumb = document.createElement('span');
                crumb.textContent = breadcrumbPath[i].data.name;
                if (i < breadcrumbPath.length - 1) {
                    crumb.style.cssText = 'cursor:pointer;color:#6f42c1;';
                    const targetNode = breadcrumbPath[i];
                    crumb.addEventListener('click', () => {
                        treemapZoomNode = targetNode;
                        renderTreemap(container);
                    });
                } else {
                    crumb.style.cssText = 'font-weight:bold;color:#333;';
                }
                bcDiv.appendChild(crumb);
            }

            container.appendChild(bcDiv);
        }

        const svgContainer = document.createElement('div');
        svgContainer.style.cssText = `width:${width}px;height:${treemapH}px;`;
        container.appendChild(svgContainer);

        const svg = d3.select(svgContainer)
            .append('svg')
            .attr('width', width)
            .attr('height', treemapH);

        // Tooltip
        let tooltip = document.getElementById('treemap-tooltip');
        if (!tooltip) {
            tooltip = document.createElement('div');
            tooltip.id = 'treemap-tooltip';
            tooltip.style.cssText = 'position:fixed;pointer-events:none;background:rgba(0,0,0,0.85);color:#fff;padding:8px 12px;border-radius:4px;font-size:12px;font-family:Arial,sans-serif;z-index:10200;display:none;max-width:300px;line-height:1.4;';
            document.body.appendChild(tooltip);
        }

        // Collect all internal (non-leaf) nodes at any depth
        const internalNodes = subRoot.descendants().filter(d => d.children && d.depth >= 1);

        // Depth-based colors for group backgrounds
        const groupColors = ['#f0f0f0', '#e8e8e8', '#dcdcdc', '#d2d2d2', '#c8c8c8'];

        // Draw group backgrounds (all internal folder nodes)
        svg.selectAll('rect.group')
            .data(internalNodes)
            .enter()
            .append('rect')
            .attr('x', d => d.x0)
            .attr('y', d => d.y0)
            .attr('width', d => d.x1 - d.x0)
            .attr('height', d => d.y1 - d.y0)
            .attr('fill', d => groupColors[Math.min(d.depth - 1, groupColors.length - 1)])
            .attr('stroke', d => d.depth === 1 ? '#888' : '#aaa')
            .attr('stroke-width', d => d.depth === 1 ? 1.5 : 1)
            .attr('rx', 3)
            .style('cursor', d => d.children ? 'pointer' : 'default')
            .on('click', function(event, d) {
                if (d.children) {
                    event.stopPropagation();
                    treemapZoomNode = d;
                    renderTreemap(container);
                }
            });

        // Group labels
        svg.selectAll('text.group-label')
            .data(internalNodes)
            .enter()
            .append('text')
            .attr('x', d => d.x0 + 4)
            .attr('y', d => d.y0 + 14)
            .text(d => {
                const maxLen = Math.floor((d.x1 - d.x0) / 7);
                const childFolders = d.children ? d.children.filter(c => c.children).length : 0;
                const childLeaves = d.children ? d.children.filter(c => !c.children).length : 0;
                let label = d.data.name;
                if (childFolders > 0) label += ` (${childFolders} folders`;
                if (childFolders > 0 && childLeaves > 0) label += `, ${childLeaves} users)`;
                else if (childFolders > 0) label += ')';
                else if (childLeaves > 0) label += ` (${childLeaves} users)`;
                return label.length > maxLen ? label.substring(0, maxLen - 1) + '\u2026' : label;
            })
            .attr('font-size', d => d.depth === 1 ? '12px' : '11px')
            .attr('font-weight', 'bold')
            .attr('font-family', 'Arial, sans-serif')
            .attr('fill', '#333')
            .style('pointer-events', 'none');

        // Leaf nodes
        const leaves = subRoot.leaves();

        svg.selectAll('rect.leaf')
            .data(leaves)
            .enter()
            .append('rect')
            .attr('class', 'leaf')
            .attr('x', d => d.x0)
            .attr('y', d => d.y0)
            .attr('width', d => Math.max(0, d.x1 - d.x0))
            .attr('height', d => Math.max(0, d.y1 - d.y0))
            .attr('fill', d => {
                const st = d.data.subjectType || d.parent?.data?.subjectType || 'USER';
                return treemapSubjectColor(st);
            })
            .attr('stroke', '#fff')
            .attr('stroke-width', 1)
            .attr('rx', 2)
            .style('cursor', 'pointer')
            .on('mousemove', function(event, d) {
                const st = d.data.subjectType || d.parent?.data?.subjectType || 'USER';
                let html = '';
                // Build folder path from ancestors
                const pathParts = [];
                let node = d.parent;
                while (node && node.depth >= 1) {
                    pathParts.unshift(node.data.name);
                    node = node.parent;
                }
                // Folder/user/company/role names come from ACC (any project member with
                // create rights can set them) and are not sanitized upstream — escape
                // before building this tooltip's HTML to prevent stored XSS.
                const folderPath = escapeHtml(pathParts.join(' / '));
                const safeName = escapeHtml(d.data.name || '');
                if (treemapMode === 'folders') {
                    if (st === 'EMPTY') {
                        html = `<strong>${safeName}</strong><br><em>No users assigned</em><br>Path: ${folderPath}`;
                    } else {
                        html = `<strong>${safeName}</strong><br>Type: ${st}`;
                        if (st === 'USER' && d.data.email) html += ` — ${escapeHtml(d.data.email)}`;
                        if (st === 'COMPANY' && d.data.companyName) html += ` — ${escapeHtml(d.data.companyName)}`;
                        if (st === 'ROLE' && d.data.roleName) html += ` — ${escapeHtml(d.data.roleName)}`;
                        html += `<br>Folder: ${folderPath}`;
                    }
                } else {
                    html = `<strong>${escapeHtml(d.data.name || d.data.path || '')}</strong><br>User: ${escapeHtml(d.parent?.data?.name || '')}`;
                }
                tooltip.innerHTML = html;
                tooltip.style.display = 'block';
                tooltip.style.left = (event.clientX + 12) + 'px';
                tooltip.style.top = (event.clientY - 10) + 'px';
            })
            .on('mouseout', function() {
                tooltip.style.display = 'none';
            })
            .on('click', function(event, d) {
                // Zoom into the parent folder of this user leaf
                if (d.parent && d.parent.data.folderId) {
                    treemapZoomNode = d.parent;
                    renderTreemap(container);
                }
            });

        // Leaf labels (only if cell is large enough)
        svg.selectAll('text.leaf-label')
            .data(leaves)
            .enter()
            .append('text')
            .attr('class', 'leaf-label')
            .attr('x', d => d.x0 + 3)
            .attr('y', d => d.y0 + 13)
            .text(d => {
                const w = d.x1 - d.x0;
                const h = d.y1 - d.y0;
                if (w < 30 || h < 16) return '';
                const name = d.data.name || '';
                const maxLen = Math.floor(w / 6.5);
                return name.length > maxLen ? name.substring(0, maxLen - 1) + '...' : name;
            })
            .attr('font-size', '10px')
            .attr('font-family', 'Arial, sans-serif')
            .attr('fill', '#333')
            .style('pointer-events', 'none');
    }

    /**
     * Open the treemap modal
     */
    function openTreemapModal() {
        // Remove existing
        const existing = document.getElementById('treemapOverlay');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.id = 'treemapOverlay';
        overlay.className = 'treemap-overlay';
        overlay.innerHTML = `
            <div class="treemap-modal">
                <div class="treemap-modal-header">
                    <h3>Treemap</h3>
                    <div class="treemap-toggle-group">
                        <label class="treemap-radio-label"><input type="radio" name="treemapMode" value="folders" checked /> Folders with Users</label>
                        <label class="treemap-radio-label"><input type="radio" name="treemapMode" value="users" /> Users with Folders</label>
                    </div>
                    <div class="treemap-filter-group">
                        <span class="treemap-filter-label">Show:</span>
                        <label class="treemap-filter-radio"><span class="treemap-filter-swatch" style="background:#90caf9"></span><input type="radio" name="treemapFilter" value="names" checked /> Names</label>
                        <label class="treemap-filter-radio"><span class="treemap-filter-swatch" style="background:#64b5f6"></span><input type="radio" name="treemapFilter" value="emails" /> Emails</label>
                        <label class="treemap-filter-radio"><span class="treemap-filter-swatch" style="background:#ffcc80"></span><input type="radio" name="treemapFilter" value="COMPANY" /> Companies</label>
                        <label class="treemap-filter-radio"><span class="treemap-filter-swatch" style="background:#a5d6a7"></span><input type="radio" name="treemapFilter" value="ROLE" /> Roles</label>
                    </div>
                    <input type="text" class="treemap-search" id="treemapSearch" placeholder="Search users..." autocomplete="off" />
                    <span class="treemap-close">&times;</span>
                </div>
                <div class="treemap-modal-body" id="treemapContainer"></div>
            </div>
        `;
        document.body.appendChild(overlay);

        // Mode radio buttons (Folders with Users / Users with Folders)
        overlay.querySelectorAll('input[name="treemapMode"]').forEach(radio => {
            radio.addEventListener('change', () => {
                treemapMode = radio.value;
                treemapZoomNode = null;
                renderTreemap(document.getElementById('treemapContainer'));
            });
        });

        // Filter radio buttons (All Users / Companies / Roles)
        overlay.querySelectorAll('input[name="treemapFilter"]').forEach(radio => {
            radio.addEventListener('change', () => {
                treemapSubjectFilter = radio.value;
                treemapZoomNode = null;
                renderTreemap(document.getElementById('treemapContainer'));
            });
        });

        // Search field – highlight matching leaf cells
        let treemapSearchTimeout = null;
        const searchInput = document.getElementById('treemapSearch');
        searchInput.addEventListener('input', () => {
            clearTimeout(treemapSearchTimeout);
            treemapSearchTimeout = setTimeout(() => {
                const query = searchInput.value.trim().toLowerCase();
                const container = document.getElementById('treemapContainer');
                const svg = container?.querySelector('svg');
                if (!svg) return;
                const d3svg = d3.select(svg);
                // Reset all leaves
                d3svg.selectAll('rect.leaf').each(function() {
                    d3.select(this)
                        .attr('stroke', '#fff')
                        .attr('stroke-width', 0.5)
                        .style('opacity', query ? 0.3 : 1)
                        .style('animation', null);
                });
                d3svg.selectAll('text.leaf-label').style('opacity', query ? 0.3 : 1);
                if (!query) return;
                // Highlight matches
                d3svg.selectAll('rect.leaf').each(function(d) {
                    const name = (d.data.name || '').toLowerCase();
                    const email = (d.data.email || '').toLowerCase();
                    const company = (d.data.companyName || '').toLowerCase();
                    const role = (d.data.roleName || '').toLowerCase();
                    if (name.includes(query) || email.includes(query) || company.includes(query) || role.includes(query)) {
                        d3.select(this)
                            .attr('stroke', '#ff6b00')
                            .attr('stroke-width', 3)
                            .style('opacity', 1)
                            .style('animation', 'treemapPulse 1.2s ease-in-out infinite');
                    }
                });
                d3svg.selectAll('text.leaf-label').each(function(d) {
                    const name = (d.data.name || '').toLowerCase();
                    const email = (d.data.email || '').toLowerCase();
                    const company = (d.data.companyName || '').toLowerCase();
                    const role = (d.data.roleName || '').toLowerCase();
                    if (name.includes(query) || email.includes(query) || company.includes(query) || role.includes(query)) {
                        d3.select(this).style('opacity', 1);
                    }
                });
            }, 200);
        });

        // Close
        const closeTreemap = () => {
            overlay.remove();
            const tip = document.getElementById('treemap-tooltip');
            if (tip) tip.style.display = 'none';
        };
        overlay.querySelector('.treemap-close').addEventListener('click', closeTreemap);
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeTreemap();
        });

        // Expand all folders before rendering so the full structure is shown
        treemapMode = 'folders';
        treemapZoomNode = null;
        treemapSubjectFilter = 'names';

        // Render immediately with current data, then progressively expand
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                const container = document.getElementById('treemapContainer');
                if (container) renderTreemap(container);
                // Start expanding in background, re-rendering after each round
                expandAllFoldersForTreemap();
            });
        });
    }

    /**
     * Expand all folders recursively, re-rendering the treemap after each round
     * so the user sees the structure build up progressively.
     */
    async function expandAllFoldersForTreemap() {
        if (!currentProjectData || !currentHierarchy) return;

        // Show loading banner
        const modalBody = document.getElementById('treemapContainer');
        if (!modalBody) return;
        let banner = modalBody.querySelector('.treemap-loading-banner');
        if (!banner) {
            banner = document.createElement('div');
            banner.className = 'treemap-loading-banner';
            banner.innerHTML = '<div class="treemap-loading-spinner"></div><span>Loading folder structure...</span>';
            modalBody.parentElement.insertBefore(banner, modalBody);
        }
        const bannerText = banner.querySelector('span');

        const allNewFolderIds = new Set();

        let round = 0;
        while (true) {
            round++;
            // Find all leaf folders that haven't been expanded yet
            const leafFolders = [];
            const visited = new Set();
            function findLeaves(rows, depth) {
                const key = levelKeyForDepth(depth);
                const nextKey = levelKeyForDepth(depth + 1);
                for (const row of rows) {
                    const f = row[key];
                    if (!f || visited.has(f.id)) continue;
                    visited.add(f.id);
                    const hasChildren = rows.some(r => r[key]?.id === f.id && r[nextKey]);
                    if (hasChildren) {
                        findLeaves(rows.filter(r => r[key]?.id === f.id), depth + 1);
                    } else if (!folderChildrenCache[f.id] || folderChildrenCache[f.id].length > 0) {
                        if (folderChildrenCache[f.id] === undefined) {
                            leafFolders.push(f.id);
                        }
                    }
                }
            }
            findLeaves(currentHierarchy, 0);

            if (leafFolders.length === 0) break;

            // Fetch children in parallel (batches of 10)
            for (let i = 0; i < leafFolders.length; i += 10) {
                const batch = leafFolders.slice(i, i + 10);
                await Promise.all(batch.map(fid => loadChildrenForFolder(fid)));
            }

            // Expand all that got children
            let anyExpanded = false;
            for (const fid of leafFolders) {
                const children = folderChildrenCache[fid];
                if (children && children.length > 0) {
                    expandedFolderIds.add(fid);
                    anyExpanded = true;
                    for (const row of currentHierarchy) {
                        for (let d = 0; d < 20; d++) {
                            const k = levelKeyForDepth(d);
                            const nk = levelKeyForDepth(d + 1);
                            if (row[k]?.id === fid && row[nk]) {
                                allNewFolderIds.add(row[nk].id);
                            }
                        }
                    }
                }
            }
            if (!anyExpanded) break;
            if (round > 20) break; // safety limit

            // Update banner
            if (bannerText) bannerText.textContent = `Loading folder structure... (round ${round}, ${allNewFolderIds.size} folders found)`;

            // Re-render treemap every 3 rounds to avoid excessive renders
            if (round % 3 === 0) {
                const container = document.getElementById('treemapContainer');
                if (!container) return; // modal was closed
                renderTreemap(container);
            }
            // Yield to browser so the UI updates
            await new Promise(resolve => requestAnimationFrame(resolve));
        }

        // Final re-render after all folder expansion
        const containerAfterExpand = document.getElementById('treemapContainer');
        if (containerAfterExpand) renderTreemap(containerAfterExpand);

        // Load permissions for new folders in small batches with retry
        if (allNewFolderIds.size > 0 && window.FolderPermissions?.fetchAllFolderPermissions) {
            const folderIdArray = Array.from(allNewFolderIds);
            const permBatchSize = 20;
            let loaded = 0;
            let failed = 0;

            for (let i = 0; i < folderIdArray.length; i += permBatchSize) {
                const batchIds = new Set(folderIdArray.slice(i, i + permBatchSize));
                loaded += batchIds.size;
                if (bannerText) bannerText.textContent = `Loading permissions... (${loaded}/${folderIdArray.length} folders)`;

                for (let attempt = 1; attempt <= 3; attempt++) {
                    try {
                        await loadExistingACCPermissions(
                            currentProjectData.projectId, currentHierarchy,
                            currentProjectUsers, currentProjectData.accessToken,
                            { onlyFolderIds: batchIds }
                        );
                        break; // success
                    } catch (err) {
                        console.warn(`[Treemap] permission batch ${i / permBatchSize + 1} attempt ${attempt} failed:`, err.message);
                        if (attempt === 3) {
                            failed += batchIds.size;
                            console.error('[Treemap] giving up on batch after 3 retries');
                        } else {
                            // Wait before retry (exponential backoff)
                            await new Promise(r => setTimeout(r, 1000 * attempt));
                        }
                    }
                }

                // Re-render every few batches
                if (i % (permBatchSize * 3) === 0 || i + permBatchSize >= folderIdArray.length) {
                    propagatePermissionsToEmptyRows();
                    const container = document.getElementById('treemapContainer');
                    if (container) renderTreemap(container);
                }
                await new Promise(resolve => requestAnimationFrame(resolve));
            }

            if (failed > 0 && bannerText) {
                bannerText.textContent = `Done. Failed to load permissions for ${failed} folders.`;
                await new Promise(r => setTimeout(r, 3000));
            }

            propagatePermissionsToEmptyRows();
            const container = document.getElementById('treemapContainer');
            if (container) renderTreemap(container);
        }

        // Remove loading banner
        const finalBanner = document.querySelector('.treemap-loading-banner');
        if (finalBanner) finalBanner.remove();
    }

    // ===================== END TREEMAP =====================
