#!/usr/bin/env bash
# Copyright 2025 Adobe. All rights reserved.
# Copyright (c) 2025 Mukesh Kesharwani
#
# Licensed under the MIT License. See LICENSE file for details.

# Run ON the EC2 instance as root (sudo). Expects env: AWS_DEFAULT_REGION, RDS_HOST, RDS_PORT, DB_NAME,
# ADMIN_USER, SECRET_ARN, IAM_USER, FORCE (true/false), MARKER path.
# Optional: RESTART_OSCAL_SERVICE (0|1, default 0), RDS_WAIT_ATTEMPTS (default 30), RDS_WAIT_SLEEP_SEC (default 10).
# Invoked by scripts/deploy-to-ec2.sh when Terraform has RDS outputs (do not run standalone unless you set all env vars).

set -euo pipefail
MARKER="${MARKER:-/opt/oscal/data/.rds-bootstrap-done}"
FORCE="${FORCE:-false}"
RESTART_OSCAL_SERVICE="${RESTART_OSCAL_SERVICE:-0}"
RDS_WAIT_ATTEMPTS="${RDS_WAIT_ATTEMPTS:-30}"
RDS_WAIT_SLEEP_SEC="${RDS_WAIT_SLEEP_SEC:-10}"
export PGCONNECT_TIMEOUT="${PGCONNECT_TIMEOUT:-10}"

log() {
  printf '[%s] rds-bootstrap: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"
}

need_cli_tool() {
  command -v "$1" >/dev/null 2>&1
}

ensure_rds_cli_tools() {
  if need_cli_tool psql && need_cli_tool jq && need_cli_tool aws; then
    log "CLI tools present (psql, jq, aws); skipping dnf install"
    return 0
  fi
  log "Installing postgresql client, jq, awscli (dnf lock_timeout=120s, command timeout=180s)..."
  local dnf_common=(dnf install -y --setopt=lock_timeout=120)
  if timeout 180 "${dnf_common[@]}" postgresql15 jq awscli 2>/dev/null; then
    log "dnf install postgresql15 jq awscli succeeded"
    return 0
  fi
  if timeout 180 "${dnf_common[@]}" postgresql jq awscli; then
    log "dnf install postgresql jq awscli succeeded"
    return 0
  fi
  log "ERROR: dnf install failed or timed out after 180s (another package manager may hold the lock)"
  exit 1
}

fetch_master_password() {
  aws secretsmanager get-secret-value \
    --secret-id "$SECRET_ARN" \
    --region "${AWS_DEFAULT_REGION}" \
    --query SecretString \
    --output text 2>/dev/null | jq -r '.password // empty'
}

wait_for_database() {
  local attempt db_ready=0
  log "Waiting for database at ${RDS_HOST}:${RDS_PORT} (up to ${RDS_WAIT_ATTEMPTS} attempts, ${RDS_WAIT_SLEEP_SEC}s apart)..."
  for attempt in $(seq 1 "$RDS_WAIT_ATTEMPTS"); do
    PGPASSWORD="$(fetch_master_password)" || PGPASSWORD=""
    export PGPASSWORD
    if [[ -n "$PGPASSWORD" ]] && psql -h "$RDS_HOST" -p "$RDS_PORT" -U "$ADMIN_USER" -d postgres -c 'SELECT 1' >/dev/null 2>&1; then
      log "Database reachable on attempt ${attempt}/${RDS_WAIT_ATTEMPTS}"
      db_ready=1
      break
    fi
    log "Attempt ${attempt}/${RDS_WAIT_ATTEMPTS}: not reachable yet (check SG, RDS status, Secrets Manager)"
    sleep "$RDS_WAIT_SLEEP_SEC"
  done
  if [[ "$db_ready" -ne 1 ]]; then
    log "ERROR: database not reachable after ${RDS_WAIT_ATTEMPTS} attempts"
    exit 1
  fi
}

run_sql_bootstrap() {
  PGPASSWORD="$(fetch_master_password)"
  if [[ -z "$PGPASSWORD" ]]; then
    log "ERROR: empty master password from Secrets Manager (${SECRET_ARN})"
    exit 1
  fi
  export PGPASSWORD

  cat > /tmp/oscal-rds-create-role.sql <<'ROLESQL'
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'ROLEHOLDER') THEN
    EXECUTE format('CREATE ROLE %I LOGIN', 'ROLEHOLDER');
  END IF;
