# VM ↔ Firebase Integration Guide

A reusable reference for deploying a Node.js app on a **Google Compute Engine (GCE) VM** that talks to
**Firebase** (Auth + Firestore), fronted by a custom domain whose DNS is managed at **Infomaniak**. Written
from real-world setup and debugging of exactly this pattern — every "gotcha" section below is a real issue
that was hit and fixed, not a theoretical warning.

This assumes: the VM runs on GCE, and the target Firebase/GCP project already exists.

---

## 1. Architecture at a glance

```
Browser
  │  HTTPS
  ▼
Nginx (SSL termination, port 80/443)
  │  reverse proxy
  ▼
Node.js app (PM2-managed, listening on a local port e.g. 3000)
  │
  ├── Firebase Auth  ──┐
  └── Firestore      ──┤── both reached via Application Default Credentials
                        │   (no key file — see §2)
                        ▼
              Firebase/GCP project
```

DNS: `Infomaniak DNS zone → A record → VM's static external IP`.

---

## 2. Authentication: use Application Default Credentials, not a key file

There are two ways a Node server can authenticate to Firebase Admin SDK:

| Approach | How | Security |
|---|---|---|
| **Service account key file** (`service-account.json`) | Download from Firebase Console → Project Settings → Service Accounts → Generate new private key | A long-lived secret file sitting on disk. Easy to accidentally commit to git, easy to leak. |
| **Application Default Credentials (ADC)** — recommended for GCE | The VM has a service account *attached to it*; the Firebase Admin SDK asks the VM's metadata server for a short-lived token, no file involved | No secret file exists anywhere. Access is controlled entirely by IAM role grants on the service account. |

**Use ADC.** Code pattern:

```js
const admin = require('firebase-admin');

admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: 'your-project-id'
});
```

If you also need direct Firestore access via the standalone `@google-cloud/firestore` package (not just
`admin.firestore()`), it picks up the same ADC automatically:

```js
const { Firestore } = require('@google-cloud/firestore');
const db = new Firestore({ projectId: 'your-project-id' }); // databaseId optional, defaults to "(default)"
```

No `GOOGLE_APPLICATION_CREDENTIALS` env var, no JSON file to `.gitignore` and rotate.

---

## 3. IAM: what the VM's service account actually needs

Every GCE VM has a **service account attached to it** (find it: Compute Engine → your VM → Security and
access → "Service account" field — usually the project's default Compute Engine service account,
`PROJECT_NUMBER-compute@developer.gserviceaccount.com`). ADC uses *this* identity.

Grant it these roles **on the Firebase project** (IAM & Admin → IAM → Grant access):

| Role | Needed for |
|---|---|
| **Firebase Authentication Admin** | `admin.auth().verifyIdToken()`, `deleteUser()`, and any other Admin SDK Auth call |
| **Cloud Datastore User** (or **Cloud Datastore admin** if you also need index/database management) | Firestore reads/writes |
| **Service Usage Consumer** | Only needed if the VM's own GCP project is *different* from the Firebase project (see §4) — without it you'll get `USER_PROJECT_DENIED` errors calling Identity Toolkit |

### GCE-specific gotcha: instance Access Scopes
IAM roles are necessary but **not sufficient** on GCE. Every VM instance also has its own **"Access
scopes"** setting (Compute Engine → your VM → Edit → "Access scopes" under Security), which caps what
OAuth scopes the VM's ADC token is *allowed to request at all* — independent of IAM. Firebase Auth Admin
operations need the broad `cloud-platform` scope, but GCE's default scope list doesn't offer that
individually.

**Fix**: set the VM's access scope to **"Allow full access to all Cloud APIs"**. IAM roles remain the real
gatekeeper for what the service account can actually *do* — the scope just removes an additional
token-level restriction. Note: **changing this requires stopping the VM first** (GCP won't let you edit it
on a running instance) — plan for a short downtime window.

---

## 4. Should the VM and Firebase project be the same GCP project?

**Strongly recommended: yes, keep them in the same project.** If the app's compute (VM) lives in a
*different* GCP project than the Firebase project, you get real, recurring complexity:

