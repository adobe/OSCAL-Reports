-- Concept: Mukesh Kesharwani
-- Contact: mukesh.kesharwani@adobe.com
BEGIN;

SELECT pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('oscal_guardian:001_guardian_ssp_apply', 0)
);

DO $$
DECLARE
  role_name TEXT;
  role_record RECORD;
BEGIN
  IF current_user IN (
    'oscal_guardian_ssp_apply_service', 'oscal_guardian_ssp_apply_admin'
  ) THEN
    RAISE EXCEPTION 'Run this migration as the dedicated object owner, not a runtime role';
  END IF;

  IF to_regclass('public.oscal_guardian_ssp_apply_jobs') IS NOT NULL
     OR to_regclass('public.oscal_guardian_target_authorizations') IS NOT NULL
     OR to_regclass('public.oscal_guardian_authorization_audit_events') IS NOT NULL THEN
    RAISE EXCEPTION 'An earlier public-schema draft exists; owner-approved reconciliation is required';
  END IF;

  FOREACH role_name IN ARRAY ARRAY[
    'oscal_guardian_ssp_apply_service', 'oscal_guardian_ssp_apply_admin'
  ] LOOP
    SELECT oid, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls
      INTO role_record FROM pg_catalog.pg_roles WHERE rolname = role_name;
    IF NOT FOUND THEN
      EXECUTE format(
        'CREATE ROLE %I NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS',
        role_name
      );
    ELSIF role_record.rolcanlogin OR role_record.rolsuper
          OR role_record.rolcreatedb OR role_record.rolcreaterole
          OR role_record.rolreplication OR role_record.rolbypassrls
          OR EXISTS (
            SELECT 1 FROM pg_catalog.pg_auth_members
            WHERE member = role_record.oid
          ) THEN
      RAISE EXCEPTION 'Unsafe existing role %; platform owner must resolve attributes/memberships', role_name;
    END IF;
  END LOOP;
END
$$;

CREATE SCHEMA IF NOT EXISTS oscal_guardian;

DO $$
BEGIN
  IF (
    SELECT nspowner <> current_user::regrole
    FROM pg_catalog.pg_namespace WHERE nspname = 'oscal_guardian'
  ) THEN
    RAISE EXCEPTION 'oscal_guardian must be owned by the migration executor';
  END IF;
END
$$;

REVOKE ALL ON SCHEMA oscal_guardian
  FROM PUBLIC, oscal_guardian_ssp_apply_service, oscal_guardian_ssp_apply_admin;
GRANT USAGE ON SCHEMA oscal_guardian
  TO oscal_guardian_ssp_apply_service, oscal_guardian_ssp_apply_admin;

