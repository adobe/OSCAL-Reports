# Okta SSO and OIDC Integration

Step-by-step guide for **Okta SSO integration** and **role inheritance from Okta groups** for the OSCAL SOA/SSP/CCM Generator. Covers the **amsgovcloud.com.au** deployment and other environments (e.g. keekar.3utilities.com, local development).

---

## Table of Contents

1. [What You Get](#what-you-get)
2. [Best practices adopted in this project](#best-practices-adopted-in-this-project)
3. [Generic_OIDC (Authentik) — local and Docker](#generic_oidc-authentik--local-and-docker)
4. [Application URLs by Environment](#application-urls-by-environment)
5. [Where to Do What – Quick Map](#where-to-do-what--quick-map)
6. [Okta Admin Console – Application](#okta-admin-console--application)
7. [Okta Admin Console – Groups Claim (for role inheritance)](#okta-admin-console--groups-claim-for-role-inheritance)
8. [OSCAL App – SSO Settings](#oscal-app--sso-settings)
9. [Groups Claim & Role Mapping](#groups-claim--role-mapping)
10. [Checklist & Verification](#checklist--verification)
11. [Troubleshooting](#troubleshooting)
12. [Chrome "Dangerous site" / Safe Browsing warning](#chrome-dangerous-site--safe-browsing-warning)
13. [References](#references)

---

## What You Get

- **SSO:** Users sign in with Okta (no app password).
- **Role inheritance:** App role (Platform Admin, Assessor, User) is derived from **Okta group membership** and synced on every login.
- **JIT (optional):** New users can be auto-created on first sign-in with a default or group-derived role.

**Login flow:** User clicks "Sign in with Okta" → redirect to Okta → sign-in → redirect back to app with authorization code → app exchanges code for tokens and creates a session.

---

## Best practices adopted in this project

This section summarizes the **SSO/OIDC patterns and best practices** implemented in the OSCAL Report Generator. They align with OWASP, OAuth 2.0 / OIDC standards, and operational security.

### OAuth 2.0 / OIDC security

| Practice | Implementation |
|----------|-----------------|
| **Authorization Code flow only** | No implicit flow; the app uses `response_type=code` and exchanges the code for tokens server-side. |
| **PKCE (RFC 7636)** | Every authorize request sends `code_challenge` (S256) and `code_challenge_method=S256`. At token exchange, `code_verifier` is sent. Required when Okta has "Require PKCE" enabled; harmless otherwise. |
| **State parameter (CSRF)** | State is **signed** (HMAC-SHA256 with client secret). Payload includes `redirect_uri`, `code_verifier`, and timestamp. Validated at callback; works across server restarts and load-balanced instances without a shared store. |
| **Redirect URI binding** | The callback uses the `redirect_uri` from the validated state (or config). Must match exactly what was sent to Okta (no trailing slash, same scheme/host/path). |
| **Scopes** | Default requested scope is `openid profile email`. The app does **not** require a `groups` scope; Okta can include the groups claim with **Include in: Always** to avoid scope misconfiguration. |

### Groups and role mapping

| Practice | Implementation |
|----------|-----------------|
| **Groups from multiple sources** | Groups are merged from **userinfo** response, **access token** JWT, and **ID token** JWT. Okta often puts groups only in tokens; the backend merges all sources so role resolution works regardless. |
| **Highest-privilege role** | When multiple Okta groups map to different app roles, the app assigns the **highest** role (Platform Admin > Assessor > User). |
| **Case-insensitive group match** | Group names in the mapping are matched case-insensitively against IdP group names. |
| **Sync role on every login** | Optional "Sync role from Okta groups on every login" updates the user’s app role on each sign-in from current group membership (configurable in Settings). |

### Group-to-role mapping interface (Settings → SSO Integration)

- **Add mapping:** Enter Okta group name and select app role (User, Assessor, Platform Admin); add multiple rows.
- **Edit:** Change group name or role per row.
- **Remove:** Per-row "Remove" to delete a mapping.
- **Default role for new users:** Used when no group matches or groups claim is missing (e.g. User, Assessor, Platform Admin).
- **JIT provisioning & role:** Toggle "Enable JIT provisioning"; "Default role for new users"; "Sync role from Okta groups on every login."

### JIT (just-in-time) provisioning

| Practice | Implementation |
|----------|-----------------|
| **Optional JIT** | Configurable in Settings → SSO Integration. When enabled, users not in the app’s user list are created on first sign-in. |
| **Default role** | Configurable (User, Assessor, Platform Admin). Used for JIT-created users when no group matches. |
| **Group-derived role** | JIT-created users get the role resolved from Okta groups (same mapping as existing users). |
| **Reactivation** | If an existing user is deactivated, successful Okta sign-in (with JIT or pre-existing user) can reactivate the account. |
| **Audit** | JIT-created users are tagged with `createdVia: 'oidc-jit'` for traceability. |

### Client secret and sensitive config

| Practice | Implementation |
|----------|-----------------|
| **Pass vault (preferred)** | When [pass](https://www.passwordstore.org/) is available, saving the Okta client secret in the GUI stores it in pass; only a `_pass` pointer is written to config. At runtime the app resolves the pointer. |
| **Fallback (no pass)** | If pass is not installed or unavailable, the secret is stored as plaintext in config; the API may warn. |
| **Env override** | `OSCAL_OKTA_CLIENT_SECRET` on the server overrides config/pass (e.g. for EC2 or containers where pass is not used). |
| **API masking** | Client secrets are never returned to the client; the Settings API returns masked values or placeholders. |

---

## Generic_OIDC (Authentik) — local and Docker

Release **1.7.20** adds a built-in OIDC provider **`Generic_OIDC`** for **Authentik** (default discovery host `sso.keekar.au`). Use it on **local laptop** and **Docker** where Okta is not the primary IdP. **EC2 (AMS Gov Cloud)** continues to use **Okta**; Generic_OIDC may still appear in config but production sign-in is Okta-first.

### Login page (1.7.20)

| Area | Behaviour |
|------|-----------|
| **Upper form** | Username/password, **Sign in with Okta** (when Okta is enabled). |
| **Lower panel** | **Sign in with Generic SSO** (Authentik orange button) when `Generic_OIDC` is enabled, followed by access-policy text (15-user cohort, 30-day dormancy, SMTP retirement). |
| **Expedited entry (optional)** | Shown only when **not** on EC2 (`showExpeditedAccessPolicy` from `GET /api/auth/sso/login-providers`; false when `OSCAL_SECRETS_MODE=aws-sm`). |
| **Email self-registration UI** | Removed from login page; `POST /api/auth/self-register` remains for now (Messaging tab unchanged). |

### Routes and config

| Item | Value |
|------|--------|
| **Provider id** | `Generic_OIDC` (in `ssoConfig.oauth.providers`) |
| **Authorize** | `GET /api/auth/oidc/generic-oidc/authorize` |
| **Token exchange** | `POST /api/auth/oidc/generic-oidc/exchange-token` |
| **Frontend callback** | `/auth/callback` → `GenericOidcCallback.jsx` |
| **Redirect URI allowlist** | Host/scheme validated in `genericOidc.js` (localhost, configured public hosts) |
| **Client secret** | `{ "_cfgenc": … }` in `config.json.example`; resolved at runtime via `configFieldCrypto.js` / SM on EC2 |
| **Settings UI** | Settings → SSO Integration: read-only Generic OIDC card + enable toggle |

### User lifecycle (local Generic SSO)

- Inactive **self-registered** users are deactivated after **30 days** (`userCleanup.js`); email blocklist cooldown is **30 days**.
- Hard delete after deactivation remains **45 days** (admin lifecycle in `userManager.js`).

See **`config/app/config.json.example`** for the default `Generic_OIDC` block and **`docs/CHANGELOG.md`** for release notes.

### TLS and `tlsRelaxed` (1.7.21)

Some IdPs (including Authentik on `sso.keekar.au` with certain Let's Encrypt chains) serve a certificate chain that **browsers and curl accept** but **Node.js 20 / OpenSSL in Alpine** rejects with `UNABLE_TO_GET_ISSUER_CERT_LOCALLY` during OIDC discovery.

| Approach | When to use |
|----------|-------------|
| **Fix IdP chain (preferred)** | Serve the full chain to ISRG Root X1 on the reverse proxy; then leave `tlsRelaxed: false`. |
| **`tlsRelaxed: true`** | Set on `ssoConfig.oauth.providers.Generic_OIDC` in `config.json` (Docker/NAS bind-mount) when you cannot change the IdP chain immediately. Discovery/token/userinfo calls skip strict TLS verification for that provider only. |
| **`OSCAL_GENERIC_OIDC_TLS_RELAXED=1`** | Container/env override when config is not writable. |

SSO Integration → Test connection surfaces whether `tlsRelaxed` is active. **Do not enable on EC2 production** unless Adobe security approves; EC2 production sign-in remains **Okta**.

---

## Application URLs by Environment

Use the **exact** values below when Okta asks for Initiate login URI, Callback URI, and Logout redirect URIs. The **Redirect URI** in the OSCAL app must match the Okta Callback URI for that environment.

| Environment | Base URL | Initiate login URI | Callback URI (Sign-in redirect) | Logout redirect |
|-------------|----------|--------------------|----------------------------------|-----------------|
| **AMS Gov Cloud** | **https://oscal.amsgovcloud.com.au/** | `https://oscal.amsgovcloud.com.au/api/auth/okta/authorize` | `https://oscal.amsgovcloud.com.au/auth/okta/callback` | `https://oscal.amsgovcloud.com.au/` |
| **Production (Keekar)** | https://keekar.3utilities.com/ | `https://keekar.3utilities.com/api/auth/okta/authorize` | `https://keekar.3utilities.com/auth/okta/callback` | `https://keekar.3utilities.com/` |
| **Local development** | http://localhost:3021/ | (app-derived) | `http://localhost:3021/auth/okta/callback` | `http://localhost:3021/` |

---

## Where to Do What – Quick Map

| # | Where | What |
|---|--------|------|
| 1 | **Okta Admin** → Applications | Create/configure OIDC app; set **Initiate login URI** and **Callback URI** for your deployment (e.g. oscal.amsgovcloud.com.au). |
| 2 | **Okta Admin** → Security → API (Authorization Server) | Add **groups** claim so tokens contain group membership (required for role inheritance). |
| 3 | **OSCAL App** → Settings → SSO Integration | Enable OAuth + Okta; set Domain, Client ID, Client Secret, Redirect URI; configure **group → role** mapping and "Sync role from Okta groups". |
| 4 | Browser | Sign in with Okta and confirm role in app. |

---

## Okta Admin Console – Application

**Where:** [Okta Admin Console](https://help.okta.com/en-us/content/topic/okta-admin-console.htm) (e.g. `your-org.okta.com` or `your-org.oktapreview.com`).

1. Go to **Applications** → **Applications** → **Create App Integration**.
2. Select **OIDC - OpenID Connect** and **Web Application** (or Single-Page Application). Click **Next**.
3. Configure (use values from [Application URLs by Environment](#application-urls-by-environment) for your deployment):

   | Field | Example for oscal.amsgovcloud.com.au |
   |-------|-------------------------------------|
   | **App name** | e.g. `OSCAL Report Generator (amsgovcloud)` |
   | **Grant type** | ✅ Authorization Code |
   | **Initiate login URI** | `https://oscal.amsgovcloud.com.au/api/auth/okta/authorize` |
   | **Callback URI** (Sign-in redirect URIs) | `https://oscal.amsgovcloud.com.au/auth/okta/callback` |
   | **Logout redirect URIs** | `https://oscal.amsgovcloud.com.au/` |

4. **Controlled access:** Assign to the right groups or "Everyone". Click **Save**.
5. Note **Client ID** and **Client Secret** — you will enter these in the OSCAL app.

---

## Okta Admin Console – Groups Claim (for role inheritance)

To get **role inheritance from Okta groups**, the authorization server must include a **groups** claim in the access token (or ID token).

**Where:** Okta Admin → **Security** → **API** → **Authorization Servers**.

### Option A: Custom Authorization Server (recommended)

1. Use an existing Custom Authorization Server or **Add Authorization Server**. Note its **Issuer** or ID (e.g. `default`) — use this as **Authorization Server ID** in the OSCAL app.
2. Open that Authorization Server → **Claims** → **Add Claim**:
   - **Name:** `groups`
   - **Include in token type:** Access Token (and ID token if desired).
   - **Value type:** **Groups**.
   - **Filter:** e.g. `.*` for all groups, or `^OSCAL-` for specific groups.
3. Set **Include in** to **Always** so the claim is in the token without requiring a separate `groups` scope (avoids "One or more scopes are not configured").
4. Ensure your Application (from the previous section) uses this Authorization Server.

### Option B: Default org authorization server

- With the **default** org server, you can often add a **groups** claim to the **ID token** only. The OSCAL app reads groups from both access and ID tokens, so ID token groups will work.

### Avoid "One or more scopes are not configured"

- The app does **not** request a `groups` scope by default. In Okta, set the `groups` claim to **Always** include in the token (Claims → groups → Include in: Always). Then you do not need a `groups` scope.

---

## OSCAL App – SSO Settings

**Where:** Your app URL (e.g. https://oscal.amsgovcloud.com.au/ or https://keekar.3utilities.com/) → log in (e.g. as Platform Admin) → **Settings** (gear) → **SSO Integration**.

1. **OAuth 2.0 / OpenID Connect:** Enable **OAuth** and **Okta**.
2. Fill in:

   | Field | Value |
   |-------|--------|
   | **Okta Domain** | Your Okta host, e.g. `your-org.okta.com` (no `https://`, no path, no trailing slash) |
   | **Authorization Server ID** | The ID from the Groups Claim step (e.g. `default`), or leave blank if using org server |
   | **Client ID** | From Okta app |
   | **Client Secret** | From Okta app |
   | **Redirect URI** | Must match Okta exactly, e.g. `https://oscal.amsgovcloud.com.au/auth/okta/callback` or `https://keekar.3utilities.com/auth/okta/callback` |

3. **Redirect URI** must be **exactly** what you added in Okta (same scheme, host, path). If the app derives it from the current origin, ensure you are on the correct base URL when saving.
4. (Optional) **Scope:** e.g. `openid profile email` or `openid profile email groups` if you added a groups scope.
5. Click **Save Settings**.

---

## Groups Claim & Role Mapping

### In the OSCAL App (Settings → SSO Integration)

1. **Sync role from Okta groups on every login:** leave **on** for role inheritance.
2. **Okta group → app role mapping:** Add rows, e.g.:

   | Okta group name | App role |
   |-----------------|----------|
   | `OSCAL-Admins`  | Platform Admin |
   | `OSCAL-Assessors` | Assessor |
   | `OSCAL-Users`   | User |

   Use the **exact** Okta group names (case-insensitive match in app).
3. **Default role for new users:** e.g. **User** (used when no group matches or groups claim is missing).
4. **JIT provisioning:** Enable if you want users not in the app’s user list to be created on first sign-in.

The app reads groups from the **userinfo** response and from the **access token** and **ID token**, then resolves the highest matching role.

---

## Checklist & Verification

### Okta Admin

- [ ] Application created (OIDC, Web or SPA).
- [ ] **Sign-in redirect URI** matches your deployment (e.g. `https://oscal.amsgovcloud.com.au/auth/okta/callback`).
- [ ] Client ID and Client Secret copied.
- [ ] Authorization Server has `groups` claim with **Include in: Always** (or scope granted if using a groups scope).

### OSCAL App

- [ ] Settings → SSO Integration: OAuth and Okta enabled.
- [ ] Okta Domain, Authorization Server ID, Client ID, Client Secret set.
- [ ] **Redirect URI** matches Okta exactly for your environment.
- [ ] Group → role mapping and "Sync role from Okta groups" configured.
- [ ] Settings saved.

### Test

1. Open a private/incognito window and go to your app URL.
2. Click **Sign in with Okta**.
3. Sign in at Okta; you should be redirected back and signed in.
4. Confirm your **role** in the app (e.g. in the header or Settings). It should match the role for the Okta group(s) you belong to. If you are in multiple mapped groups, the app assigns the **highest** role (Platform Admin > Assessor > User).

---

## Troubleshooting

| Issue | What to check |
|-------|----------------|
| **"One or more scopes are not configured for the authorization server resource"** | Set the `groups` claim in Okta to **Always** include in the token (no `groups` scope). The app only requests `openid profile email` by default. |
| "Okta sign-in is not configured" | Enable OAuth and Okta in Settings → SSO Integration; ensure Client ID and Domain are set. |
| "Redirect URI mismatch" | Redirect URI in Okta and in the app must match **exactly** (e.g. `https://oscal.amsgovcloud.com.au/auth/okta/callback` — no trailing slash, correct scheme and host). |
| "Invalid or expired state" | Complete sign-in within a few minutes; avoid refreshing the Okta callback URL; try "Sign in with Okta" again from the login page. |
| "Code may be expired" | Complete the Okta login and return to the app within about a minute. |
| **"The client secret supplied for a confidential client is invalid"** | Okta is rejecting the client secret. In Okta Admin: (1) Confirm **Client ID** matches. (2) **Client secret** must match exactly — copy from Okta or regenerate and update app config / `OSCAL_OKTA_CLIENT_SECRET` on the server. (3) **Sign-in redirect URIs** must include your callback (e.g. `https://oscal.amsgovcloud.com.au/auth/okta/callback`). On EC2, set secret via env `OSCAL_OKTA_CLIENT_SECRET` or ensure config has the correct secret. |
| Role not updating from groups | Okta: Authorization Server has `groups` claim; set Include in **Always** or ensure scope is granted. OSCAL: "Sync role from Okta groups" on; group → role mapping has correct Okta group names. |
| User not found / 403 | Enable JIT provisioning in Settings → SSO, or add the user's email to **Users** (Platform Admin). |
| **Chrome "Dangerous site" / Safe Browsing warning** | See [Chrome Safe Browsing warning](#chrome-dangerous-site--safe-browsing-warning) below. |

### How secrets are stored

- **With pass:** If the server has [pass](https://www.passwordstore.org/) and the store is available, saving the Okta client secret in the GUI stores it in pass and only a `_pass` pointer is written to config. At runtime the app resolves the pointer and uses the secret.
- **Without pass (e.g. EC2):** If pass is not installed or not available, saving the client secret in the GUI stores it as **plaintext in config**. The API may return a warning that the secret was stored in config.
- **Env override:** Setting `OSCAL_OKTA_CLIENT_SECRET` on the server overrides the config/pass value (e.g. systemd `Environment=OSCAL_OKTA_CLIENT_SECRET=...`).
- **Okta domain:** You can enter the domain with or without `https://` in the GUI; the app normalizes it to hostname only when saving.

---

### Chrome "Dangerous site" / Safe Browsing warning

When you click **Sign in with Okta**, Chrome may show a red **"Dangerous site"** or **"Deceptive site ahead"** page. This is **Google Safe Browsing** flagging the domain (often the app URL or the page Okta redirects back to). It can be a **false positive**, especially for personal or small domains.

**What to do:**

1. **Confirm which URL is flagged** — Note whether the warning appears when you open the app, when Okta redirects you back (callback URL), or on the Okta domain.
2. **Request a review from Google (if you own the site)** — On the Chrome warning page, use **"Details"** then **"Report that this site doesn't pose a danger"**. Or use [Google Safe Browsing – Request a review](https://safebrowsing.google.com/safebrowsing/report_error/?hl=en). Reviews can take hours to a few days.
3. **Temporary workaround (only if you fully trust the site)** — On the warning page, click **"Details"**, then **"Visit this unsafe site"**. Use only on a trusted network and only for a site you control.
4. **Use another browser or device** — Try signing in via Okta in Firefox or Safari; they may not show the warning.
5. **Verify your site is not compromised** — Ensure server and app are up to date, no injected content or malware, and HTTPS is valid.

**For users (not site owners):** Ask the site owner to request a Safe Browsing review. Do not bypass the warning unless your organization has confirmed the site is safe.

---

## Server-side HTTP (Axios)

Any **backend** OIDC-related HTTP client code that uses **Axios** must import **`backend/utils/safeAxios.js`** (not the `axios` package directly) so merged outbound headers are validated for CR/LF (**CWE-113**). Do not log full authorization headers or client secrets in structured logs. See **docs/BEST_PRACTICES.md** (*Outbound HTTP (Axios)*) and **.cursor/rules/security-standards.mdc**.

---

## References

- [Okta Admin Console](https://help.okta.com/en-us/content/topic/okta-admin-console.htm)
- [Okta OIDC and OAuth 2.0](https://developer.okta.com/docs/concepts/oauth-openid/)
- AMS Gov Cloud app: [https://oscal.amsgovcloud.com.au/](https://oscal.amsgovcloud.com.au/)
- Production (Keekar): [https://keekar.3utilities.com/](https://keekar.3utilities.com/)

---

**Version:** 1.7.21 · **Last updated:** June 2026
