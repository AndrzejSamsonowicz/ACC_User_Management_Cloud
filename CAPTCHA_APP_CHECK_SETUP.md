# CAPTCHA (Firebase App Check + reCAPTCHA v3) — How It's Implemented

A reusable reference for the anti-bot protection wired into Firebase Auth via **App Check** and
**reCAPTCHA v3**. Written from real setup and debugging of this exact flow.

---

## 0. Terminology — this is not a "click the boxes" CAPTCHA

There is no user-facing challenge anywhere in this app. **reCAPTCHA v3** runs invisibly in the background
on every page load, scoring how bot-like the browsing session looks (0.0–1.0), with no interaction
required from the user at all.

**App Check** is the Firebase product this feeds into: it attaches a verifiable attestation token to
requests the client makes to Firebase services (Auth, Firestore, etc.), so Firebase's backend can — *if
you turn enforcement on* (see §6) — reject requests that don't carry a valid token, i.e., requests not
genuinely coming from your registered web app. reCAPTCHA v3 is the specific "attestation provider" plugged
into App Check here; App Check also supports other providers (e.g., reCAPTCHA Enterprise), but v3 is what
this app uses.

---

## 1. Client-side wiring (every page that touches Firebase)

Two things, in every HTML page that initializes Firebase (login, register, main app, admin — anywhere
`firebase.initializeApp()` is called):

```html
<script src="https://www.gstatic.com/firebasejs/10.7.1/firebase-app-check-compat.js"></script>
```

```js
firebase.initializeApp(firebaseConfig);

// Right after initializeApp, before other Firebase calls run on this page
const appCheck = firebase.appCheck();
appCheck.activate('YOUR_RECAPTCHA_V3_SITE_KEY', true);   // 2nd arg = auto-refresh tokens

const auth = firebase.auth();
// ...
```

The site key here is the **public** half of a reCAPTCHA v3 key pair — safe to embed in client code, same
category as the Firebase `apiKey`. It must be duplicated into **every** page that uses Firebase, not just
the login page.

---

## 2. Creating the reCAPTCHA v3 key pair

