#!/usr/bin/env bash
# Concept: Mukesh Kesharwani
# Contact: mukesh.kesharwani@adobe.com
#
# Guardian integration verification for the OSCAL Reports application.
# Exit 0 = every check ran and passed. 1 = a check failed. 2 = nothing failed but a check was
# skipped (INCOMPLETE): a skipped check is never reported as a pass.
#
#   GUARDIAN_ACCEPTANCE_REPORT=/path/to/real/ssp.json verify-guardian-integration.sh [--full]
#
# Required evidence: Okta and Authentik sign-in flows, and Guardian called with BOTH an Okta-shaped and an
# Authentik-shaped token (a run that lacks either is a FAIL, not a pass).
# Optional: GUARDIAN_CHECKOUT (default /Users/mkesharw/Documents/GuardianAgent).
# This script is read-only toward the Guardian checkout and uses no AWS, secrets or live services.
set -uo pipefail

ROOT="$(git rev-parse --show-toplevel)" || { echo "Run inside the OSCAL Reports repository."; exit 1; }
cd "$ROOT"
GUARDIAN="${GUARDIAN_CHECKOUT:-/Users/mkesharw/Documents/GuardianAgent}"
REPORT="${GUARDIAN_ACCEPTANCE_REPORT:-}"
FULL=false
[[ "${1:-}" == "--full" ]] && FULL=true

LOG="$(mktemp -d)"
trap 'rm -rf "$LOG"' EXIT
failed=0
skipped=0
rows=()

record() { rows+=("$(printf '%-38s %-8s %s' "$1" "$2" "$3")"); }

# run <name> <summary-grep-pattern> <command...>
run() {
  local name="$1" pattern="$2"
  shift 2
  if "$@" >"$LOG/out" 2>&1; then
    record "$name" "PASS" "$(grep -oE "$pattern" "$LOG/out" | tail -3 | tr '\n' ' ' | cut -c1-200)"
  else
    failed=1
    record "$name" "FAIL" "$(grep -E "rror|FAIL|$pattern" "$LOG/out" | tail -3 | tr '\n' ' ' | cut -c1-200)"
  fi
}

skip() { skipped=1; record "$1" "SKIPPED" "$2"; }

# 1. Guardian-related backend suites (or the whole backend suite with --full)
if $FULL; then
  run "Backend full suite" '^(Tests|Test Suites):.*' npm --prefix backend test
else
  run "Backend Guardian + auth suites" '^(Tests|Test Suites):.*' npm --prefix backend test -- --runInBand --runTestsByPath \
    "$ROOT/test_cases/backend/integration/guardianAssessments.test.js" \
    "$ROOT/test_cases/backend/unit/guardianService.test.js" \
    "$ROOT/test_cases/backend/integration/guardianRoutes.test.js"
fi

# 1b. Okta and Authentik (Generic SSO) sign-in through to Guardian, plus their configuration and role mapping tests
run "IdP flows: Okta + Authentik" '^(Tests|Test Suites):.*' npm --prefix backend test -- --runInBand --runTestsByPath \
  "$ROOT/test_cases/backend/integration/idpGuardianFlows.test.js" \
  "$ROOT/test_cases/backend/unit/genericOidc.test.js" \
  "$ROOT/test_cases/backend/unit/defaultGenericOidcConfig.test.js" \
  "$ROOT/test_cases/backend/unit/defaultOidcGroupRoleMapping.test.js" \
  "$ROOT/test_cases/backend/unit/oidcHttpsAgent.test.js"

# 2. Real cached Guardian evidence through the real local gateway (test-only authentication)
if [[ -z "$REPORT" || ! -f "$REPORT" ]]; then
  skip "Guardian: Okta-shaped + Authentik-shaped" "set GUARDIAN_ACCEPTANCE_REPORT to a real SSP file"
elif [[ ! -d "$GUARDIAN/data/guardian_s3_runs" ]]; then
  skip "Guardian: Okta-shaped + Authentik-shaped" "no cached runs at $GUARDIAN/data/guardian_s3_runs (refresh only with Guardian's own script)"
