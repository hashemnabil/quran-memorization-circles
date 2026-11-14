-- Durable global sequence for incremental sync. Internal/authentication tables
-- are intentionally excluded: sync logs must never become a credential archive.
CREATE TABLE "sync_changes" (
  "seq" BIGSERIAL PRIMARY KEY,
  "entity" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "operation" TEXT NOT NULL CHECK ("operation" IN ('UPSERT', 'DELETE')),
  "payload" JSONB,
  "changedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "sync_changes_entity_entityId_seq_idx"
  ON "sync_changes" ("entity", "entityId", "seq");

CREATE TABLE "processed_operations" (
  "opId" VARCHAR(128) NOT NULL,
  "accountId" TEXT NOT NULL,
  "result" JSONB,
  "processedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("opId", "accountId")
);
CREATE INDEX "processed_operations_accountId_processedAt_idx"
  ON "processed_operations" ("accountId", "processedAt");

-- Use a conservative table allowlist, not "all tables": audit/auth/session/token
-- data and internal sync tables are never replicated. Per-entity API allowlists
-- remain mandatory even though sensitive keys are stripped here as defense in depth.
CREATE OR REPLACE FUNCTION capture_sync_change() RETURNS trigger AS $$
DECLARE
  row_data JSONB;
  row_id TEXT;
  table_entity TEXT;
  is_deleted BOOLEAN := FALSE;
BEGIN
  IF TG_OP = 'DELETE' THEN
    row_data := to_jsonb(OLD);
  ELSE
    row_data := to_jsonb(NEW);
  END IF;

  row_id := row_data ->> 'id';
  IF row_id IS NULL THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  -- Never persist credential, token, or secret fields in the generic journal.
  row_data := row_data
    - 'password' - 'passwordHash' - 'hashedPassword' - 'token'
    - 'accessToken' - 'refreshToken' - 'secret' - 'privateKey'
    - 'resetToken' - 'verificationToken';

  table_entity := TG_TABLE_NAME;
  is_deleted := TG_OP = 'DELETE' OR COALESCE(row_data ->> 'deletedAt', '') <> '';

  INSERT INTO sync_changes ("entity", "entityId", "operation", "payload")
  VALUES (table_entity, row_id, CASE WHEN is_deleted THEN 'DELETE' ELSE 'UPSERT' END,
          CASE WHEN is_deleted THEN NULL ELSE row_data END);
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

-- Explicit data-table allowlist; excludes users, registry identity, auth,
-- tokens, sessions, messages, audit logs, and the journal itself.
DO $$
DECLARE t RECORD;
BEGIN
  FOR t IN
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      AND table_name IN (
        'circles', 'students', 'attendance', 'recitations',
        'student_evaluations', 'student_notes', 'preparations',
        'announcements', 'courses', 'course_enrollments',
        'exams', 'exam_requests', 'transfers', 'transfer_requests',
        'suspension_requests', 'certificates', 'certificate_records',
        'student_file_requests', 'staff_attendance'
      )
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS sync_change_capture ON %I', t.table_name);
    EXECUTE format(
      'CREATE TRIGGER sync_change_capture AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION capture_sync_change()',
      t.table_name
    );
  END LOOP;
END $$;
