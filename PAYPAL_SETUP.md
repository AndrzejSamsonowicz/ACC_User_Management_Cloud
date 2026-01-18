# PayPal Setup Guide for ACC User Management

## Overview
This guide will help you set up PayPal integration for selling annual licenses to your ACC User Management tool.

## Estimated Time: 20 minutes
## Cost: **FREE** for sandbox testing, 2.9% + $0.30 per transaction in production

---

## Step 1: Create PayPal Developer Account

1. Go to [PayPal Developer](https://developer.paypal.com/)
2. Click **"Log in to Dashboard"** (top right)
3. Sign in with your PayPal account (or create one)
4. You'll be redirected to the Developer Dashboard

---

## Step 2: Create Sandbox Test Accounts (Optional - for Testing)

1. In Developer Dashboard, click **"Sandbox"** → **"Accounts"**
2. You'll see two pre-created test accounts:
   - **Business Account** (seller - receives payments)
   - **Personal Account** (buyer - makes payments)
3. Click **"View/Edit Account"** to get credentials
4. Note the email and password for testing

**Testing URLs:**
- Sandbox Dashboard: https://www.sandbox.paypal.com/
- Use these credentials to log in and check test transactions

---

## Step 3: Create REST API App

1. In Developer Dashboard, click **"Apps & Credentials"**
2. Make sure you're in **"Sandbox"** mode (toggle at top)
3. Click **"Create App"** button
4. Fill in details:
   - **App Name**: `ACC User Management`
   - **Sandbox Business Account**: Select one from dropdown (or use default)
5. Click **"Create App"**

---

## Step 4: Get API Credentials

After creating the app, you'll see:

### Sandbox Credentials (for testing):
```
Client ID: AYgX7r8... (long string)
Secret: ELN... (long string)
```

Copy these values!

### Important Note:
- **Sandbox** = Test environment (no real money)
- **Live** = Production environment (real money)

For now, use **Sandbox** credentials.

---

## Step 5: Configure Environment Variables

1. Open your `.env` file
2. Add PayPal credentials:

```env
# PayPal Configuration (SANDBOX for testing)
PAYPAL_CLIENT_ID=your_sandbox_client_id_here
PAYPAL_CLIENT_SECRET=your_sandbox_client_secret_here
PAYPAL_MODE=sandbox

# License Pricing
ANNUAL_LICENSE_PRICE=299.00
ANNUAL_LICENSE_CURRENCY=USD
```

---

## Step 6: Update purchase.html

1. Open `purchase.html`
2. Find this line (around line 360):
   ```html
   <script src="https://www.paypal.com/sdk/js?client-id=YOUR_PAYPAL_CLIENT_ID&currency=USD"></script>
   ```

3. Replace `YOUR_PAYPAL_CLIENT_ID` with your **actual Client ID** from Step 4

**Example:**
```html
<script src="https://www.paypal.com/sdk/js?client-id=AYgX7r8d9FnH4K2P5Q7R9T1V3W5Y7Z9B1C3&currency=USD"></script>
```

**IMPORTANT:** This should be the **public** Client ID (it's safe to expose in HTML). Never put the Secret in HTML!

---

## Step 7: Test Payment Flow (Sandbox)

1. Start your server:
   ```bash
   npm start
   ```

2. Navigate to: `http://localhost:3000/purchase.html`

3. Enter a test email address

4. Click the PayPal button

5. You'll be redirected to PayPal **Sandbox** environment

6. Log in with **Sandbox Personal Account** (buyer account from Step 2)
   - Email: `sb-xxxxx@personal.example.com` (from your sandbox accounts)
   - Password: (from sandbox account details)

7. Complete the payment

8. You'll be redirected back with a license key!

9. Check the PayPal Sandbox Dashboard to see the transaction

---

## Step 8: Switch to Live (Production)

**Only do this when ready to accept real payments!**

1. In PayPal Developer Dashboard, toggle to **"Live"** mode (top right)

2. Create a new app or use existing app in Live mode

3. Get **Live** credentials:
   ```
   Client ID: AbCd... (different from sandbox)
   Secret: XyZ... (different from sandbox)
   ```

4. Update `.env` file:
   ```env
   PAYPAL_CLIENT_ID=your_live_client_id_here
   PAYPAL_CLIENT_SECRET=your_live_client_secret_here
   PAYPAL_MODE=live
   ```

5. Update `purchase.html` with Live Client ID

6. **Verify your PayPal Business Account:**
   - Go to www.paypal.com
   - Complete business verification
   - Add bank account to receive funds

---

## Step 9: Customize Pricing (Optional)

To change the license price, update `.env`:

```env
ANNUAL_LICENSE_PRICE=199.00
# Or any price you want

ANNUAL_LICENSE_CURRENCY=EUR
# Supported: USD, EUR, GBP, CAD, AUD, etc.
```

Also update the price displayed in `purchase.html` (line ~82):
```html
<div class="price">$299</div>
```

---

## Step 10: Email Integration (Recommended)

Currently, license keys are shown on screen. To email them automatically:

### Option A: Use SendGrid (Recommended)

1. Sign up at [SendGrid](https://sendgrid.com/) (free tier: 100 emails/day)
2. Get API key
3. Install package: `npm install @sendgrid/mail`
4. Add to `.env`:
   ```env
   SENDGRID_API_KEY=your_api_key_here
   SENDGRID_FROM_EMAIL=noreply@yourdomain.com
   ```
5. Update server.js to send emails after payment

### Option B: Use Nodemailer (Gmail)

1. Install: `npm install nodemailer`
2. Configure Gmail app password
3. Add email sending logic in `server.js`

**Sample email template:**
```
Subject: Your ACC User Management License Key

Hello,

Thank you for purchasing ACC User Management!

Your License Key: XXXX-XXXX-XXXX-XXXX
Valid Until: [Date]

Next Steps:
1. Go to [Your Domain]/register.html
2. Enter your email and license key
3. Create your password
4. Verify your email
5. Start using the tool!

Need help? Reply to this email.

Best regards,
ACC User Management Team
```

---

## Troubleshooting

### "Invalid client credentials"
- Check that Client ID and Secret match in `.env`
- Ensure no extra spaces or quotes
- Verify you're using correct mode (sandbox vs live)

### "Payment not completing"
- Check server logs for errors
- Verify webhook URLs if using webhooks
- Ensure Firestore is properly configured

### "PayPal button not showing"
- Check browser console for errors
- Verify Client ID in `purchase.html` is correct
- Check that PayPal SDK loaded (view page source)

### "Transaction found but not in database"
- Check Firebase Admin SDK initialization
- Verify Firestore security rules
- Check server logs for database errors

---

## Security Best Practices

✅ **DO:**
- Keep Secret in `.env` file (never commit to Git)
- Use HTTPS in production
- Verify payment status on server-side
- Log all transactions
- Monitor for fraud

❌ **DON'T:**
- Put Secret in HTML/JavaScript
- Trust client-side payment status
- Store credit card data yourself
- Skip payment verification

---

## PayPal Fees

### Sandbox (Testing): **FREE**

### Live (Production):
- **Standard Rate**: 2.9% + $0.30 per transaction
- **For $299 license**: You receive $290.34

### Volume Discounts:
- $3,000+/month: 2.7% + $0.30
- $10,000+/month: 2.4% + $0.30
- $100,000+/month: 1.9% + $0.30

**Calculation for 100 customers @ $299/year:**
- Revenue: $29,900
- PayPal fees: ~$897
- You receive: ~$29,003

---

## Alternative Payment Options

If you prefer different payment providers:

### Stripe
- Similar fees (2.9% + $0.30)
- Better developer experience
- More payment methods
- Replace PayPal SDK with Stripe Checkout

### Paddle
- Handles VAT/tax automatically
- 5% + $0.50 per transaction
- Good for international sales

### Manual (Bank Transfer)
- No fees
- Manual license generation
- Slower, more work

---

## Next Steps

1. ✅ Test complete flow in sandbox
2. ✅ Set up email notifications
3. ✅ Test with real PayPal account (small amount)
4. ✅ Monitor first few sales closely
5. ✅ Set up accounting/bookkeeping

---

## Support

- **PayPal Developer Docs**: https://developer.paypal.com/docs/
- **PayPal Merchant Support**: https://www.paypal.com/merchantsupport
- **PayPal Community**: https://www.paypal-community.com/

---

## Compliance & Legal

Before going live:
- [ ] Create Terms of Service
- [ ] Create Privacy Policy
- [ ] Create Refund Policy
- [ ] Register business (if required in your country)
- [ ] Set up tax collection (if applicable)
- [ ] Comply with GDPR (if serving EU customers)

**Suggested refund policy:**
"30-day money-back guarantee, no questions asked"

This builds trust and is standard for SaaS products.
