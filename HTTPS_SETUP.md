# Add HTTPS to Your Google Cloud VM

## Current Situation

- ✅ Credentials **encrypted in Firestore** (secure storage)
- ❌ Connection uses **HTTP** (insecure transport)
- Browser shows "Not secure" warning

## Why You Need HTTPS

1. **Encrypt traffic** between browser and server
2. **Remove browser warnings**
3. **Required for production** use
4. **Protect sensitive data** in transit

## Option 1: Use a Domain Name (Recommended)

### Prerequisites
- A domain name (e.g., from Google Domains, Namecheap, GoDaddy)
- Cost: ~$12/year for domain

### Steps:

#### 1. Get a Domain Name
Register a domain like `acc-user-mgmt.com` or use an existing one.

#### 2. Point Domain to Your VM
Create an A record:
- **Host**: `@` (or subdomain like `app`)
- **Type**: A
- **Value**: `34.65.160.116`
- **TTL**: 300

#### 3. SSH into Your VM
```bash
gcloud compute ssh acc-user-management-v2-vm --zone=us-central1-a
```

#### 4. Install Nginx (Reverse Proxy)
```bash
sudo apt update
sudo apt install nginx -y
```

#### 5. Install Certbot (for SSL)
```bash
sudo apt install certbot python3-certbot-nginx -y
```

#### 6. Configure Nginx
```bash
sudo nano /etc/nginx/sites-available/acc-user-mgmt
```

Add this configuration (replace `yourdomain.com` with your actual domain):
```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

#### 7. Enable the Site
```bash
sudo ln -s /etc/nginx/sites-available/acc-user-mgmt /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

#### 8. Get SSL Certificate (Free from Let's Encrypt)
```bash
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

Follow the prompts:
- Enter your email
- Agree to terms
- Choose option 2: Redirect HTTP to HTTPS

#### 9. Test Auto-Renewal
```bash
sudo certbot renew --dry-run
```

#### 10. Update Firewall (if needed)
```bash
# Allow HTTPS traffic
gcloud compute firewall-rules create allow-https \
  --allow=tcp:443 \
  --target-tags=acc-tool \
  --description="Allow HTTPS traffic"

# Allow HTTP (will redirect to HTTPS)
gcloud compute firewall-rules create allow-http \
  --allow=tcp:80 \
  --target-tags=acc-tool \
  --description="Allow HTTP traffic (redirects to HTTPS)"
```

#### 11. Update APS App Callback URL
Go to https://aps.autodesk.com/myapps and add:
```
https://yourdomain.com/index.html
```

#### 12. Update server.js CORS
Edit server.js to include your domain in allowed origins:
```javascript
const allowedOrigins = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://34.65.160.116:3000',
    'https://34.65.160.116:3000',
    'https://yourdomain.com',
    'https://www.yourdomain.com'
];
```

### Result:
✅ Access your app at: `https://yourdomain.com`  
✅ Green padlock in browser  
✅ No security warnings  
✅ Auto-renewing SSL certificate (free forever)

---

## Option 2: Self-Signed Certificate (Quick Test Only)

⚠️ **Not recommended for production** - browsers will still show warnings

### Steps:

#### 1. SSH into VM
```bash
gcloud compute ssh acc-user-management-v2-vm --zone=us-central1-a
```

#### 2. Create Self-Signed Certificate
```bash
cd /home/acc-user-management
mkdir -p ssl
cd ssl

# Generate certificate (valid for 1 year)
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes \
  -subj "/C=US/ST=State/L=City/O=Organization/CN=34.65.160.116"
```

#### 3. Update server.js to Use HTTPS
```javascript
const https = require('https');
const fs = require('fs');

// SSL Certificate
const httpsOptions = {
    key: fs.readFileSync(path.join(__dirname, 'ssl', 'key.pem')),
    cert: fs.readFileSync(path.join(__dirname, 'ssl', 'cert.pem'))
};

// Create HTTPS server
const server = https.createServer(httpsOptions, app);
server.listen(port, () => {
    console.log(`HTTPS Server running on port ${port}`);
});
```

#### 4. Update Firewall
```bash
gcloud compute firewall-rules create allow-https \
  --allow=tcp:443 \
  --target-tags=acc-tool
```

#### 5. Restart App
```bash
pm2 restart all
```

#### 6. Access via HTTPS
```
https://34.65.160.116:3000/
```

⚠️ Browser will show "Your connection is not private" - click "Advanced" → "Proceed"

---

## Option 3: Cloudflare Tunnel (Free HTTPS)

Use Cloudflare's free SSL without a custom domain.

### Steps:

1. **Sign up for Cloudflare** (free): https://cloudflare.com

2. **Install cloudflared on VM:**
```bash
wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared-linux-amd64.deb
```

3. **Create tunnel:**
```bash
cloudflared tunnel login
cloudflared tunnel create acc-user-mgmt
cloudflared tunnel route dns acc-user-mgmt your-subdomain.yourdomain.workers.dev
```

4. **Configure tunnel:**
Create `~/.cloudflared/config.yml`:
```yaml
tunnel: YOUR_TUNNEL_ID
credentials-file: /home/your-user/.cloudflared/YOUR_TUNNEL_ID.json

ingress:
  - hostname: your-subdomain.yourdomain.workers.dev
    service: http://localhost:3000
  - service: http_status:404
```

5. **Run tunnel:**
```bash
cloudflared tunnel run acc-user-mgmt
```

---

## Recommendation

**For Production → Use Option 1 (Domain + Let's Encrypt)**

Benefits:
- ✅ Free SSL certificate
- ✅ Auto-renewal
- ✅ No browser warnings
- ✅ Professional appearance
- ✅ Required by many corporate security policies

Cost: ~$12/year for domain name

**For Testing → Keep HTTP for now**

Your credentials are already encrypted in Firestore, so storage is secure. The HTTP connection is a concern for production but acceptable for testing.

---

## Quick Comparison

| Method | Cost | Complexity | Browser Warning | Best For |
|--------|------|------------|-----------------|----------|
| Domain + Let's Encrypt | $12/year | Medium | None ✅ | Production |
| Self-Signed | Free | Easy | Yes ⚠️ | Testing only |
| Cloudflare Tunnel | Free | Medium | None ✅ | Free alternative |
| Keep HTTP | Free | None | Yes ⚠️ | Development |

---

## Your Current Security Status

✅ **Credentials in Firestore**: Encrypted with ENCRYPTION_KEY  
✅ **Firebase Auth**: Using secure authentication  
✅ **Password hashing**: Firebase handles this  
❌ **Transport encryption**: Need HTTPS for production  

You're 80% of the way there! Adding HTTPS is the final step for production-ready security.
