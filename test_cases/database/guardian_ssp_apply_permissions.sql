-- Concept: Mukesh Kesharwani
-- Contact: mukesh.kesharwani@adobe.com
-- Disposable PostgreSQL only. Invoked by run-guardian-ssp-apply.sh.
\set ON_ERROR_STOP on
BEGIN;

SET LOCAL ROLE oscal_guardian_ssp_apply_service;

INSERT INTO oscal_guardian.ssp_apply_jobs (id, target_id, requester_subject, input_ssp)
VALUES (
  '00000000-0000-4000-8000-000000000001', 'test-target', 'test-issuer:test-user',
  '{"system-security-plan": {}}'
);
UPDATE oscal_guardian.ssp_apply_jobs SET state = 'processing', updated_at = now();
UPDATE oscal_guardian.ssp_apply_jobs
SET state = 'accepted', guardian_operation_ref = 'test-operation', updated_at = now();
UPDATE oscal_guardian.ssp_apply_jobs SET state = 'unknown', updated_at = now();
UPDATE oscal_guardian.ssp_apply_jobs
SET state = 'completed', output_ssp = '{"system-security-plan": {}}',
    finished_at = now(), updated_at = now();

INSERT INTO oscal_guardian.ssp_apply_jobs (
  target_id, requester_subject, input_ssp, state, failure_code, finished_at
) VALUES (
  'test-target', 'test-issuer:test-user', '{"system-security-plan": {}}',
  'failed', 'test_failure', now()
);

DO $$
DECLARE
  statement TEXT;
BEGIN
  IF (SELECT count(*) FROM oscal_guardian.ssp_apply_jobs) <> 2
     OR (SELECT output_ssp FROM oscal_guardian.ssp_apply_jobs WHERE state = 'completed')
        <> '{"system-security-plan": {}}'::jsonb THEN
    RAISE EXCEPTION 'Job lifecycle/document round-trip failed';
  END IF;

  FOREACH statement IN ARRAY ARRAY[
    $q$INSERT INTO oscal_guardian.ssp_apply_jobs (target_id, requester_subject, input_ssp, state)
       VALUES ('t', 'u', '{"system-security-plan":{}}', 'invalid')$q$,
    $q$INSERT INTO oscal_guardian.ssp_apply_jobs (target_id, requester_subject, input_ssp)
       VALUES (' ', 'u', '{"system-security-plan":{}}')$q$,
    $q$INSERT INTO oscal_guardian.ssp_apply_jobs (target_id, requester_subject, input_ssp)
       VALUES ('t', ' ', '{"system-security-plan":{}}')$q$,
    $q$INSERT INTO oscal_guardian.ssp_apply_jobs (target_id, requester_subject, input_ssp)
       VALUES ('t', 'u', 'null')$q$,
    $q$INSERT INTO oscal_guardian.ssp_apply_jobs (target_id, requester_subject, input_ssp)
       VALUES ('t', 'u', '{}')$q$,
    $q$INSERT INTO oscal_guardian.ssp_apply_jobs (target_id, requester_subject, input_ssp)
       VALUES ('t', 'u', '{"system-security-plan":null}')$q$,
    $q$INSERT INTO oscal_guardian.ssp_apply_jobs (target_id, requester_subject, input_ssp)
       VALUES ('t', 'u', NULL)$q$,
    $q$UPDATE oscal_guardian.ssp_apply_jobs SET output_ssp = '[]'$q$,
    $q$UPDATE oscal_guardian.ssp_apply_jobs SET finished_at = NULL WHERE state = 'completed'$q$,
    $q$UPDATE oscal_guardian.ssp_apply_jobs SET output_ssp = NULL WHERE state = 'completed'$q$,
    $q$UPDATE oscal_guardian.ssp_apply_jobs SET finished_at = created_at - interval '1 second'$q$,
    $q$UPDATE oscal_guardian.ssp_apply_jobs SET updated_at = created_at - interval '1 second'$q$,
    $q$UPDATE oscal_guardian.ssp_apply_jobs SET state = 'accepted' WHERE state = 'completed'$q$
  ] LOOP
    BEGIN
      EXECUTE statement;
      RAISE EXCEPTION 'Expected constraint rejection: %', statement;
    EXCEPTION WHEN check_violation OR not_null_violation THEN
      NULL;
    END;
  END LOOP;

  FOREACH statement IN ARRAY ARRAY[
    'UPDATE oscal_guardian.ssp_apply_jobs SET requester_subject = ''different''',
    'UPDATE oscal_guardian.ssp_apply_jobs SET target_id = ''different''',
    'UPDATE oscal_guardian.ssp_apply_jobs SET input_ssp = ''{"system-security-plan":{}}''',
    'UPDATE oscal_guardian.ssp_apply_jobs SET id = gen_random_uuid()',
    'UPDATE oscal_guardian.ssp_apply_jobs SET created_at = now()',
    'DELETE FROM oscal_guardian.ssp_apply_jobs',
    'TRUNCATE oscal_guardian.ssp_apply_jobs',
    'INSERT INTO oscal_guardian.target_authorizations DEFAULT VALUES',
    'UPDATE oscal_guardian.target_authorizations SET enabled = false',
    'DELETE FROM oscal_guardian.target_authorizations',
    'TRUNCATE oscal_guardian.target_authorizations',
    'SELECT * FROM oscal_guardian.authorization_audit_events',
    'INSERT INTO oscal_guardian.authorization_audit_events DEFAULT VALUES',
    'UPDATE oscal_guardian.authorization_audit_events SET event_type = ''changed''',
    'DELETE FROM oscal_guardian.authorization_audit_events',
    'TRUNCATE oscal_guardian.authorization_audit_events',
    'SELECT nextval(''oscal_guardian.authorization_audit_events_id_seq'')',
    'CREATE TABLE oscal_guardian.unauthorized (id int)',
    'SELECT * FROM public.extended_data'
  ] LOOP
    BEGIN
      EXECUTE statement;
      RAISE EXCEPTION 'Expected service permission denial: %', statement;
    EXCEPTION WHEN insufficient_privilege THEN
      NULL;
    END;
  END LOOP;
