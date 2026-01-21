# PowerShell Script to Deploy to Google Cloud VM
# Run this from your local machine (Windows)

$ErrorActionPreference = "Stop"

# Configuration
$VM_NAME = "acc-user-management-v2-vm"
$ZONE = "europe-west6-b"
$PROJECT_ID = "acc-user-mgmt"
$VM_IP = "34.65.160.116"
$LOCAL_PATH = "c:\MCPServer\ACC_User_Management"
$VM_PATH = "/home/samsona/ACC_User_Management_Cloud"

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "ACC User Management - Deployment Script" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Check if gcloud is installed
Write-Host "Step 1: Checking gcloud installation..." -ForegroundColor Green
$gcloudCheck = Get-Command gcloud -ErrorAction SilentlyContinue
if ($gcloudCheck) {
    Write-Host "[OK] gcloud is installed" -ForegroundColor Green
} else {
    Write-Host "[ERROR] gcloud is not installed!" -ForegroundColor Red
    Write-Host "Install from: https://cloud.google.com/sdk/docs/install" -ForegroundColor Yellow
    exit 1
}

# Step 2: Set project
Write-Host "`nStep 2: Setting Google Cloud project..." -ForegroundColor Green
gcloud config set project $PROJECT_ID
Write-Host "[OK] Project set to: $PROJECT_ID" -ForegroundColor Green

# Step 3: Check VM status
Write-Host "`nStep 3: Checking VM status..." -ForegroundColor Green
$vmStatus = gcloud compute instances describe $VM_NAME --zone=$ZONE --format="value(status)" 2>&1
if ($vmStatus -eq "RUNNING") {
    Write-Host "[OK] VM is running" -ForegroundColor Green
} elseif ($vmStatus -eq "TERMINATED") {
    Write-Host "[WARN] VM is stopped. Starting..." -ForegroundColor Yellow
    gcloud compute instances start $VM_NAME --zone=$ZONE
    Write-Host "[OK] VM started. Waiting 30 seconds for boot..." -ForegroundColor Green
    Start-Sleep -Seconds 30
} else {
    Write-Host "[ERROR] VM status unknown: $vmStatus" -ForegroundColor Red
    exit 1
}

# Step 4: Upload deployment script
Write-Host "`nStep 4: Uploading deployment script..." -ForegroundColor Green
gcloud compute scp "$LOCAL_PATH\deploy-vm.sh" ${VM_NAME}:${VM_PATH}/deploy-vm.sh --zone=$ZONE
Write-Host "[OK] Deployment script uploaded" -ForegroundColor Green

# Step 5: Upload application files
Write-Host "`nStep 5: Uploading application files..." -ForegroundColor Green
Write-Host "  This may take a few minutes..." -ForegroundColor Yellow

# Create a temporary directory with only necessary files
$tempDir = "$env:TEMP\acc-deploy-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
New-Item -ItemType Directory -Path $tempDir -Force | Out-Null

# Copy necessary files (exclude node_modules, logs, etc.)
$filesToCopy = @(
    "*.js",
    "*.json",
    "*.html",
    "*.css",
    "*.md",
    ".env.production"
)

foreach ($pattern in $filesToCopy) {
    Copy-Item "$LOCAL_PATH\$pattern" $tempDir -ErrorAction SilentlyContinue
}

# Upload files
gcloud compute scp --recurse "$tempDir\*" ${VM_NAME}:${VM_PATH}/ --zone=$ZONE

# Clean up temp directory
Remove-Item -Path $tempDir -Recurse -Force

Write-Host "[OK] Application files uploaded" -ForegroundColor Green

# Step 6: Run deployment script on VM
Write-Host "`nStep 6: Running deployment script on VM..." -ForegroundColor Green
gcloud compute ssh $VM_NAME --zone=$ZONE --command="cd $VM_PATH && chmod +x deploy-vm.sh && ./deploy-vm.sh"
Write-Host "[OK] Deployment script completed" -ForegroundColor Green

# Step 7: Check application status
Write-Host "`nStep 7: Checking application status..." -ForegroundColor Green
Start-Sleep -Seconds 5
$pm2Status = gcloud compute ssh $VM_NAME --zone=$ZONE --command="pm2 status" 2>&1
Write-Host $pm2Status

# Step 8: Show logs
Write-Host "`nStep 8: Recent application logs:" -ForegroundColor Green
$pm2Logs = gcloud compute ssh $VM_NAME --zone=$ZONE --command="pm2 logs --lines 20 --nostream" 2>&1
Write-Host $pm2Logs

# Step 9: Final instructions
Write-Host ""
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "Deployment Complete!" -ForegroundColor Green
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Application URL: http://$VM_IP:3000" -ForegroundColor Yellow
Write-Host ""
Write-Host "Useful commands:" -ForegroundColor Cyan
Write-Host "  View logs:    gcloud compute ssh $VM_NAME --zone=$ZONE --command='pm2 logs'" -ForegroundColor White
Write-Host "  Check status: gcloud compute ssh $VM_NAME --zone=$ZONE --command='pm2 status'" -ForegroundColor White
Write-Host "  Restart app:  gcloud compute ssh $VM_NAME --zone=$ZONE --command='pm2 restart all'" -ForegroundColor White
Write-Host "  SSH to VM:    gcloud compute ssh $VM_NAME --zone=$ZONE" -ForegroundColor White
Write-Host ""
Write-Host "=========================================" -ForegroundColor Cyan
