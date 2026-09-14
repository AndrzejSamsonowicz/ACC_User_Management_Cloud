# Confirmation (Email Verification) Sending — How It's Set Up

A reusable reference for the "verify your email" confirmation email sent after signup, using Firebase
Authentication. Written from real setup and debugging of exactly this flow, including every mistake made
along the way — treat the "Gotchas" callouts as seriously as the main steps.

**Scope note**: this doc is specifically about the *account verification* email (Firebase Auth's built-in
mechanism). If the app also sends *other* transactional emails (e.g., a purchased license key, a welcome
email with custom content), those typically go through a completely separate path — your own SMTP client
(e.g., `nodemailer`) called from your own server code — not Firebase Auth templates at all. Don't confuse
the two; they have different configuration surfaces and this doc only covers the Firebase Auth one.

---

## 1. What actually triggers the email (client-side code)

Firebase Auth does **not** send a verification email automatically on signup. Your client code must call
it explicitly, right after creating the account:

```js
const userCredential = await auth.createUserWithEmailAndPassword(email, password);
const user = userCredential.user;

// Non-blocking — don't fail registration if this specific call has an issue
try {
    await user.sendEmailVerification();
} catch (verificationError) {
    console.log('Sending verification email failed (non-critical):', verificationError);
}
```

That's the entire client-side footprint. `sendEmailVerification()` talks directly to Firebase's Identity
Toolkit API — it does not go through your own backend at all. Everything else (who it's from, what it
says, whether it lands in spam) is controlled entirely in the **Firebase Console**, not in your codebase.

---

## 2. Where the email content actually lives: Firebase Console → Templates

`console.firebase.google.com/project/YOUR_PROJECT/authentication/emails` → **Email address verification**
template.

Editable fields:
- **Sender name** — display name shown in the recipient's inbox
- **From** — the sending address's local part (domain part is fixed unless you set up a custom domain, §3)
- **Reply to**
- **Subject** — supports the `%APP_NAME%` placeholder
- **Message** — supports `%DISPLAY_NAME%` and `%LINK%` placeholders

**Gotcha**: `%APP_NAME%` is meant to reflect your project's display name (Project Settings → General →
"Project name"), but in practice this substitution can lag behind a rename by more than expected, and this
console has occasionally shown a transient "Email template updates are currently unavailable for this
project" error unrelated to anything you did. If a rename doesn't show up in a test email after a
reasonable wait, it's a Firebase-side issue, not a config mistake on your part — the banner itself
suggests contacting Firebase support if it persists.

**Gotcha**: once you apply a custom domain (§3), the **Message** field becomes **read-only** — you can
still edit Sender name/From/Reply-to/Subject, but not the body text. This is deliberate on Firebase's part
(anti-phishing: a custom domain makes the email look more "trusted," so they restrict how much of the
content you can manipulate). Don't spend time looking for a way around this.

---

## 3. Why the default email lands in spam, and the actual fix

Firebase's default sending address is something like `noreply@your-project.firebaseapp.com`. Even with
zero misconfiguration, this **commonly lands in spam** — not because anything is broken, but because it's
an unauthenticated-looking, generic address with no established sender reputation tied to *your* domain.

### The fix: authenticate your own domain for Firebase's sending

In the template editor, next to the **From** field, click **"Customise domain"**. Firebase walks you
through adding DNS records to *your own domain* (not `firebaseapp.com`) so Firebase's mail servers are
authorized to send *as* your domain:

| Record | Type | Purpose |
|---|---|---|
| `yourdomain.com` | TXT | `v=spf1 include:_spf.firebasemail.com ~all` (or similar) — SPF |
| `yourdomain.com` | TXT | `firebase=your-project-id` — ownership verification |
| `firebase1._domainkey.yourdomain.com` | CNAME | DKIM selector 1 |
| `firebase2._domainkey.yourdomain.com` | CNAME | DKIM selector 2 |

**Critical gotcha — SPF records cannot be duplicated.** A domain can only have **one** `v=spf1` TXT record.
If your domain already sends real mail (e.g., a company mailbox through Google Workspace, Microsoft 365,
or any provider), it almost certainly already has an SPF record. **Do not add Firebase's SPF line as a
second, separate TXT record** — that creates a `PermError` that can break authentication for *all* your
existing mail, not just this new email. Instead, **merge** it into the existing record:

```
# Before (example, your existing record will differ):
v=spf1 include:spf.protection.outlook.com include:spf.yourmailprovider.com -all

# After (Firebase's include added, nothing else changed):
v=spf1 include:spf.protection.outlook.com include:spf.yourmailprovider.com include:_spf.firebasemail.com -all
```

The two DKIM CNAME records and the ownership TXT record are safe to add as brand-new records — no
conflict risk there, since they use hostnames/selectors that won't already exist.

**Why two DKIM records?** Standard key-rotation practice — mail providers keep two signing keys active at
once so they can rotate without any DNS changes on your end or any signing downtime. Add both; you'll
never need to touch them again.

**Check your DMARC policy before assuming this "just works".** If your domain has `p=reject` (strict DMARC),
verify the setup actually achieves DKIM alignment (Firebase's flow is designed to, when all 4 records are
added correctly) — a partial setup under a strict DMARC policy can cause emails to be outright rejected by
some receivers, not merely spam-filtered.

Once DNS propagates (usually fast, sometimes up to the "48 hours" Firebase warns about), click **Verify**,
then **Apply custom domain**.

