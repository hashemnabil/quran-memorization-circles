-- Additive journal-policy change; no data tables or existing receipts are rewritten.
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

  -- Allocate the sequence only after the journal lock is held. This prevents
  -- a later seq committing first and making clients skip an earlier transaction.
  PERFORM pg_advisory_xact_lock(hashtext('quran-sync-journal'), 0);

  INSERT INTO sync_changes ("entity", "entityId", "operation", "payload")
  VALUES (table_entity, row_id, CASE WHEN is_deleted THEN 'DELETE' ELSE 'UPSERT' END,
          CASE WHEN is_deleted THEN jsonb_build_object(
            'id', row_id, 'circleId', row_data -> 'circleId',
            'parentId', row_data -> 'parentId', 'userId', row_data -> 'userId'
          ) ELSE row_data END);
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

