# Okta SSO and Role Inheritance – OSCAL at amsgovcloud.com.au

Step-by-step guide to complete **Okta SSO integration** and **role inheritance from Okta groups** for the application hosted at **https://oscal.amsgovcloud.com.au/**.

---

## Table of Contents

1. [What You Get](#what-you-get)
2. [Where to Do What – Quick Map](#where-to-do-what--quick-map)
3. [Step 1: Okta Admin Console – Application](#step-1-okta-admin-console--application)
4. [Step 2: Okta Admin Console – Groups Claim (for role inheritance)](#step-2-okta-admin-console--groups-claim-for-role-inheritance)
5. [Step 3: OSCAL App – SSO Settings](#step-3-oscal-app--sso-settings)
6. [Step 4: Verify Login and Role](#step-4-verify-login-and-role)
7. [Troubleshooting](#troubleshooting)

---

## What You Get

- **SSO:** Users sign in with Okta (no app password).
- **Role inheritance:** App role (Platform Admin, Assessor, User) is derived from **Okta group membership** and synced on every login.
- **JIT (optional):** New users can be auto-created on first sign-in with a default or group-derived role.

---

## Where to Do What – Quick Map

| # | Where | What |
|---|--------|------|
| 1 | **Okta Admin** → Applications | Create/configure OIDC app; set **Initiate login URI** and **Callback URI** for oscal.amsgovcloud.com.au. |
| 2 | **Okta Admin** → Security → API (Authorization Server) | Add **groups** claim so tokens contain group membership (required for role inheritance). |
| 3 | **OSCAL App** → Settings → SSO Integration | Enable OAuth + Okta; set Domain, Client ID, Client Secret, Redirect URI; configure **group → role** mapping and “Sync role from Okta groups”. |
| 4 | Browser | Sign in with Okta and confirm role in app. |

---

## Step 1: Okta Admin Console – Application

**Where:** [Okta Admin Console](https://help.okta.com/en-us/content/topic/okta-admin-console.htm) (e.g. `your-org.okta.com`).

1. Go to **Applications** → **Applications** → **Create App Integration**.
2. Select **OIDC - OpenID Connect** and **Web Application** (or Single-Page Application). Click **Next**.
3. Configure:

   | Field | Value for oscal.amsgovcloud.com.au |
   |-------|-------------------------------------|
   | **App name** | e.g. `OSCAL Report Generator (amsgovcloud)` |
   | **Grant type** | ✅ Authorization Code |
   | **Initiate login URI** | `https://oscal.amsgovcloud.com.au/api/auth/okta/authorize` |
   | **Callback URI** (Sign-in redirect URIs) | `https://oscal.amsgovcloud.com.au/auth/okta/callback` |
   | **Logout redirect URIs** | `https://oscal.amsgovcloud.com.au/` |

4. **Controlled access:** Assign to the right groups or “Everyone”. Click **Save**.
5. Note **Client ID** and **Client Secret** — you will enter these in the OSCAL app (Step 3).

---

## Step 2: Okta Admin Console – Groups Claim (for role inheritance)

To get **role inheritance from Okta groups**, the authorization server must include a **groups** claim in the access token (or ID token). This is done in the **Authorization Server** that your app uses.

**Where:** Okta Admin → **Security** → **API**.

### Option A: Custom Authorization Server (recommended for groups in access token)

1. **Security** → **API** → **Authorization Servers**.
2. Use an existing Custom Authorization Server or **Add Authorization Server**. Note its **Issuer** or ID (e.g. `default`) — you will use this as **Authorization Server ID** in the OSCAL app.
3. Open that Authorization Server → **Claims** tab → **Add Claim**:
   - **Name:** `groups`
   - **Include in token type:** Access Token (and ID token if you want).
   - **Value type:** Groups.
   - **Filter:** e.g. `.*` for all groups, or a regex for specific groups (e.g. `^OSCAL-`).
4. **Scopes** tab: Ensure a scope (e.g. `groups`) includes this claim, and that your Access Policy grants that scope to the client.
5. In your **Application** (from Step 1), under Sign-on or Grant type, ensure the app is configured to use this Authorization Server (so the token request uses it).

### Option B: Default org authorization server

- With the **default** org server, you can often add a **groups** claim to the **ID token** only (not the access token). Add a claim as above and include it in the ID token. The OSCAL app reads groups from both access and ID tokens, so ID token groups will work.

### Ensure scope includes groups

- When the OSCAL app has group-to-role mapping or “Sync role from Okta groups” enabled, it requests the `groups` scope automatically. In Okta, ensure the scope that contains the `groups` claim is granted by your Access Policy for this client.

---

## Step 3: OSCAL App – SSO Settings

**Where:** https://oscal.amsgovcloud.com.au/ → log in (e.g. as Platform Admin) → **Settings** (gear) → **SSO Integration**.

1. **OAuth 2.0 / OpenID Connect:** Enable **OAuth** and **Okta**.
2. Fill in:

   | Field | Value |
   |-------|--------|
   | **Okta Domain** | Your Okta host, e.g. `your-org.okta.com` (no `https://`, no path, no trailing slash) |
   | **Authorization Server ID** | The ID from Step 2 (e.g. `default`), or leave blank if using org server |
   | **Client ID** | From Step 1 (Okta app) |
   | **Client Secret** | From Step 1 (Okta app) |
   | **Redirect URI** | `https://oscal.amsgovcloud.com.au/auth/okta/callback` (must match Okta exactly) |

3. **JIT provisioning & role from Okta groups:**
   - **Enable JIT provisioning** if you want users not in the app’s user list to be created on first sign-in.
   - **Default role for new users:** e.g. User (used when no group matches).
   - **Sync role from Okta groups on every login:** leave **on** for role inheritance.
4. **Okta group → app role mapping:** Add rows, e.g.:

   | Okta group name | App role |
   |-----------------|----------|
   | `OSCAL-Admins`  | Platform Admin |
   | `OSCAL-Assessors` | Assessor |
   | `OSCAL-Users`   | User |

   Use the **exact** Okta group names (case-insensitive match in app). Add/remove rows as needed.

5. Click **Save Settings**.

---

## Step 4: Verify Login and Role

1. Open https://oscal.amsgovcloud.com.au/ in a private/incognito window.
2. Click **Sign in with Okta**.
3. Sign in at Okta; you should be redirected back and signed in.
4. Confirm your **role** in the app (e.g. in the header or Settings). It should match the role for the Okta group(s) you belong to. If you are in multiple mapped groups, the app assigns the **highest** role (Platform Admin > Assessor > User).

---

## Troubleshooting

| Issue | Where to check |
|------|-----------------|
| “Okta sign-in is not configured” | OSCAL app: Settings → SSO → OAuth and Okta enabled; Okta Domain and Client ID set. |
| Redirect URI mismatch | Okta app Callback URI and OSCAL Redirect URI must be exactly `https://oscal.amsgovcloud.com.au/auth/okta/callback`. |
| Role not updating from groups | Okta: Authorization Server has `groups` claim; scope that includes groups is granted. OSCAL: “Sync role from Okta groups” on; group → role mapping has correct Okta group names. |
| User not found / 403 after Okta login | Enable JIT provisioning in Settings → SSO, or add the user’s email to **Users** (Platform Admin). |
| Invalid or expired state | Complete sign-in within a few minutes; try “Sign in with Okta” again from the login page. |

For more detail on Okta OIDC and groups, see [OKTA_OIDC_INTEGRATION.md](OKTA_OIDC_INTEGRATION.md).