else
  if env GUARDIAN_CHECKOUT="$GUARDIAN" GUARDIAN_ACCEPTANCE_REPORT="$REPORT" node test_cases/e2e/guardian-real-cache.mjs >"$LOG/out" 2>&1; then
    missing=""
    for needle in '"verification":"real-cached-evidence-test-only-auth"' \
      '"verification":"real-cached-evidence-authentik-shaped-test-only-auth"' \
      '"case":"no custom scope","status":401' '"case":"non-member group","status":403'; do
      grep -qF "$needle" "$LOG/out" || missing="$missing $needle"
    done
    if [[ -z "$missing" ]]; then
      record "Guardian: Okta-shaped + Authentik-shaped" "PASS" "$(grep -oE '"verification":"[^"]*"' "$LOG/out" | tr '\n' ' ' | cut -c1-200)"
    else
      failed=1
      record "Guardian: Okta-shaped + Authentik-shaped" "FAIL" "missing evidence:$missing"
    fi
  else
    failed=1
    record "Guardian: Okta-shaped + Authentik-shaped" "FAIL" "$(grep -E 'rror|FAIL' "$LOG/out" | tail -3 | tr '\n' ' ' | cut -c1-200)"
  fi
fi

# 3. Browser workflow (Guardian responses are mocked)
channel=""
[[ -d "/Applications/Google Chrome.app" ]] && channel="chrome"
run "Browser workflow (mocked Guardian)" '[0-9]+ (passed|failed)' \
  env OSCAL_BROWSER_CHANNEL="$channel" GUARDIAN_ACCEPTANCE_REPORT="$REPORT" \
  npx --no-install playwright test test_cases/e2e/guardian-assessment.spec.mjs --workers=1 --reporter=line
rm -rf test-results .playwright-mcp

# 4. Production build and whitespace
run "Frontend production build" 'built in [0-9a-z.]+' npm --prefix frontend run build
run "git diff --check" 'trailing whitespace|space' git diff --check

# 5. Server smoke: the real backend boots (against a throwaway data folder) and answers the calls the login page makes
# without a server error. This catches dependency drift that unit tests miss, for example a cookie library Express cannot call.
smoke_server() {
  local port data pid csrf login providers
  port="$(node -e "const s=require('net').createServer().listen(0,()=>{console.log(s.address().port);s.close()})")"
  data="$(mktemp -d)"
  echo '[]' > "$data/users.json"
  ( cd backend && exec env PORT="$port" OSCAL_DATA_DIR="$data" node server.js >"$LOG/server.out" 2>&1 ) &
  pid=$!
  for _ in $(seq 1 60); do
    [[ "$(curl -s -m 2 -o /dev/null -w '%{http_code}' "http://127.0.0.1:$port/api/csrf-token")" != "000" ]] && break
    sleep 0.5
  done
  csrf="$(curl -s -m 10 -o /dev/null -w '%{http_code}' "http://127.0.0.1:$port/api/csrf-token")"
  login="$(curl -s -m 10 -o /dev/null -w '%{http_code}' -X POST "http://127.0.0.1:$port/api/auth/login" \
    -H 'Content-Type: application/json' -d '{"username":"no-such-user-smoke","password":"wrong"}')"
  providers="$(curl -s -m 10 -o /dev/null -w '%{http_code}' "http://127.0.0.1:$port/api/auth/sso/login-providers")"
  kill "$pid" 2>/dev/null
  wait "$pid" 2>/dev/null
  rm -rf "$data"
  if [[ "$csrf" == "200" && "$login" == "401" && "$providers" == "200" ]]; then
    record "Server smoke (login page calls)" "PASS" "csrf-token $csrf, fake login $login, login-providers $providers"
  else
    failed=1
    record "Server smoke (login page calls)" "FAIL" "csrf-token $csrf (want 200), fake login $login (want 401), login-providers $providers (want 200); see backend log: $(grep -m1 -E 'TypeError|Error:' "$LOG/server.out" | cut -c1-110)"
  fi
}
smoke_server

echo
echo "Guardian integration verification ($(date -u +%Y-%m-%dT%H:%MZ))"
printf '%s\n' "${rows[@]}"
echo
echo "Evidence: backend suites use mocked IdP tokens and Guardian responses; the harness uses real cached assessments with"
echo "TEST-ONLY authentication; browser tests mock Guardian. None of these proves a real Okta or Authentik sign-in or real"
echo "Guardian authentication. Real sign-in with each IdP is manual: record it as done or not done, never assume it."

if [[ $failed -ne 0 ]]; then echo "RESULT: FAIL"; exit 1; fi
if [[ $skipped -ne 0 ]]; then echo "RESULT: INCOMPLETE (a check was skipped; not a pass)"; exit 2; fi
echo "RESULT: PASS"
