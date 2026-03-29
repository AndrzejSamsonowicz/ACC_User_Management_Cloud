# ACC User Management - Cloud SaaS Version

**Multi-tenant cloud-based SaaS solution for managing Autodesk Construction Cloud users and permissions.**

🔐 **Secure** | 🚀 **Scalable** | 💼 **Production-Ready**

---

## 🌟 Features

### Authentication & Security
- 🔑 Firebase Authentication with email/password
- 🔒 AES-256-CBC encryption for all sensitive data
- 👤 Complete multi-tenant data isolation
- 🛡️ JWT-based API authentication
- 📧 Email verification required

### User Management
- **Account-Level Users**: Manage users across entire BIM 360 Team/ACC accounts
- **Project-Level Users**: Manage project-specific user access
- **Bulk Operations**: Import/export users via CSV
- **Real-time Updates**: Sync company and role information
- **Batch Processing**: Handle large user lists (50/batch for accounts, 200/batch for projects)

### Folder Permissions
- 📁 Save and sync folder-level permissions across projects
- 🌐 Multi-project support with hub/project isolation
- 🔐 Encrypted storage per user, per project
- 🔄 One-click sync to ACC folders

### Licensing & Billing
- 💳 Manual license activation/deactivation
- 💰 €900/year subscription model
- 📊 Admin dashboard for license management
- ⏰ Automatic license expiry tracking

---

## 🚀 Quick Start

### Prerequisites
- Node.js 14+ and npm
- Firebase project with Firestore enabled
- Autodesk account with API access
- Active Autodesk app credentials (Client ID & Secret)

### Installation

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/ACC_USER_MANAGEMENT_CLOUD.git
cd ACC_USER_MANAGEMENT_CLOUD

# Install dependencies
npm install

# Configure environment variables
cp .env.example .env
# Edit .env with your credentials
```

### Environment Configuration

Edit `.env` file with your credentials:

```env
# Firebase Admin SDK
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your_project.iam.gserviceaccount.com

# Encryption (generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
ENCRYPTION_KEY=your_64_character_hex_key

# Server
PORT=3000
NODE_ENV=production
```

### Run the Application

```bash
# Development mode
node server.js

# Production with PM2
npm install -g pm2
pm2 start ecosystem.config.js
```

Access the application at `http://localhost:3000`

---

## 📚 Architecture

### Tech Stack
- **Backend**: Node.js + Express.js
- **Database**: Firebase Firestore
- **Authentication**: Firebase Auth
- **Encryption**: Node.js Crypto (AES-256-CBC)
- **Frontend**: Vanilla JavaScript + Bootstrap 5
- **APIs**: Autodesk Construction Cloud Platform Services

### Data Structure

```
Firestore:
users/{userId}/
  ├── email, licenseKey, licenseExpiry
  ├── clientId (encrypted), clientSecret (encrypted), encryptionIV
  ├── users_main_list_encrypted, usersMainListIV
  ├── folderPermissions: {
  │     "hubId_projectId": "encrypted_data"
  │   }
  └── folderPermissionsIVs: {
        "hubId_projectId": "iv_hex"
      }
```

### Security Features
- All user credentials encrypted at rest
- Per-user encryption keys derived from userId
- Separate initialization vectors (IVs) for each data type
- JWT tokens for API authentication
- Firebase security rules enforcing user isolation
- No shared data between tenants

---

## 🔧 API Endpoints

### Authentication
- `POST /register` - Create new user account
- `POST /login` - User login
- `POST /logout` - User logout
- `GET /check-auth` - Verify authentication status

### User Management
- `POST /save` - Save encrypted credentials
- `GET /load` - Load encrypted credentials
- `POST /save-users-main-list` - Save encrypted users list
- `GET /load-users-main-list` - Load encrypted users list

### Folder Permissions
- `POST /save-folder-permissions` - Save folder permissions (per project)
- `GET /load-folder-permissions/:hubId/:projectId` - Load permissions
- `GET /check-folder-permissions/:hubId/:projectId` - Check if permissions exist

### Admin (Protected)
- `GET /admin/users` - List all registered users
- `POST /admin/users/:userId/license` - Activate license
- `DELETE /admin/users/:userId/license` - Deactivate license

---

## 📖 Usage Guide

### 1. First-Time Setup
1. Register an account at `/` (registration page)
2. Verify your email address
3. Contact admin to activate your license
4. Log in and enter your Autodesk API credentials (Client ID & Secret)

