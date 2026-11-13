<!--
Concept: Mukesh Kesharwani
Contact: mukesh.kesharwani@adobe.com
-->

# Docker deployment: Generic SSO and Guardian Agent assessments

How a deployment engineer turns on Generic SSO (Authentik) sign-in and the **Guardian Agent assessment** feature
(fetch real control assessments into an uploaded OSCAL SSP) for a Docker, Docker Compose or TrueNAS deployment, using the
templates in this repository. Everything is opt-in: with nothing configured, the container behaves as before and the
Guardian feature stays off.

Related: [GUARDIAN_ASSESSMENTS.md](GUARDIAN_ASSESSMENTS.md) (how the feature works),
[GUARDIAN_DEPLOY_INPUTS.md](GUARDIAN_DEPLOY_INPUTS.md) (owner-held inputs and status),
[OIDC_SSO_INTEGRATION.md](OIDC_SSO_INTEGRATION.md) (sign-in), [DOCKER_HUB_GUIDE.md](DOCKER_HUB_GUIDE.md),
[DEPLOYMENT_AND_OPERATIONS.md](DEPLOYMENT_AND_OPERATIONS.md).

> **Image version.** Use an image built from this repository at version 2.1.1 or later (`keekar/oscal_reports:v2.1.1`
> once published). The published `v1.9.0` image predates the settings described here (shared issuer variables,
> token-lifetime limit, targets-JSON quoting, clearer error messages) and `v2.0.0` predates the two-provider merge
> documentation and the test and script fixes. Build and publish with `./scripts/build-and-push-dockerhub.sh` before
> using this guide against a published tag.

## 1. Files to use

| File | Purpose |
| --- | --- |
| [`.env.docker.example`](../.env.docker.example) | Template of every environment variable. Copy to `.env.docker`, fill in, never commit. |
| [`docker-compose.yml`](../docker-compose.yml) | Already passes these variables to the container (`${VAR:-default}`); an empty value means "off / unset". |
| [`scripts/install_from_dockerhub.sh`](../scripts/install_from_dockerhub.sh) | TrueNAS blue/green installer. Passes `.env.docker` (or `OSCAL_ENV_FILE`) to the container with `--env-file` when the file exists. |
| `/data/config.json` (container volume) | Saved application settings. Other Generic SSO settings (scope, redirect URLs, client secret, role mappings) are stored here (section 5). |

## 2. Quick start

```bash
cd /path/to/deployment-folder            # contains docker-compose.yml and scripts/
cp .env.docker.example .env.docker
$EDITOR .env.docker                      # replace every <placeholder>; see section 4
```

Then start it the way you deploy:

| Method | Command |
| --- | --- |
| Docker Compose | `docker compose --env-file .env.docker up -d --force-recreate` |
| TrueNAS install script | `./scripts/install_from_dockerhub.sh` (uses `.env.docker` in the deployment folder automatically; `OSCAL_ENV_FILE=/other/path ./scripts/install_from_dockerhub.sh` for another name) |
| Plain `docker run` | `docker run -d ... --env-file .env.docker keekar/oscal_reports:<tag>` |

The application reads these variables **once at start**. After any change, recreate the container
(`--force-recreate`, or rerun the install script). Users are signed out by a restart.

Quoting rules: write each value as-is (no spaces around `=`, no inline `# comments`). Compose and the install script take
the targets JSON with or without surrounding single quotes. Keep the single quotes for Compose.

## 3. What you need from the owners first

None of these can be created from the repository. Collect them before filling in the template.

| Needed | From | Notes |
| --- | --- | --- |
| Authentik application: issuer, OAuth client ID | Authentik owner | Issuer is exact and ends with `/`. The OSCAL sign-in redirect URL must be registered (section 5). |
| Custom scope (default name `guardian-assessments`) | Authentik owner | Restricted to the approved groups. OSCAL requests it automatically when Guardian is enabled (section 5). |
| `groups` claim inside the **access** token | Authentik owner | Check with a decoded access token; the sign-in log lists the names (section 6). |
| Access-token validity | Authentik owner | Must not exceed Guardian's limit (next row). |
| Guardian `maxTokenAgeSeconds` | Guardian owner | 600 by default, up to 3600. Set `OSCAL_GUARDIAN_GENERIC_SSO_MAX_TOKEN_AGE_SECONDS` to the same number. |
| Guardian assessment API URL and host | Guardian owner | From Guardian's `assessment_api_endpoints` output (key `authentik`). |
| Target IDs and groups | Guardian owner | Provider (`cloudflare` or `okta`), target ID, and the access-token group names allowed to use it. Guardian applies its own grants as well. |
| Identity host reachable from AWS | Network owner | The issuer must resolve to a public address from public DNS and answer on 443 with a valid certificate, because Guardian's AWS authorizer reads its signing keys. |

