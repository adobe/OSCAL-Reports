#!/usr/bin/env bash
# Run ON the EC2 instance as root (sudo). Expects env: AWS_DEFAULT_REGION, RDS_HOST, RDS_PORT, DB_NAME,
# MASTER_USER, SECRET_ARN, IAM_USER, FORCE (true/false), MARKER path.
# Invoked by scripts/deploy-to-ec2.sh when Terraform has RDS outputs (do not run standalone unless you set all env vars).

set -euo pipefail
MARKER="${MARKER:-/opt/oscal/data/.rds-bootstrap-done}"
FORCE="${FORCE:-false}"

mkdir -p /opt/oscal/data
if [[ "$FORCE" == true ]] && [[ -f "$MARKER" ]]; then
  rm -f "$MARKER"
  echo "Removed $MARKER (--force)"
fi

dnf install -y postgresql15 jq awscli 2>/dev/null || dnf install -y postgresql jq awscli

if [[ ! -f "$MARKER" ]]; then
  echo "RDS bootstrap: waiting for database at $RDS_HOST:$RDS_PORT ..."
  for _attempt in $(seq 1 30); do
    PGPASSWORD="$(aws secretsmanager get-secret-value --secret-id "$SECRET_ARN" --query SecretString --output text 2>/dev/null | jq -r '.password // empty')" || true
    export PGPASSWORD
    if [[ -n "$PGPASSWORD" ]] && psql -h "$RDS_HOST" -p "$RDS_PORT" -U "$MASTER_USER" -d postgres -c 'SELECT 1' >/dev/null 2>&1; then
      echo "RDS bootstrap: database is reachable"
      break
    fi
    sleep 10
  done
  PGPASSWORD="$(aws secretsmanager get-secret-value --secret-id "$SECRET_ARN" --query SecretString --output text | jq -r '.password')"
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
  psql -h "$RDS_HOST" -p "$RDS_PORT" -U "$MASTER_USER" -d postgres -v ON_ERROR_STOP=1 -f /tmp/oscal-rds-create-role.sql
  rm -f /tmp/oscal-rds-create-role.sql
  psql -h "$RDS_HOST" -p "$RDS_PORT" -U "$MASTER_USER" -d postgres -v ON_ERROR_STOP=1 -c "GRANT rds_iam TO \"${IAM_USER}\";"
  psql -h "$RDS_HOST" -p "$RDS_PORT" -U "$MASTER_USER" -d postgres -v ON_ERROR_STOP=1 -c "GRANT CONNECT ON DATABASE \"${DB_NAME}\" TO \"${IAM_USER}\";"
  psql -h "$RDS_HOST" -p "$RDS_PORT" -U "$MASTER_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -c "GRANT USAGE, CREATE ON SCHEMA public TO \"${IAM_USER}\";"
  psql -h "$RDS_HOST" -p "$RDS_PORT" -U "$MASTER_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -c "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO \"${IAM_USER}\";"
  psql -h "$RDS_HOST" -p "$RDS_PORT" -U "$MASTER_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -c "GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO \"${IAM_USER}\";"
  psql -h "$RDS_HOST" -p "$RDS_PORT" -U "$MASTER_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -c "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO \"${IAM_USER}\";"
  psql -h "$RDS_HOST" -p "$RDS_PORT" -U "$MASTER_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -c "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO \"${IAM_USER}\";"
  touch "$MARKER"
  echo "RDS bootstrap: SQL completed"
fi

DROPIN_DIR=/etc/systemd/system/oscal-reporter.service.d
DROPIN="$DROPIN_DIR/50-oscal-rds-env.conf"
mkdir -p "$DROPIN_DIR"
cat > "$DROPIN" <<RDSINI
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
chmod 644 "$DROPIN"
systemctl daemon-reload
systemctl restart oscal-reporter.service || true
echo "Done: $DROPIN ; oscal-reporter restarted."
