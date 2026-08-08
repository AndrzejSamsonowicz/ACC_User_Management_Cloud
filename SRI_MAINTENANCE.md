# Subresource Integrity (SRI) — Firebase SDK — Maintenance Requirement

## TL;DR for whoever (human or AI) touches the Firebase `<script src>` tags

**If the pinned Firebase SDK version in the `<script src="https://www.gstatic.com/firebasejs/...">`
URLs is ever bumped, the `integrity` hashes on those same `<script>` tags MUST be regenerated to
match the new file version — otherwise the scripts will fail to load entirely.**

This is fail-safe (the browser blocks the mismatched script rather than running unverified code),
but it means **changing the version number alone breaks the app** — every page that loads Firebase
(login, registration, admin panel, main app) will fail to initialize.

## Where this applies

Four files load Firebase via CDN `<script>` tags with `integrity` + `crossorigin="anonymous"`
attributes, all currently pinned to **v10.7.1**:

- `public/index.html`
- `public/admin.html`
- `public/login.html`
- `public/register.html`

Each loads some subset of these four scripts (all from `https://www.gstatic.com/firebasejs/<version>/`):

- `firebase-app-compat.js`
- `firebase-auth-compat.js`
- `firebase-firestore-compat.js`
- `firebase-app-check-compat.js`

## How to detect this condition

- The version number in the URL (e.g. `10.7.1`) does not match the SHA-384 hash the `integrity`
  attribute was generated for.
- Symptom in the browser: the Firebase scripts silently fail to load (blocked by the browser's SRI
  check), so `firebase` is `undefined` on `window`, and the app fails to initialize auth/Firestore —
  usually with no obvious error message pointing at SRI specifically. Check DevTools console for a
  message like `Failed to find a valid digest ... in the "integrity" attribute`.

## How to regenerate the hashes

For each of the four script URLs at the new version, download the file and compute its SHA-384
hash, base64-encoded (this is the standard SRI hash format):

```bash
curl -s -o firebase-app-compat.js "https://www.gstatic.com/firebasejs/<NEW_VERSION>/firebase-app-compat.js"
openssl dgst -sha384 -binary firebase-app-compat.js | openssl base64 -A
# -> prefix the output with "sha384-" for the integrity attribute value
```

Repeat for each of the four script files, then update BOTH the version number in the `src` URL and
the corresponding `integrity="sha384-..."` value on every `<script>` tag, in all four HTML files
listed above. All four files should end up with identical `integrity` values for the same script
file — do not let them drift out of sync.

## Verifying the update worked

Load the app in a browser with DevTools open and check the console for SRI errors, then confirm
Firebase actually initialized:

```js
typeof firebase !== 'undefined' && firebase.apps.length > 0
// should be true
```

If this is `false` or the console shows an integrity/digest error, the hash and the file version
don't match — re-check the hash generation step.

## Why this exists

Subresource Integrity protects against the CDN, DNS, or network path being compromised and serving
a tampered version of the Firebase SDK — without it, a corrupted script would run silently with full
access to the page (including auth tokens). See `SECURITY_REPORT.html` §4 (OWASP A08) and §8 for
how this fits into the broader security posture documented for this application.
