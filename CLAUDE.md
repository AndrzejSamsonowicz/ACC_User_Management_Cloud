# CLAUDE.md

Guidance for Claude Code (or any AI agent) working in this repository.

## What this app is

ACC User Management — a Node/Express + vanilla-JS web app that lets a tenant admin log in via
Firebase Auth, then connect to Autodesk Construction Cloud (ACC) via OAuth to manage users, roles,
companies, and folder permissions across ACC hubs/projects. Per-tenant data is stored (encrypted) in
Firestore. See `README.md` for feature overview and setup.

## Repo layout

- `server.js` — Express backend: auth middleware, Firestore encryption/decryption, API routes.
- `public/` — everything served to the browser (HTML pages + client-side JS). **This is the only
  directory Express serves as static files** (`express.static`) — anything outside `public/`
  (credentials, `.env*`, deployment scripts, docs) is never web-accessible. Keep it that way; do not
  move server-side-only files into `public/`, and do not change `server.js` to serve the repo root.
- `SECURITY_REPORT.html` — the living, customer-facing security posture document. If you change
  something that affects a claim in it (encryption scheme, auth flow, headers, XSS mitigations,
  etc.), update this file and regenerate the PDF (`Security Standards Report — ACC User Management
  _ Digibuild.pdf`) via headless Chrome print-to-PDF — see the workflow used in this repo's git
  history for the exact command (`chrome --headless --print-to-pdf=... file:///.../SECURITY_REPORT.html`).
  Report claims should reflect verified current state, not aspirational/planned state.

## Known maintenance gotchas — read before touching related code

- **`SRI_MAINTENANCE.md`** — if you ever bump the pinned Firebase SDK version in the
  `<script src="https://www.gstatic.com/firebasejs/...">` tags (in `public/index.html`,
  `admin.html`, `login.html`, `register.html`), you MUST regenerate the matching
  `integrity="sha384-..."` hashes on those same tags, or the scripts will fail to load entirely
  (fail-safe SRI behavior) and the app will break. Full instructions in that file.

## Security posture (as of the most recent hardening pass)

A full security review and remediation was done covering: static-file exposure of credentials,
secrets committed to git, stored XSS (untrusted ACC data rendered as HTML), Firestore encryption
key derivation (now AES-256-GCM, key derived from a real server-side secret, not just data already
in the same document), the Autodesk OAuth client secret being exposed to the browser (now proxied
server-side via `/api/aps/token`), OAuth CSRF (`state` parameter now validated), and SRI on external
scripts. Full detail and current status: `SECURITY_REPORT.html`.

When adding new code that renders data originating outside the app (Autodesk API responses, other
users' input, etc.) as HTML, use `escapeHtml()` (defined in `public/index.html`'s inline script,
available globally to scripts loaded after it) or build via DOM APIs (`createElement` /
`textContent` / `dataset` / `addEventListener`) — do not concatenate untrusted values into
`innerHTML` template strings or inline `onclick` attributes.
