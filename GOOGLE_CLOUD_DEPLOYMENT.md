# Google Cloud Deployment Guide - ACC User Management Tool

## Prerequisites
- Google Cloud account with billing enabled
- Google Cloud SDK installed locally (gcloud CLI)
- This project ready for deployment

## Cost Estimate
- **e2-micro instance**: FREE (Always Free tier: 1 instance per month)
- **Network egress**: First 1 GB/month free, then $0.12/GB
- **Storage**: $0.04/GB per month
- **Estimated monthly cost**: $0-$5 depending on usage

## Step-by-Step Deployment

### 1. Install Google Cloud SDK (if not already installed)
```bash
# Windows (PowerShell)
(New-Object Net.WebClient).DownloadFile("https://dl.google.com/dl/cloudsdk/channels/rapid/GoogleCloudSDKInstaller.exe", "$env:Temp\GoogleCloudSDKInstaller.exe")
& $env:Temp\GoogleCloudSDKInstaller.exe
```

### 2. Initialize and Login
```bash
gcloud init
gcloud auth login
```

### 3. Create a New Project (or use existing)
```bash
# Create new project
gcloud projects create acc-user-mgmt --name="ACC User Management"

# Set as active project
gcloud config set project acc-user-mgmt
```

### 4. Enable Required APIs
```bash
gcloud services enable compute.googleapis.com
```

### 5. Create Firewall Rule (Allow HTTP traffic on port 3000)
```bash
gcloud compute firewall-rules create allow-acc-tool \
  --allow=tcp:3000 \
  --description="Allow access to ACC User Management Tool" \
  --direction=INGRESS \
  --target-tags=acc-tool
```

### 6. Create the VM Instance (e2-micro - Free Tier)
```bash
gcloud compute instances create acc-user-management-vm \
  --zone=us-central1-a \
  --machine-type=e2-micro \
  --tags=acc-tool \
  --image-family=ubuntu-2204-lts \
  --image-project=ubuntu-os-cloud \
  --boot-disk-size=10GB \
  --boot-disk-type=pd-standard
```

### 7. Get the External IP Address
```bash
gcloud compute instances describe acc-user-management-vm \
  --zone=us-central1-a \
  --format="get(networkInterfaces[0].accessConfigs[0].natIP)"
```
**Save this IP address - this will be your access URL!**

### 8. SSH into the VM
```bash
gcloud compute ssh acc-user-management-vm --zone=us-central1-a
```

### 9. Once Connected to VM, Set Up the Application

```bash
# Create app directory
sudo mkdir -p /home/acc-user-management
sudo chown $USER:$USER /home/acc-user-management
cd /home/acc-user-management

# Clone or upload your files (Option A: Using Git)
git clone https://github.com/AndrzejSamsonowicz/ACC_User_Management.git .

# OR Option B: Upload files manually using gcloud
# Exit SSH first (type 'exit'), then from your local machine:
# gcloud compute scp --recurse c:\MCPServer\ACC_User_Management\* acc-user-management-vm:/home/acc-user-management --zone=us-central1-a
```

### 10. Install Dependencies and Start the App (Still in SSH)
```bash
# Install Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2
sudo npm install -g pm2

# Install app dependencies
npm install

# Create logs directory
mkdir -p logs

# Start the application
pm2 start ecosystem.config.js

# Save PM2 process list
pm2 save

# Setup PM2 to start on boot
pm2 startup
# Copy and run the command that PM2 outputs

# Check status
pm2 status
pm2 logs
```

### 11. Access Your Application
Open your browser and navigate to:
```
http://YOUR_EXTERNAL_IP:3000
```

Replace `YOUR_EXTERNAL_IP` with the IP address from Step 7.

## Useful Commands

### Check Application Status
```bash
gcloud compute ssh acc-user-management-vm --zone=us-central1-a
pm2 status
pm2 logs
```

### Restart Application
```bash
gcloud compute ssh acc-user-management-vm --zone=us-central1-a
pm2 restart acc-user-management
```

### Stop the VM (to save costs when not in use)
```bash
gcloud compute instances stop acc-user-management-vm --zone=us-central1-a
```

### Start the VM
```bash
gcloud compute instances start acc-user-management-vm --zone=us-central1-a
```

