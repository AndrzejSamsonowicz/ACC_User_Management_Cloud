# Fix Autodesk Login Error - APS App Setup

## Problem
Getting redirected to `https://signin.autodesk.com/request-error` when clicking "Login with Autodesk"

## Root Cause
Your APS (Autodesk Platform Services) app is either:
1. Not created yet
2. Has the wrong Redirect URI configured
3. Credentials not entered in the app

## Solution: Set Up APS App Correctly

### Step 1: Create or Update APS App

1. **Go to Autodesk Platform Services:**
   - Visit: https://aps.autodesk.com/myapps

2. **Sign in** with your Autodesk account

3. **Create New App** (or edit existing):
   - Click "Create App"
   - App Name: `ACC User Management`
   - I want this app to access: **Select all relevant APIs**:
     - ✅ APS API
     - ✅ Autodesk Construction Cloud API
     - ✅ BIM 360 API
     - ✅ Data Management API

4. **CRITICAL: Set Callback URL (Redirect URI)**
   
   Add BOTH of these URLs:
   ```
   http://34.65.160.116:3000/index.html
   http://localhost:3000/index.html
   ```
   
   **Important:** 
   - Must be EXACT match (including http vs https, port, and path)
   - Your VM IP is `34.65.160.116`
   - If you later get a domain, add that too

5. **Save and Get Credentials:**
   - After saving, you'll see:
     - **Client ID** (looks like: `abc123xyz...`)
     - **Client Secret** (click "Show" to reveal)
   - **COPY BOTH** - you'll need them next

### Step 2: Enter Credentials in Your App

1. **Open your application:**
   ```
   http://34.65.160.116:3000/
   ```

2. **Click "Enter Client Credentials"**

3. **Paste your credentials:**
   - Client ID: (paste from Step 1)
   - Client Secret: (paste from Step 1)

4. **Click "Save Credentials"**
   - This encrypts and stores them in Firebase

### Step 3: Test Login

1. **Click "Login with Autodesk"**
   
2. **You should see:**
   - Autodesk login page (not an error)
   - After login, redirected back to your app
   - List of hubs/accounts

3. **If you still get request-error:**
   - Check browser console for the actual auth URL being used
   - Verify the redirect_uri parameter matches what you set in APS app
   - Make sure you saved credentials correctly

## Common Mistakes

### ❌ Wrong Redirect URI
```
# In APS app: http://34.65.160.116:3000/
# In actual request: http://34.65.160.116:3000/index.html
# Result: ERROR - must match exactly!
```

### ✅ Correct Redirect URI
```
# In APS app: http://34.65.160.116:3000/index.html
# In actual request: http://34.65.160.116:3000/index.html
# Result: SUCCESS!
```

### ❌ Missing Protocol
```
# Wrong: 34.65.160.116:3000/index.html
# Right: http://34.65.160.116:3000/index.html
```

### ❌ HTTPS vs HTTP Mismatch
```
# If APS app has: https://34.65.160.116:3000/index.html
# But you access: http://34.65.160.116:3000/
# Result: ERROR
```

## Verification Steps

### Check Current Redirect URI
Open browser console and look at the login URL:
```javascript
// In index.html, line ~933, you'll see:
console.log('Auth URL:', authUrl);
console.log('Redirect URI:', REDIRECT_URI);
```

### Expected Values
```
Redirect URI: http://34.65.160.116:3000/index.html
Auth URL: https://developer.api.autodesk.com/authentication/v2/authorize?
          response_type=code&
          client_id=YOUR_CLIENT_ID&
          redirect_uri=http%3A%2F%2F34.65.160.116%3A3000%2Findex.html&
          scope=...
```

### Debugging Script
Run this in browser console to check:
```javascript
console.log('CLIENT_ID:', CLIENT_ID || 'NOT SET');
console.log('CLIENT_SECRET:', CLIENT_SECRET ? 'SET (hidden)' : 'NOT SET');
console.log('REDIRECT_URI:', window.location.origin + '/index.html');
```

## If You Don't Have an APS Account

1. **Create free APS account:**
   - Visit: https://aps.autodesk.com/
   - Click "Get Started"
   - Sign up with email

2. **Create your first app** (follow Step 1 above)

3. **Free tier includes:**
   - API access for development
   - No credit card required
   - Suitable for testing this tool

## Quick Checklist

- [ ] APS app created at https://aps.autodesk.com/myapps
- [ ] Callback URL set to: `http://34.65.160.116:3000/index.html`
- [ ] Callback URL also includes: `http://localhost:3000/index.html` (for local testing)
- [ ] Client ID copied
- [ ] Client Secret copied
- [ ] Credentials entered in app via "Enter Client Credentials"
- [ ] Credentials saved (saw success message)
- [ ] Tested "Login with Autodesk" button

## Next Steps After Fixing

Once login works:
1. You'll be redirected to Autodesk login
2. Grant permissions to your app
3. Get redirected back to your app
4. See list of BIM 360/ACC hubs
5. Start managing users!

## Need Help?

If you're still stuck:
1. Share the exact CLIENT_ID (first 10 characters only)
2. Share the redirect_uri from browser console
3. Share a screenshot of your APS app Callback URLs
4. I'll help identify the mismatch
