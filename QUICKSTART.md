# ACC User Management v2.0 - Quick Start Guide

## 🎯 What's New in v2.0

Your ACC User Management tool now has a complete authentication and licensing system!

### New Features:
- ✅ **User Authentication** - Email/password login with Firebase
- ✅ **Email Verification** - Secure account activation
- ✅ **Password Recovery** - Self-service password reset
- ✅ **License Management** - Annual subscription model
- ✅ **PayPal Integration** - Automated license sales
- ✅ **Encrypted Storage** - AES-256-GCM encryption for credentials
- ✅ **Multi-tenant** - Support for 100+ customers
- ✅ **Rate Limiting** - Protection against abuse
- ✅ **Session Management** - Secure user sessions
- ✅ **Admin Dashboard** - License and user management (coming soon)

---

## 🚀 Quick Start (5 Steps)

### 1. Install Dependencies

```bash
cd c:\MCPServer\ACC_User_Management
npm install
```

### 2. Set Up Firebase

1. Follow `FIREBASE_SETUP.md` (30 minutes)
2. Update `firebase-config.js` with your Firebase credentials
3. Update `.env` with Firebase Admin SDK credentials

### 3. Set Up PayPal

1. Follow `PAYPAL_SETUP.md` (20 minutes)
2. Update `.env` with PayPal credentials
3. Update `purchase.html` line 360 with your PayPal Client ID

### 4. Configure Environment

```bash
# Copy example file
copy .env.example .env

# Edit .env and fill in all values
notepad .env
```

Generate encryption key:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 5. Start the Server

```bash
npm start
```

Visit: `http://localhost:3000/purchase.html`

---

## 📁 New Files Overview

| File | Purpose |
|------|---------|
| `login.html` | User login page with password recovery |
| `register.html` | New user registration with license activation |
| `purchase.html` | License purchase with PayPal integration |
| `firebase-config.js` | Firebase client configuration |
| `.env.example` | Environment variables template |
| `FIREBASE_SETUP.md` | Detailed Firebase setup guide |
| `PAYPAL_SETUP.md` | Detailed PayPal setup guide |
| `DEPLOYMENT_GUIDE.md` | Complete deployment instructions |
| `QUICKSTART.md` | This file |

### Modified Files:
- `server.js` - Added authentication API endpoints, encryption, PayPal integration
- `package.json` - Added Firebase Admin, axios, dotenv dependencies
- `index.html` - Added session management and encrypted credential loading

---

## 🔒 Security Features

### Data Encryption
- **ClientID & ClientSecret** encrypted with AES-256-GCM
- **Encryption Key** stored securely in environment variables
- **Unique IV** per user for additional security

### Authentication
- **Firebase Authentication** - Industry-standard security
- **Email Verification** required before first login
- **Password Requirements**: 8+ chars, uppercase, lowercase, number
- **Rate Limiting**: 100 requests per 15 minutes per IP

### License Protection
- **Server-side Validation** - Can't be bypassed
- **Expiry Checking** - Automatic license expiration
- **One-time Activation** - Each license key used once
- **Revocation Support** - Admin can revoke licenses

---

## 🌐 User Flow

### For New Customers:

1. **Purchase License** (`purchase.html`)
   - Enter email
   - Pay via PayPal ($299/year)
   - Receive license key

2. **Register** (`register.html`)
   - Enter email & license key
   - Create password
   - Accept terms

3. **Verify Email**
   - Check inbox
   - Click verification link

4. **Login** (`login.html`)
   - Enter email & password
   - Automatic license validation

5. **Use Tool** (`index.html`)
   - Enter Autodesk ClientID/Secret (once)
   - Credentials saved encrypted
   - Auto-loaded on future visits

### For Existing Customers:

1. **Login** → Automatic credential loading → Start working!

---

## 💰 Pricing & Licensing

### Default Configuration:
- **Price**: $299 USD per year
- **Currency**: USD (changeable)
- **Duration**: 12 months from purchase
- **Renewal**: Manual (automatic renewals coming soon)

### Customization:

Edit `.env`:
```env
ANNUAL_LICENSE_PRICE=199.00
ANNUAL_LICENSE_CURRENCY=EUR
```