END
$$;

SET LOCAL ROLE oscal_guardian_ssp_apply_admin;

INSERT INTO oscal_guardian.target_authorizations (
  target_id, principal_type, principal_id, created_by_subject
) VALUES
  ('test-target', 'group', 'test-approved-group', 'test-issuer:test-admin'),
  ('test-target', 'user', 'test-issuer:test-user', 'test-issuer:test-admin');
UPDATE oscal_guardian.target_authorizations SET enabled = false WHERE principal_type = 'user';
DELETE FROM oscal_guardian.target_authorizations WHERE principal_type = 'user';

INSERT INTO oscal_guardian.authorization_audit_events (
  target_id, actor_subject, event_type, principal_type, principal_id, job_id
) VALUES (
  'test-target', 'test-issuer:test-admin', 'authorization_granted', 'group',
  'test-approved-group', '00000000-0000-4000-8000-000000000001'
);

DO $$
DECLARE
  statement TEXT;
BEGIN
  IF (SELECT count(*) FROM oscal_guardian.target_authorizations WHERE enabled) <> 1 THEN
    RAISE EXCEPTION 'Admin mapping management failed';
  END IF;

  BEGIN
    INSERT INTO oscal_guardian.target_authorizations (
      target_id, principal_type, principal_id, created_by_subject
    ) VALUES ('test-target', 'group', 'test-approved-group', 'test-issuer:test-admin');
    RAISE EXCEPTION 'Expected duplicate mapping rejection';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;

  FOREACH statement IN ARRAY ARRAY[
    $q$INSERT INTO oscal_guardian.target_authorizations (
         target_id, principal_type, principal_id, created_by_subject
       ) VALUES ('t', 'invalid', 'p', 'a')$q$,
    $q$INSERT INTO oscal_guardian.authorization_audit_events (
         target_id, actor_subject, event_type, principal_type
       ) VALUES ('t', 'a', 'e', 'group')$q$,
    $q$INSERT INTO oscal_guardian.authorization_audit_events (
         target_id, actor_subject, event_type, event_data
       ) VALUES ('t', 'a', 'e', '[]')$q$
  ] LOOP
    BEGIN
      EXECUTE statement;
      RAISE EXCEPTION 'Expected authorization/audit constraint rejection: %', statement;
    EXCEPTION WHEN check_violation THEN
      NULL;
    END;
  END LOOP;

  BEGIN
    INSERT INTO oscal_guardian.authorization_audit_events (
      target_id, actor_subject, event_type, job_id
    ) VALUES ('t', 'a', 'e', '00000000-0000-4000-8000-000000000099');
    RAISE EXCEPTION 'Expected audit job foreign-key rejection';
  EXCEPTION WHEN foreign_key_violation THEN
    NULL;
  END;

  FOREACH statement IN ARRAY ARRAY[
    'SELECT * FROM oscal_guardian.ssp_apply_jobs',
    'INSERT INTO oscal_guardian.ssp_apply_jobs DEFAULT VALUES',
    'UPDATE oscal_guardian.ssp_apply_jobs SET state = ''unknown''',
    'DELETE FROM oscal_guardian.ssp_apply_jobs',
    'SELECT * FROM oscal_guardian.authorization_audit_events',
    'UPDATE oscal_guardian.authorization_audit_events SET event_type = ''changed''',
    'DELETE FROM oscal_guardian.authorization_audit_events',
    'TRUNCATE oscal_guardian.authorization_audit_events',
    'INSERT INTO oscal_guardian.authorization_audit_events (id) VALUES (10)',
    'INSERT INTO oscal_guardian.authorization_audit_events (occurred_at) VALUES (now())',
    'SELECT setval(''oscal_guardian.authorization_audit_events_id_seq'', 1)',
    'SELECT nextval(''public.oscal_guardian_test_other_seq'')',
    'CREATE TABLE oscal_guardian.unauthorized (id int)'
  ] LOOP
    BEGIN
      EXECUTE statement;
      RAISE EXCEPTION 'Expected admin permission denial: %', statement;
    EXCEPTION WHEN insufficient_privilege THEN
      NULL;
    END;
  END LOOP;