## 4. Variable reference

Every variable is optional unless stated. "Section" refers to the template. Values shown are placeholders.

| Variable | Section | Required when | Example | Notes |
| --- | --- | --- | --- | --- |
| `OSCAL_GENERIC_SSO_ISSUER` | 1 | Generic SSO is not already saved in `/data/config.json` | `https://sso.example.com/application/o/app/` | One definition of the identity host. Sign-in issuer, discovery and end-session URLs and Guardian's key URL (`<issuer>jwks/`) derive from it. Must be https, end with `/`, no query or fragment, otherwise it is ignored with a warning. Overrides the saved values. |
| `OSCAL_GENERIC_SSO_CLIENT_ID` | 1 | as above | `oscal-report-generator` | Sign-in client ID and the access-token audience Guardian checks. |
| `OSCAL_GUARDIAN_ASSESSMENTS_ENABLED` | 2 | Guardian feature on | `true` | Anything other than `true` keeps the feature off (default `false`). |
| `OSCAL_GUARDIAN_GENERIC_SSO_ASSESSMENTS_URL` | 2 | Guardian feature on | `https://<api-id>.execute-api.<region>.amazonaws.com/v1/guardian` | https, port 443, path ends `/v1/guardian`, host must be listed below. |
| `OSCAL_GUARDIAN_ASSESSMENTS_ALLOWED_HOSTS` | 2 | Guardian feature on | `<api-id>.execute-api.<region>.amazonaws.com` | Comma separated, lowercase, exact, no wildcards. Nothing is allowed by default. |
| `OSCAL_GUARDIAN_GENERIC_SSO_SCOPE` | 2 | Guardian feature on | `guardian-assessments` | Single scope name, no spaces. Without it the Guardian Generic SSO path stays off. |
| `OSCAL_GUARDIAN_GENERIC_SSO_MAX_TOKEN_AGE_SECONDS` | 2 | token lifetime above 600 s | `3600` | 60 to 3600, default 600. Equal to Guardian's limit and at least the IdP access-token validity. |
| `OSCAL_GUARDIAN_PRIVILEGED_GROUPS` | 2 | to change the default | `Platform Admin` | Comma separated phrases. A member of any IdP group whose name **contains** a phrase (case-insensitive) may use the feature. |
| `OSCAL_GUARDIAN_ASSESSMENT_TARGETS_JSON` | 2 | Guardian feature on | see template | One-line JSON array, at most 100 targets: `provider` (`cloudflare` or `okta`), `targetId`, `label`, `groups` (exact access-token group names). |
| `OSCAL_GUARDIAN_GENERIC_SSO_ISSUER`, `_JWKS_URL`, `_CLIENT_ID` | 3 | rarely | | Guardian-only overrides of the shared issuer and client ID (for an IdP whose key URL is not `<issuer>jwks/`). |
| `OSCAL_GENERIC_OIDC_TLS_RELAXED` | 3 | homelab IdP with an incomplete TLS chain | `1` | `1`/`true` turns strict TLS off for the IdP. Prefer fixing the chain. |
| `EXTERNAL_PORT` | 3 | to change the host port | `3020` | Compose only. |

Okta delegated-token variables (`OSCAL_GUARDIAN_ASSESSMENTS_URL`, `OSCAL_GUARDIAN_ISSUER`, `_JWKS_URL`, `_AUDIENCE`,
`_CLIENT_ID`, `_SCOPES`) and the older apply path are described in [GUARDIAN_INTEGRATION.md](GUARDIAN_INTEGRATION.md) and
[GUARDIAN_ASSESSMENTS.md](GUARDIAN_ASSESSMENTS.md); they are not in the template because the Authentik path does not need them.

**Secrets.** The template holds no secrets. Save the OAuth **client secret** in the application (Settings, SSO
Integration), where it is stored encrypted in `/data/config.json`, or supply it through your secret manager as
`OSCAL_GENERIC_OIDC_CLIENT_SECRET`. Never put it in a file that is committed or shared.

