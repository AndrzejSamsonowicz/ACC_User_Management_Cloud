# Complete Deployment Guide - ACC User Management with Authentication

## Overview

This guide covers the complete deployment of ACC User Management Tool v2.0 with:
- ✅ Firebase Authentication & Firestore Database
- ✅ PayPal Payment Integration
- ✅ AES-256-GCM Encrypted Credential Storage
- ✅ Email Verification & Password Recovery
- ✅ Annual License Management
- ✅ Rate Limiting & Security
- ✅ Google Cloud VM Hosting

---

## Prerequisites

- Google Cloud account (with billing enabled)
- PayPal Business account
- Domain name (optional but recommended)
- Basic command line knowledge

---

## Phase 1: Local Setup & Testing (30 minutes)

### 1.1 Install Dependencies

```bash
cd c:\MCPServer\ACC_User_Management
npm install
```

This installs:
- `express` - Web server
- `firebase-admin` - Server-side Firebase SDK
- `dotenv` - Environment variables
- `axios` - HTTP client for PayPal API

### 1.2 Set Up Firebase

Follow the detailed guide: `FIREBASE_SETUP.md`

**Quick checklist:**
- [x] Create Firebase project
- [x] Enable Authentication (Email/Password)
- [x] Create Firestore database
- [x] Set security rules
- [x] Register web app
- [x] Download service account JSON
- [x] Update `firebase-config.js`

### 1.3 Set Up PayPal

Follow the detailed guide: `PAYPAL_SETUP.md`

**Quick checklist:**
- [x] Create PayPal Developer account
- [x] Create Sandbox app
- [x] Get Client ID and Secret
- [x] Update `purchase.html` with Client ID
- [x] Test in sandbox mode

### 1.4 Configure Environment

1. Copy `.env.example` to `.env`:
   ```bash
   copy .env.example .env
   ```

2. Edit `.env` and fill in all values:
   ```env
   PORT=3000
   NODE_ENV=production
   
   # Firebase (from service account JSON)
   FIREBASE_PROJECT_ID=your-project-id
   FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
   FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com
   
   # Encryption (generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
   ENCRYPTION_KEY=abcdef0123456789...  # 64 hex characters
   
   # PayPal
   PAYPAL_CLIENT_ID=your_sandbox_client_id
   PAYPAL_CLIENT_SECRET=your_sandbox_client_secret
   PAYPAL_MODE=sandbox
   
   # Pricing
   ANNUAL_LICENSE_PRICE=299.00
   ANNUAL_LICENSE_CURRENCY=USD
   
   # Admin
   ADMIN_EMAIL=your@email.com
   
   # Rate Limiting
   RATE_LIMIT_WINDOW_MS=900000
   RATE_LIMIT_MAX_REQUESTS=100
   ```

3. Generate encryption key:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

### 1.5 Test Locally

1. Start the server:
   ```bash
   npm start
   ```

2. Open browser: `http://localhost:3000/purchase.html`

3. Test complete flow:
   - Purchase license (use PayPal sandbox)
   - Register with license key
   - Verify email
   - Login
   - Save Autodesk credentials
   - Use the tool

---

## Phase 2: Google Cloud Deployment (45 minutes)

### 2.1 Prepare for Deployment

1. Create `.gitignore` (if not exists):
   ```
   .env
   node_modules/
   *.log
   *_folder_permissions.json
   user_permissions_import.json
   ```

2. Commit your code to Git (recommended):
   ```bash
   git add .
   git commit -m "Add authentication and licensing system"
   git push
   ```

### 2.2 Create Google Cloud VM

```bash
# Set project
gcloud config set project your-project-id

# Create VM with adequate resources
gcloud compute instances create acc-user-mgmt-vm \
  --zone=us-central1-a \
  --machine-type=e2-small \
  --tags=acc-tool,http-server,https-server \
  --image-family=ubuntu-2204-lts \
  --image-project=ubuntu-os-cloud \
  --boot-disk-size=20GB \
  --boot-disk-type=pd-standard
```

**Note:** e2-small ($13/month) recommended over e2-micro for 100 users

### 2.3 Configure Firewall

```bash
# Allow HTTP (port 3000)
gcloud compute firewall-rules create allow-acc-tool-http \
  --allow=tcp:3000 \
  --description="Allow ACC Tool HTTP" \
  --direction=INGRESS \
  --target-tags=acc-tool

# Allow HTTPS (port 443) - for future SSL
gcloud compute firewall-rules create allow-https \
  --allow=tcp:443 \
  --description="Allow HTTPS" \
  --direction=INGRESS \
  --target-tags=https-server
```

