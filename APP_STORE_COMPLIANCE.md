# Autodesk App Store Compliance Checklist

Tracked plan for submitting ACC User Management to the Autodesk App Store (BIM 360/ACC
Integration category). Sourced from: the original meeting notes, Autodesk's official
Getting Started Guide + linked publisher PDFs, the live BIM 360/ACC Publisher Center page
(`aps.autodesk.com/app-store/publisher-center/bim-360`), and a real approved comparable
listing (Enlaye for Autodesk Forma).

**Confirmed decisions:**
- Register a new APS app as **Traditional Web App**, using **3-legged OAuth**. Autodesk's own
  BIM 360 publisher page states *"Use only approved OAuth workflows (2-legged or
  3-legged)"* — no server-to-server mandate — and Enlaye's live listing confirms 3-legged is
  normal and accepted for this exact category of app.
- **Only you (the publisher) ever create this APS app.** One Client ID/Secret, owned by you,
  used by every tenant. Tenants never create their own APS app and never see a Client
  ID/Secret — see §1b.
- **Keep the existing digibuild.ch (Firebase) login as-is.** No change to how customers sign
  up or how licenses are tied to an account — this plan does not touch that system. Bigger
  ideas (e.g. dropping it in favor of Autodesk-only sign-in for easier enterprise sales) are
  parked, not part of this submission.
- **List the app as Free on the Autodesk App Store.** The store listing is a credibility
  signal, not the sales channel — real subscriptions/payment continue through the existing
  `purchase.html`/PayPal flow on your own site. This avoids routing any money through
  Autodesk's own store checkout and its commission terms.

Status tags: `[BLOCKING]` — will very likely cause rejection if unaddressed. `[NON-CODE]` —
account/business/content task, not a code change. `[VERIFY]` — probably fine, confirm before
submitting.

---

## 1. APS App Registration `[BLOCKING]` `[NON-CODE]`

- [ ] Register a **new** APS app for production use — do not reuse "Revit Query" (personal
      test app) or "test2" (Server-to-Server test).
- [ ] Application Type: **Traditional Web App**.
- [ ] Grant Type: Authorization Code and Client Credentials (default for this type).
- [ ] Callback URL list: only `https://usermgt.digibuild.ch/...` production URLs. Leave
      `localhost` entries out of the production registration, or keep them isolated to a
      separate dev-only APS app so the reviewer never sees stray/IP-based callback URLs.
- [ ] API Access: select only the APIs actually called (Authentication, Data Management,
      ACC Admin, BIM 360 Admin, userinfo) — don't leave the default broad selection.

## 1b. Retire the Per-Tenant "Bring Your Own APS App" Flow `[BLOCKING]` — Done in code

Model B means one publisher-owned Client ID/Secret for every tenant, in server env vars —
there is nothing left for an end user to create or paste. Done locally, not yet committed
or deployed:

- [x] Removed the "Setup your application" modal in `public/index.html` (the 4-step
      guide + per-step videos: create APS app → add callback URL → add custom
      integration → paste Client ID/Secret), plus the now-unused "Settings" button and
      its subtitle on the login card.
- [x] Removed the credential gate's old wording in `login()` — replaced with a plain
      "Autodesk sign-in is not available right now" message for the (now purely
      server-config) failure case.
- [x] Removed `POST /save-credentials`, `GET /load-credentials`, and
      `getDecryptedCredentials()`. Replaced with a single `GET /api/aps-client-id`
      ([server.js:96](server.js:96)) that just returns `process.env.APS_CLIENT_ID` — the
      Client ID isn't secret, so this is safe to expose to any logged-in user.
- [x] `/api/aps/token` ([server.js:597](server.js:597)) now uses
      `process.env.APS_CLIENT_ID` / `process.env.APS_CLIENT_SECRET` directly, same pattern
      as `PAYPAL_CLIENT_ID`/`PAYPAL_CLIENT_SECRET`. Added both to `.env.example`.
- [x] Dropped the dead `clientId`/`clientSecret`/`encryptionIV` placeholder fields from the
      new-user Firestore document in `/api/register-user`.
- [x] VM `.env` now has real `APS_CLIENT_ID` / `APS_CLIENT_SECRET` values (confirmed present,
      values never shared in chat). Deployed, restarted, and confirmed working end-to-end
      with a real "Login with Autodesk" test in the browser.
