# Okta OIDC Integration Guide

This guide walks you through integrating the OSCAL SOA/SSP/CCM Generator with Okta for sign-in and optional role mapping from Okta groups.

**For the deployment at https://oscal.amsgovcloud.com.au/**, use the step-by-step guide: [OKTA_SSO_AMSGOVCLOUD.md](OKTA_SSO_AMSGOVCLOUD.md).

---

## Table of Contents

1. [Application URLs](#application-urls)
2. [Overview](#overview)
3. [Okta Admin Console Setup](#okta-admin-console-setup)
4. [Application Settings (OSCAL App)](#application-settings-oscal-app)
5. [Groups Claim & Role Mapping](#groups-claim--role-mapping)
6. [Checklist & Verification](#checklist--verification)
7. [Troubleshooting](#troubleshooting)
8. [Chrome "Dangerous site" / Safe Browsing warning](#chrome-dangerous-site--safe-browsing-warning)

---

## Application URLs

Use these **exact** values when Okta asks for Initiate login URI, Callback URI, and Logout redirect URIs.

| Okta field | Production value |
|------------|------------------|
| **Initiate login URI** | `https://keekar.3utilities.com/api/auth/okta/authorize` |
| **Callback URI** (Sign-in redirect URI) | `https://keekar.3utilities.com/auth/okta/callback` |
| **Logout redirect URIs** | `https://keekar.3utilities.com/` |

| Environment | Base URL | Callback URI |
|-------------|----------|-------------------|
| **Production (Green)** | **https://keekar.3utilities.com/** | **https://keekar.3utilities.com/auth/okta/callback** |
| Local development | http://localhost:3021/ | http://localhost:3021/auth/okta/callback |

The production instance is the **Green** deployment exposed at [https://keekar.3utilities.com/](https://keekar.3utilities.com/). Use the **exact** URIs above when configuring Okta and the app.

---

## Overview

- **Login flow:** User clicks "Sign in with Okta" → redirect to Okta → sign-in → redirect back to app with authorization code → app exchanges code for tokens and creates a session.
- **Optional:** Okta can send a `groups` claim so the app maps Okta group membership to app roles (Platform Admin, Assessor, User).
- **JIT provisioning:** If enabled, users not in the app’s user list are created on first sign-in (with a default or group-derived role).

---

## Okta Admin Console Setup

### Step 1: Create or Use an Okta Application

1. Log in to [Okta Admin Console](https://help.okta.com/en-us/content/topic/okta-admin-console.htm) (e.g. `your-org.okta.com` or `your-org.oktapreview.com`).
2. Go to **Applications** → **Applications** → **Create App Integration**.
3. Choose **OIDC - OpenID Connect** and **Single-Page Application** or **Web Application** (this app uses **authorization code** flow; either type can work; if in doubt, choose **Web Application**).
4. Click **Next**.

### Step 2: Configure the Application

1. **App name:** e.g. `Keekar OSCAL Generator` or `OSCAL Report Generator (Production)`.
2. **Grant type:** Enable **Authorization Code**.
3. **Initiate login URI:** `https://keekar.3utilities.com/api/auth/okta/authorize`  
   (The app URL that starts the Okta login; the app also shows "Sign in with Okta" on the login page, which links here.)
4. **Callback URI** (Sign-in redirect URIs): Add **exactly**:
   - **Production:** `https://keekar.3utilities.com/auth/okta/callback`
   - (Optional) Local: `http://localhost:3021/auth/okta/callback`
5. **Logout redirect URIs:** Add `https://keekar.3utilities.com/` (where to send users after sign-out).
6. **Controlled access:** Assign to the right groups or "Everyone".
7. Click **Save**.

### Step 3: Note Client Credentials

- **Client ID** — copy; you will enter it in the OSCAL app.
- **Client Secret** — copy; you will enter it in the OSCAL app (required for token exchange).

### Step 4: Authorization Server (for groups claim)

- If you use the **default** org authorization server, you may have limited claim options.
- For a **groups** claim and full control, use a **Custom Authorization Server**:
  1. **Security** → **API** → **Add Authorization Server** (or use existing, e.g. `default`).
  2. Note the **Issuer** / ID (e.g. `default`). You will use this as **Authorization Server ID** in the app.

---

## Application Settings (OSCAL App)

Configure the OSCAL app so it uses your Okta tenant and the **production** redirect URI.

1. Log in to [https://keekar.3utilities.com/](https://keekar.3utilities.com/) (e.g. as Platform Admin).
2. Go to **Settings** (gear icon) → **SSO Integration**.
3. Under **OAuth 2.0 / OpenID Connect**, enable **OAuth** and **Okta**.
4. Fill in:

| Field | Value | Example |
|-------|--------|--------|
| **Okta Domain** | Your Okta host (no path, no trailing slash) | `your-org.okta.com` or `your-org.oktapreview.com` |
| **Authorization Server ID** | Custom server ID, or `default`, or leave blank for org server | `default` |
| **Client ID** | From Okta app | `0oaxxxxxxx` |
| **Client Secret** | From Okta app | (paste secret) |
| **Redirect URI** | **Must match Okta and environment** | **`https://keekar.3utilities.com/auth/okta/callback`** |

5. **Redirect URI** must be **exactly** what you added in Okta (same scheme, host, path). For production use **`https://keekar.3utilities.com/auth/okta/callback`**.
6. (Optional) **Scope:** e.g. `openid profile email` or `openid profile email groups` if you add a groups scope (see below).
7. Click **Save Settings**.

If the app does not show a Redirect URI field, it may derive it from the current origin; ensure you are on `https://keekar.3utilities.com` when saving so the stored redirect URI is correct.

---

## Groups Claim & Role Mapping

To map Okta groups to app roles (Platform Admin, Assessor, User):

### In Okta (Custom Authorization Server)

1. **Security** → **API** → select your Authorization Server (e.g. `default`).
2. **Claims** → **Add Claim**:
   - **Name:** `groups`
   - **Include in token type:** Access Token (and ID token if desired).
   - **Value type:** **Groups**.
   - **Filter:** e.g. `.*` for all groups, or a regex for specific groups.
3. **Scopes** → ensure a scope (e.g. `groups`) includes this claim, and that the scope is granted by your Access Policy.
4. In the **Okta Application** (Sign-on or Grant type section), ensure the requested scopes include the one that has the `groups` claim (e.g. `openid profile email groups`).

### In the OSCAL App (Settings → SSO Integration)

1. Enable **Sync role from Okta groups on every login**.
2. Under **Okta group → app role mapping**, add rows, e.g.:
   - Okta group name: `OSCAL-Admins` → App role: **Platform Admin**
   - Okta group name: `OSCAL-Assessors` → App role: **Assessor**
   - Okta group name: `OSCAL-Users` → App role: **User**
3. **Default role for new users:** e.g. **User** (used when no group matches or groups claim is missing).
4. Save settings.

The app reads groups from the **userinfo** response and from the **access token** and **ID token** (JWT payload), then resolves the highest matching role. Okta often puts groups in the token rather than userinfo; the backend merges all sources automatically.

---

## Checklist & Verification

### Okta Admin

- [ ] Application created (OIDC, Web or SPA).
- [ ] **Sign-in redirect URI** includes `https://keekar.3utilities.com/auth/okta/callback`.
- [ ] Client ID and Client Secret copied.
- [ ] (Optional) Custom Authorization Server with `groups` claim and scope; scope granted in Access Policy.

### OSCAL App (https://keekar.3utilities.com)

- [ ] Settings → SSO Integration: OAuth and Okta enabled.
- [ ] Okta Domain, Authorization Server ID, Client ID, Client Secret set.
- [ ] **Redirect URI** = `https://keekar.3utilities.com/auth/okta/callback`.
- [ ] (Optional) Group → role mapping and "Sync role from Okta groups" configured.
- [ ] Settings saved.

### Test

1. Open a private/incognito window and go to [https://keekar.3utilities.com/](https://keekar.3utilities.com/).
2. Click **Sign in with Okta**.
3. You should be redirected to Okta, then back to the app and signed in.
4. If you use groups, confirm your role in the app (e.g. Platform Admin, Assessor, User) matches the mapped Okta group.

---

## Troubleshooting

| Issue | What to check |
|-------|----------------|
| "Okta sign-in is not configured" | Enable OAuth and Okta in Settings → SSO Integration; ensure Client ID and Domain are set. |
| "Invalid or expired state" | Complete sign-in within a few minutes; avoid refreshing the Okta callback URL. |
| "Redirect URI mismatch" | Redirect URI in Okta and in the app must be **exactly** `https://keekar.3utilities.com/auth/okta/callback` (no trailing slash, `https`). |
| "Code may be expired" | Complete the Okta login and return to the app within about a minute. |
| Role not updating from groups | Ensure Okta returns a `groups` claim (Custom Authorization Server, claim + scope), and that "Sync role from Okta groups" and group → role mapping are set in the app. |
| User not found / 403 | Enable JIT provisioning in Settings → SSO, or add the user's email to Users (Platform Admin). |
| **Chrome "Dangerous site" / Safe Browsing warning** | See [Chrome Safe Browsing warning](#chrome-dangerous-site--safe-browsing-warning) below. |

For more detail on the groups claim in Okta, see the in-app note under Settings → SSO Integration (“Ensure your Okta Authorization Server returns a **groups** claim”).

---

### Chrome "Dangerous site" / Safe Browsing warning

When you click **Sign in with Okta**, Chrome may show a red **"Dangerous site"** or **"Deceptive site ahead"** page. This is **Google Safe Browsing** flagging the domain (often the app URL `keekar.3utilities.com` or the page Okta redirects back to). It can be a **false positive**, especially for personal or small domains.

**What to do:**

1. **Confirm which URL is flagged**  
   Note whether the warning appears when you open the app (`https://keekar.3utilities.com/`), when Okta redirects you back (`https://keekar.3utilities.com/auth/okta/callback`), or on the Okta domain. That tells you if the app domain or Okta is flagged.

2. **Request a review from Google (recommended if you own the site)**  
   If you control the domain and are sure it's safe:
   - On the Chrome warning page, use **"Details"** then **"Report that this site doesn't pose a danger"** (or similar).
   - Or use [Google Safe Browsing – Request a review](https://safebrowsing.google.com/safebrowsing/report_error/?hl=en) and submit the URL (e.g. `https://keekar.3utilities.com`).  
   Reviews can take from hours to a few days. Once cleared, the warning should stop for most users.

3. **Temporary workaround (only if you fully trust the site)**  
   Chrome sometimes lets you proceed:
   - On the warning page, click **"Details"** (or similar), then **"Visit this unsafe site"** (or equivalent).  
   Use only on a trusted network and only for a site you control. Do not use for unknown or shared sites.

4. **Use another browser or device**  
   If the warning appears only in Chrome, try signing in via Okta in another browser (e.g. Firefox or Safari) or another device. Other browsers use different safe-browsing data and may not show the warning.

5. **Verify your site is not compromised**  
   If you host the app, ensure:
   - The server and app are up to date and not compromised.
   - There's no injected content, malware, or phishing pages.
   - HTTPS is valid (no certificate errors).  
   Fix any issues before requesting a Safe Browsing review.

**For users (not site owners):** If you don't control the domain, ask the site owner (e.g. your org) to request a Safe Browsing review. Do not bypass the warning unless your organization has confirmed the site is safe.

---

## References

- [Okta Admin Console](https://help.okta.com/en-us/content/topic/okta-admin-console.htm)
- [Okta OIDC and OAuth 2.0](https://developer.okta.com/docs/concepts/oauth-openid/)
- Production app: [https://keekar.3utilities.com/](https://keekar.3utilities.com/)
