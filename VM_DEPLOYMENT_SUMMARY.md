# Google Cloud VM Deployment - Issues & Solutions

## Current Status

✅ **VM is Running**: http://34.65.160.116:3000  
✅ **HTML is Loading**: The frontend is being served  
❌ **Backend Issues**: Missing configuration files

## Problems Found

### 1. Missing `service-account.json`
**Issue**: Firebase Admin SDK requires this file but it doesn't exist on the VM  
**Impact**: Server crashes or can't access Firebase/Firestore  
**Solution**: Create the file from your `.env.production` credentials

### 2. Missing `.env` file
**Issue**: Server needs environment variables (encryption key, Firebase config)  
**Impact**: Server may crash or use wrong configuration  
**Solution**: Create proper `.env` file on the VM

### 3. Wrong IP in CORS
**Issue**: `server.js` had old IP `34.45.169.78` in allowed origins  
**Impact**: API calls from frontend might be blocked  
**Solution**: ✅ **FIXED** - Updated to include `34.65.160.116`

## Quick Fix (Run This Now!)

Open PowerShell on your local machine and run:

```powershell
cd c:\MCPServer\ACC_User_Management
.\quick-fix-vm.ps1
```

This script will:
1. Create `service-account.json` on the VM
2. Create `.env` file with proper configuration
3. Update `firebase-config.js`
4. Restart the application
5. Show you the logs

**Note**: You'll be prompted to confirm before it runs.

## Alternative: Manual Fix

If you prefer to do it manually:

### Step 1: SSH into the VM
```powershell
gcloud compute ssh acc-user-management-v2-vm --zone=us-central1-a
```

### Step 2: Upload service-account.json
```bash
# Download your Firebase service account key from Firebase Console:
# https://console.firebase.google.com/project/accusermanagement/settings/serviceaccounts/adminsdk

# Upload it to the VM:
gcloud compute scp /path/to/your/service-account.json acc-user-management-v2-vm:/home/acc-user-management/service-account.json --zone=us-central1-a

chmod 600 service-account.json
```

### Step 3: Create .env file
```bash
cat > .env << 'EOF'
ENCRYPTION_KEY=ACC-UserMgmt-SecureKey-2026-v2-EU-Production-34chars
FIREBASE_API_KEY=AIzaSyBZs-p0860rlQVlIgqq8ZpS0MM_Wvb62zI
FIREBASE_AUTH_DOMAIN=accusermanagement.firebaseapp.com
FIREBASE_PROJECT_ID=accusermanagement
FIREBASE_STORAGE_BUCKET=accusermanagement.firebasestorage.app
FIREBASE_MESSAGING_SENDER_ID=8286394417
FIREBASE_APP_ID=1:8286394417:web:6e129a206122bc7dc89d10
PORT=3000
NODE_ENV=production
EOF

chmod 600 .env
```

### Step 4: Create firebase-config.js
```bash
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

### Step 5: Restart the Application
```bash
pm2 restart all
pm2 logs --lines 50
```

Look for these messages in the logs:
- ✅ `Using service-account.json file`
- ✅ `Encryption key loaded successfully`
- ✅ `Server running on port 3000`

## Verification

After running the fix:

1. **Check PM2 Status**
   ```bash
   pm2 status
   ```
   Should show: `status: online`

2. **Check Logs**
   ```bash
   pm2 logs
   ```
   Should show no errors

3. **Test in Browser**
   Open: http://34.65.160.116:3000/
   - Should load the login page
   - Should be able to register/login
   - Firebase connection should work

4. **Check Browser Console**
   - Open Developer Tools (F12)
   - Look for errors in Console tab
   - Should see Firebase initialized successfully

## Future Deployments

For future updates, use the full deployment script:

```powershell
cd c:\MCPServer\ACC_User_Management
.\deploy-to-vm.ps1
```

This will:
- Upload all your latest code
- Update dependencies
- Restart the application
- Show you the status

## Troubleshooting

### Application won't start
```bash
pm2 logs
npm install
pm2 restart all
```

### Still seeing errors
Check that all three files were created:
```bash
ls -la /home/acc-user-management/service-account.json
ls -la /home/acc-user-management/.env
ls -la /home/acc-user-management/firebase-config.js
```

### Can't connect to Firebase
Verify the service account JSON is valid:
```bash
cat /home/acc-user-management/service-account.json
```

## Useful Commands

**View logs:**
```powershell
gcloud compute ssh acc-user-management-v2-vm --zone=us-central1-a --command="pm2 logs"
```

**Check status:**
```powershell
gcloud compute ssh acc-user-management-v2-vm --zone=us-central1-a --command="pm2 status"
```

**Restart app:**
```powershell
gcloud compute ssh acc-user-management-v2-vm --zone=us-central1-a --command="pm2 restart all"
```

**SSH into VM:**
```powershell
gcloud compute ssh acc-user-management-v2-vm --zone=us-central1-a
```

## Files Created

I've created these helper files in your project:
1. `quick-fix-vm.ps1` - Quick fix script (run this now!)
2. `deploy-to-vm.ps1` - Full deployment script
3. `deploy-vm.sh` - Server-side deployment script
4. `DEPLOYMENT_FIX.md` - Detailed fix instructions
5. `VM_DEPLOYMENT_SUMMARY.md` - This file

## Next Steps

1. Run `quick-fix-vm.ps1` to fix the current deployment
2. Test your application at http://34.65.160.116:3000/
3. If you see any errors, check the PM2 logs
4. Report back with the status or any errors you encounter