END
$$;
ROLESQL
  sed -i "s/ROLEHOLDER/${IAM_USER}/g" /tmp/oscal-rds-create-role.sql
  log "Creating IAM DB role and grants for ${IAM_USER}..."
  psql -h "$RDS_HOST" -p "$RDS_PORT" -U "$ADMIN_USER" -d postgres -v ON_ERROR_STOP=1 -f /tmp/oscal-rds-create-role.sql
  rm -f /tmp/oscal-rds-create-role.sql
  psql -h "$RDS_HOST" -p "$RDS_PORT" -U "$ADMIN_USER" -d postgres -v ON_ERROR_STOP=1 -c "GRANT rds_iam TO \"${IAM_USER}\";"
  psql -h "$RDS_HOST" -p "$RDS_PORT" -U "$ADMIN_USER" -d postgres -v ON_ERROR_STOP=1 -c "GRANT CONNECT ON DATABASE \"${DB_NAME}\" TO \"${IAM_USER}\";"
  psql -h "$RDS_HOST" -p "$RDS_PORT" -U "$ADMIN_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -c "GRANT USAGE, CREATE ON SCHEMA public TO \"${IAM_USER}\";"
  psql -h "$RDS_HOST" -p "$RDS_PORT" -U "$ADMIN_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -c "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO \"${IAM_USER}\";"
  psql -h "$RDS_HOST" -p "$RDS_PORT" -U "$ADMIN_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -c "GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO \"${IAM_USER}\";"
  psql -h "$RDS_HOST" -p "$RDS_PORT" -U "$ADMIN_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -c "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO \"${IAM_USER}\";"
  psql -h "$RDS_HOST" -p "$RDS_PORT" -U "$ADMIN_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -c "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO \"${IAM_USER}\";"
  touch "$MARKER"
  log "SQL bootstrap completed; marker written to ${MARKER}"
}

write_systemd_dropin() {
  local dropin_dir dropin tmp_dropin
  dropin_dir=/etc/systemd/system/oscal-reporter.service.d
  dropin="$dropin_dir/50-oscal-rds-env.conf"
  tmp_dropin="$(mktemp)"
  mkdir -p "$dropin_dir"
  cat > "$tmp_dropin" <<RDSINI
[Service]
Environment=OSCAL_DATABASE_ENABLED=1
Environment=OSCAL_DATABASE_AUTH=iam
Environment=OSCAL_DATABASE_HOST=${RDS_HOST}
Environment=OSCAL_DATABASE_PORT=${RDS_PORT}
Environment=OSCAL_DATABASE_NAME=${DB_NAME}
Environment=OSCAL_DATABASE_USER=${IAM_USER}
Environment=OSCAL_DATABASE_SSL=require
Environment=OSCAL_DATABASE_RDS_REGION=${AWS_DEFAULT_REGION}
RDSINI
  chmod 644 "$tmp_dropin"
  if [[ -f "$dropin" ]] && cmp -s "$tmp_dropin" "$dropin"; then
    log "Systemd drop-in unchanged (${dropin})"
    rm -f "$tmp_dropin"
    return 0
  fi
  mv -f "$tmp_dropin" "$dropin"
  log "Updated systemd drop-in ${dropin}"
}

log "Starting (MARKER=${MARKER}, FORCE=${FORCE}, RESTART_OSCAL_SERVICE=${RESTART_OSCAL_SERVICE})"
mkdir -p /opt/oscal/data
if [[ "$FORCE" == true ]] && [[ -f "$MARKER" ]]; then
  rm -f "$MARKER"
  log "Removed ${MARKER} (FORCE=true)"
fi

if [[ -f "$MARKER" ]]; then
  log "Marker exists; skipping dnf install and SQL grants"
else
  ensure_rds_cli_tools
  wait_for_database
  run_sql_bootstrap
fi

write_systemd_dropin
systemctl daemon-reload
if [[ "${RESTART_OSCAL_SERVICE}" == 1 ]]; then
  systemctl restart oscal-reporter.service || true
  log "oscal-reporter.service restarted"
else
  log "Skipping service restart (deploy/npm step will restart oscal-reporter)"
fi
log "Done"