CREATE TABLE IF NOT EXISTS oscal_guardian.ssp_apply_jobs (
  id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  target_id TEXT NOT NULL CHECK (btrim(target_id) <> ''),
  requester_subject TEXT NOT NULL CHECK (btrim(requester_subject) <> ''),
  state TEXT NOT NULL DEFAULT 'queued'
    CHECK (state IN ('queued', 'processing', 'accepted', 'completed', 'failed', 'unknown')),
  input_ssp JSONB NOT NULL CHECK (
    jsonb_typeof(input_ssp) = 'object'
    AND input_ssp ? 'system-security-plan'
    AND jsonb_typeof(input_ssp -> 'system-security-plan') = 'object'
  ),
  output_ssp JSONB CHECK (
    output_ssp IS NULL OR (
      jsonb_typeof(output_ssp) = 'object'
      AND output_ssp ? 'system-security-plan'
      AND jsonb_typeof(output_ssp -> 'system-security-plan') = 'object'
    )
  ),
  guardian_operation_ref TEXT
    CHECK (guardian_operation_ref IS NULL OR btrim(guardian_operation_ref) <> ''),
  failure_code TEXT CHECK (failure_code IS NULL OR btrim(failure_code) <> ''),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  CHECK (updated_at >= created_at),
  CHECK (finished_at IS NULL OR finished_at >= created_at),
  CHECK ((state IN ('completed', 'failed')) = (finished_at IS NOT NULL)),
  CHECK (state <> 'completed' OR output_ssp IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS ssp_apply_jobs_state_created_idx
  ON oscal_guardian.ssp_apply_jobs (state, created_at);
CREATE INDEX IF NOT EXISTS ssp_apply_jobs_requester_created_idx
  ON oscal_guardian.ssp_apply_jobs (requester_subject, created_at DESC);

CREATE TABLE IF NOT EXISTS oscal_guardian.target_authorizations (
  id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  target_id TEXT NOT NULL CHECK (btrim(target_id) <> ''),
  principal_type TEXT NOT NULL CHECK (principal_type IN ('group', 'user')),
  principal_id TEXT NOT NULL CHECK (btrim(principal_id) <> ''),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_subject TEXT NOT NULL CHECK (btrim(created_by_subject) <> ''),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (updated_at >= created_at),
  UNIQUE (target_id, principal_type, principal_id)
);

CREATE INDEX IF NOT EXISTS target_authorizations_principal_idx
  ON oscal_guardian.target_authorizations (principal_type, principal_id, target_id)
  WHERE enabled;

CREATE TABLE IF NOT EXISTS oscal_guardian.authorization_audit_events (
  id BIGSERIAL PRIMARY KEY,
  target_id TEXT NOT NULL CHECK (btrim(target_id) <> ''),
  actor_subject TEXT NOT NULL CHECK (btrim(actor_subject) <> ''),
  event_type TEXT NOT NULL CHECK (btrim(event_type) <> ''),
  principal_type TEXT CHECK (
    principal_type IS NULL OR principal_type IN ('group', 'user')
  ),
  principal_id TEXT,
  job_id UUID REFERENCES oscal_guardian.ssp_apply_jobs (id) ON DELETE RESTRICT,
  event_data JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(event_data) = 'object'),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((principal_type IS NULL) = (principal_id IS NULL)),
  CHECK (principal_id IS NULL OR btrim(principal_id) <> '')
);

CREATE INDEX IF NOT EXISTS authorization_audit_target_time_idx
  ON oscal_guardian.authorization_audit_events (target_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS authorization_audit_job_time_idx
  ON oscal_guardian.authorization_audit_events (job_id, occurred_at DESC)
  WHERE job_id IS NOT NULL;

COMMENT ON TABLE oscal_guardian.ssp_apply_jobs IS
  'SSP JSON stored locally; job UUID is an identifier, not authorization. Validate SSPs separately.';
COMMENT ON TABLE oscal_guardian.authorization_audit_events IS
  'Append-only for runtime roles; never store tokens, credentials, or SSP content in event_data.';

REVOKE ALL ON TABLE
  oscal_guardian.ssp_apply_jobs,
  oscal_guardian.target_authorizations,
  oscal_guardian.authorization_audit_events
  FROM PUBLIC, oscal_guardian_ssp_apply_service, oscal_guardian_ssp_apply_admin;
REVOKE ALL ON SEQUENCE oscal_guardian.authorization_audit_events_id_seq
  FROM PUBLIC, oscal_guardian_ssp_apply_service, oscal_guardian_ssp_apply_admin;

GRANT SELECT, INSERT ON TABLE oscal_guardian.ssp_apply_jobs
  TO oscal_guardian_ssp_apply_service;
GRANT UPDATE (state, output_ssp, guardian_operation_ref, failure_code, updated_at, finished_at)
  ON TABLE oscal_guardian.ssp_apply_jobs TO oscal_guardian_ssp_apply_service;
GRANT SELECT ON TABLE oscal_guardian.target_authorizations
  TO oscal_guardian_ssp_apply_service;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE oscal_guardian.target_authorizations
  TO oscal_guardian_ssp_apply_admin;
GRANT INSERT (target_id, actor_subject, event_type, principal_type, principal_id, job_id, event_data)
  ON TABLE oscal_guardian.authorization_audit_events TO oscal_guardian_ssp_apply_admin;
GRANT USAGE ON SEQUENCE oscal_guardian.authorization_audit_events_id_seq
  TO oscal_guardian_ssp_apply_admin;

-- Global default ACLs can reach even a new schema. Fail rather than revoke another owner's grants.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'oscal_guardian'
      AND c.relowner <> current_user::regrole
  ) OR EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(c.relacl) acl
    WHERE n.nspname = 'oscal_guardian'
      AND acl.grantee NOT IN (
        current_user::regrole,
        'oscal_guardian_ssp_apply_service'::regrole,
        'oscal_guardian_ssp_apply_admin'::regrole
      )
  ) OR EXISTS (
    SELECT 1 FROM pg_catalog.pg_attribute a
    JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(a.attacl) acl
    WHERE n.nspname = 'oscal_guardian'
      AND NOT (
        acl.grantee = current_user::regrole
        OR (
          c.relname = 'ssp_apply_jobs'
          AND acl.grantee = 'oscal_guardian_ssp_apply_service'::regrole
          AND acl.privilege_type = 'UPDATE'
          AND NOT acl.is_grantable
          AND a.attname IN (
            'state', 'output_ssp', 'guardian_operation_ref',
            'failure_code', 'updated_at', 'finished_at'
          )
        )
        OR (
          c.relname = 'authorization_audit_events'
          AND acl.grantee = 'oscal_guardian_ssp_apply_admin'::regrole
          AND acl.privilege_type = 'INSERT'
          AND NOT acl.is_grantable
          AND a.attname IN (
            'target_id', 'actor_subject', 'event_type', 'principal_type',
            'principal_id', 'job_id', 'event_data'
          )
        )
      )
  ) OR EXISTS (
    SELECT 1 FROM pg_catalog.pg_namespace n
    CROSS JOIN LATERAL pg_catalog.aclexplode(n.nspacl) acl
    WHERE n.nspname = 'oscal_guardian'
      AND acl.grantee NOT IN (
        current_user::regrole,
        'oscal_guardian_ssp_apply_service'::regrole,
        'oscal_guardian_ssp_apply_admin'::regrole
      )
  ) THEN
    RAISE EXCEPTION 'Unexpected Guardian ownership/ACLs; platform owner must resolve defaults or drift';
  END IF;
END
$$;

COMMIT;
