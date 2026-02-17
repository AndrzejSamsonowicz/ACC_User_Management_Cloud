# Firebase API Key Rotation Guide

**Date:** January 22, 2026  
**Status:** 🔴 URGENT - API Key Exposed in Git History (Now Removed)  
**Action Required:** Rotate Firebase API Key

---

## ✅ What Was Done (Git History Cleanup)

1. ✅ Removed `firebase-config.js` from entire Git history
2. ✅ Force-pushed cleaned history to GitHub
3. ✅ Verified file is properly in `.gitignore`
4. ✅ File recreated locally (not tracked by Git)

**Result:** The old API key is no longer visible in your GitHub repository.

---

## 🚨 Why You Still Need to Rotate

Even though we removed the file from GitHub:
- ❌ **GitHub caches old commits** - The key may still be accessible via direct commit URLs
- ❌ **Anyone who cloned before** - They have the key in their local history
- ❌ **Search engines** - May have indexed the key if the repo was public
- ❌ **Git forensics** - Advanced users could potentially recover it

**Bottom Line:** The key is compromised and must be rotated.

---

## 📋 Step-by-Step API Key Rotation

### Step 1: Create New Firebase Web App (Recommended)

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select project: `accusermanagement`
3. Go to **Project Settings** (gear icon) > **General**
4. Scroll to **"Your apps"** section
5. Find your current web app
6. Click **⋮** (three dots) > **Delete app**
7. Confirm deletion
8. Click **Add app** > **Web** (</> icon)
9. App nickname: `ACC User Management Web (2026)`
10. **Do NOT** check "Firebase Hosting"
11. Click **Register app**
12. **Copy the new configuration** ⬇️

```javascript
const firebaseConfig = {
  apiKey: "NEW_API_KEY_HERE",
  authDomain: "accusermanagement.firebaseapp.com",
  projectId: "accusermanagement",
  storageBucket: "accusermanagement.firebasestorage.app",
  messagingSenderId: "8286394417",
  appId: "NEW_APP_ID_HERE",
  measurementId: "NEW_MEASUREMENT_ID_HERE"
};
```

### Step 2: Update Local Configuration

1. Open `firebase-config.js` in your local project
2. Replace the entire `firebaseConfig` object with the new values
3. Save the file
4. **DO NOT** commit this file to Git (already in .gitignore ✅)

### Step 3: Update Production Server

**If running on Google Cloud VM:**
```bash
# SSH to your VM
gcloud compute ssh acc-user-management-v2-vm --zone=us-central1-a

# Edit the firebase-config.js file
nano /home/acc-user-management/firebase-config.js

# Paste the new configuration
# Save: Ctrl+O, Enter, Ctrl+X

# Restart the application
pm2 restart all

# Verify
pm2 logs
```

### Step 4: Test Authentication

1. Open your application: `http://usermgt.digibuild.ch:3000`
2. Try to log in with an existing account
3. Try to register a new account
4. Verify Firebase Authentication works
5. Check admin panel access

### Step 5: Monitor for Issues

```bash
# On VM - Check for Firebase errors
pm2 logs --lines 100 | grep -i firebase

# Check for authentication errors
pm2 logs --lines 100 | grep -i "auth"
```

---

## 🔒 Alternative: Restrict Existing Key (Less Secure)

If you can't rotate immediately, add restrictions:

1. Firebase Console > **Project Settings** > **General**
2. Scroll to **"Your apps"** > Click your web app
3. Under **"App restrictions"**:
   - **HTTP referrers:** Add `usermgt.digibuild.ch`
   - **IP addresses:** Add your VM IP: `34.65.160.116`
   - **API restrictions:** Enable only required APIs

**⚠️ Warning:** This is NOT a full fix - the key is still compromised.

---

## 🛡️ Prevent Future Exposures

### 1. Always Use Environment Variables (Future Enhancement)

Create `firebase-config.template.js`:
```javascript
const firebaseConfig = {
    apiKey: process.env.FIREBASE_API_KEY || "YOUR_API_KEY_HERE",
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || "accusermanagement.firebaseapp.com",
    // ... rest of config
};
```

### 2. Use Pre-Commit Hooks

Install `git-secrets`:
```powershell
# Prevent accidental commits of secrets
git secrets --install
git secrets --register-aws
git secrets --add 'AIza[0-9A-Za-z_-]{35}'  # Firebase API key pattern
```

### 3. Enable Firebase App Check

Add to your HTML files (after rotating key):
```javascript
// Initialize Firebase App Check
const appCheck = firebase.appCheck();
appCheck.activate(
  'YOUR_RECAPTCHA_V3_SITE_KEY',
  true // Auto-refresh tokens
);
```

**Get reCAPTCHA key:**
1. Firebase Console > **App Check**
2. Click **Get Started**
3. Register your app with reCAPTCHA v3
4. Copy the site key

---

## 📊 Security Status After Rotation

| Security Measure | Before | After Rotation |
|-----------------|--------|----------------|
| API Key in GitHub | 🔴 Exposed | 🟢 Removed |
| API Key Validity | 🔴 Compromised | 🟢 New & Secure |
| Git History Clean | 🔴 Contains key | 🟢 Cleaned |
| Firestore Rules | 🟢 Secure | 🟢 Secure |
| Rate Limiting | 🟢 Active | 🟢 Active |
| App Check | 🔴 Disabled | 🟡 Pending |

---

## ✅ Post-Rotation Checklist

- [ ] New Firebase web app created
- [ ] `firebase-config.js` updated locally
- [ ] `firebase-config.js` updated on production VM
- [ ] Application restarted on VM
- [ ] Login tested successfully
- [ ] Registration tested successfully
- [ ] Admin panel tested
- [ ] Firebase App Check enabled (optional but recommended)
- [ ] Old web app deleted from Firebase Console
- [ ] Team members notified (if applicable)

---

## 🆘 If Something Breaks

### Can't Log In After Rotation
```javascript
// Check browser console for errors
// Look for: "Firebase API key invalid" or similar

// Verify firebase-config.js has correct values
console.log(firebaseConfig);

// Clear browser cache and try again
// Ctrl+Shift+Delete > Clear cache
```

### VM Application Won't Start
```bash
# SSH to VM
# Check PM2 logs
pm2 logs --err

# Check if firebase-config.js exists
ls -la /home/acc-user-management/firebase-config.js

# Verify syntax
node -c /home/acc-user-management/firebase-config.js
```

### Roll Back (Emergency Only)
If the new key doesn't work, you can temporarily use the old one while troubleshooting:
1. Restore old API key to `firebase-config.js`
2. Restart application
3. Debug the issue
4. Re-rotate when ready

---

## 📞 Support Resources

- **Firebase Console:** https://console.firebase.google.com/
- **Firebase App Check:** https://firebase.google.com/docs/app-check
- **Firebase Security Rules:** https://firebase.google.com/docs/firestore/security/get-started
- **GitHub Security Best Practices:** https://docs.github.com/en/code-security

---

**⏰ Estimated Time:** 15-20 minutes  
**Priority:** 🔴 HIGH - Complete within 24-48 hours  
**Risk if Not Done:** API quota abuse, unauthorized signup attempts

---

**Last Updated:** January 22, 2026  
**Next Review:** After API key rotation completed
