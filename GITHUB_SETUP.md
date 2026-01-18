# GitHub Repository Setup Guide

## Creating ACC_USER_MANAGEMENT_CLOUD Repository

### Step 1: Pre-Commit Checklist

**⚠️ CRITICAL - Verify these items before pushing to GitHub:**

- [ ] `.env` file is **NOT** committed (check `.gitignore`)
- [ ] No Firebase service account keys in repository
- [ ] No real user data or credentials in any files
- [ ] All test `.txt` files excluded (check `.gitignore`)
- [ ] `README_CLOUD.md` renamed to `README.md`
- [ ] Update company/support email addresses in README
- [ ] Remove any hardcoded passwords or API keys

### Step 2: Files to Include

**Core Application Files:**
```
✅ server.js
✅ index.html
✅ package.json
✅ package-lock.json
✅ ecosystem.config.js
✅ startup.sh
```

**JavaScript Modules:**
```
✅ get_account_users.js
✅ get_project_users.js
✅ update_account_users.js
✅ manage_project_users.js
✅ read_project_folders.js
✅ update_folder_permission.js
✅ folders_permissions.js
✅ user-table.js
```

**Documentation:**
```
✅ README.md (rename from README_CLOUD.md)
✅ CHANGELOG.md
✅ VERSION.md
✅ RELEASE_NOTES.md
✅ GOOGLE_CLOUD_DEPLOYMENT.md
✅ INFOMANIAK_DEPLOYMENT.md
✅ INFOMANIAK_CHECKLIST.md
```

**Configuration:**
```
✅ .gitignore
✅ .env.example
✅ .github/copilot-instructions.md (if exists)
```

### Step 3: Files to EXCLUDE

**❌ Never commit these:**
```
❌ .env
❌ *serviceAccountKey*.json
❌ firebase-service-account.json
❌ user_permissions_import.json
❌ users_main_list.json
❌ Atlantic_folder_permissions.json
❌ All .txt files (test data)
❌ SampleUsers.csv
❌ node_modules/
```

### Step 4: Create GitHub Repository

1. **Go to GitHub** → https://github.com/new
2. **Repository name**: `ACC_USER_MANAGEMENT_CLOUD`
3. **Description**: "Multi-tenant cloud SaaS for managing Autodesk Construction Cloud users and permissions"
4. **Visibility**: Private (recommended) or Public
5. **DO NOT** initialize with README (we already have one)
6. Click **Create repository**

### Step 5: Push Local Code to GitHub

```bash
# Navigate to project directory
cd C:\MCPServer\ACC_User_Management

# Rename README for cloud version
mv README_CLOUD.md README.md

# Initialize git (if not already done)
git init

# Add remote repository (replace YOUR_USERNAME)
git remote add origin https://github.com/YOUR_USERNAME/ACC_USER_MANAGEMENT_CLOUD.git

# Check what will be committed
git status

# Add all files (respects .gitignore)
git add .

# Verify no sensitive files are staged
git status

# Create initial commit
git commit -m "Initial commit: Multi-tenant cloud SaaS version

- Firebase authentication and Firestore integration
- Multi-tenant architecture with complete data isolation
- AES-256-CBC encryption for credentials and user data
- Manual license activation system (€900/year)
- Account and project user management
- Multi-project folder permissions with encryption
- Batch processing (50/batch account, 200/batch project)
- User-friendly progress indicators
- Production-ready deployment configuration"

# Push to GitHub
git push -u origin main
# Or if your default branch is 'master':
# git push -u origin master
```

### Step 6: Create GitHub Milestone

1. Go to repository → **Issues** → **Milestones**
2. Click **New milestone**
3. **Title**: `v1.0.0 - Cloud SaaS Release`
4. **Due date**: (set as needed)
5. **Description**:
```
Production-ready multi-tenant cloud SaaS release.

**Features:**
- ✅ Firebase multi-tenant architecture
- ✅ Complete data encryption (AES-256-CBC)
- ✅ Manual license management (€900/year)
- ✅ Account & project user management
- ✅ Multi-project folder permissions
- ✅ Batch operations with rate limiting
- ✅ User-friendly progress indicators
- ✅ Google Cloud VM deployment ready

**Documentation:**
- ✅ Comprehensive README
- ✅ Deployment guides
- ✅ API documentation
- ✅ Environment setup instructions
```

