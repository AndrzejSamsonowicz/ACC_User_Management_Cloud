# Infomaniak Domain Setup with Google VM

## Overview

This guide explains how to configure your Infomaniak subdomain `usermgt.digibuild.ch` to point to your Google Cloud VM (34.65.160.116) and enable HTTPS.

**Current Setup:**
- App running on: Google VM at http://34.65.160.116:3000
- Domain: usermgt.digibuild.ch (managed by Infomaniak)
- Goal: Access app via https://usermgt.digibuild.ch

## Architecture

```
Internet → Infomaniak DNS → Google VM (34.65.160.116)
                              ↓
                            Nginx (reverse proxy, port 80/443)
                              ↓
                            Your Node.js app (port 3000)
```

---

## Part 1: Configure DNS in Infomaniak

### Step 1: Access DNS Management

1. Go to https://manager.infomaniak.com/
2. Navigate to **Domains** section
3. Select your domain **digibuild.ch**
4. Click on **DNS Zone** or **DNS Management**

### Step 2: Add A Record

Add an A record for the subdomain:

| Type | Name    | Value          | TTL  |
|------|---------|----------------|------|
| A    | usermgt | 34.65.160.116  | 3600 |

**Steps:**
1. Click "Add Record" or "New Entry"
2. Select Type: **A**
3. Name/Host: **usermgt**
4. IPv4 Address: **34.65.160.116**
5. TTL: **3600** (1 hour) or use default
6. Save the record

### Step 3: Verify DNS Propagation

Wait 5-30 minutes for DNS to propagate, then verify:

**On Windows (PowerShell):**
```powershell
nslookup usermgt.digibuild.ch
```

**Expected result:**
```
Name:    usermgt.digibuild.ch
Address: 34.45.169.78
```

If it doesn't resolve immediately, wait a bit longer (DNS can take up to 24 hours but usually much faster).

---

## Part 2: Configure Google VM for HTTPS

You need to set up a reverse proxy (Nginx) on your Google VM to handle HTTPS and forward traffic to your Node.js app.

### Step 1: SSH into Your Google VM

```bash
# From Google Cloud Console or using gcloud CLI
gcloud compute ssh your-vm-name --zone=your-zone

# Or use SSH directly if you have the key
ssh your-username@34.45.169.78
```

### Step 2: Install Nginx

```bash
# Update package list
sudo apt update

# Install Nginx
sudo apt install -y nginx

# Check Nginx status
sudo systemctl status nginx
```

### Step 3: Configure Firewall

Open ports 80 (HTTP) and 443 (HTTPS):

**In Google Cloud Console:**
1. Go to **VPC Network** → **Firewall**
2. Click **Create Firewall Rule**
3. Create two rules:

**Rule 1: Allow HTTP**
- Name: `allow-http`
- Targets: All instances or specific tags
- Source IP ranges: `0.0.0.0/0`
- Protocols and ports: `tcp:80`

**Rule 2: Allow HTTPS**
- Name: `allow-https`
- Targets: All instances or specific tags
- Source IP ranges: `0.0.0.0/0`
- Protocols and ports: `tcp:443`

**Or via gcloud command:**
```bash
gcloud compute firewall-rules create allow-http --allow tcp:80 --source-ranges 0.0.0.0/0
gcloud compute firewall-rules create allow-https --allow tcp:443 --source-ranges 0.0.0.0/0
```

### Step 4: Configure Nginx as Reverse Proxy

Create Nginx configuration for your app:

```bash
# Remove default configuration
sudo rm /etc/nginx/sites-enabled/default

# Create new configuration
sudo nano /etc/nginx/sites-available/acc-user-management
```

**Paste this configuration:**

```nginx
server {
    listen 80;
    server_name usermgt.digibuild.ch;

    # Redirect all HTTP to HTTPS (after SSL is configured)
    # Commented out for now - will be added after SSL setup
    # return 301 https://$server_name$request_uri;

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

**Enable the configuration:**

```bash
# Create symbolic link to enable site
sudo ln -s /etc/nginx/sites-available/acc-user-management /etc/nginx/sites-enabled/

# Test Nginx configuration
sudo nginx -t

# If test passes, restart Nginx
sudo systemctl restart nginx
```

### Step 5: Test HTTP Access

At this point, you should be able to access your app via:
- http://usermgt.digibuild.ch (once DNS propagates)
- http://34.45.169.78 (still works directly)

Test in browser or via curl:
```bash
curl http://usermgt.digibuild.ch
```

---

## Part 3: Enable HTTPS with Let's Encrypt

### Step 1: Install Certbot

```bash
# Install Certbot and Nginx plugin
sudo apt install -y certbot python3-certbot-nginx
```

### Step 2: Obtain SSL Certificate

**Important:** Make sure DNS is fully propagated before this step!

```bash
# Request certificate for your domain
sudo certbot --nginx -d usermgt.digibuild.ch
```

**During the process:**
1. Enter your email address (for renewal notifications)
2. Agree to Terms of Service
3. Choose whether to share email with EFF (optional)
4. Certbot will automatically configure Nginx for HTTPS

**Certbot will:**
- Obtain SSL certificate from Let's Encrypt
- Automatically update your Nginx configuration
- Set up HTTP to HTTPS redirect
- Configure SSL settings

### Step 3: Verify HTTPS

Visit: **https://usermgt.digibuild.ch**

You should see:
- 🔒 Secure connection in browser
- Your ACC User Management application
- Valid SSL certificate

### Step 4: Auto-Renewal

Certbot automatically sets up certificate renewal. Verify it's configured:

```bash
# Check renewal timer
sudo systemctl status certbot.timer