- You need the `Service Usage Consumer` role (see above) on top of everything else.
- The VM's service account identity is documented as belonging to its "home" project, which is confusing
  when debugging permission errors — the error messages reference the *target* (Firebase) project, not the
  VM's, which trips people up.
- Firestore, Auth, and any future Firebase feature end up needing separate cross-project grants each time.

If you're setting this up fresh, use one project for everything. If you inherit a split setup, the fix is
straightforward (move Firestore into the Firebase project's own default database) but requires a genuine
data migration if real data already exists.

---

## 5. Firestore setup

- Enable **Firestore Native mode** (not Datastore mode).
- Pick a region and stick with it — can't be changed later without a full migration.
- Use the **`(default)` database** unless you have a specific reason to create a named one. Firestore
  supports multiple named databases per project, but this adds a parameter (`databaseId`) you have to keep
  consistent everywhere, for no benefit in a typical single-app setup.
- The free **Spark plan** covers Firestore for small-to-moderate usage (1 GiB storage, 50k reads/20k
  writes/20k deletes per day) — no billing account needs to be linked just to use Firestore. You only need
  **Blaze** (which requires linking a billing account) for things like custom SMTP in Auth email templates
  or Cloud Functions with outbound network access.

---

## 6. Client-side vs server-side Firebase config — what's actually secret

A common point of confusion: the Firebase **client** config (used in browser-side JS to initialize the
Firebase SDK) is **not a secret**, even though it looks like one:

```js
const firebaseConfig = {
    apiKey: "AIza...",       // public by design
    authDomain: "your-project.firebaseapp.com",
    projectId: "your-project",
    storageBucket: "...",
    messagingSenderId: "...",
    appId: "..."
};
```

This `apiKey` is meant to be visible in every page's source — Firebase's real security boundary is
Firestore/Auth **security rules** and server-side validation, not hiding this config. It's fine to commit
this file to git and serve it to the browser.

**What genuinely must stay server-only and out of any browser-served directory:**
- Anything derived from your own app's secrets (e.g., an `ENCRYPTION_KEY` used to encrypt stored data —
  see §11)
- A `service-account.json` key file, *if* you end up using one instead of ADC
- Third-party API client secrets (OAuth client secrets, payment provider secrets, SMTP passwords)

Structure the app so only a `public/`-style directory (containing HTML/CSS/client-JS) is served
statically, and the server process never serves the rest of the repo.

---

## 7. Domain setup via Infomaniak → GCE VM

### Step 1 — Reserve a **static** external IP before touching DNS
This is the single most important step to get right first. GCE VMs get a **new ephemeral IP every time
they're stopped and started**, unless the IP is reserved as static. If you point DNS at an ephemeral IP,
the very next VM restart (for any reason — a crash, a maintenance event, you stopping it deliberately)
silently breaks your domain until someone notices and manually updates DNS.

1. Cloud Console → VPC Network → IP addresses → find the VM's current external IP (listed as "Ephemeral")
2. Click **"Reserve"** / "Promote to static" — this keeps the *same* IP value, just locks it permanently to
   this VM
3. Only *then* proceed to DNS

### Step 2 — Infomaniak DNS
In the domain's DNS zone (Infomaniak Manager → Web & Domains → Domain → Change the DNS zone):
- Add an **A record**: hostname → the static IP from Step 1

### Step 3 — GCP firewall
Confirm firewall rules allow inbound `tcp:80` and `tcp:443`. GCP's `default-allow-http` /
`default-allow-https` rules usually exist already, but check their **Targets** — if they target a specific
network tag (not "Apply to all"), the VM needs that same tag (VM → Edit → Network tags), or the traffic
never reaches it despite the rule existing.

### Step 4 — Nginx reverse proxy + Let's Encrypt SSL
```bash
sudo apt update && sudo apt install nginx certbot python3-certbot-nginx -y
```

```nginx
# /etc/nginx/sites-available/yourapp
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/yourapp /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl restart nginx
sudo certbot --nginx -d your-domain.com   # auto-configures HTTPS, auto-renews
```