## 4a. TrueNAS Apps (Custom App)

TrueNAS Apps do not read `docker-compose.yml` or `.env.docker`; the container's environment is part of the app. Two ways:

**In the TrueNAS web UI:** Apps, the OSCAL app, **Edit**, section **Environment Variables**, add one row per variable from
section 4 (name and value exactly as in the template). Do **not** wrap values in quotes; TrueNAS passes them literally,
so the targets JSON is the bare JSON array on one line. Save; the app redeploys.

**From the TrueNAS shell with the helper** (reads the filled-in template, never prints values, keeps the app's other
variables, and makes an owner-only backup of the app's current settings first):

```bash
sudo python3 scripts/truenas_apply_app_env.py --app <app-name> --env-file .env.docker            # dry run: shows names only
sudo python3 scripts/truenas_apply_app_env.py --app <app-name> --env-file .env.docker --apply    # apply and redeploy
```

Add `--dns <resolver-ip>` to also set the app's DNS servers (see the signing-key row in section 7); the env-file argument is then optional.

The helper only passes `OSCAL_GENERIC_SSO_*`, `OSCAL_GENERIC_OIDC_TLS_RELAXED` and `OSCAL_GUARDIAN_*` variables, skips empty
or still-`<placeholder>` values, and leaves secrets alone. The backup is written to `~/oscal-backups/` (root-owned,
`0700`; list it with `sudo ls`). To undo, restore the saved values in the UI or rerun the helper with the previous file.
Check afterwards with the steps in section 6, using `sudo docker exec <container> ...`.

## 5. Saved application settings (config template)

Two things live in the container's `/data/config.json` rather than in environment variables. Set them in the
application (**Settings, SSO Integration, Generic OIDC**) or merge this template into the file while the container is
stopped. Replace the placeholders; keep the file's other settings.

```json
{
  "ssoConfig": {
    "oauth": {
      "enabled": true,
      "providers": {
        "Generic_OIDC": {
          "enabled": true,
          "displayName": "Generic SSO",
          "scope": "openid profile email guardian-assessments",
          "callbackPath": "/auth/callback",
          "redirectUriPatterns": [
            { "matchingMode": "strict", "url": "https://<oscal-host>/auth/callback" }
          ]
        }
      }
    }
  }
}
```

- **`scope`** must contain `openid`. While `OSCAL_GUARDIAN_ASSESSMENTS_ENABLED=true` and `OSCAL_GUARDIAN_GENERIC_SSO_SCOPE`
  is a single plain scope name, the application adds that scope to the sign-in request itself, so you do not have to list it
  here. Users must sign out and in again after the setting is first applied.
- **`redirectUriPatterns`** must list the address users browse to, and the same URL must be registered in the IdP.
- Issuer, discovery URL and client ID come from the variables in section 4 when they are set; otherwise from this file.
- A fresh volume is seeded from `config/app/config.json.example`, whose Generic SSO issuer is the placeholder
  `sso.example.com`, so set the two `OSCAL_GENERIC_SSO_*` variables (or the saved settings) before expecting Generic SSO
  sign-in. A volume that already holds saved settings keeps them.

## 6. Verify

1. **Container health:** `curl http://<host>:3020/health` returns `{"status":"healthy",...}`.
2. **Settings reach the application:**
   `docker exec <container> node --input-type=module -e 'const m=await import("/app/guardianAssessments.js"); console.log(m.readGenericSsoConfig(process.env), m.readGuardianAssessmentConfig(process.env).targets.length)'`
   prints the issuer, key URL, audience and scope, then the number of targets. An error names the setting at fault.
3. **Sign in** with Generic SSO as a member of a privileged group. In the container log (`docker logs <container>`) find the
   sign-in line `guardian_generic_sso_token_retention`:

   | Field | Meaning |
   | --- | --- |
   | `event.outcome: success` | The access token passed every check and was kept. |
   | `token.lifetime_seconds` and `token.max_age_seconds` | The IdP token lifetime and the limit. The first must not exceed the second. |
   | `token.groups`, `token.privileged_groups` | Group names in the access token (names only, never the token). |
   | `token.matches_target_group` | `true` when a token group equals a group in a configured target. |
   | `event.outcome: failure` with `event.reason` | `scope_missing`, `groups_claim_missing`, `no_privileged_group`, `lifetime_too_long`, or a `jwt_...` code (audience, issuer, signature, expired). |

4. **Use it:** upload an SSP, choose **Load Existing Report**, answer **Yes** to Guardian, then **Load assessment runs**.
   The target and run selectors become active.

## 7. Troubleshooting

| What you see | Cause and fix |
| --- | --- |
| "Guardian assessment retrieval is disabled or not configured. **Problem: ...**" | The text names the setting at fault: targets JSON invalid or empty, endpoint URL or its allowed host, `OSCAL_GUARDIAN_ASSESSMENTS_ENABLED` not `true`, or the Generic SSO issuer, client ID or scope. Fix the variable and recreate the container. |
| "Authentik issues access tokens that live N seconds, but Guardian accepts at most M seconds" | Authentik token validity exceeds the limit. Set the Authentik provider's **Access token validity** to M seconds or less, or have the Guardian owner raise their limit and set `OSCAL_GUARDIAN_GENERIC_SSO_MAX_TOKEN_AGE_SECONDS` to match. |
| "Your Generic SSO sign-in is no longer valid for Guardian ... only N minutes" | The token expired or was never kept. Sign out, sign in, then fetch within the stated time. |
| Page: "OSCAL could not fetch the signing keys ... non-public address" (log `event.reason: jwks_host_not_public`) | The container resolves the SSO host to a private address (for example `10.x`, `192.168.x`), usually because the host's DNS rewrites the answer. Sign-in still works (it does not apply this check) but Guardian's token verification refuses a private key host by design. Make the container resolve the **public** address: Compose `dns:` (commented example in `docker-compose.yml`), TrueNAS **DNS Configuration** in the app, or `scripts/truenas_apply_app_env.py --app <name> --dns <resolver-ip>`. Use a resolver that returns the public address and list only the servers you want. Check: `docker exec <container> node -e 'require("dns").promises.lookup("<sso-host>",{all:true}).then(a=>console.log(a))'`. |
| Page: "OSCAL could not reach <host> to fetch the signing keys" (log `jwks_unreachable`) | The container cannot connect to the SSO host: network, firewall, routing, or the host not reachable on 443 from this container. |
| Log `event.reason: scope_missing` | Authentik did not grant the Guardian scope. Check `OSCAL_GUARDIAN_ASSESSMENTS_ENABLED=true` and `OSCAL_GUARDIAN_GENERIC_SSO_SCOPE`, that the scope exists in Authentik and is mapped to the OSCAL provider, and that the user is in an approved group. Then sign in again. |
| `HTTP 403` from Guardian | The access-token groups do not match Guardian's grants. Compare `token.groups` with Guardian's configured groups. |
| `HTTP 401` from Guardian | Token rejected (age, lifetime, audience, issuer, scope). The Guardian owner can read the reason code in their log. |
| `HTTP 500`, `502`, `504` from Guardian | A Guardian service failure. Give the time and status to the Guardian owner. |
| Login page: "Could not reach the SSO server ..." | The container cannot reach the IdP (DNS, firewall, routing). Test from inside the container, not the host. |
| Selectors empty although the sign-in succeeded | No access-token group equals a group in the targets JSON (`token.matches_target_group` is `false`). Correct the target groups. |
| Variables seem ignored | The container was not recreated, or a different file is in use. `docker inspect <container> --format '{{range .Config.Env}}{{println .}}{{end}}'` shows what it received (it contains values, so do not share the output). |

## 8. Operating notes and security

- **Precedence:** environment variables override the saved issuer, discovery, end-session and client ID values; everything
  else (scope, redirect patterns, secret, role mappings) comes from `/data/config.json`.
- **No shipped defaults:** nothing deployment-specific is built into the image. Leave the template values empty to keep
  Guardian off.
- **Least privilege:** keep `OSCAL_GUARDIAN_GENERIC_SSO_MAX_TOKEN_AGE_SECONDS` as low as the workflow allows (a stolen token
  works for its whole lifetime), list only the groups that need each target, and keep the allowed-hosts list to the single
  Guardian host.
- **Secrets and logs:** the logs contain group names and numbers only; they never contain tokens or the client secret.
  Treat `.env.docker` as configuration (restrict permissions with `chmod 600`) and keep it out of version control
  (`.env.docker` is in `.gitignore`).
- **Local development** uses the repository's `.env` (see `.env.example` and the notes in
  [GUARDIAN_ASSESSMENTS.md](GUARDIAN_ASSESSMENTS.md)); it is not read in Docker. Do not copy `.env` into a deployment.