# Test renewal (dry run)
sudo certbot renew --dry-run
```

Certificates will auto-renew before expiry (Let's Encrypt certs are valid for 90 days).

---

## Part 4: Update Application Configuration

### Update CORS Settings (if needed)

If you have specific CORS origins, update [server.js](c:\MCPServer\ACC_User_Management\server.js):

```javascript
// Update this line if you had specific origins
res.header('Access-Control-Allow-Origin', '*'); // Or specific domain
```

### Verify .env File on VM

Make sure your Google VM has the `.env` file with credentials:

```bash
# SSH into VM
ssh your-username@34.45.169.78

# Navigate to app directory
cd /path/to/ACC_User_Management

# Check if .env exists
ls -la .env

# Edit if needed
nano .env
```

**.env should contain:**
```env
APS_CLIENT_ID=your_client_id
APS_CLIENT_SECRET=your_client_secret
NODE_ENV=production
```

---

## Final Nginx Configuration (After SSL)

After Certbot runs, your Nginx config will look like this:

```nginx
server {
    listen 80;
    server_name usermgt.digibuild.ch;
    
    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name usermgt.digibuild.ch;

    # SSL certificate files (managed by Certbot)
    ssl_certificate /etc/letsencrypt/live/usermgt.digibuild.ch/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/usermgt.digibuild.ch/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

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

---

## Verification Checklist

- [ ] DNS A record created in Infomaniak (usermgt → 34.45.169.78)
- [ ] DNS propagated (verified with nslookup)
- [ ] Nginx installed on Google VM
- [ ] Firewall rules allow ports 80 and 443
- [ ] Nginx reverse proxy configured
- [ ] HTTP access works (http://usermgt.digibuild.ch)
- [ ] Certbot installed
- [ ] SSL certificate obtained
- [ ] HTTPS access works (https://usermgt.digibuild.ch)
- [ ] Auto-renewal configured
- [ ] Application functions correctly over HTTPS

---

## Troubleshooting

### DNS Not Resolving

**Problem:** `nslookup usermgt.digibuild.ch` doesn't return 34.45.169.78

**Solutions:**
1. Wait longer (DNS can take up to 24 hours)
2. Check Infomaniak DNS settings - ensure A record is correct
3. Clear DNS cache: `ipconfig /flushdns` (Windows)
4. Try different DNS server: `nslookup usermgt.digibuild.ch 8.8.8.8`

### Connection Refused

**Problem:** Can't connect to usermgt.digibuild.ch

**Solutions:**
1. Check Nginx is running: `sudo systemctl status nginx`
2. Check firewall rules in Google Cloud Console
3. Verify Nginx config: `sudo nginx -t`
4. Check Nginx error logs: `sudo tail -f /var/log/nginx/error.log`

### Certbot Fails

**Problem:** Certbot can't obtain certificate

**Solutions:**
1. Ensure DNS is fully propagated first
2. Check ports 80 and 443 are open
3. Verify Nginx is running and accessible via HTTP
4. Check Certbot logs: `sudo tail -f /var/log/letsencrypt/letsencrypt.log`

### App Not Loading

**Problem:** Nginx works but app doesn't load

**Solutions:**
1. Check Node.js app is running: `pm2 status` or `ps aux | grep node`
2. Verify app is listening on port 3000: `netstat -tlnp | grep 3000`
3. Check app logs: `pm2 logs` or application logs
4. Test app directly: `curl http://localhost:3000`

### Mixed Content Warnings

**Problem:** HTTPS page loads but with warnings

**Solutions:**
1. Ensure all resources use HTTPS URLs
2. Check browser console for specific warnings
3. Update any hardcoded HTTP URLs in your code

---

## Maintenance

### Update SSL Certificate Manually

If auto-renewal fails:
```bash
sudo certbot renew
sudo systemctl reload nginx
```

### Monitor Nginx Logs

```bash
# Access logs
sudo tail -f /var/log/nginx/access.log

# Error logs
sudo tail -f /var/log/nginx/error.log
```

### Update Nginx Configuration

After any config changes:
```bash
# Test configuration
sudo nginx -t

# Reload Nginx (graceful, no downtime)
sudo systemctl reload nginx

# Or restart Nginx
sudo systemctl restart nginx
```

---

## Security Enhancements (Optional)

### 1. Rate Limiting

Add to Nginx config:
```nginx
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;

server {
    location / {
        limit_req zone=api_limit burst=20;
        # ... existing proxy_pass config
    }
}
```

### 2. Security Headers

Add to server block:
```nginx
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Referrer-Policy "no-referrer-when-downgrade" always;
```

### 3. IP Whitelisting (if needed)

Restrict access to specific IPs:
```nginx
location / {
    allow 1.2.3.4;    # Your office IP
    allow 5.6.7.8;    # Another allowed IP
    deny all;
    # ... existing proxy_pass config
}
```

---

## Quick Reference

| Item | Value |
|------|-------|
| **Domain** | usermgt.digibuild.ch |
| **Google VM IP** | 34.45.169.78 |
| **App Port** | 3000 (internal) |
| **HTTP Port** | 80 (external) |
| **HTTPS Port** | 443 (external) |
| **Nginx Config** | /etc/nginx/sites-available/acc-user-management |
| **SSL Cert Location** | /etc/letsencrypt/live/usermgt.digibuild.ch/ |
| **DNS Provider** | Infomaniak |
| **Hosting** | Google Cloud VM |

---

## Summary

1. **Infomaniak**: Configure DNS A record pointing usermgt.digibuild.ch to 34.45.169.78
2. **Google VM**: Install Nginx, configure reverse proxy, open firewall ports
3. **SSL**: Use Certbot to obtain free Let's Encrypt certificate
4. **Result**: Access your app securely at https://usermgt.digibuild.ch

This setup keeps your app on Google VM while using your Infomaniak domain with HTTPS!
