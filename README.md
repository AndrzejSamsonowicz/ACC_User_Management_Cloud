# ACC User Management v2.0

**Enterprise-grade user permissions management tool for Autodesk Construction Cloud (ACC) with authentication, licensing, and encrypted credential storage.**

---

## 🎯 What's New in v2.0

**Major Update:** Complete authentication and licensing system for multi-tenant SaaS deployment!

### New Features:
- ✅ **User Authentication** - Firebase-powered login system
- ✅ **License Management** - Annual subscription model with PayPal
- ✅ **Encrypted Credentials** - AES-256-GCM encryption for Autodesk credentials
- ✅ **Email Verification** - Secure account activation
- ✅ **Password Recovery** - Self-service password reset
- ✅ **Multi-tenant Support** - Isolated customer environments
- ✅ **Rate Limiting** - DDoS protection
- ✅ **Session Management** - Secure, persistent sessions
- ✅ **Admin Dashboard** - User and license management (coming soon)

---

## 📋 Description

ACC User Management is a comprehensive tool for managing user permissions across Autodesk Construction Cloud (ACC) projects. Perfect for administrators managing multiple projects and teams.

### Core Features:
- Bulk user management and permissions
- Project-level access control
- Folder permissions management
- User import/export (CSV)
- Real-time permission updates
- Detailed audit logs

### Business Features:
- Secure customer authentication
- Automated license sales and activation
- Encrypted credential storage per customer
- Annual licensing with auto-expiry
- Multiple simultaneous users supported

---

## 🚀 Quick Start

### For First-Time Setup:

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Configure Services**:
   - Follow [Firebase Setup Guide](FIREBASE_SETUP.md) (30 min)
   - Follow [PayPal Setup Guide](PAYPAL_SETUP.md) (20 min)

3. **Set Environment Variables**:
   ```bash
   copy .env.example .env
   # Edit .env with your credentials
   ```

4. **Start Server**:
   ```bash
   npm start
   ```

5. **Test Locally**:
   - Visit: `http://localhost:3000/purchase.html`
   - Complete test purchase
   - Register and login

📖 **Detailed Instructions**: See [QUICKSTART.md](QUICKSTART.md)

---

## 📁 Project Structure

```
ACC_User_Management/
├── login.html              # User login page
├── register.html           # New user registration
├── purchase.html           # License purchase (PayPal)
├── index.html              # Main application (authenticated)
├── admin.html              # Admin dashboard (coming soon)
├── server.js               # Express server with auth APIs
├── firebase-config.js      # Firebase client configuration
├── package.json            # Dependencies
├── .env.example            # Environment variables template
├── ecosystem.config.js     # PM2 configuration
│
├── Documentation/
│   ├── QUICKSTART.md           # Quick start guide
│   ├── FIREBASE_SETUP.md       # Firebase configuration
│   ├── PAYPAL_SETUP.md         # PayPal integration
│   ├── DEPLOYMENT_GUIDE.md     # Production deployment
│   └── GOOGLE_CLOUD_DEPLOYMENT.md
│
└── Legacy Files/
    ├── get_account_users.js
    ├── view_project_users.js
    ├── manage_project_users.js
    └── ... (other utility scripts)
```

---

## 🔒 Security Features

### Enterprise-Grade Security:
- **AES-256-GCM Encryption** - Autodesk credentials encrypted at rest
- **Firebase Authentication** - Industry-standard user auth
- **Email Verification** - Prevents fake accounts
- **Rate Limiting** - 100 requests per 15 min per IP
- **Session Management** - Secure JWT tokens
- **HTTPS Ready** - SSL certificate support
- **Input Validation** - Protection against injection attacks
- **Firestore Security Rules** - Row-level access control

---

## 💰 Licensing Model

### Default Configuration:
- **Price**: $299 USD/year per customer
- **Payment**: PayPal (automated)
- **Delivery**: Instant license key via email
- **Support**: Priority email support included

### Customer Benefits:
- 12 months of access
- Encrypted credential storage
- Automatic updates
- Priority support
- 30-day money-back guarantee (configurable)

---

## 📊 Technical Stack

### Frontend:
- HTML5, CSS3, JavaScript (Vanilla)
- Firebase SDK (Authentication, Firestore)
- PayPal SDK

### Backend:
- Node.js 18+
- Express.js
- Firebase Admin SDK
- Crypto (AES-256-GCM)

### Database:
- Cloud Firestore (NoSQL)

### Payment:
- PayPal REST API

### Hosting:
- Google Cloud Compute Engine (VM)
- Or any Node.js hosting provider

---

## 🔧 Prerequisites

### Required:
- Node.js v18+ and npm v9+
- Firebase account (free tier available)
- PayPal Business account
- Google Cloud account (for deployment)

