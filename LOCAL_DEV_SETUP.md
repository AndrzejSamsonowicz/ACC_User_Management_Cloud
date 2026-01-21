# Local Development Setup

## Prerequisites

1. **Firebase Service Account Credentials**
   - Go to [Firebase Console](https://console.firebase.google.com)
   - Select project: `accusermanagement`
   - Navigate to: Project Settings → Service Accounts
   - Click "Generate New Private Key"
   - Save as `service-account.json` in project root

2. **Environment Variables**
   - `.env` file already created with ENCRYPTION_KEY
   - This file is gitignored and won't be committed

## Running Locally

```bash
# Install dependencies (if not already done)
npm install

# Start server
node server.js
```

Server will run on: **http://localhost:3000**

Access the app at: **http://localhost:3000/index.html**

## Local vs Production Files

### Local Only (gitignored):
- `service-account.json` - Your Firebase credentials
- `.env` - Local encryption key

### Production (on VM):
- Uses `.env.production` for encryption key
- Uses same `service-account.json` (must be uploaded separately)

## Deployment to Google VM

Once you've tested locally and are ready to deploy:

```bash
# Option 1: Use the deployment script
.\deploy-to-vm.ps1

# Option 2: Manual deployment
# 1. The script will copy all files except gitignored ones
# 2. You'll need to manually upload service-account.json to VM (one time)
# 3. The VM will use .env.production for environment variables
```

## Important Notes

- **Never commit** `service-account.json` or `.env` to git
- Local and production use the same Firebase project
- Test all features locally before deploying to VM
- The server automatically forces HTTPS in production (non-localhost)

## Troubleshooting

### "service-account.json not found"
Download fresh credentials from Firebase Console (see Prerequisites above)

### "ENCRYPTION_KEY not set"
The `.env` file should already exist. If not, generate one:
```bash
node -e "console.log('ENCRYPTION_KEY=' + require('crypto').randomBytes(32).toString('hex'))" > .env
```

### Port 3000 already in use
Kill the existing process or use a different port by changing `port` variable in server.js
