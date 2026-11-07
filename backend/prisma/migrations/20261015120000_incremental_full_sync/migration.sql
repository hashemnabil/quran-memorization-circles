-- Keep relationship IDs in tombstones so dependent offline projections refresh.
CREATE OR REPLACE FUNCTION capture_sync_change() RETURNS trigger AS $$
DECLARE row_data JSONB; previous_data JSONB; row_id TEXT; deleted BOOLEAN;
BEGIN
  row_data := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  row_id := row_data ->> 'id';
  IF row_id IS NULL THEN RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END; END IF;
  previous_data := CASE WHEN TG_OP = 'UPDATE' THEN jsonb_build_object('circleId', to_jsonb(OLD)->'circleId') ELSE NULL END;
  row_data := row_data - 'password' - 'passwordHash' - 'hashedPassword' - 'token'
    - 'accessToken' - 'refreshToken' - 'secret' - 'privateKey' - 'resetToken' - 'verificationToken';
  deleted := TG_OP = 'DELETE' OR COALESCE(row_data ->> 'deletedAt', '') <> '';
  PERFORM pg_advisory_xact_lock(hashtext('quran-sync-journal'), 0);
  INSERT INTO sync_changes ("entity", "entityId", "operation", "payload")
  VALUES (TG_TABLE_NAME, row_id, CASE WHEN deleted THEN 'DELETE' ELSE 'UPSERT' END,
    CASE WHEN deleted THEN jsonb_build_object('id', row_id,
      'studentId', row_data->'studentId', 'circleId', row_data->'circleId',
      'parentId', row_data->'parentId', 'userId', row_data->'userId',
      'teacherId', row_data->'teacherId', 'courseId', row_data->'courseId')
    ELSE row_data || jsonb_build_object('_previous', previous_data) END);
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

-- Extra domains record IDs only. Credentials and message/registry contents never
-- enter the journal; authenticated domain APIs supply authorized data separately.
CREATE OR REPLACE FUNCTION capture_full_sync_hint() RETURNS trigger AS $$
DECLARE row_data JSONB; row_id TEXT;
BEGIN
  IF TG_TABLE_NAME = 'users' AND TG_OP = 'UPDATE' THEN
    IF (to_jsonb(OLD) - 'lastLoginAt' - 'updatedAt') = (to_jsonb(NEW) - 'lastLoginAt' - 'updatedAt') THEN RETURN NEW; END IF;
  END IF;
  row_data := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  row_id := row_data ->> 'id';
  IF row_id IS NULL THEN RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('quran-sync-journal'), 0);
  INSERT INTO sync_changes ("entity", "entityId", "operation", "payload")
  VALUES (TG_TABLE_NAME, row_id, CASE WHEN TG_OP = 'DELETE' THEN 'DELETE' ELSE 'UPSERT' END,
    jsonb_build_object('id', row_id, 'studentId', row_data->'studentId',
      'circleId', row_data->'circleId', 'userId', row_data->'userId',
      'teacherId', row_data->'teacherId', 'courseId', row_data->'courseId',
      'dutyId', row_data->'dutyId', 'requestId', row_data->'requestId',
      'examId', row_data->'examId'));
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['users','teacher_profiles','parent_profiles',
    'circle_teachers','circle_memberships','exam_sections','exam_milestone_records',
    'exam_request_sections','exam_sections_on_exams','notifications','course_attendance',
    'preparation_assignments','surah_completions','support_tickets','ticket_messages',
    'conversations','conversation_members','messages','school_settings','registry_users',
    'certificate_templates','media_activities','media_plans','teacher_duties','teacher_duty_assignments']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS full_sync_hint ON %I', table_name);
    EXECUTE format('CREATE TRIGGER full_sync_hint AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION capture_full_sync_hint()', table_name);
  END LOOP;
END $$;
