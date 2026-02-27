# Security Guidelines

## 🔴 CRITICAL: Never Commit Service Account Keys

**Service account JSON files MUST NEVER be committed to version control.**

These files grant admin-level access to your Firebase project:
- Read/write/delete ALL Firestore data
- Manage authentication
- Full project administration privileges

### Protected Files in .gitignore

The following patterns are blocked from git:
- `*service-account*.json`
- `*serviceAccountKey*.json`
- `firebase-service-account*.json`
- `*-firebase-adminsdk-*.json`
- `serviceAccount*.json`

### If You Accidentally Commit a Service Account File

1. **IMMEDIATELY** rotate/delete the compromised service account in Firebase Console
2. Generate a new service account key
3. Remove the file from git history:
   ```bash
   git filter-branch --force --index-filter \
     "git rm --cached --ignore-unmatch path/to/service-account.json" \
     --prune-empty --tag-name-filter cat -- --all
   ```
4. Force push to all remotes (coordinate with team)

## Environment Variables

Sensitive configuration is stored in `.env` (also in .gitignore):
- `ENCRYPTION_KEY` - Used for encrypting credentials at rest
- `FIREBASE_SERVICE_ACCOUNT_PATH` - Path to service account JSON

## Current Security Measures

✅ **Encryption at Rest**
- AES-256-CBC encryption for all sensitive data
- Unique random salts per user (scrypt key derivation)
- Fresh IV for each encryption operation
- Credentials stored encrypted in Firestore

✅ **Firebase Security**
- App Check enabled (reCAPTCHA v3)
- Firebase Security Rules enforced
- No client-side credential storage
- Secure authentication flow

✅ **API Protection**
- Rate limiting on authentication endpoints
- CORS restrictions
- XSS protection headers
- Content Security Policy

## Reporting Security Issues

If you discover a security vulnerability, please report it via:
- GitHub Security Advisory (preferred)
- Email to repository owner

Do not open public issues for security vulnerabilities.