- [x] **Revised**: brought back a much smaller "Settings" modal — one step, "How to add
      custom integration," reusing the original `custom integration.mp4`. This is the
      tenant-side step that's still real under Model B (their ACC hub admin still has to
      authorize the app), so it stays; the other three steps (create an APS app, add
      callback URL, paste Client ID/Secret) are gone for good, and their videos
      (`create APS app.mp4`, `add URL.mp4`, `copy Client ID and Secret.mp4`) are now
      unreferenced — safe to delete whenever, not blocking.
- [ ] **Not started**: the admin-only credential-rotation panel idea (§ discussed in chat —
      an `admin.html` screen to update the shared Client ID/Secret without SSH) — a nice-to
      -have, not required; `.env` alone is sufficient for now.

## 2. OAuth Branding `[BLOCKING]` — Done, applied locally

- [x] Login button now shows Autodesk's real, current, unmodified logo (the black
      symbol+wordmark, `autodesk-logo-blk.svg` in `public/`) followed by "Sign in" —
      matches their own guidance verbatim: *"the app presents the Autodesk logo followed by
      the 'Sign in' wording."* Sourced directly from Autodesk's own asset CDN
      (`damassets.autodesk.net/content/dam/autodesk/logos/`), confirmed as the same file used
      on their public Brand Hub page — not a third-party logo-scraping site. Put the button
      on a white background rather than the app's blue, since Autodesk Black is their
      preferred version and White is only "acceptable against sufficiently dark backgrounds"
      — the app's blue isn't unambiguously dark enough to rely on that exception.
- [x] Added a small "Compatible with Autodesk Forma" badge on `login.html` (the first screen
      anyone sees), using Autodesk's official Forma product icon
      (`public/forma-product-icon.svg`, sourced directly from `autodesk.com`'s own Forma
      product page) — swapped in for an earlier BIM 360-icon version per feedback that Forma
      branding fits this app better than the legacy BIM 360 name.

## 3. OAuth Scope Minimization `[BLOCKING]` — Done and deployed

Audited every single call to `developer.api.autodesk.com` across all 10 files that make one
(`index.html` and 9 `public/*.js` files), and verified the required scope for each API family
directly against Autodesk's own reference pages (not assumed from memory):

