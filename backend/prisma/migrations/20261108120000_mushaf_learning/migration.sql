-- Additive: existing scores and attendance remain unchanged.
ALTER TYPE "AttendanceStatus" ADD VALUE IF NOT EXISTS 'LATE';
ALTER TABLE recitations ADD COLUMN "typeCounters" JSONB, ADD COLUMN "wordErrors" JSONB, ADD COLUMN "gradingSnapshot" JSONB, ADD COLUMN "errorRatio" DOUBLE PRECISION;
ALTER TABLE attendance ADD COLUMN "customStatus" TEXT, ADD COLUMN points DOUBLE PRECISION NOT NULL DEFAULT 0, ADD COLUMN "scoringSnapshot" JSONB;
CREATE TABLE learning_rule_sets (id TEXT PRIMARY KEY, "scopeId" TEXT NOT NULL, rules JSONB NOT NULL, "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX learning_rule_scope ON learning_rule_sets("scopeId", "createdAt" DESC);
CREATE TABLE learning_points_audit (id BIGSERIAL PRIMARY KEY, "studentId" TEXT NOT NULL, source TEXT NOT NULL, "sourceId" TEXT NOT NULL, before_points DOUBLE PRECISION NOT NULL, after_points DOUBLE PRECISION NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX learning_audit_student ON learning_points_audit("studentId", "createdAt" DESC);

-- The old trigger used an independent settings table and overwrote server grades.
DROP TRIGGER IF EXISTS recitations_calculate_daily_grade ON recitations;
-- Some existing schools never had the legacy `tajweed` column. Preserve it
-- when present, and leave already recorded tajweedErrors unchanged otherwise.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'recitations'
      AND column_name = 'tajweed'
  ) THEN
    EXECUTE 'UPDATE recitations SET "tajweedErrors"=tajweed WHERE "tajweedErrors"=0 AND tajweed>0';
  END IF;
END $$;
CREATE OR REPLACE FUNCTION refresh_learning_total(student_id TEXT) RETURNS DOUBLE PRECISION AS $$
DECLARE total DOUBLE PRECISION;
BEGIN
 PERFORM 1 FROM students WHERE id=student_id FOR UPDATE;
 SELECT ROUND((COALESCE((SELECT SUM(points) FROM recitations WHERE "studentId"=student_id AND "deletedAt" IS NULL),0)+COALESCE((SELECT SUM(points) FROM surah_completions WHERE "studentId"=student_id),0)+COALESCE((SELECT SUM(points) FROM attendance WHERE "studentId"=student_id),0))::numeric,2)::DOUBLE PRECISION INTO total;
 UPDATE students SET "totalPoints"=total,"updatedAt"=CURRENT_TIMESTAMP WHERE id=student_id;RETURN total;
END; $$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION score_learning_attendance() RETURNS trigger AS $$
DECLARE policy JSONB; rule JSONB; chosen TEXT;
BEGIN
 IF TG_OP='UPDATE' AND NEW.status=OLD.status AND NEW."customStatus" IS NOT DISTINCT FROM OLD."customStatus" THEN
 NEW.points=OLD.points;NEW."scoringSnapshot"=OLD."scoringSnapshot";RETURN NEW;END IF;
 SELECT rules INTO policy FROM learning_rule_sets WHERE "scopeId" IN ('school',NEW."circleId") ORDER BY ("scopeId" <> 'school') DESC,"createdAt" DESC,id DESC LIMIT 1;
 chosen=COALESCE(NEW."customStatus",NEW.status::text);
 SELECT value INTO rule FROM jsonb_array_elements(COALESCE(policy->'attendance','[]'::jsonb)) WHERE value->>'id'=chosen AND value->>'enabled'='true';
 IF policy IS NOT NULL AND rule IS NULL THEN RAISE EXCEPTION 'Invalid or disabled attendance status';END IF;
 NEW.points=ROUND((COALESCE((rule->>'points')::DOUBLE PRECISION,0)*COALESCE((policy#>>'{weights,attendance}')::DOUBLE PRECISION,1))::numeric,2)::DOUBLE PRECISION;
 NEW."scoringSnapshot"=jsonb_build_object('status',chosen,'label',COALESCE(rule->>'label',chosen),'points',NEW.points,'rule',rule,'weights',policy->'weights');RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER learning_attendance_score BEFORE INSERT OR UPDATE ON attendance FOR EACH ROW EXECUTE FUNCTION score_learning_attendance();
CREATE OR REPLACE FUNCTION audit_learning_points() RETURNS trigger AS $$
DECLARE student_id TEXT; source_id TEXT; before_value DOUBLE PRECISION:=0;after_value DOUBLE PRECISION:=0;
BEGIN
 IF TG_OP<>'INSERT' THEN student_id=OLD."studentId";source_id=OLD.id;before_value=OLD.points;IF TG_TABLE_NAME='recitations' AND to_jsonb(OLD)->>'deletedAt' IS NOT NULL THEN before_value=0;END IF;END IF;
 IF TG_OP<>'DELETE' THEN student_id=NEW."studentId";source_id=NEW.id;after_value=NEW.points;IF TG_TABLE_NAME='recitations' AND to_jsonb(NEW)->>'deletedAt' IS NOT NULL THEN after_value=0;END IF;END IF;
 IF before_value IS DISTINCT FROM after_value THEN
 INSERT INTO learning_points_audit ("studentId",source,"sourceId",before_points,after_points) VALUES (student_id,TG_TABLE_NAME,source_id,before_value,after_value);
 PERFORM refresh_learning_total(student_id);END IF;RETURN NULL;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER learning_attendance_points AFTER INSERT OR UPDATE OR DELETE ON attendance FOR EACH ROW EXECUTE FUNCTION audit_learning_points();
CREATE TRIGGER learning_recitation_points AFTER INSERT OR UPDATE OR DELETE ON recitations FOR EACH ROW EXECUTE FUNCTION audit_learning_points();
CREATE TRIGGER learning_achievement_points AFTER INSERT OR UPDATE OR DELETE ON surah_completions FOR EACH ROW EXECUTE FUNCTION audit_learning_points();

-- Opening balances retain the stored historical points; nothing is regraded.
INSERT INTO learning_points_audit ("studentId",source,"sourceId",before_points,after_points,"createdAt") SELECT "studentId",'recitations',id,0,points,"createdAt" FROM recitations WHERE "deletedAt" IS NULL AND points<>0;
INSERT INTO learning_points_audit ("studentId",source,"sourceId",before_points,after_points,"createdAt") SELECT "studentId",'surah_completions',id,0,points,"completedAt" FROM surah_completions WHERE points<>0;

CREATE TRIGGER learning_rules_sync_hint AFTER INSERT ON learning_rule_sets FOR EACH ROW EXECUTE FUNCTION capture_full_sync_hint();
