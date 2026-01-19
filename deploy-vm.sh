#!/bin/bash
# Deploy script for Google Cloud VM
# This script sets up all necessary files on the VM

set -e  # Exit on error

echo "========================================="
echo "ACC User Management - VM Setup Script"
echo "========================================="

# Variables
APP_DIR="/home/samsona/ACC_User_Management_Cloud"
VM_IP="34.65.160.116"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}Step 1: Checking service-account.json${NC}"
if [ ! -f "$APP_DIR/service-account.json" ]; then
    echo -e "${RED}✗ service-account.json not found!${NC}"
    echo -e "${RED}Please upload your Firebase service account credentials first:${NC}"
    echo -e "${RED}gcloud compute scp /path/to/service-account.json \$VM_NAME:$APP_DIR/service-account.json --zone=\$ZONE${NC}"
    exit 1
fi
chmod 600 "$APP_DIR/service-account.json"
echo -e "${GREEN}✓ service-account.json found${NC}"

echo -e "${GREEN}Step 2: Creating .env file${NC}"
cat > "$APP_DIR/.env" << 'EOF'
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
chmod 600 "$APP_DIR/.env"
echo -e "${GREEN}✓ .env file created${NC}"

echo -e "${GREEN}Step 3: Creating firebase-config.js${NC}"
cat > "$APP_DIR/firebase-config.js" << 'EOF'
const firebaseConfig = {
  apiKey: "AIzaSyBZs-p0860rlQVlIgqq8ZpS0MM_Wvb62zI",
  authDomain: "accusermanagement.firebaseapp.com",
  projectId: "accusermanagement",
  storageBucket: "accusermanagement.firebasestorage.app",
  messagingSenderId: "8286394417",
  appId: "1:8286394417:web:6e129a206122bc7dc89d10"
};
EOF
echo -e "${GREEN}✓ firebase-config.js created${NC}"

echo -e "${GREEN}Step 4: Installing dependencies${NC}"
cd "$APP_DIR"
npm install
echo -e "${GREEN}✓ Dependencies installed${NC}"

echo -e "${GREEN}Step 5: Creating logs directory${NC}"
mkdir -p "$APP_DIR/logs"
echo -e "${GREEN}✓ Logs directory created${NC}"

echo -e "${GREEN}Step 6: Restarting PM2${NC}"
pm2 restart all || pm2 start ecosystem.config.js
pm2 save
echo -e "${GREEN}✓ PM2 restarted${NC}"

echo ""
echo "========================================="
echo -e "${GREEN}Deployment Complete!${NC}"
echo "========================================="
echo ""
echo "Application URL: http://$VM_IP:3000"
echo ""
echo "Check status with:"
echo "  pm2 status"
echo ""
echo "View logs with:"
echo "  pm2 logs"
echo ""
echo "========================================="
