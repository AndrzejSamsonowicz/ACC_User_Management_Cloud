# Firebase Setup Guide for ACC User Management

## Overview
This guide will help you set up Firebase Authentication and Firestore for the ACC User Management authentication system.

## Estimated Time: 30 minutes
## Estimated Cost: **FREE** (Firebase Free Tier includes 50K reads/day, 20K writes/day, 1GB storage)

---

## Step 1: Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click **"Add project"**
3. Enter project name: `acc-user-management`
4. **Disable** Google Analytics (optional, not needed)
5. Click **"Create project"**
6. Wait for provisioning (~30 seconds)

---

## Step 2: Enable Authentication

1. In Firebase Console, click **"Authentication"** in left sidebar
2. Click **"Get started"**
3. Click **"Sign-in method"** tab
4. Enable **"Email/Password"**
   - Toggle **"Enable"** switch
   - Click **"Save"**
5. (Optional) Configure email templates:
   - Click **"Templates"** tab
   - Customize "Email verification" and "Password reset" templates
   - Add your company branding

---

## Step 3: Create Firestore Database

1. In Firebase Console, click **"Firestore Database"**
2. Click **"Create database"**
3. Select **"Start in production mode"** (we'll add security rules later)
4. Choose location: **us-central** (or nearest to your users)
5. Click **"Enable"**
6. Wait for provisioning (~1 minute)

### Set Security Rules

Click **"Rules"** tab and replace with:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users collection - users can only read/write their own data
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    
    // Licenses collection - read-only for authenticated users
    match /licenses/{licenseId} {
      allow read: if request.auth != null;
      allow write: if false; // Only server can write
    }
    
    // Admin collection - only for admin users
    match /admins/{adminId} {
      allow read: if request.auth != null && 
                     exists(/databases/$(database)/documents/admins/$(request.auth.uid));
      allow write: if false; // Only server can write
    }
    
    // Analytics collection - admin only
    match /analytics/{document=**} {
      allow read: if request.auth != null && 
                     exists(/databases/$(database)/documents/admins/$(request.auth.uid));
      allow write: if false; // Only server can write
    }
  }
}
```

Click **"Publish"**

---

## Step 4: Register Web App

1. In Firebase Console, go to **Project Settings** (gear icon)
2. Scroll down to **"Your apps"** section
3. Click **Web icon** (</> symbol)
4. Enter app nickname: `ACC User Management Web`
5. **Do NOT** check "Firebase Hosting" (we use Google Cloud VM)
6. Click **"Register app"**
7. **Copy the configuration object** - you'll need this!

```javascript
const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "acc-user-management.firebaseapp.com",
  projectId: "acc-user-management",
  storageBucket: "acc-user-management.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};
```

8. Paste this into `firebase-config.js` (replace the placeholder values)
9. Click **"Continue to console"**

---

## Step 5: Generate Service Account (for Server)

1. In Firebase Console, go to **Project Settings** > **Service Accounts** tab
2. Click **"Generate new private key"**
3. Click **"Generate key"** in the dialog
4. A JSON file will download - **KEEP THIS SECURE!**
5. Open the downloaded JSON file
6. Copy these values to your `.env` file:
   - `project_id` → `FIREBASE_PROJECT_ID`
   - `private_key` → `FIREBASE_PRIVATE_KEY` (keep the quotes and \n characters!)
   - `client_email` → `FIREBASE_CLIENT_EMAIL`

---

## Step 6: Configure Environment Variables

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` and fill in:
   - Firebase values from Step 5
   - Generate encryption key:
     ```bash
     node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
     ```
   - PayPal credentials (see PAYPAL_SETUP.md)
   - Admin email address

3. **IMPORTANT**: Add `.env` to `.gitignore` (never commit secrets!)

---

## Step 7: Initialize Firestore Collections

The server will automatically create collections on first use, but you can manually create them:

1. In Firestore, click **"Start collection"**
2. Create these collections:

### Collection: `users`
- Document ID: (auto-generated)
- Fields:
  - `email`: string
  - `licenseKey`: string
  - `licenseExpiry`: timestamp
  - `clientId`: string (encrypted)
  - `clientSecret`: string (encrypted)
  - `encryptionIV`: string
  - `createdAt`: timestamp
  - `lastLogin`: timestamp
  - `emailVerified`: boolean

### Collection: `licenses`
- Document ID: (license key)
- Fields:
  - `userId`: string
  - `email`: string
  - `status`: string (active/expired/revoked)
  - `purchaseDate`: timestamp
  - `expiryDate`: timestamp
  - `paypalOrderId`: string
  - `price`: number
  - `currency`: string

### Collection: `admins`
- Document ID: (admin user ID)
- Fields:
  - `email`: string
  - `role`: string (super_admin/admin)
  - `createdAt`: timestamp

### Collection: `analytics`
- Document ID: (auto-generated)
- Fields:
  - `userId`: string
  - `action`: string
  - `timestamp`: timestamp
  - `metadata`: map

---

## Step 8: Create First Admin User

1. Run the server: `npm start`
2. Use the admin creation endpoint (details in API documentation)
3. Or manually add to `admins` collection in Firestore Console

---

## Step 9: Enable Email Verification (Optional but Recommended)

1. In Firebase Console → **Authentication** → **Templates**
2. Click **"Email address verification"**
3. Customize the email template
4. Add your company name and logo
5. Save changes

---

## Security Best Practices

✅ **DO:**
- Keep `.env` file secret (add to `.gitignore`)
- Use strong passwords for admin accounts
- Regularly rotate encryption keys
- Monitor Firebase Console for unusual activity
- Enable Firebase App Check (optional, advanced)

❌ **DON'T:**
- Commit `.env` or service account JSON to Git
- Share Firebase config publicly (apiKey is okay, but keep project ID semi-private)
- Use same Firebase project for dev and production

---

## Testing the Setup

1. Start the server: `npm start`
2. Navigate to: `http://localhost:3000/login.html`
3. Try registering a new account
4. Check Firebase Console → Authentication (user should appear)
5. Check Firestore → users collection (user data should appear)

---

## Troubleshooting

### "Firebase: Error (auth/invalid-api-key)"
- Check that `firebase-config.js` has correct values from Firebase Console

### "Firebase Admin SDK authentication error"
- Check `.env` file has correct service account credentials
- Ensure `FIREBASE_PRIVATE_KEY` includes `\n` characters (line breaks)

### "Permission denied" in Firestore
- Check Security Rules are published correctly
- Ensure user is authenticated before accessing Firestore

### Email verification not sending
- Check Firebase Console → Authentication → Templates
- Verify email domain is authorized

---

## Next Steps

1. Complete PayPal setup (see `PAYPAL_SETUP.md`)
2. Deploy to Google Cloud (see `GOOGLE_CLOUD_DEPLOYMENT.md`)
3. Test complete user journey: register → verify email → purchase license → use tool
4. Set up monitoring and backups

---

## Cost Monitoring

Firebase Free Tier limits:
- **Authentication**: 50,000 active users/month (FREE)
- **Firestore reads**: 50,000/day (FREE)
- **Firestore writes**: 20,000/day (FREE)
- **Storage**: 1 GB (FREE)

For 100 customers with moderate usage, you should stay within free tier!

Monitor usage: Firebase Console → Usage and billing