And update `purchase.html` (line ~82):
```html
<div class="price">$299</div>  <!-- Change to your price -->
```

---

## 🎯 Testing Guide

### Test in Sandbox Mode:

1. **Start Server**:
   ```bash
   npm start
   ```

2. **Purchase License** (Sandbox):
   - Go to `http://localhost:3000/purchase.html`
   - Use test email: `test@example.com`
   - Click PayPal button
   - Login with PayPal Sandbox account (see PAYPAL_SETUP.md)
   - Complete payment
   - Copy license key

3. **Register Account**:
   - Go to `http://localhost:3000/register.html`
   - Enter email & license key
   - Create password
   - Click "Create Account"

4. **Verify Email**:
   - Check Firebase Console → Authentication
   - Manually verify user (or check email)

5. **Login**:
   - Go to `http://localhost:3000/login.html`
   - Enter credentials
   - Should redirect to main tool

6. **Save Credentials**:
   - Enter Autodesk ClientID/Secret
   - Click "Save Credentials"
   - Verify they're encrypted in Firestore

7. **Test Session**:
   - Logout
   - Login again
   - Credentials should auto-load

---

## 📊 Admin Features (Coming Soon)

`admin.html` will provide:
- User list with license status
- License management (revoke, extend)
- Analytics dashboard
- Revenue tracking
- User activity logs

For now, use Firebase Console for admin tasks.

---

## 🚨 Troubleshooting

### "Firebase not initialized"
- Check `.env` has correct Firebase credentials
- Ensure `FIREBASE_PRIVATE_KEY` includes `\n` characters
- Verify service account JSON is valid

### "PayPal button not showing"
- Check `purchase.html` has correct Client ID
- Verify browser console for errors
- Ensure PayPal SDK loaded (check network tab)

### "Invalid license key"
- Verify key copied correctly (no spaces)
- Check Firestore for license document
- Ensure payment completed in PayPal

### "Credentials not loading"
- Check user is authenticated
- Verify Firestore security rules
- Check browser console for errors

### "Email not sending"
- Verify Firebase email templates configured
- Check spam folder
- Manual verification in Firebase Console (for testing)

---

## 📈 Scaling Considerations

### Current Capacity:
- **100 users**: Free tier covers this
- **Storage**: 1GB Firestore (free)
- **Authentication**: 50,000 users (free)

### When to Upgrade:

**500+ users:**
- Upgrade Google Cloud VM to e2-medium
- Consider Firebase Blaze plan
- Add Redis for caching

**1000+ users:**
- Multiple VMs with load balancer
- CDN for static files (Cloud CDN)
- Monitoring (Google Cloud Monitoring)

---

## 🔐 Security Checklist

Before deploying to production:

- [ ] Generated strong encryption key (64 hex chars)
- [ ] `.env` added to `.gitignore`
- [ ] Firebase security rules published
- [ ] HTTPS enabled (SSL certificate)
- [ ] PayPal in sandbox mode (for testing)
- [ ] Email verification enabled
- [ ] Rate limiting configured
- [ ] Strong admin passwords
- [ ] Backup strategy in place
- [ ] Monitoring configured

---

## 📞 Support & Resources

### Documentation:
- `FIREBASE_SETUP.md` - Firebase configuration
- `PAYPAL_SETUP.md` - PayPal integration
- `DEPLOYMENT_GUIDE.md` - Production deployment
- `GOOGLE_CLOUD_DEPLOYMENT.md` - Google Cloud VM setup

### External Resources:
- Firebase: https://firebase.google.com/docs
- PayPal: https://developer.paypal.com/docs
- Node.js: https://nodejs.org/docs

---

## 🎉 You're Ready!

Your tool now has enterprise-grade authentication and licensing!

### Next Steps:

1. ✅ Complete Firebase setup
2. ✅ Complete PayPal setup
3. ✅ Test complete flow locally
4. ✅ Deploy to Google Cloud (see DEPLOYMENT_GUIDE.md)
5. ✅ Switch to PayPal Live mode
6. ✅ Start selling licenses!

---

**Questions or issues?** Check the troubleshooting sections in:
- `FIREBASE_SETUP.md`
- `PAYPAL_SETUP.md`
- `DEPLOYMENT_GUIDE.md`

Good luck! 🚀
