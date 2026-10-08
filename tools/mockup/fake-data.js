// Deterministic fake ACC data for the local mockup (tools/mockup/server.js).
// Every name here is invented. Shapes follow the Autodesk endpoints the
// frontend actually calls (Data Management, Construction Admin, HQ, Docs).

let seed = 42;
function rand() {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
}
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const uuid = (prefix, n) => `${prefix}-${String(n).padStart(4, '0')}-4a1b-9c2d-mock${String(n).padStart(8, '0')}`;

const ACCOUNT_ID = '7d1f2c3a-0000-4000-8000-sevenseas001';
const HUB_ID = `b.${ACCOUNT_ID}`;
const ME = { email: 'anna.keller@sevenseas-build.example', name: 'Anna Keller' };

const FIRST = ['Anna', 'Marco', 'Lena', 'Jonas', 'Sofia', 'Luca', 'Mia', 'Noah', 'Elena', 'David', 'Clara', 'Felix',
    'Nora', 'Tim', 'Laura', 'Simon', 'Julia', 'Pascal', 'Sara', 'Lukas', 'Eva', 'Nico', 'Lea', 'Yannick'];
const LAST = ['Keller', 'Meier', 'Brunner', 'Frei', 'Gerber', 'Steiner', 'Baumann', 'Fischer', 'Huber', 'Weber',
    'Moser', 'Graf', 'Roth', 'Kunz', 'Suter', 'Bühler', 'Lehmann', 'Wyss', 'Zimmermann', 'Schmid'];

const companies = [
    'SevenSeas Build AG', 'Alpine Structures', 'Lakeside Engineering', 'Northwind MEP', 'Granite Facades',
    'Bluewave Electrical', 'Summit Surveying', 'Harbor Architects',
].map((name, i) => ({ id: uuid('comp', i + 1), name, trade: pick(['Architecture', 'Engineering', 'Electrical', 'Concrete', 'General Contractor']) }));

const roles = ['Architect', 'Project Manager', 'Site Engineer', 'BIM Coordinator', 'Structural Engineer',
    'MEP Engineer', 'Document Controller', 'Owner Representative', 'Subcontractor']
    .map((name, i) => ({ id: uuid('role', i + 1), name, status: 'active', projectAdmin: false }));

const accountUsers = [];
for (let i = 0; i < 48; i++) {
    const first = i === 0 ? 'Anna' : pick(FIRST);
    const last = i === 0 ? 'Keller' : pick(LAST);
    const company = i === 0 ? companies[0] : pick(companies);
    const role = pick(roles);
    accountUsers.push({
        id: uuid('user', i + 1),
        account_id: ACCOUNT_ID,
        email: i === 0 ? ME.email : `${first}.${last}${i}@${company.name.toLowerCase().replace(/[^a-z]+/g, '')}.example`.toLowerCase(),
        name: `${first} ${last}`,
        first_name: first,
        last_name: last,
        company_id: company.id,
        company_name: company.name,
        default_role: role.name,
        default_role_id: role.id,
        role: i === 0 ? 'account_admin' : 'account_user',
        status: rand() < 0.9 ? 'active' : 'pending',
        uid: `AUTODESK${1000 + i}`,
        job_title: role.name,
        created_at: '2025-03-14T09:00:00.000Z',
        updated_at: '2026-09-30T12:00:00.000Z',
    });
}

const PROJECT_NAMES = ['Atlantic', 'Harbor Tower', 'Lakeside Campus', 'Northgate Hospital', 'Rhine Bridge Renovation',
    'Alpine Data Center', 'Bahnhof Areal Phase 2', 'Westpark Residences', 'Seefeld School', 'Glatt Valley Logistics Hub',
    'Old Town Hotel Refurb', 'Riverside Offices', 'Kantonsspital Wing C', 'Uetliberg Tunnel Portal', 'Airport Hangar 4',
    'Limmat Housing Block A', 'Limmat Housing Block B', 'Innovation Park Lab', 'Sports Arena Roof', 'Water Treatment Upgrade'];

const projects = PROJECT_NAMES.map((name, i) => ({
    id: uuid('proj', i + 1),
    accountId: ACCOUNT_ID,
    name,
    platform: 'acc',
    status: i === 17 ? 'archived' : 'active',
    type: pick(['Office', 'Healthcare', 'Infrastructure', 'Residential', 'Education']),
    jobNumber: `SS-${2024 + (i % 3)}-${String(100 + i)}`,
    classification: 'production',
    startDate: '2025-01-15',
    endDate: '2027-06-30',
    createdAt: '2025-01-10T08:00:00.000Z',
    updatedAt: '2026-10-01T08:00:00.000Z',
}));