### Step 7: Create Release Tag

```bash
# Create annotated tag
git tag -a v1.0.0 -m "Release v1.0.0: Multi-tenant cloud SaaS

Features:
- Firebase authentication and Firestore
- Multi-tenant data isolation with encryption
- Manual license activation system
- Account and project user management
- Multi-project folder permissions
- Production deployment configurations"

# Push tag to GitHub
git push origin v1.0.0
```

### Step 8: Create GitHub Release

1. Go to repository → **Releases** → **Draft a new release**
2. **Choose a tag**: Select `v1.0.0`
3. **Release title**: `v1.0.0 - Cloud SaaS Release`
4. **Description**: (Copy from RELEASE_NOTES.md)
5. **Attach binaries**: (optional) Package as ZIP if needed
6. Click **Publish release**

### Step 9: Repository Settings (Recommended)

**Branch Protection:**
1. Settings → Branches → Add rule
2. Branch name pattern: `main` (or `master`)
3. Enable:
   - ✅ Require pull request reviews before merging
   - ✅ Require status checks to pass before merging

**Security:**
1. Settings → Security → Enable:
   - ✅ Dependency graph
   - ✅ Dependabot alerts
   - ✅ Dependabot security updates

**Secrets (for CI/CD):**
1. Settings → Secrets and variables → Actions
2. Add repository secrets:
   - `FIREBASE_PROJECT_ID`
   - `FIREBASE_PRIVATE_KEY`
   - `FIREBASE_CLIENT_EMAIL`
   - `ENCRYPTION_KEY`

### Step 10: Update Documentation

**In README.md, update:**
- Repository URL references
- Support email address
- Company information
- License information

**Create Wiki pages (optional):**
- Installation guide
- API documentation
- Troubleshooting
- FAQ

### Step 11: Final Verification

```bash
# Clone repository in a new location to verify
cd C:\temp
git clone https://github.com/YOUR_USERNAME/ACC_USER_MANAGEMENT_CLOUD.git
cd ACC_USER_MANAGEMENT_CLOUD

# Verify .env is NOT present
ls .env  # Should not exist

# Verify .env.example exists
ls .env.example  # Should exist

# Verify all source files are present
ls *.js  # Check all JS files
ls *.md  # Check all documentation

# Test installation
npm install
# Should complete without errors
```

---

## Quick Commands Summary

```bash
# Prepare repository
mv README_CLOUD.md README.md
git init
git remote add origin https://github.com/YOUR_USERNAME/ACC_USER_MANAGEMENT_CLOUD.git

# Commit and push
git add .
git commit -m "Initial commit: Multi-tenant cloud SaaS version"
git push -u origin main

# Create release tag
git tag -a v1.0.0 -m "Release v1.0.0: Multi-tenant cloud SaaS"
git push origin v1.0.0
```

---

## Troubleshooting

**Problem: `.env` file appears in `git status`**
```bash
# Remove from staging
git reset HEAD .env

# Verify .gitignore includes .env
cat .gitignore | grep .env
```

**Problem: Large files or `node_modules` committed**
```bash
# Remove from git cache
git rm -r --cached node_modules
git commit -m "Remove node_modules from git"
```

**Problem: Sensitive data already committed**
```bash
# Use BFG Repo-Cleaner or git-filter-branch
# See: https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository
```

---

## Post-Release Tasks

- [ ] Update deployment on Google Cloud VM
- [ ] Test production environment
- [ ] Monitor error logs
- [ ] Announce release to users/customers
- [ ] Update documentation wiki
- [ ] Plan next milestone features

---

**Date**: January 18, 2026
**Version**: 1.0.0
**Status**: Ready for GitHub migration ✅
