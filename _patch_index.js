// One-shot patch script — delete after running
const fs = require('fs');
const path = require('path');
const filePath = path.join(__dirname, 'index.html');
let content = fs.readFileSync(filePath, 'utf8');

// ─────────────────────────────────────────────
// 1.  Replace "Add new users to projects" button area (View Account Users sibling)
// ─────────────────────────────────────────────
const oldBtnArea = `                        <div style="display: flex; gap: 10px;">
                            <button id="viewAccountUsersBtn" onclick="" style="display: none;">
                                View Account Users
                            </button>
                        </div>`;
const newBtnArea = `                        <div style="display: flex; gap: 10px; align-items: center;">
                            <button id="addNewUsersBtn" onclick="openMultiProjectNewUsersModal()" disabled style="display: none;">
                                Add new users to projects
                            </button>
                            <button id="viewAccountUsersBtn" onclick="" style="display: none;">
                                View Account Users
                            </button>
                        </div>`;
if (content.includes(oldBtnArea)) {
    content = content.replace(oldBtnArea, newBtnArea);
    console.log('✅ Button area replaced');
} else {
    console.log('❌ Button area NOT found');
}

// ─────────────────────────────────────────────
// 2.  Replace renderProjectsList — target a unique inner marker
// ─────────────────────────────────────────────
// We'll replace the whole function by finding its start and the comment that follows it.
const funcStart = '        function renderProjectsList(projects) {';
const funcEnd   = '\r\n\r\n        // Function to update project count';

const startIdx = content.indexOf(funcStart);
const endIdx   = content.indexOf(funcEnd, startIdx);

if (startIdx === -1 || endIdx === -1) {
    console.log('❌ renderProjectsList boundaries not found', startIdx, endIdx);
    process.exit(1);
}

const newFunc = `        function renderProjectsList(projects) {
            const projectsList = document.getElementById('projectsList');
            // Reset button state when list re-renders
            const addBtn = document.getElementById('addNewUsersBtn');
            if (addBtn) addBtn.disabled = true;

            if (projects && projects.length > 0) {
                const projectsHtml = projects.map(project => \`
                    <div class="project-item" style="margin: 15px 0; padding: 15px; border: 1px solid #ddd; border-radius: 5px; background-color: #fafafa;">
                        <div style="display: flex; align-items: flex-start; gap: 12px;">
                            <input type="checkbox" class="project-select-cb"
                                data-project-id="\${project.id}"
                                data-project-name="\${project.name.replace(/"/g, '&quot;')}"
                                onchange="onProjectCheckboxChange()"
                                style="margin-top: 3px; cursor: pointer; width: 18px; height: 18px; flex-shrink: 0;">
                            <div style="flex: 1;">
                                <div style="margin-bottom: 15px;">
                                    <strong style="font-size: 16px; color: #333;">\${project.name}</strong>
                                </div>
                                <div style="display: flex; gap: 10px; flex-direction: column;">
                                    <div style="display:flex; gap:10px;">
                                        <button class="project-btn project-btn-update" onclick="openManageExistingUsersModal('\${project.id}', '\${project.name.replace(/'/g, "\\\\'")}')">
                                            Existing Users
                                        </button>
                                        <button class="project-btn project-btn-update" onclick="showFoldersModal('\${project.id}', '\${project.name.replace(/'/g, "\\\\'")}', window.currentHubId, currentAccessToken)">
                                            Manage Access to Folders
                                        </button>
                                    </div>

                                    <!-- Per-project progress indicator -->
                                    <div class="project-progress" id="projectProgress-\${project.id}" style="display:none; margin-top:8px;">
                                        <div style="width:100%; background:#eee; border-radius:6px; height:10px; overflow:hidden;">
                                            <div id="projectProgressBar-\${project.id}" style="width:0%;height:10px;background:#0696D7;border-radius:6px;"></div>
                                        </div>
                                        <div id="projectProgressText-\${project.id}" style="font-size:12px;color:#666;margin-top:6px;"></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                \`).join('');
                projectsList.innerHTML = projectsHtml;
            } else {
                projectsList.innerHTML = '<div style="text-align: center; padding: 40px; color: #666;">No projects match your filter.</div>';
            }
        }

        function onProjectCheckboxChange() {
            const anyChecked = document.querySelector('.project-select-cb:checked') !== null;
            const btn = document.getElementById('addNewUsersBtn');
            if (btn) btn.disabled = !anyChecked;
        }`;

content = content.slice(0, startIdx) + newFunc + content.slice(endIdx);
console.log('✅ renderProjectsList replaced');

fs.writeFileSync(filePath, content, 'utf8');
console.log('✅ File saved');