// Project membership: Anna (project admin) plus a stable random subset.
const projectUsers = new Map();
for (const project of projects) {
    const members = accountUsers.filter((u, i) => i === 0 || rand() < 0.35);
    projectUsers.set(project.id, members.map((u, i) => {
        const role = roles.find(r => r.id === u.default_role_id);
        return {
            id: u.id,
            email: u.email,
            name: u.name,
            firstName: u.first_name,
            lastName: u.last_name,
            autodeskId: u.uid,
            companyId: u.company_id,
            companyName: u.company_name,
            roleIds: [role.id],
            roles: [{ id: role.id, name: role.name }],
            status: u.status,
            accessLevels: { accountAdmin: i === 0, projectAdmin: i === 0 || rand() < 0.15, executive: false },
            products: [
                { key: 'projectAdministration', access: i === 0 ? 'administrator' : 'none' },
                { key: 'docs', access: 'member' },
                { key: 'build', access: rand() < 0.6 ? 'member' : 'none' },
                { key: 'insight', access: 'member' },
                { key: 'modelCoordination', access: rand() < 0.4 ? 'member' : 'none' },
            ],
            addedOn: '2025-02-01T08:00:00.000Z',
        };
    }));
}

// Folder tree, the same for every project: Project Files / Plans with a few levels.
const TREE = {
    'Project Files': {
        '01 Architecture': { 'Drawings': {}, 'Models': {}, 'Renderings': {} },
        '02 Structure': { 'Calculations': {}, 'Models': {} },
        '03 MEP': { 'HVAC': {}, 'Electrical': {}, 'Plumbing': {} },
        '04 Site': {},
        '99 Archive': {},
    },
    'Plans': { 'Issued for Construction': {}, 'Shop Drawings': {} },
};

const folderIndex = new Map(); // folderId -> { name, children: [ids], parentId }
let folderCounter = 0;
function buildFolders(name, subtree, parentId) {
    const id = `urn:adsk.wipprod:fs.folder:co.mock${String(++folderCounter).padStart(6, '0')}`;
    const children = Object.entries(subtree).map(([n, s]) => buildFolders(n, s, id));
    folderIndex.set(id, { name, children, parentId });
    return id;
}
const topFolderIds = Object.entries(TREE).map(([n, s]) => buildFolders(n, s, null));

function folderJson(id) {
    const f = folderIndex.get(id);
    return {
        type: 'folders',
        id,
        attributes: { name: f.name, displayName: f.name, objectCount: f.children.length + 3, hidden: false },
        relationships: f.parentId ? { parent: { data: { type: 'folders', id: f.parentId } } } : {},
    };
}

const ACTIONS = {
    viewer: ['VIEW', 'COLLABORATE'],
    downloader: ['VIEW', 'DOWNLOAD', 'COLLABORATE'],
    uploader: ['PUBLISH', 'COLLABORATE'],
    editor: ['VIEW', 'DOWNLOAD', 'COLLABORATE', 'PUBLISH', 'EDIT'],
    manager: ['VIEW', 'DOWNLOAD', 'COLLABORATE', 'PUBLISH', 'EDIT', 'CONTROL'],
};

function folderPermissions(projectId, folderId) {
    const members = projectUsers.get(projectId) || [];
    let h = 0;
    for (const ch of folderId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const perms = [];
    members.forEach((u, i) => {
        if (i !== 0 && (h + i * 7) % 3 !== 0) return;
        const level = i === 0 ? 'manager' : Object.keys(ACTIONS)[(h + i) % 5];
        perms.push({
            subjectId: u.id, autodeskId: u.autodeskId, name: u.name, email: u.email, userType: 'USER',
            subjectType: 'USER', subjectStatus: 'ACTIVE', actions: ACTIONS[level], inheritActions: [],
        });
    });
    const role = roles[h % roles.length];
    perms.push({ subjectId: role.id, name: role.name, subjectType: 'ROLE', subjectStatus: 'ACTIVE', actions: ACTIONS.viewer, inheritActions: [] });
    const company = companies[h % companies.length];
    perms.push({ subjectId: company.id, name: company.name, subjectType: 'COMPANY', subjectStatus: 'ACTIVE', actions: ACTIONS.downloader, inheritActions: [] });
    return perms;
}

module.exports = {
    ACCOUNT_ID, HUB_ID, ME, companies, roles, accountUsers, projects, projectUsers,
    topFolderIds, folderIndex, folderJson, folderPermissions,
};