| Scope | Confirmed used by | Verdict |
|---|---|---|
| `data:read` | Data Management API — hubs/projects/folders browsing | Keep |
| `data:write` | Folder permissions batch-create/update/delete — confirmed directly on Autodesk's `permissions:batch-create` reference page (`Required OAuth Scopes: data:write`) | Keep |
| `data:create` | **No code path found** — no folder/item/version creation anywhere | **Removed** |
| `account:read` | GET calls across Construction Admin, HQ, and BIM 360 Admin APIs | Keep |
| `account:write` | PATCH/POST/DELETE project & account users, companies — confirmed directly on Autodesk's `PATCH projects/:project_id/users/user_id` reference page (`Required OAuth Scopes: account:write`) | Keep |
| `user:read` | `/userinfo` (current user's own profile) | Keep |
| `offline_access` | Refresh tokens (§4) | Keep |

- [x] Only `data:create` was genuinely unused — removed from the scope string at
      [index.html:1558](public/index.html:1558). Everything else the app requests, it
      actually exercises somewhere in the codebase.

## 4. Token Handling `[BLOCKING]` — Mostly done, applied locally, not yet deployed

- [x] `offline_access` requested; `authorization_code` and `refresh_token` grants both
      capture the `refresh_token` Autodesk returns and store it — see
      `storeApsRefreshToken()`/`getStoredApsRefreshToken()` in `server.js`, using the exact
      same AES-256-GCM scheme as everything else (no second encryption path added).
- [x] Silent refresh implemented: `scheduleTokenRefresh()` in `index.html` renews the access
      token ~5 minutes before it expires, re-scheduling itself each time; on failure it falls
      back to the "Login with Autodesk" screen instead of silently breaking. This only keeps
      an already-connected session alive — it does not reconnect automatically on a later
      visit or page load.
- [ ] **Reverted by request**: auto-reconnecting on page load (skipping the "Login with
      Autodesk" click entirely when a valid stored connection existed) was tried and then
      explicitly rolled back — it made the app's licensing gate feel invisible, since a
      customer with a prior connection would never see the login card at all. Every visit
      now requires an explicit click, same as before this section's work started; only the
      mid-session keep-alive (above) remains.
- [x] The refresh token itself never reaches the browser — `/api/aps/token` now only ever
      returns `access_token`/`expires_in`/`token_type`, for every grant type, even though
      Autodesk's own response includes the refresh token. Access tokens still only ever live
      in a JS variable, never `localStorage`/`sessionStorage`.

## 5. Region Routing — Verified not applicable, no code change needed

- [x] Researched directly against Autodesk's own documentation (dated, not assumed from
      memory): *"3/18, 2024 update: All BIM 360 and Forma (Autodesk Forma) API supports
      automatic region routing"* and, on the same page, *"Data Management API is not
      affected."* The only APIs that ever needed a manual region header are Model Derivative
      (thumbnails/manifests/metadata) and the pre-v7.27 Viewer — confirmed via a full audit
      that this app calls neither anywhere. Every API this app actually uses (Data
      Management hubs/projects/folders, Construction Admin, HQ, BIM 360 Admin, BIM 360 Docs
      permissions) is either explicitly unaffected or auto-routed by Autodesk's backend.
      `selectHub`'s unused `hubRegion` parameter isn't a bug — nothing needs it. The original
      meeting-notes warning was accurate historically (pre-2024) but Autodesk resolved this
      server-side since.

## 6. Documented APIs Only `[BLOCKING]`

- [x] Rewrite the comment at
      [update_project_users.js:8-11](public/update_project_users.js:8) — it used to
      describe discovering the endpoint via *"the real ACC 'Members' page's own network
      traffic."* The endpoint itself is documented and unchanged; only the comment's wording
      changed, to state it as a documented-API fact instead of a reverse-engineering
      narrative. Done locally — not yet committed or deployed.

## 7. Remove Incompleteness / Beta Signals `[BLOCKING]` — Done, applied locally

- [x] Scrubbed "coming soon" wording for the Admin Dashboard — [README.md:20](README.md:20)
      and [README.md:86](README.md:86). It was just stale docs; `admin.html` has existed and
      worked the whole time.
- [x] Removed the `?demo=true` Firebase-auth bypass entirely — deleted `isDemoMode`, the
      unauthenticated init path, `displayDemoInfo()`, and the two conditionals in
      `update_project_users.js` that referenced it (fixed to always send the real auth
      header now that there's no other mode).
- [x] Confirmed no "beta" wording anywhere in the app's own HTML/UI (checked all of
      `public/*.html`) and no other leftover demo-mode references anywhere in `public/`.

## 8. Licensing / Entitlement `[BLOCKING]` — Verified compliant, no code change needed

Since the digibuild.ch (Firebase) login stays as-is, licensing keeps using the **existing
Firebase UID** — no re-keying to an Autodesk user id needed. Autodesk's own Entitlement API
(`checkentitlement`) is confirmed **desktop-only** anyway (it reads native desktop app APIs
like `LoginUserId`, and can't be called from a web app), so it was never an option here.

Traced the actual purchase → activation code path rather than assuming work was needed:

- [x] Activation is already automatic — `purchase.html` shows the license key on-screen
      immediately and builds a "Register Now" link with the key pre-filled in the URL
      ([purchase.html:399-400](public/purchase.html:399)); `register.html` auto-fills it
      ([register.html:319-321](public/register.html:319)); `/api/register-user` claims the
      license and creates the account atomically in one Firestore transaction. An existing
      account buying a license gets it applied automatically right after their next sign-in
      via a `pendingLicenseKey` handoff. The confirmation email is a receipt/backup, not the
      only way to get the key — this isn't the "email me a key" pattern Autodesk rejects.
- [x] A fresh signup with no license key gets an automatic 3-day trial, active immediately
      (`isTrial`/`trialEndDate`/`hasActiveAccess: true` set in the same transaction) — no
      manual step blocks first use.
- [x] Confirmed with a real test purchase (done ~2026-08, worked smoothly end-to-end) — not
      just a code trace.

## 9. EULA `[BLOCKING]` — Draft done, applied locally

- [x] Wrote `public/terms.html` — a Terms of Service covering the service description,
      accounts, trial/subscription/payment terms (accurately describes the actual one-time
      annual PayPal purchase — no auto-renewal claimed, since none exists), acceptable use,
      the Autodesk relationship disclosure, IP, warranty disclaimer, liability cap,
      termination, governing law (Switzerland — confirm), and contact.
- [x] Added a first-login "Accept Terms" gate — `showTermsGate()` in `index.html`, blocking
      until the user checks a box and clicks Continue; recorded server-side via the new
      `POST /api/accept-terms` (`termsAcceptedAt` on the user's Firestore doc). Wired into
      `/api/validate-login`'s response (`termsAccepted` field). Admins are exempt (they're
      the operator, not a customer) so this only shows for real customers.
- [x] Linked from `login.html`, `register.html`, and `purchase.html` footers.
- **Still open, on you**: this is a first draft, not a substitute for real legal review —
      please read it yourself and have someone qualified check it (especially the governing
      law and liability sections) before treating it as final. Once approved, the same text
      needs to go in the App Store listing description field too.

## 10. Privacy Policy `[BLOCKING]` — Draft done, applied locally

- [x] Wrote `public/privacy.html` covering everything required: what's collected and why
      (account info, cached ACC user/role/company/folder-permission data — explicitly *not*
      project files, encrypted Autodesk tokens), the third parties involved (Google
      Cloud/Firebase in europe-west6/Zurich, Autodesk, PayPal, the email provider) and that
      each protects data to an equivalent standard, retention (30 days after account
      closure, per your call), how to revoke consent/request deletion
      (digibuild@digibuild.ch)
      and how to revoke the Autodesk connection independently (via ACC's own Custom
      Integrations panel — ties to §4), and token handling.
- [x] Linked from the same first-login gate as the Terms, plus `login.html`,
      `register.html`, and `purchase.html` footers.
- **Still open, on you**: same as §9 — real legal review recommended before treating this as
      final, and it needs to be linked from the App Store listing page itself once you're at
      the submission step (§14).

## 11. APS Client ID Display Page — Done, applied locally

- [x] Autodesk's BIM 360 publisher page requires: *"a page that displays your APS Client ID
      and app name so users can add it as an integration"* — the Settings modal already
      showed the live Client ID; added an explicit "App Name: Forma User Management" line
      right above it so both are paired together in one place, not just on the same screen.

## 12. Data Exposure `[VERIFY]` — Real finding, fixed, applied locally

Audited for shareable links, public storage, and any client-side path that bypasses the
server's own auth checks:

- [x] No Google Cloud Storage usage anywhere in the app (no `@google-cloud/storage`, no
      bucket calls) — all data lives in Firestore, reached only through server.js. Static
      files are scoped to `public/` with `dotfiles: 'deny'`. No "share link"/public-link
      feature exists anywhere in the codebase.
- [x] **Real finding, now fixed**: `admin.html`'s "Extend License" action wrote directly to
      Firestore from the browser (`licenses`/`users` collections) — the only admin action
      that didn't go through a server endpoint. Since the Firebase JS SDK is not itself a
      security boundary, this depended entirely on Firestore security rules (not in this
      repo, configured in the Firebase Console) to stop a non-admin from replaying that same
      write from their own browser console and granting themselves unlimited license time.
      Fixed by adding `POST /api/admin/extend-license` (`authenticateAdmin`-gated, mirrors
      the existing `/api/admin/revoke-license` pattern exactly) and pointing `admin.html` at
      it instead.
- [x] Swept the rest of the app for the same pattern: `index.html` and `login.html` both
      still initialized a client-side Firestore instance (`db = firebase.firestore()`) with
      **zero actual `.collection()` calls** anywhere in either file — dead code left over
      from before everything moved server-side. Removed the unused `db` variable and the
      now-unnecessary `firebase-firestore-compat.js` script tag from all three files
      (`index.html`, `login.html`, `admin.html`) — no client-side Firestore access remains
      anywhere in the app at all.

## 13. Publisher Registration & Business Setup `[NON-CODE]`

- [ ] Register as a publisher at apps.autodesk.com (company or individual details).
- [ ] Accept the Publisher Agreement (includes Exhibit A minimum EULA terms — feeds §9).
- [ ] No PayPal setup needed for the listing itself — it's submitted as Free (see decisions
      above). Your existing PayPal integration for real subscriptions is unaffected and
      stays exactly as-is on your own site.
- [ ] Provide a support contact (email or page) — required field on the submission form.

## 14. Submission Assets `[NON-CODE]`

- [ ] App icon, 120x120px recommended, no company/app name baked into the image.
- [ ] Up to 10 screenshots.
- [ ] App description (≤4000 characters) — can include formatted text, links, EULA text.
- [ ] Price: **Free** (see decisions above — real billing stays on your own site).
- [ ] Select "login type" on the submission form (how a user logs into your web service —
      confirm this maps to "Sign in with Autodesk" / 3-legged OAuth).
- [ ] Select App Compatibility: ACC and/or BIM 360, plus up to 4 relevant categories.

---

## Open item to close with Autodesk directly

Send the exact sentence from the original meeting notes — *"Create a server-to-server APS
app as the owner; the 'traditional web app' type won't let you configure all Forma
extension types"* — to Autodesk (`appsubmissions@autodesk.com`) or whoever ran that meeting,
and ask them to point at the specific screen/doc it came from. Current evidence (official
BIM 360 publisher page + Enlaye's live listing) strongly supports Traditional Web App being
correct for this app, but this is the one architectural decision worth a direct
confirmation before it's too costly to reverse.