### Recommended:
- Domain name
- SSL certificate (Let's Encrypt - free)
- Git for version control

---

## 📦 Installation

### Development Setup:

```bash
# Clone repository
git clone https://github.com/yourusername/ACC_User_Management.git
cd ACC_User_Management

# Install dependencies
npm install

# Configure environment
copy .env.example .env
# Edit .env with your credentials

# Start development server
npm start
```

### Production Deployment:

See detailed guide: [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)

Quick deploy to Google Cloud:
```bash
# Deploy to VM
gcloud compute scp --recurse * your-vm:~/ACC_User_Management

# SSH into VM
gcloud compute ssh your-vm

# Install and start
cd ACC_User_Management
npm install --production
pm2 start ecosystem.config.js
```

---

## 🎮 Usage

### For End Users:

1. **Purchase License**: Visit `/purchase.html`
2. **Register Account**: Use license key at `/register.html`
3. **Verify Email**: Click link in inbox
4. **Login**: Access tool at `/login.html`
5. **Save Credentials**: Enter Autodesk ClientID/Secret once
6. **Manage Users**: Full access to ACC user management

### For Administrators:

1. **Monitor Users**: Firebase Console → Authentication
2. **Manage Licenses**: Firestore → licenses collection
3. **View Analytics**: Firestore → analytics collection
4. **Revoke Access**: Use admin API endpoints
5. **Monitor Payments**: PayPal Dashboard

---

## 📈 Scalability

### Current Capacity:
- **100 concurrent users** (tested)
- **1000+ total licenses** (Firestore free tier)
- **50,000 auth users/month** (Firebase free tier)

### Scaling Path:
- **100-500 users**: Current setup works fine
- **500-1000 users**: Upgrade to e2-medium VM ($26/month)
- **1000+ users**: Multiple VMs + load balancer

---

## 💵 Cost Breakdown

### Monthly Operational Costs (100 users):

| Service | Cost | Notes |
|---------|------|-------|
| Firebase | $0 | Free tier sufficient |
| Google Cloud VM | $13 | e2-small instance |
| PayPal Fees | ~2.9% per sale | ~$8.67 per $299 license |
| Domain (optional) | ~$1 | Amortized annual cost |
| **Total** | **~$14/month** | Plus PayPal per-transaction fees |

### Revenue Example (100 customers):
- **Revenue**: $29,900/year
- **Costs**: ~$168/year + $867 PayPal fees
- **Profit**: ~$28,865/year (96% margin)

---

## 🛠️ Configuration

### Environment Variables:

Required in `.env`:
```env
# Server
PORT=3000
NODE_ENV=production

# Firebase Admin SDK
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxx@xxx.iam.gserviceaccount.com

# Encryption (generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
ENCRYPTION_KEY=abcdef0123456789...  # 64 hex characters

# PayPal
PAYPAL_CLIENT_ID=your_client_id
PAYPAL_CLIENT_SECRET=your_client_secret
PAYPAL_MODE=sandbox  # or 'live' for production

# Licensing
ANNUAL_LICENSE_PRICE=299.00
ANNUAL_LICENSE_CURRENCY=USD

# Admin
ADMIN_EMAIL=your@email.com

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000  # 15 minutes
RATE_LIMIT_MAX_REQUESTS=100
```

---

## 🐛 Troubleshooting

### Common Issues:

**Firebase not connecting:**
- Verify `.env` credentials
- Check `FIREBASE_PRIVATE_KEY` has `\n` characters
- Ensure service account has proper permissions

**PayPal button not showing:**
- Check Client ID in `purchase.html`
- Verify browser console for errors
- Ensure SDK loaded (check network tab)

**Login fails:**
- Check email is verified
- Verify license hasn't expired
- Check Firestore security rules

**Credentials not loading:**
- Ensure user is authenticated
- Check browser console for API errors
- Verify encryption key matches

📖 **More Help**: See troubleshooting sections in setup guides.

---

## 📚 Documentation

- [Quick Start Guide](QUICKSTART.md) - Get running in 5 steps
- [Firebase Setup](FIREBASE_SETUP.md) - Complete Firebase configuration
- [PayPal Setup](PAYPAL_SETUP.md) - Payment integration guide
- [Deployment Guide](DEPLOYMENT_GUIDE.md) - Production deployment
- [Google Cloud Deployment](GOOGLE_CLOUD_DEPLOYMENT.md) - VM setup

---

## 🤝 Contributing

Contributions welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

---

## 📄 License

This project is proprietary software for commercial use.

---

## 🆘 Support

- **Documentation**: Check guides in `/Documentation`
- **Issues**: Open GitHub issue
- **Email**: your-support@email.com

---

## 🎯 Roadmap

### v2.1 (Q1 2026):
- [ ] Admin dashboard UI
- [ ] Automated email notifications
- [ ] Stripe payment option
- [ ] Usage analytics

### v2.2 (Q2 2026):
- [ ] Auto-renewal subscriptions
- [ ] Multi-language support
- [ ] Mobile-responsive design
- [ ] API rate limit dashboard

### v3.0 (Q3 2026):
- [ ] Team accounts
- [ ] White-label options
- [ ] Advanced analytics
- [ ] Webhook integrations

---

## 📊 Stats

- **Version**: 2.0.0
- **Release Date**: January 2026
- **Node Version**: 18+
- **Lines of Code**: ~3000+
- **Security Level**: Enterprise-grade

---

**Built with ❤️ for ACC administrators worldwide**



