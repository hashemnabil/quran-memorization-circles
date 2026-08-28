-- Supervisors are also valid teacher identities.
-- Backfill the teacher profile required by CircleTeacher / Recitation.
INSERT INTO "teacher_profiles" ("id", "userId", "gender", "employmentType", "isActive", "createdAt", "updatedAt")
SELECT gen_random_uuid(), u."id", 'MALE', 'VOLUNTEER', u."isActive", NOW(), NOW()
FROM "users" u
LEFT JOIN "teacher_profiles" t ON t."userId" = u."id"
WHERE u."role" = 'SUPERVISOR' AND t."id" IS NULL;

-- If a supervisor already has a teacher profile that was soft-deleted, restore it.
UPDATE "teacher_profiles" t
SET "deletedAt" = NULL,
    "isActive" = u."isActive",
    "updatedAt" = NOW()
FROM "users" u
WHERE t."userId" = u."id"
  AND u."role" = 'SUPERVISOR'
  AND t."deletedAt" IS NOT NULL;

-- Keep future supervisor accounts automatically linked to a teacher profile.
CREATE OR REPLACE FUNCTION ensure_supervisor_teacher_profile()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."role" = 'SUPERVISOR' THEN
    INSERT INTO "teacher_profiles" ("id", "userId", "gender", "employmentType", "isActive", "createdAt", "updatedAt")
    VALUES (gen_random_uuid(), NEW."id", 'MALE', 'VOLUNTEER', NEW."isActive", NOW(), NOW())
    ON CONFLICT ("userId") DO UPDATE
      SET "deletedAt" = NULL,
          "isActive" = EXCLUDED."isActive",
          "updatedAt" = NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_supervisor_teacher_profile ON "users";
CREATE TRIGGER trg_supervisor_teacher_profile
AFTER INSERT OR UPDATE OF "role" ON "users"
FOR EACH ROW
EXECUTE FUNCTION ensure_supervisor_teacher_profile();

-- Whenever a supervisor is assigned to a circle, that same person becomes the
-- primary teacher of that circle. Existing students and all their records stay
-- attached to the same Circle; only the teacher assignment changes.
CREATE OR REPLACE FUNCTION sync_circle_supervisor_as_primary_teacher()
RETURNS TRIGGER AS $$
DECLARE
  supervisor_teacher_id TEXT;
BEGIN
  IF NEW."supervisorId" IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT t."id" INTO supervisor_teacher_id
  FROM "teacher_profiles" t
  WHERE t."userId" = NEW."supervisorId"
    AND t."deletedAt" IS NULL
  LIMIT 1;

  IF supervisor_teacher_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Do not leave the supervisor as an assistant while also making them primary.
  UPDATE "circle_teachers"
  SET "endedAt" = NOW(),
      "note" = COALESCE("note", 'تعيين المشرف كمحفظ أساسي')
  WHERE "circleId" = NEW."id"
    AND "endedAt" IS NULL
    AND ("teacherId" <> supervisor_teacher_id OR "role" <> 'PRIMARY');

  INSERT INTO "circle_teachers" ("id", "circleId", "teacherId", "role", "startedAt", "createdAt", "note")
  SELECT gen_random_uuid(), NEW."id", supervisor_teacher_id, 'PRIMARY', NOW(), NOW(), 'المشرف هو المحفظ الأساسي للحلقة'
  WHERE NOT EXISTS (
    SELECT 1
    FROM "circle_teachers"
    WHERE "circleId" = NEW."id"
      AND "teacherId" = supervisor_teacher_id
      AND "role" = 'PRIMARY'
      AND "endedAt" IS NULL
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_circle_supervisor_primary_teacher ON "circles";
CREATE TRIGGER trg_circle_supervisor_primary_teacher
AFTER INSERT OR UPDATE OF "supervisorId" ON "circles"
FOR EACH ROW
EXECUTE FUNCTION sync_circle_supervisor_as_primary_teacher();

-- Existing supervised circles must follow the same rule immediately.
UPDATE "circles" c
SET "updatedAt" = NOW()
WHERE c."supervisorId" IS NOT NULL
  AND c."deletedAt" IS NULL;