### Update Application Code
```bash
# SSH into VM
gcloud compute ssh acc-user-management-vm --zone=us-central1-a

# Navigate to app directory
cd /home/acc-user-management

# Pull latest changes (if using Git)
git pull

# Restart the app
pm2 restart acc-user-management
```

### Delete Everything (if needed)
```bash
# Delete VM
gcloud compute instances delete acc-user-management-vm --zone=us-central1-a

# Delete firewall rule
gcloud compute firewall-rules delete allow-acc-tool

# Delete project (optional)
gcloud projects delete acc-user-mgmt
```

## Security Recommendations

1. **Add HTTPS**: Use a domain name and Let's Encrypt for SSL
2. **Restrict Firewall**: Limit access to specific IP addresses
3. **Add Authentication**: Implement login to protect the tool
4. **Use Environment Variables**: Store sensitive data in .env file

## Optional: Set Up a Domain Name

1. Register a domain (Google Domains, Namecheap, etc.)
2. Create an A record pointing to your VM's external IP
3. Install Nginx as reverse proxy
4. Set up Let's Encrypt SSL certificate

## Monitoring

### View Application Logs (PM2)
```bash
pm2 logs acc-user-management
```

### Monitor Resource Usage
```bash
pm2 monit
```

### View Access Logs in Google Cloud Console

1. **Open Google Cloud Logs Explorer:**
   - Visit: https://console.cloud.google.com/logs/query?project=acc-user-mgmt
   - Or from GCP Console: Navigation Menu → Logging → Logs Explorer

2. **Filter for HTTP Access Logs:**
   
   In the **Query** box, paste this filter:
   ```
   resource.type="gce_instance"
   resource.labels.instance_id="acc-user-management-vm"
   jsonPayload.type="http_request"
   ```

3. **Click "Run Query"** to see all HTTP requests with:
   - Timestamp
   - IP Address (visitor location)
   - HTTP Method (GET, POST, etc.)
   - URL requested
   - User Agent (browser/device info)

4. **Useful Filters:**

   View only specific pages:
   ```
   jsonPayload.type="http_request"
   jsonPayload.url="/"
   ```

   View requests from specific IP:
   ```
   jsonPayload.type="http_request"
   jsonPayload.ip="1.2.3.4"
   ```

   View last 24 hours:
   ```
   jsonPayload.type="http_request"
   timestamp>="2025-11-23T00:00:00Z"
   ```

5. **Time Range:** Use the time picker at the top to select:
   - Last 1 hour
   - Last 24 hours
   - Last 7 days
   - Custom range

### View Access Logs from Command Line

Run the PowerShell script:
```powershell
.\check-access-logs.ps1
```

Or query manually:
```powershell
# Get last 100 HTTP requests
gcloud logging read 'resource.type="gce_instance" jsonPayload.type="http_request"' `
  --limit=100 `
  --format=json `
  --project=acc-user-mgmt

# Count unique visitors (last 7 days)
gcloud logging read 'jsonPayload.type="http_request"' `
  --limit=1000 `
  --format="value(jsonPayload.ip)" `
  --freshness=7d `
  --project=acc-user-mgmt | Sort-Object -Unique

# Export to CSV for analysis
gcloud logging read 'jsonPayload.type="http_request"' `
  --limit=1000 `
  --format=json `
  --project=acc-user-mgmt | ConvertFrom-Json | `
  Select-Object @{N='Time';E={$_.timestamp}}, @{N='IP';E={$_.jsonPayload.ip}}, @{N='URL';E={$_.jsonPayload.url}} | `
  Export-Csv -Path access-logs.csv -NoTypeInformation
```

### Find IP Geolocation

To see which countries visitors are from:
1. Get unique IPs from logs
2. Use online tools:
   - https://www.iplocation.net/
   - https://ipinfo.io/
3. Or enable GeoIP in BigQuery (advanced setup)

## Troubleshooting

**Application won't start:**
```bash
pm2 logs acc-user-management
npm install
pm2 restart all
```

**Can't access from browser:**
- Check firewall rule exists
- Verify VM is running
- Ensure port 3000 is in the firewall rule
- Check if PM2 process is running: `pm2 status`

**Out of memory:**
- Upgrade to e2-small ($13/month)
- Or optimize the application

## Support
For issues, check the logs and ensure all steps were followed correctly.
