# Changelog

All notable changes to the ACC User Management project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-12-03 - December 2025 Release

### Added

#### Permission Management
- Permission level tooltips with 1-second hover delay showing all 6 levels with descriptions
- Visual color-coded permission levels with gradient backgrounds
- Input validation for permission levels (1-6 only)
- Tooltip positioning below permission input fields

#### Multi-User Operations
- Shift+Click multi-user selection in user list panel
- Blue highlight visual feedback for selected users
- Multi-user drag and drop to folder permission cells
- Horizontal placement of multiple users (first in target cell, rest fill right)
- Cell selection toggle with Shift+Click to deselect
- Cleared selection state after successful drop

#### Folder Permissions
- 3-level folder hierarchy display (Level 1, 2, 3)
- Shift+drag to fill multiple cells with same value (changed from right-click)
- Sortable user list with company/role filtering
- Batch permission sync to ACC with parallel processing
- Progress indicators for folder loading and sync operations
- Local storage for folder permissions (save/restore)
- JSON export functionality for backup
- Admin user detection and handling

#### CSV Import
- CSV import modal with file browser
- "Download CSV Sample" button with template download
- Sample CSV with 6 example users
- Email;Company;Role format validation
- Automatic header row skipping (first line)
- Email format validation with regex
- Error reporting for invalid rows
- Format instructions in modal

#### User Management Table
- Editable cells for all user properties
- Shift+drag to copy values vertically and horizontally
- Email column protection (validates email format)
- Administrator auto-upgrade for all access levels
- Administrator auto-downgrade when access changed
- Multi-email paste detection and processing
- Automatic row creation for pasted emails
- Column sorting (ascending/descending)
- Select all checkbox functionality

#### User Interface
- Clean modal dialogs for folders and user management
- Real-time progress bars with percentage display
- Responsive layout design
- Artifact Elements font integration
- Error message displays
- Loading states and animations
- Hover effects and visual feedback

### Changed
- Button text from "Save to Server" to "Save Users Setting"
- Drag-to-fill modifier from right mouse button to Shift key
- Removed "Download JSON" button from Users Main List modal
- Improved cell selection logic to support toggle behavior

### Fixed
- CSV header row no longer causes validation errors
- Email validation prevents non-email values in email column
- Cell deselection now works properly with Shift+Click
- Multi-user drag properly clears selection after drop
- Permission level inputs properly validate on input

### Technical
- Modular JavaScript architecture with IIFE pattern
- Event delegation for dynamic content
- Parallel API calls with Promise.all
- Batch permission operations
- 2-legged OAuth authentication
- Express.js server with CORS support
- PM2 ecosystem configuration
- Local .env credential management

### Known Issues
- Event listeners may accumulate on modal reopen (optimization needed)
- Tooltip cleanup on element removal could be improved
- FileReader missing error handler in CSV import
- Console.log statements present (should be removed for production)

## [Unreleased]

### To Be Added
- Event listener cleanup optimization
- Enhanced error handling for file operations
- Permission level paste validation
- Partial failure handling in batch sync
- Production logging strategy
- Excel export functionality
- Permission templates
- Audit logging

---

**Repository:** AndrzejSamsonowicz/ACC_User_Management  
**Milestone:** December 2025 Release  
**Release Date:** December 3, 2025
