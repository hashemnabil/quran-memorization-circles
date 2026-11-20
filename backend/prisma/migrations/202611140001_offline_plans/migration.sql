-- Journal identifiers only; plan contents remain behind the student access policy.
DROP TRIGGER IF EXISTS full_sync_hint ON memorization_plans;
CREATE TRIGGER full_sync_hint AFTER INSERT OR UPDATE OR DELETE ON memorization_plans
FOR EACH ROW EXECUTE FUNCTION capture_full_sync_hint();
DROP TRIGGER IF EXISTS full_sync_hint ON memorization_progress;
CREATE TRIGGER full_sync_hint AFTER INSERT OR UPDATE OR DELETE ON memorization_progress
FOR EACH ROW EXECUTE FUNCTION capture_full_sync_hint();
