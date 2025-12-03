# ACC User Management - December 2025 Release

**Release Date:** December 3, 2025  
**Version:** 1.0.0  
**Milestone:** December 2025 Release

## Overview

This release introduces the initial version of ACC User Management system with comprehensive folder permissions management, multi-user operations, and CSV import capabilities for Autodesk Construction Cloud projects.

## Key Features

### 🎯 Permission Level Management
- **Permission Level Tooltips**: Hover over permission inputs for 1 second to see detailed descriptions of all 6 permission levels
  - Level 1: View Only
  - Level 2: View/Download
  - Level 3: View/Download+PublishMarkups
  - Level 4: View/Download+PublishMarkups+Upload
  - Level 5: View/Download+PublishMarkups+Upload+Edit
  - Level 6: Full control
- **Visual Color Coding**: Permission levels are color-coded with gradient backgrounds for easy identification
- **Input Validation**: Real-time validation ensuring only valid permission levels (1-6) can be entered

### 👥 Multi-User Selection & Management
- **Shift+Click Selection**: Hold Shift and click to select multiple users from the user list
- **Visual Selection Feedback**: Selected users are highlighted in blue with white text
- **Multi-User Drag & Drop**: Drag multiple selected users at once to folder permission cells
- **Horizontal Placement**: First user placed in target cell, remaining users fill horizontally to the right
- **Cell Selection Toggle**: Shift+Click on already selected cells to deselect them

### 📂 Folder Permissions
- **3-Level Folder Hierarchy**: Display and manage permissions across Level 1, 2, and 3 folders
- **Drag-to-Fill**: Hold Shift and drag to fill multiple cells with the same value
- **User List Panel**: Sortable user list with company/role filtering options
- **Batch Permission Sync**: Sync all folder permissions to ACC in parallel batches
- **Admin Detection**: Automatic detection and handling of project administrators

### 📊 CSV Import
- **CSV Import Modal**: User-friendly modal with file browser for local CSV selection
- **Sample Download**: "Download CSV Sample" button provides template with correct format
- **Format Validation**: Validates Email;Company;Role format with semicolon delimiters
- **Header Auto-Skip**: Automatically skips the first row (header) during import
- **Email Validation**: Real-time email format validation during import
- **Multi-Row Processing**: Efficiently processes multiple users in a single import

### 🔄 User Management Table
- **Editable Cells**: Click any cell to edit user information inline
- **Drag-to-Fill**: Shift+drag to copy cell values vertically or horizontally
- **Email Column Protection**: Prevents dragging non-email values to email column
- **Administrator Auto-Upgrade**: Automatically upgrades all access levels when user becomes administrator
- **Multi-Email Paste**: Paste multiple emails at once, automatically creates new rows
- **Sort Functionality**: Click column headers to sort ascending/descending

### 🎨 User Interface
- **Modal Dialogs**: Clean, modern modal windows for folders and user management
- **Progress Indicators**: Real-time progress bars for folder loading and permission sync
- **Responsive Layout**: Adapts to different screen sizes
- **Artifact Elements Font**: Consistent Autodesk branding throughout
- **Error Handling**: User-friendly error messages and validation feedback

## Technical Implementation

### Architecture
- **Modular JavaScript**: Separate modules for folders, users, and permissions
- **IIFE Pattern**: Encapsulated module scope to prevent global namespace pollution
- **Event Delegation**: Efficient event handling for dynamic content
- **Parallel API Calls**: Batch processing with Promise.all for improved performance

### API Integration
- **Autodesk Platform Services (APS)**: Full integration with ACC/BIM360 APIs
- **2-Legged OAuth**: Server-side authentication for secure API access
- **Batch Operations**: Efficient batch create/update/delete for permissions
- **Error Recovery**: Comprehensive error handling and retry logic

### Data Management
- **Local Storage**: Save and restore folder permissions locally
- **JSON Export/Import**: Export folder permissions for backup
- **CSV Support**: Import users from CSV files
- **State Management**: Maintains current project, hierarchy, and user data

## Files Modified/Created

### Core Files
- `read_project_folders.js` (2324 lines) - Folder hierarchy and permissions management
- `user-table.js` (2256 lines) - User management table and CSV import
- `update_folder_permission.js` (695 lines) - Batch permission sync to ACC
- `folders_permissions.js` (203 lines) - Permission fetching and utilities
- `manage_project_users.js` - Project user management
- `get_project_users.js` - Fetch project users from ACC
- `get_account_users.js` - Fetch account-level users
- `update_account_users.js` - Update account user settings
- `index.html` (2476 lines) - Main HTML structure and modals
- `server.js` (246 lines) - Express server with CORS and credential management
- `ecosystem.config.js` - PM2 configuration for production deployment

### Configuration
- `.env` - Environment variables for APS credentials
- `package.json` - Node.js dependencies and scripts
- `.github/copilot-instructions.md` - AI coding assistant guidelines

## Known Issues

See code review findings for potential improvements:
- Event listener cleanup optimization needed
- Tooltip memory management enhancement
- Additional error handling for edge cases

## Installation & Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Configure APS credentials in `.env`:
   ```
   APS_CLIENT_ID=your_client_id
   APS_CLIENT_SECRET=your_client_secret
   ```

3. Start the server:
   ```bash
   npm start
   ```

4. Access the application at `http://localhost:8080`

## Usage

### Managing Folder Permissions
1. Select a project from the project list
2. Click "Manage Access to Folders"
3. Drag users from the left panel to folder cells
4. Set permission levels (1-6) for each user
5. Click "Save Users Setting" to save locally
6. Click "Sync to ACC" to push changes to Autodesk servers

### Importing Users from CSV
1. Open the Users Main List modal
2. Click "Import CSV"
3. Download the sample CSV for reference
4. Select your CSV file (Email;Company;Role format)
5. Click "Import CSV" to process

### Multi-User Operations
1. Hold Shift and click to select multiple users
2. Selected users highlight in blue
3. Drag all selected users to a folder cell
4. Users fill horizontally from the drop point
5. Click elsewhere to clear selection

## Browser Compatibility

- Chrome/Edge (recommended)
- Firefox
- Safari

## Dependencies

- Express.js - Web server
- Node.js - Runtime environment
- PM2 - Process management (production)
- Autodesk Platform Services SDK

## Security

- OAuth 2.0 authentication
- Server-side credential storage
- CORS configuration for API access
- Input validation and sanitization

## Performance

- Parallel API calls for folder hierarchy fetching
- Batch permission operations (reduced API calls)
- Event delegation for dynamic content
- Efficient data caching

## Future Enhancements

- Enhanced error recovery and retry logic
- Event listener cleanup optimization
- Advanced filtering and search capabilities
- Permission templates and presets
- Audit logging and change history
- Export to Excel functionality

## Credits

**Developer:** Andrzej Samsonowicz  
**Repository:** AndrzejSamsonowicz/ACC_User_Management  
**Platform:** Autodesk Construction Cloud

## Support

For issues, questions, or contributions, please open an issue on the GitHub repository.

---

**Milestone:** December 2025 Release  
**Status:** ✅ Complete  
**Date:** December 3, 2025
