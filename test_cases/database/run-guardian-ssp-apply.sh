#!/usr/bin/env bash
# Concept: Mukesh Kesharwani
# Contact: mukesh.kesharwani@adobe.com
set -euo pipefail

if [[ "${1:-}" == "--help" ]]; then
  echo "Usage: bash test_cases/database/run-guardian-ssp-apply.sh"
  echo "Requires local Docker. Creates a disposable PostgreSQL 16 container without network/ports/credentials."
  exit 0
fi
if [[ $# -ne 0 ]]; then
  echo "No arguments or database connection strings are accepted." >&2
  exit 1
fi

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
endpoint="$(docker context inspect --format '{{.Endpoints.docker.Host}}')"
if [[ -n "${DOCKER_HOST:-}" || -n "${DOCKER_CONTEXT:-}" || "$endpoint" != unix://* ]]; then
  echo "Refusing Docker overrides or a non-local Docker context; select a local Unix-socket context." >&2
  exit 1
fi
docker info --format '{{.ServerVersion}}' >/dev/null

container=""
cleanup() {
  if [[ -n "$container" ]]; then
    docker rm --force "$container" >/dev/null
  fi
}
trap cleanup EXIT

container="$(docker run --detach --rm --network none \
  --tmpfs /var/lib/postgresql/data \
  --env POSTGRES_HOST_AUTH_METHOD=trust postgres:16-alpine)"
ready=false
for ((attempt = 0; attempt < 60; attempt++)); do
  if docker exec "$container" pg_isready -U postgres >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 1
done
if [[ "$ready" != true ]]; then
  echo "Disposable PostgreSQL did not become ready." >&2
  exit 1
fi

sql() {
  docker exec -i "$container" psql -X -U postgres -d postgres -v ON_ERROR_STOP=1
}
migrate() {
  {
    printf 'SET ROLE oscal_guardian_test_owner;\n'
    cat "$root/backend/database/migrations/001_guardian_ssp_apply.sql"
  } | sql
}
bootstrap() {
  sql <<'SQL'
SET ROLE oscal_guardian_test_owner;
GRANT USAGE, CREATE ON SCHEMA public TO oscal_guardian_test_legacy_app;
GRANT ALL ON ALL TABLES IN SCHEMA public TO oscal_guardian_test_legacy_app;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO oscal_guardian_test_legacy_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO oscal_guardian_test_legacy_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO oscal_guardian_test_legacy_app;
SQL
}

sql <<'SQL'
CREATE ROLE oscal_guardian_test_owner NOLOGIN CREATEROLE;
CREATE ROLE oscal_guardian_test_legacy_app NOLOGIN;
GRANT CREATE ON DATABASE postgres TO oscal_guardian_test_owner;
GRANT USAGE, CREATE ON SCHEMA public TO oscal_guardian_test_owner;
SET ROLE oscal_guardian_test_owner;
CREATE TABLE public.extended_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), scope TEXT NOT NULL,
  scope_id TEXT NOT NULL, payload JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE (scope, scope_id)
);
CREATE TABLE public.adobe_teams (
  id SERIAL PRIMARY KEY, label TEXT NOT NULL, sort_order INT NOT NULL DEFAULT 0
);
CREATE SEQUENCE public.oscal_guardian_test_other_seq;
INSERT INTO public.extended_data (scope, scope_id) VALUES ('ssp', 'test-system');
INSERT INTO public.adobe_teams (label) VALUES ('test-team');
SQL
bootstrap

echo "Testing unsafe pre-existing role rejection and transaction rollback"
sql <<'SQL'
CREATE ROLE oscal_guardian_ssp_apply_service LOGIN;
SQL
if migrate; then
  echo "Migration unexpectedly accepted a login role collision." >&2
  exit 1
fi
sql <<'SQL'
DO $$
BEGIN
  IF to_regnamespace('oscal_guardian') IS NOT NULL THEN
    RAISE EXCEPTION 'Failed migration did not roll back';
  END IF;
END
$$;
DROP ROLE oscal_guardian_ssp_apply_service;
SET ROLE oscal_guardian_test_owner;
ALTER DEFAULT PRIVILEGES GRANT SELECT ON TABLES TO oscal_guardian_test_legacy_app;
SQL

echo "Testing unsafe global default ACL rejection and transaction rollback"
if migrate; then
  echo "Migration unexpectedly accepted a global default ACL leak." >&2
  exit 1
fi
sql <<'SQL'
DO $$
BEGIN
  IF to_regnamespace('oscal_guardian') IS NOT NULL
     OR EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'oscal_guardian_ssp_apply_service') THEN
    RAISE EXCEPTION 'Failed migration left objects or roles behind';
  END IF;
END
$$;
SET ROLE oscal_guardian_test_owner;
ALTER DEFAULT PRIVILEGES REVOKE SELECT ON TABLES FROM oscal_guardian_test_legacy_app;
SQL

echo "Testing fresh apply and repeated apply"
migrate
migrate
bootstrap
echo "Testing role permissions, constraints, artifact round-trip and legacy behavior"
sql < "$root/test_cases/database/guardian_ssp_apply_permissions.sql"
echo "Testing repeated apply with existing jobs, mappings and audit history"
migrate
sql <<'SQL'
DO $$
BEGIN
  IF (SELECT count(*) FROM oscal_guardian.ssp_apply_jobs) <> 2
     OR (SELECT count(*) FROM oscal_guardian.target_authorizations) <> 1
     OR (SELECT count(*) FROM oscal_guardian.authorization_audit_events) <> 1
     OR (SELECT payload FROM public.extended_data WHERE scope_id = 'test-system')
        <> '{"preserved":true}'::jsonb THEN
    RAISE EXCEPTION 'Repeat migration changed persisted data';
  END IF;
END
$$;
SQL
echo "Testing rejection of column-level audit privilege drift"
sql <<'SQL'
SET ROLE oscal_guardian_test_owner;
GRANT SELECT (event_data) ON oscal_guardian.authorization_audit_events
  TO oscal_guardian_ssp_apply_service;
SQL
if migrate; then
  echo "Migration unexpectedly accepted column-level audit read access." >&2
  exit 1
fi
sql <<'SQL'
SET ROLE oscal_guardian_test_owner;
REVOKE SELECT (event_data) ON oscal_guardian.authorization_audit_events
  FROM oscal_guardian_ssp_apply_service;
SQL
migrate
echo "PASS: Guardian SSP Apply PostgreSQL migration, privileges and compatibility"