### If it's a fresh sending domain: expect some spam placement anyway, especially from strict providers
Even with perfect SPF/DKIM/DMARC (confirmed via the email's raw headers — see §7), a **brand-new sender
identity** commonly still lands in spam for its first several sends at strict providers (Yahoo in
particular was observed being noticeably stricter than Gmail/Outlook for an identical, fully-authenticated
message). This is sender-reputation ramp-up, not a technical fault — it improves with legitimate sending
volume and recipients marking messages "not spam." Don't chase this further via configuration once
authentication headers confirm `pass` on everything; there's nothing more to fix.

---

## 4. Optional: route through your own mailbox instead of Firebase's relay (custom SMTP)

Still within the same Templates page → **SMTP settings**. This replaces Firebase's own sending
infrastructure with your own mail server (e.g., your company's existing mailbox), which can further help
deliverability since you're using an already-reputable, human-monitored mailbox.

Fields: SMTP host, port, security mode (`STARTTLS` for port 587, `SSL/TLS` for port 465), username,
password, sender address.

**Gotcha — 2FA-protected mailboxes need an app-specific password, and providers often have more than one
"app password" mechanism, only one of which works for raw SMTP.** For example, on Infomaniak specifically:
- ❌ Account-level **"My Profile" → "Application password(s)"** — this is scoped for their own tool-sync
  features and **fails** SMTP AUTH with `535 Invalid login or password`, even though the password is
  "real"
- ✅ The **mailbox's own webmail Settings → Devices** page → "Add a device" → generates a password that
  **does** work for direct SMTP/IMAP

If your provider has an equivalent split, look for the password generator that's scoped to the *specific
mailbox's* mail-client access, not a generic account-wide "app password" list.

**Always test the credentials directly before trusting them in Firebase**, so you're not debugging through
Firebase's UI blind:
```bash
curl --url 'smtp://mail.yourprovider.com:587' --ssl-reqd \
  --mail-from 'you@yourdomain.com' --mail-rcpt 'a-real-test-inbox@example.com' \
  --user 'you@yourdomain.com:THE_APP_PASSWORD' \
  -T <(echo -e "Subject: SMTP test\n\nbody") -v
```
Success looks like `235 2.0.0 OK` (authentication accepted) followed by `250 ... queued` (message
accepted). A `535` means the password is wrong or scoped incorrectly — regenerate rather than guessing.

Once confirmed via `curl`, enter the same values into Firebase's SMTP settings and toggle **Enable**.

**Note**: this SMTP configuration is shared across **all** Auth email templates (verification, password
reset, email-change) — it's one setting, not per-template. Updating it once covers every template
automatically.

---

## 5. Enforcing verification before login (this is your app's code, not Firebase config)

By default, Firebase Auth issuing a verification email changes **nothing** about login behavior — an
unverified user can log in exactly as freely as a verified one. If you want unverified users blocked,
**you have to add that check yourself.**

### Do it server-side (authoritative), not just client-side
The Firebase ID token issued at sign-in includes an `email_verified` boolean claim automatically. Check it
wherever your backend validates a session/login:

```js
// In your login-validation endpoint, after verifying the ID token:
if (!isAdmin && !req.user.email_verified) {
    return res.json({
        success: false,
        error: 'Please verify your email before logging in. Check your inbox for the verification link.'
    });
}
```

**Gotcha — a real bug hit in practice**: a *client-side* convenience check (`if (!user.emailVerified) { ...
block ... }`, using the Firebase JS SDK's cached user object) is tempting to add for instant feedback
without a round-trip. But if that client-side check doesn't know about your app's own admin-exemption
logic, it will **lock out admin accounts** whose Auth record happens to have `emailVerified: false` (e.g.,
an admin account created via a path that never went through email verification), even though your
server-side check correctly exempts admins. Either:
- Skip the client-side check entirely and rely solely on the server response (simplest, was the actual
  fix), or
- If you want the client-side speed optimization, make sure it independently knows about the same
  admin-exemption logic your server uses — don't let it be a dumber, inconsistent copy of the real check.

### Optional: mirror verification status into your own user-profile data
If you keep a Firestore (or similar) user document with an app-level `emailVerified` field for display
purposes (e.g., an admin dashboard column), sync it opportunistically at login time by comparing the
token's `email_verified` claim against the stored value — treat the **token claim as the source of truth**,
the stored field as denormalized display data only, never the other way around.

---

## 6. Testing checklist

- [ ] Register a new account with a real, checkable email address
- [ ] Confirm the email arrives (check spam folder too) and its sender name/from address match what you
      configured
- [ ] Attempt to log in **before** clicking the verification link — confirm it's blocked with the expected
      message
- [ ] Click the verification link, then log in again — confirm it now succeeds
- [ ] If the app has admin accounts, confirm an admin can log in regardless of their own verification
      status (this is the scenario that broke in §5's gotcha — test it explicitly, don't assume)
- [ ] Inspect the raw email headers (most webmail clients have a "view original"/"show source" option) and
      confirm `spf=pass dkim=pass dmarc=pass` in the `Authentication-Results` header
- [ ] Test with more than one email provider (e.g., Gmail *and* Outlook/Yahoo) — spam placement can differ
      significantly between providers even for an identical, fully-authenticated message

---

## 7. Quick-reference summary

| What | Where configured | Requires code deploy? |
|---|---|---|
| *Whether* the email gets sent at all | Client code (`sendEmailVerification()` call) | Yes |
| Subject, sender name, reply-to, (message body until custom domain applied) | Firebase Console → Templates | No |
| Fixing spam placement (SPF/DKIM) | DNS records + Firebase Console "Customise domain" | No |
| Using your own mailbox to send | Firebase Console → Templates → SMTP settings | No |
| *Blocking login* for unverified users | Your own server + client code | Yes |
