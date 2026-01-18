# Admin Dashboard Setup Guide

## Quick Setup (5 minutes)

The admin dashboard (`admin.html`) is fully built and ready to use. You just need to grant admin access to your email.

### Step 1: Access Firebase Console

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Click **Firestore Database** in the left menu

### Step 2: Create Admin Account

1. Click **Start collection**
2. Enter collection ID: `admins`
3. Click **Next**
4. Enter **Document ID**: Your Firebase Auth UID (find it in Authentication > Users)
   - Or use **Auto-ID** if you want to add it after creating your user account
5. Add fields:
   - **email** (string): your-admin@email.com
   - **role** (string): admin
   - **createdAt** (timestamp): Click "Use current timestamp"
6. Click **Save**

### Step 3: Access Admin Dashboard

1. Open your browser to: `http://localhost:3000/admin.html`
2. Login with your admin email
3. Dashboard will load automatically!

## What You Can Do

### 📊 Overview Dashboard
- **Total Users**: See all registered accounts
- **Active Licenses**: Currently valid licenses
- **Total Revenue**: Sum of all payments
- **Expiring Soon**: Licenses expiring in 30 days
- **Unpaid Orders**: Abandoned PayPal checkouts

### 👥 User Management
- View all registered users
- Search by email
- Filter by verification status
- See license expiry dates
- Track last login times

### 🎫 License Management
- View all licenses with status
- Search by email or license key
- Filter by: Active / Expired / Pending / Revoked
- **Actions:**
  - **Revoke License**: Immediately block access
  - **Extend License**: Add 30/90/180/365 days

### 💰 Payment Tracking
- See all completed payments
- Match PayPal Order IDs with licenses
- View purchase dates and amounts
- Link to PayPal Dashboard for full details

### 📊 Analytics
- View usage statistics
- Filter by date range (7/30/90 days)
- See user activity logs
- Track common actions

### ⚠️ Alerts
- **Unpaid Orders**: Customers who started but didn't complete payment
- **Expiring Licenses**: Get renewal reminders
- Automatic notifications at top of dashboard

## Security Notes

✅ **Protected**: Only users in `admins` collection can access  
✅ **Firebase Auth**: Uses secure token verification  
✅ **Rate Limited**: Protected against abuse  
✅ **Audit Trail**: All actions logged in analytics

## Granting Admin Access to Multiple Users

To add more admins:

1. Go to Firestore > `admins` collection
2. Click **Add document**
3. Enter the user's Firebase UID
4. Add fields: email, role, createdAt
5. Click **Save**

## Troubleshooting

**"Access denied. Admin privileges required"**
- Your email is not in the `admins` collection
- Solution: Add your UID to the `admins` collection

**"Firebase Admin not initialized"**
- Complete Firebase setup first (see FIREBASE_SETUP.md)
- Add credentials to `.env` file

**Page won't load**
- Check Firebase config in `firebase-config.js`
- Verify your email is authenticated

## Production Deployment

When deploying to your Google VM:

1. Upload admin.html with other files
2. Add admin users to production Firestore
3. Access at: `http://34.45.169.78:3000/admin.html`
4. Recommend: Set up SSL and use HTTPS

## Email Notifications (Optional Enhancement)

Want to send automated emails for:
- License expiring reminders
- Payment confirmations
- License revoked notifications

Let me know and I'll add SendGrid/Nodemailer integration!

---

**Ready to go?** Open http://localhost:3000/admin.html and test it out! 🎯