Once SSL is confirmed working, remove any `DISABLE_HTTPS_REDIRECT`-style escape hatch from the app's own
config (used only while there was no SSL yet).

### Optional hardening — block direct-IP access
By default, Nginx serves your one `server_name` block for *any* Host header it receives, including
requests straight to the bare IP (which will show a certificate mismatch warning, since the cert only
covers your domain). To close this off:

```nginx
# /etc/nginx/sites-available/default-deny
server {
    listen 80 default_server;
    listen 443 ssl default_server;
    server_name _;
    ssl_certificate /etc/ssl/certs/ssl-cert-snakeoil.pem;      # sudo apt install ssl-cert
    ssl_certificate_key /etc/ssl/private/ssl-cert-snakeoil.key;
    return 444;   # nginx-specific: close connection, no response
}
```
Enable it the same way (symlink into `sites-enabled/`, `nginx -t`, restart).

---

## 8. Process management (PM2)

### Use `exec_mode: 'fork'` explicitly
```js
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'your-app',
    script: 'server.js',
    instances: 1,
    exec_mode: 'fork',        // <-- do not omit this
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    node_args: '-r dotenv/config',
    env: { NODE_ENV: 'production', PORT: 3000 },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    time: true
  }]
};
```

**Gotcha**: merely having an `instances` key (even set to `1`) makes PM2 **default to cluster mode**
(spawning workers via Node's `cluster` module) unless `exec_mode: 'fork'` is set explicitly. Cluster mode
adds IPC/socket-sharing complexity that can manifest as an unexplained crash-loop specifically after a VM
reboot, while working fine moment-to-moment otherwise. For a single-instance app, fork mode is simpler and
was needed to fix exactly this crash-loop in practice.

### Survive VM reboots
```bash
pm2 save
sudo env PATH=$PATH:/usr/bin $(pm2 --version >/dev/null 2>&1 && which pm2) startup systemd -u $USER --hp $HOME
```
(PM2 prints the exact `sudo` command to run — copy it exactly rather than guessing the path.) Without
this, a VM reboot brings the VM back up but **not** your app — it needs a manual `pm2 resurrect` /
restart until this is configured once.

### Log file naming
Whatever `error_file`/`out_file` you configure, PM2 **always appends `-0`** to the actual filename on disk
(e.g. `err.log` → `err-0.log`). Don't lose time looking for a file that matches your config exactly.

---

## 9. Firebase Auth email templates (verification, password reset)

By default, these emails come from a generic `*.firebaseapp.com` address and commonly land in spam,
**even with nothing misconfigured** — it's a new-sender reputation problem, not a bug.

The real fix (Firebase Console → Authentication → Templates → SMTP settings):
1. **Customize domain** first — Firebase gives you SPF/DKIM DNS TXT/CNAME records to add to your domain's
   zone, authenticating Firebase's sending infrastructure as your domain. Do this even if using your own
   SMTP below, since it also affects the "From" domain shown.
2. Optionally, plug in **your own SMTP server** (e.g., your domain's existing mailbox) instead of Firebase's
   default relay, for full control over sender reputation and the "From" address.
3. Requires the **Blaze** plan (billing linked) — Spark doesn't support custom SMTP.

### Infomaniak-specific gotcha: which "app password" actually works
If the sending mailbox has 2FA enabled (SMTP AUTH can't do 2FA), you need an app-specific password. **Two
different pages in Infomaniak generate app passwords, and only one works for direct SMTP:**
- ❌ Account-level **"My Profile" → "Application password(s)"** — scoped for kSuite tool sync, **does not**
  authenticate for raw SMTP (`535 Invalid login or password`)
- ✅ The **mailbox's own webmail settings → "Devices"** page → "Add a device" → "On this device" → "My
  emails" → "Display password" — this one is scoped correctly for SMTP/IMAP

Test whichever password you generate directly before trusting it in the app:
```bash
curl --url 'smtp://mail.yourprovider.com:587' --ssl-reqd \
  --mail-from 'you@yourdomain.com' --mail-rcpt 'test@example.com' \
  --user 'you@yourdomain.com:THE_PASSWORD' \
  -T <(echo -e "Subject: test\n\nbody") -v
```
Look for `235 2.0.0 OK` (auth succeeded) and `250 ... queued` (message accepted).

---

## 10. App Check (optional anti-abuse layer)

If using Firebase App Check with reCAPTCHA v3: **the site key must be registered specifically for this
Firebase project** in Firebase Console → App Check. A reCAPTCHA key created for/registered on a different
project will fail token exchange with a `403`, even though the key itself is valid — this is a common
copy-paste mistake when reusing a key from an earlier project.

---

## 11. Encryption of stored data — a specific cross-environment trap

If the app encrypts any data before storing it in Firestore (e.g., third-party API credentials, tokens),
and derives the encryption key from a server-side secret (e.g., an `ENCRYPTION_KEY` env var):

**Never point a local/dev/staging server at the same production Firestore database** unless it uses the
*exact same* `ENCRYPTION_KEY`. If it doesn't, any record saved through that dev environment becomes
**permanently undecryptable** in production — not a bug to "fix," the encryption is working exactly as
designed (a different key can't decrypt data encrypted under another key). Symptom: intermittent decrypt
failures / "please re-enter your credentials" that correlate suspiciously with recent deploys, because
that's when dev-environment test data landed in the shared database.

Defensive coding regardless: wrap every decrypt call in try/catch and treat a failure as "no data saved"
(log a warning, don't crash the request) rather than letting it surface as a 500 — a corrupted or
foreign-key-encrypted record should degrade gracefully, not take down the endpoint.

---

## 12. Firestore transactions for check-then-write flows

Any "validate X is available, then claim/write X" flow (e.g., claiming a unique license key, reserving a
username) needs to be wrapped in `db.runTransaction()`, not a plain read followed by a separate write.
Without a transaction, two concurrent requests can both pass validation before either write lands — a
classic TOCTOU race that's easy to miss in review since it works fine in every manual test (which are
never truly concurrent).

```js
await db.runTransaction(async (transaction) => {
    const doc = await transaction.get(ref);          // all reads first
    if (/* not available */) throw new Error('...');
    transaction.update(ref, { claimedBy: userId });   // then all writes
});
```

---

## 13. Third-party API rate limits when checking many items

If the app loops over a list fetched from the user's account (e.g., "for each project, check some
permission") and fires one API call per item with no concurrency limit, this works fine in testing with a
handful of items and then **fails in production for any account with many items** (429 Too Many Requests
from the third-party API). Cap concurrency with a small queue (5 concurrent requests is a reasonable
starting point) rather than firing everything at once — especially important if the check "fails closed"
on error, since a rate-limit flood then silently produces wrong results everywhere, not just slowness.

---

## 14. Deploy checklist (quick reference)

- [ ] GCP project created/identified; Firestore Native mode enabled, region chosen
- [ ] VM created in the **same** GCP project as Firebase (see §4)
- [ ] VM's service account granted: Firebase Authentication Admin, Cloud Datastore User (§3)
- [ ] VM's Access Scopes set to "Allow full access to all Cloud APIs" (§3 — requires VM stop)
- [ ] App uses `admin.credential.applicationDefault()` — no key file (§2)
- [ ] External IP reserved as **static** (§7, step 1) — before any DNS changes
- [ ] DNS A record added at Infomaniak, pointing to the static IP
- [ ] GCP firewall allows tcp:80/443, VM has matching network tags
- [ ] Nginx + Certbot installed, SSL working, `DISABLE_HTTPS_REDIRECT`-style flags removed
- [ ] `ecosystem.config.js` has `exec_mode: 'fork'` explicitly
- [ ] `pm2 save` + `pm2 startup` run so the app survives VM reboots
- [ ] Firebase Auth email templates: custom domain (SPF/DKIM) configured, tested with a real signup
- [ ] Any encrypted-data decrypt paths wrapped in try/catch, degrade gracefully
- [ ] Any "validate then claim" flow uses a Firestore transaction
- [ ] Any per-item loop calling an external API has a concurrency cap