END
$$;

SET LOCAL ROLE oscal_guardian_ssp_apply_service;
DO $$
BEGIN
  IF (SELECT count(*) FROM oscal_guardian.target_authorizations WHERE enabled) <> 1 THEN
    RAISE EXCEPTION 'Service cannot read approved mappings';
  END IF;
END
$$;

SET LOCAL ROLE oscal_guardian_test_legacy_app;
UPDATE public.extended_data SET payload = '{"preserved":true}' WHERE scope_id = 'test-system';
DO $$
BEGIN
  IF (SELECT count(*) FROM public.adobe_teams) <> 1 THEN
    RAISE EXCEPTION 'Existing application lookup data changed';
  END IF;
  BEGIN
    PERFORM * FROM oscal_guardian.authorization_audit_events;
    RAISE EXCEPTION 'Public-schema bootstrap leaked Guardian audit access';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END
$$;

RESET ROLE;
DO $$
BEGIN
  IF (SELECT count(*) FROM oscal_guardian.authorization_audit_events) <> 1 THEN
    RAISE EXCEPTION 'Append-only audit assertion failed';
  END IF;
  BEGIN
    DELETE FROM oscal_guardian.ssp_apply_jobs WHERE id = '00000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'Audit job reference was not retained';
  EXCEPTION WHEN foreign_key_violation THEN
    NULL;
  END;
END
$$;
COMMIT;
