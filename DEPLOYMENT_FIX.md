# Google Cloud Deployment - Fix Issues

## Current Status
- **VM IP**: 34.65.160.116
- **Port**: 3000
- **URL**: http://34.65.160.116:3000/
- **Status**: HTML loads but backend likely failing due to missing credentials

## Critical Issues to Fix

### Issue 1: Missing service-account.json on VM

**Solution:** Create the file from your .env.production credentials

SSH into your VM:
```bash
gcloud compute ssh acc-user-management-v2-vm --zone=us-central1-a
```

Then create the service account file:
```bash
cd /home/acc-user-management

# Upload your Firebase service account credentials
# Download your service account key from Firebase Console:
# https://console.firebase.google.com/project/accusermanagement/settings/serviceaccounts/adminsdk
# Then upload it using:
gcloud compute scp /path/to/your/service-account.json acc-user-management-v2-vm:/home/acc-user-management/service-account.json --zone=us-central1-a
  "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-fbsvc%40accusermanagement.iam.gserviceaccount.com"
}
EOF

# Secure the file (read-only for owner)
chmod 600 service-account.json
```

### Issue 2: Create .env file on VM

```bash
# Still in SSH on the VM
cat > .env << 'EOF'
# Encryption Key (minimum 32 characters)
ENCRYPTION_KEY=ACC-UserMgmt-SecureKey-2026-v2-EU-Production-34chars

# Firebase Configuration (Client-side)
FIREBASE_API_KEY=AIzaSyBZs-p0860rlQVlIgqq8ZpS0MM_Wvb62zI
FIREBASE_AUTH_DOMAIN=accusermanagement.firebaseapp.com
FIREBASE_PROJECT_ID=accusermanagement
FIREBASE_STORAGE_BUCKET=accusermanagement.firebasestorage.app
FIREBASE_MESSAGING_SENDER_ID=8286394417
FIREBASE_APP_ID=1:8286394417:web:6e129a206122bc7dc89d10

# Server Configuration
PORT=3000
NODE_ENV=production
EOF

# Secure the file
chmod 600 .env
```

### Issue 3: Update firebase-config.js on VM

```bash
# Update the Firebase client config
cat > firebase-config.js << 'EOF'
const firebaseConfig = {
  apiKey: "AIzaSyBZs-p0860rlQVlIgqq8ZpS0MM_Wvb62zI",
  authDomain: "accusermanagement.firebaseapp.com",
  projectId: "accusermanagement",
  storageBucket: "accusermanagement.firebasestorage.app",
  messagingSenderId: "8286394417",
  appId: "1:8286394417:web:6e129a206122bc7dc89d10"
};
EOF
```

### Issue 4: Restart the Application

```bash
# Restart PM2 to load new configuration
pm2 restart all

# Check status
pm2 status

# View logs to verify it's working
pm2 logs --lines 50
```

## Verification Steps

After applying the fixes above, check these:

1. **Check PM2 Status:**
```bash
pm2 status
```
Should show: `status: online`

2. **Check Logs for Errors:**
```bash
pm2 logs --lines 100
```
Look for:
- ✅ `Encryption key loaded successfully`
- ✅ `Using service-account.json file`
- ✅ `Server running on port 3000`
- ❌ Any error messages

3. **Test from Browser:**
Open: http://34.65.160.116:3000/

Should show:
- Login page (if not logged in)
- No console errors about Firebase

4. **Test Login:**
Try to register or login - should work without errors

## Additional Fixes Needed in Local Code

You also need to update your local files before future deployments:

### Fix 1: Update CORS allowed origins in server.js

The server currently has the wrong IP. You need to update line 74:

**Current:**
```javascript
'http://34.45.169.78:3000',  // Wrong IP
```

**Should be:**
```javascript
'http://34.65.160.116:3000',  // Correct IP
```

### Fix 2: Create a proper deployment script

I'll create this for you below.

## Quick Commands Summary

**SSH into VM:**
```bash
gcloud compute ssh acc-user-management-v2-vm --zone=us-central1-a
```

**Check logs:**
```bash
pm2 logs
```

**Restart app:**
```bash
pm2 restart all
```

**Update code from local:**
```bash
# From your local PowerShell (not in SSH)
gcloud compute scp --recurse c:\MCPServer\ACC_User_Management\* acc-user-management-v2-vm:/home/acc-user-management --zone=us-central1-a
```

## Next Steps

1. Run all the commands in Issue 1-4 above
2. Verify the application is working
3. Let me know if you see any errors in the PM2 logs