### 2.4 Get External IP

```bash
gcloud compute instances describe acc-user-mgmt-vm \
  --zone=us-central1-a \
  --format="get(networkInterfaces[0].accessConfigs[0].natIP)"
```

**Save this IP address!** Example: `34.123.45.67`

### 2.5 SSH into VM

```bash
gcloud compute ssh acc-user-mgmt-vm --zone=us-central1-a
```

### 2.6 Install Node.js on VM

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify installation
node --version  # Should show v18.x.x
npm --version   # Should show 9.x.x

# Install PM2 globally
sudo npm install -g pm2

# Install Git
sudo apt install -y git
```

### 2.7 Deploy Application

#### Option A: Using Git (Recommended)

```bash
# Clone repository
git clone https://github.com/YourUsername/ACC_User_Management.git
cd ACC_User_Management
```

#### Option B: Upload Files Directly

From your **local machine** (not VM):

```bash
gcloud compute scp --recurse c:\MCPServer\ACC_User_Management\* acc-user-mgmt-vm:~/ACC_User_Management --zone=us-central1-a
```

Then on VM:
```bash
cd ACC_User_Management
```

### 2.8 Configure Environment on VM

```bash
# Create .env file
nano .env
```

Paste your environment variables (same as local `.env`), then save (Ctrl+X, Y, Enter)

**IMPORTANT:** Update `PAYPAL_MODE` to `live` when ready for production!

### 2.9 Install Dependencies

```bash
npm install --production
```

### 2.10 Start with PM2

```bash
# Start application
pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save

# Set PM2 to start on boot
pm2 startup
# Copy and run the command it outputs
```

### 2.11 Verify Deployment

1. Open browser: `http://YOUR_VM_IP:3000/login.html`
2. You should see the login page
3. Test the complete flow

---

## Phase 3: Domain & SSL Setup (Optional but Recommended)

### 3.1 Point Domain to VM

In your domain registrar (GoDaddy, Namecheap, etc.):

1. Create **A Record**:
   - Host: `@` (or `acc` for subdomain)
   - Points to: `YOUR_VM_IP`
   - TTL: 600

2. Wait for DNS propagation (5-60 minutes)

3. Test: `ping yourdom ain.com`

### 3.2 Install SSL Certificate (Let's Encrypt)

On VM:

```bash
# Install Nginx
sudo apt install -y nginx

# Install Certbot
sudo apt install -y certbot python3-certbot-nginx

# Get SSL certificate
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# Update Nginx config
sudo nano /etc/nginx/sites-available/default
```

Add this configuration:

```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl;
    server_name yourdomain.com www.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Restart Nginx:

```bash
sudo nginx -t  # Test configuration
sudo systemctl restart nginx
```

Now access via: `https://yourdomain.com/login.html`

---

## Phase 4: Create First Admin Account

### 4.1 Manual Method (Firestore Console)

1. Register a regular account via the website
2. Go to Firebase Console → Firestore
3. Create document in `admins` collection:
   - Document ID: `[your user ID from Authentication]`
   - Fields:
     - `email`: your@email.com
     - `role`: super_admin
     - `createdAt`: (timestamp) [current time]

### 4.2 Automated Method (TODO)

Create an admin creation script or endpoint (add to server.js if needed).

---

## Phase 5: Switch to Production Mode

### 5.1 Update PayPal to Live

1. Get Live PayPal credentials (see `PAYPAL_SETUP.md`)

2. Update `.env` on VM:
   ```env
   PAYPAL_CLIENT_ID=your_live_client_id
   PAYPAL_CLIENT_SECRET=your_live_client_secret
   PAYPAL_MODE=live
   ```

3. Update `purchase.html` with Live Client ID

4. Restart server:
   ```bash
   pm2 restart acc-user-management
   ```

### 5.2 Update Firebase Security Rules

In Firebase Console → Firestore → Rules, ensure production rules are active (already covered in setup).

### 5.3 Enable Production Monitoring

```bash
# On VM, monitor logs
pm2 logs acc-user-management

# Monitor with dashboard
pm2 monit

# Set up log rotation
pm2 install pm2-logrotate
```

---

## Phase 6: Marketing & Sales Setup

### 6.1 Create Landing Page