At `https://www.google.com/recaptcha/admin/create`:
- **Label**: anything descriptive
- **reCAPTCHA type**: **v3** (not v2 — v2 is the checkbox/image-grid kind, a different product entirely
  and not what App Check's reCAPTCHA v3 provider expects)
- **Domains**: add every domain this will actually run on (production domain, plus `localhost` if you test
  locally)
- Submit → you get a **Site Key** (public, goes in client code above) and a **Secret Key** (private, goes
  only into Firebase Console, §3 — never in any client-facing file)

---

## 3. Registering App Check in Firebase Console — the step most likely to be missing

`console.firebase.google.com/project/YOUR_PROJECT/appcheck` → **Apps** tab → find your web app →
**Register** → choose **reCAPTCHA** as the provider → paste in the **Secret Key** from §2 → Save.

### Gotcha — this step is easy to skip entirely, and the failure is not obvious
A real, observed failure mode: the client code calls `appCheck.activate(siteKey, true)` correctly on every
page, but the Firebase project's App Check console shows the app as **"Unregistered"** (Attestation
providers: `–`). This does **not** throw a loud error on page load — instead, every subsequent Firebase
Auth token exchange intermittently fails in the browser console with reCAPTCHA/App-Check-related `403`
errors, and Firebase's own SDK starts throttling retry attempts (`AppCheck: Requests throttled due to 403
error`). It looks like a flaky reCAPTCHA problem; it's actually "nobody registered this app in App Check
yet." **Check the Apps list in the App Check console directly** to confirm registration status before
debugging anything else.

### Gotcha — a site key registered for a *different* Firebase project silently fails
App Check validates that the reCAPTCHA key presented actually belongs to *this* project's registration.
Reusing a site key/secret pair that was created while working on a different Firebase project (a common
copy-paste mistake) fails token exchange with `403`, even though the key itself is completely valid and
the domain matches. Always create a **fresh key pair per Firebase project** (§2), don't reuse one across
projects.

### Gotcha — domain mismatch
The reCAPTCHA key's domain list (set at creation in §2, editable later in the reCAPTCHA admin console)
must include whatever domain the page is actually being served from. If you migrate the app to a new
domain later, add the new domain to the *existing* reCAPTCHA key rather than assuming it "just works."

---

## 4. Required CSP allowances

If the app sets a `Content-Security-Policy` header (recommended), reCAPTCHA needs explicit allowances or
it silently fails to load/execute:

```
script-src ... https://www.google.com https://www.recaptcha.net ...
connect-src ... https://www.google.com https://www.recaptcha.net https://www.gstatic.com ...
frame-src   ... https://www.google.com https://www.recaptcha.net ...
```

reCAPTCHA v3 loads a script, makes XHR/fetch calls, and opens an invisible iframe — all three directives
need the relevant domains, not just `script-src`. A CSP that blocks any one of these produces the same
kind of silent `403`/throttling symptoms as the registration gotcha above, so when debugging App Check
errors, check the browser console's **Network** tab for CSP violation messages before assuming it's a
Firebase-side registration problem.

---

## 5. Firebase Auth's own bot-protection field ("reCAPTCHA Enterprise" toggle)

Separately from App Check, Firebase Authentication has its **own** optional reCAPTCHA integration
(Authentication → Settings → "reCAPTCHA Enterprise", a *different* setting from App Check). This app does
**not** use that — App Check (§1–§3) is the only anti-bot mechanism wired in. Don't confuse the two if you
see both mentioned in Firebase's docs; they're separate features that happen to both involve reCAPTCHA.

---

## 6. Is any of this actually *enforced*? (Read this before assuming App Check "protects" anything)

**As implemented here: registered and generating tokens, but not enforced anywhere.** There is no
server-side `admin.appCheck().verifyToken(...)` call in this app's backend — meaning even a perfectly
configured App Check setup currently does **not** block any request. It attaches a token; nothing checks
that token's validity before serving the request.

This has a real practical consequence, observed directly: when App Check was broken (unregistered, §3),
the browser console filled with `403` errors on every page load — but **login and registration kept
working anyway**, because nothing in the request path actually depended on App Check succeeding. If you
see App Check errors in your own console, that alone does not mean users are blocked; check whether
enforcement is actually turned on (below) before assuming it's an outage.

### If you want it to actually protect something
Firebase Console → App Check → **APIs** tab lists each Firebase product (Authentication, Firestore, etc.)
with a per-product **"Enforce"** toggle. Turning it on makes Firebase's own backend reject any request
*without* a valid App Check token — at that point, a broken client-side setup (§3's gotchas) becomes a
real outage, not just console noise. **Do not flip Enforce on without first confirming, via the App Check
console's request-metrics dashboard, that verified requests are actually flowing correctly** — Firebase
gives you a monitoring-only period before you commit to enforcement specifically so you can catch a
misconfiguration before it locks out real users.

---

## 7. Testing / debugging checklist

- [ ] `console.firebase.google.com/.../appcheck` → Apps tab shows the app as **Registered**, not
      "Unregistered", with a provider listed (not `–`)
- [ ] The site key in client code matches the key pair whose Secret Key was entered in App Check
      registration
- [ ] The reCAPTCHA key's domain list (google.com/recaptcha/admin) includes the domain you're testing on
- [ ] Browser console shows no `AppCheck: ReCAPTCHA error` / `403` on page load
- [ ] CSP header (if set) allows `google.com`, `recaptcha.net`, `gstatic.com` in `script-src`,
      `connect-src`, and `frame-src`
- [ ] If enforcement is intended: confirm real login/registration/Firestore calls still succeed *after*
      turning Enforce on for each API, not just before

---

## 8. Quick-reference summary

| What | Where configured | Requires code deploy? |
|---|---|---|
| Site key embedded in every page | Client code (`appCheck.activate(...)`) | Yes |
| Secret key registration | Firebase Console → App Check → Apps | No |
| Domain allowlist for the reCAPTCHA key itself | google.com/recaptcha/admin | No |
| CSP allowances for reCAPTCHA domains | Server code (CSP header) | Yes |
| Whether App Check actually blocks anything | Firebase Console → App Check → APIs → Enforce toggle | No |
