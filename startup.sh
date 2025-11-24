#!/bin/bash
# Google Cloud VM Startup Script for ACC User Management Tool

# Update system
sudo apt-get update

# Install Node.js 18.x
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 globally
sudo npm install -g pm2

# Navigate to app directory
cd /home/acc-user-management

# Install dependencies
npm install

# Create logs directory
mkdir -p logs

# Start the application with PM2
pm2 start ecosystem.config.js

# Save PM2 process list
pm2 save

# Setup PM2 to start on boot
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u $(whoami) --hp /home/$(whoami)

# Allow port 3000 through firewall (if needed)
sudo ufw allow 3000/tcp

echo "ACC User Management Tool deployed successfully!"
echo "Application is running on port 3000"
