-- Only change hints enter the global journal. Message/comment bodies stay out.
CREATE OR REPLACE FUNCTION capture_communication_hint() RETURNS trigger AS $$
DECLARE row_data JSONB; row_id TEXT;
BEGIN
  row_data := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  row_id := COALESCE(row_data->>'id', row_data->>'postId', row_data->>'commentId');
  IF row_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('quran-sync-journal'), 0);
    INSERT INTO sync_changes ("entity", "entityId", "operation", "payload")
      VALUES (TG_TABLE_NAME, row_id, CASE WHEN TG_OP='DELETE' THEN 'DELETE' ELSE 'UPSERT' END, '{}'::jsonb);
  END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;
DO $$ DECLARE name TEXT; BEGIN
  FOREACH name IN ARRAY ARRAY['messages','conversation_members','CommunityPost','CommunityComment','CommunityLike','CommunityCommentLike'] LOOP
    IF to_regclass(format('%I',name)) IS NOT NULL THEN
      EXECUTE format('CREATE TRIGGER communication_sync_hint AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION capture_communication_hint()',name);
    END IF;
  END LOOP;
END $$;