Create `index.html` as landing page (currently it's the tool):

- Rename current `index.html` to `app.html`
- Create new `index.html` as marketing page
- Update redirects in `login.html` to go to `app.html`

### 6.2 Create Legal Pages

1. **Terms of Service** (`terms.html`)
2. **Privacy Policy** (`privacy.html`)
3. **Refund Policy** (`refund.html`)

### 6.3 Set Up Email Marketing

- Collect emails from purchases
- Send onboarding emails
- Renewal reminders (30 days before expiry)

---

## Monitoring & Maintenance

### Daily Checks

```bash
# Check server status
pm2 status

# Check recent errors
pm2 logs --err --lines 50

# Check disk space
df -h
```

### Weekly Checks

1. Review Firebase Analytics
2. Check PayPal transactions
3. Monitor license expirations
4. Review error logs

### Monthly Checks

1. Update dependencies: `npm update`
2. Review security: `npm audit`
3. Backup Firestore data
4. Review costs (Firebase, Google Cloud, PayPal fees)

### Backup Strategy

**Firestore:**
- Automatic daily backups (set up in Firebase Console)
- Export to Cloud Storage weekly

**Server:**
```bash
# Create backup
tar -czf backup-$(date +%Y%m%d).tar.gz ~/ACC_User_Management

# Download to local machine
gcloud compute scp acc-user-mgmt-vm:~/backup-*.tar.gz . --zone=us-central1-a
```

---

## Cost Breakdown (100 Customers)

### Monthly Costs

| Service | Cost | Notes |
|---------|------|-------|
| Google Cloud VM (e2-small) | $13 | 0.5 GB RAM, 2 vCPU |
| Firebase (Free Tier) | $0 | Under limits for 100 users |
| PayPal Fees (per transaction) | 2.9% + $0.30 | ~$897/year for 100 sales |
| Domain Name | ~$12/year | Optional |
| SSL Certificate | $0 | Let's Encrypt (free) |

**Total Monthly:** ~$13-15
**Annual Revenue (100 customers):** $29,900
**Annual Costs:** ~$156 + $897 PayPal = ~$1,053
**Net Profit:** ~$28,847

---

## Troubleshooting

### Server Not Starting

```bash
# Check logs
pm2 logs

# Check environment
pm2 env 0

# Restart
pm2 restart acc-user-management
```

### Firebase Connection Issues

- Verify `.env` has correct Firebase credentials
- Check that private key has `\n` line breaks
- Ensure Firebase Admin SDK initialized

### PayPal Payment Failing

- Check `PAYPAL_MODE` setting
- Verify Client ID/Secret match mode (sandbox vs live)
- Check PayPal Developer Dashboard for errors

### Users Can't Login

- Verify email verification is working
- Check Firestore security rules
- Ensure license hasn't expired

---

## Security Checklist

Before going live:

- [ ] `.env` not committed to Git
- [ ] Strong encryption key generated
- [ ] HTTPS enabled (SSL certificate)
- [ ] Firebase security rules enabled
- [ ] Rate limiting active
- [ ] Regular backups configured
- [ ] Error logging (no sensitive data in logs)
- [ ] Admin accounts secured
- [ ] PayPal webhooks verified
- [ ] Email verification required

---

## Support & Maintenance

### Update Application

```bash
# On local machine
git pull origin main
git add .
git commit -m "Update description"
git push

# On VM
cd ACC_User_Management
git pull
npm install
pm2 restart acc-user-management
```

### Scale for Growth

**200-500 users:**
- Upgrade to e2-medium VM ($26/month)
- Consider CDN for static files

**500+ users:**
- Multiple VMs with load balancer
- Separate database server
- Redis for session management

---

## Next Steps

1. ✅ Complete local testing
2. ✅ Deploy to Google Cloud
3. ✅ Test with real PayPal account (small transaction)
4. ✅ Create admin account
5. ✅ Switch to production mode
6. ✅ Market to first customers
7. ✅ Monitor and iterate

---

## Getting Help

- **Firebase**: https://firebase.google.com/support
- **PayPal**: https://developer.paypal.com/support
- **Google Cloud**: https://cloud.google.com/support
- **Node.js**: https://nodejs.org/en/docs

---

**Congratulations!** 🎉

You now have a fully functional, secure, multi-tenant ACC User Management tool with:
- Authentication & user management
- Payment processing & licensing
- Encrypted credential storage
- Scalable cloud infrastructure

Ready to serve your first 100 customers!