### 2. Managing Account Users
1. Click "Update from the Users Main List"
2. Import users from CSV or manually add entries
3. Click "Update" to sync with ACC
4. Monitor progress in real-time

### 3. Managing Project Users
1. Select a project from the dropdown
2. Click "Get Project Users"
3. Modify company, role, or permissions
4. Click "Update" to apply changes
5. Batch operations available for DELETE/POST

### 4. Folder Permissions
1. Select a project and click "Manage Access to Folders"
2. Modify folder-level permissions in the table
3. Click "Save folder permissions" (encrypted storage)
4. Click "Update to the project" to sync with ACC
5. Permissions saved per user, per project

---

## 🛠️ Development

### Project Structure
```
ACC_USER_MANAGEMENT_CLOUD/
├── server.js                      # Main Express server
├── index.html                     # Frontend UI
├── user-table.js                  # User table component
├── get_account_users.js           # Account user operations
├── view_project_users.js          # Project user operations
├── update_account_users.js        # Account user updates
├── manage_project_users.js        # Project user management
├── read_project_folders.js        # Folder operations
├── update_folder_permission.js    # Folder permission sync
├── folders_permissions.js         # Folder permissions logic
├── ecosystem.config.js            # PM2 configuration
├── package.json                   # Dependencies
├── .env.example                   # Environment template
└── .gitignore                     # Git ignore rules
```

### Key Dependencies
```json
{
  "express": "^4.18.2",
  "firebase-admin": "^12.0.0",
  "axios": "^1.6.0",
  "dotenv": "^16.3.1"
}
```

### Adding New Features
1. Update relevant `.js` files
2. Test with demo mode (`DEMO_MODE=true` in `.env`)
3. Update API documentation
4. Test multi-tenant isolation
5. Deploy to production

---

## 🚀 Deployment

### Google Cloud VM (Current)
```bash
# SSH into VM
ssh user@34.45.169.78

# Clone repository
git clone https://github.com/YOUR_USERNAME/ACC_USER_MANAGEMENT_CLOUD.git
cd ACC_USER_MANAGEMENT_CLOUD

# Install dependencies
npm install

# Configure environment
nano .env  # Add Firebase credentials

# Start with PM2
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### Alternative: Cloud Run / App Engine
See `GOOGLE_CLOUD_DEPLOYMENT.md` for detailed instructions.

---

## 📋 Roadmap

### Completed ✅
- Multi-tenant architecture with Firebase
- Complete data encryption (credentials, users lists, folder permissions)
- Manual license activation system
- Multi-project folder permissions support
- User-friendly progress indicators
- Batch processing optimizations

### Planned 🔜
- Automatic PayPal integration for licensing
- Usage analytics dashboard
- Email notifications for license expiry
- API rate limiting improvements
- Webhook support for real-time updates

---

## 🔒 Security Best Practices

1. **Never commit `.env` file** - Contains sensitive credentials
2. **Rotate encryption keys** regularly in production
3. **Use HTTPS only** in production
4. **Enable Firebase security rules** for user isolation
5. **Regular backups** of Firestore data
6. **Monitor API usage** for unusual activity
7. **Keep dependencies updated** (`npm audit`)

---

## 📝 License

Proprietary - All rights reserved.

This is a commercial SaaS product. License required for use.

---

## 🤝 Support

For licensing inquiries or support:
- Email: support@yourcompany.com
- Documentation: [GitHub Wiki](https://github.com/YOUR_USERNAME/ACC_USER_MANAGEMENT_CLOUD/wiki)

---

## 📅 Version History

See [RELEASE_NOTES.md](RELEASE_NOTES.md) for detailed version history.

**Current Version**: See [VERSION.md](VERSION.md)

---

## ⚠️ Important Notes

1. **Autodesk API Limits**: 
   - Account operations: 50 users per batch
   - Project operations: 200 users per batch
   - Respect rate limits to avoid throttling

2. **License Management**:
   - Manual activation required via admin dashboard
   - €900/year per user
   - Expired licenses block all operations

3. **Data Storage**:
   - All data encrypted in Firestore
   - Per-user data isolation enforced
   - No cross-tenant data access possible

4. **Browser Compatibility**:
   - Modern browsers only (Chrome, Firefox, Edge, Safari)
   - JavaScript must be enabled
   - Local storage required for auth tokens

---

**Built with ❤️ for Autodesk Construction Cloud users**
