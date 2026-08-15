-- Email verification is gone: login is email + password only.
ALTER TABLE "users" DROP COLUMN "emailVerifiedAt";

-- Existing phone numbers are normalised to the stored format (05XXXXXXXX) so the
-- new validation does not reject records that were saved before it existed.
-- Anything that cannot be understood is left alone for a human to correct.
CREATE OR REPLACE FUNCTION pg_temp.normalize_phone(raw text) RETURNS text AS $$
DECLARE d text;
BEGIN
  IF raw IS NULL OR btrim(raw) = '' THEN RETURN NULL; END IF;
  d := regexp_replace(raw, '[^0-9+]', '', 'g');
  d := ltrim(d, '+');
  IF d ~ '^00966' THEN d := substring(d from 6);
  ELSIF d ~ '^966' THEN d := substring(d from 4);
  END IF;
  IF d ~ '^5[0-9]{8}$' THEN d := '0' || d; END IF;
  IF d ~ '^05[0-9]{8}$' THEN RETURN d; END IF;
  RETURN raw;
END;
$$ LANGUAGE plpgsql;

UPDATE "users"           SET "phone"         = pg_temp.normalize_phone("phone")         WHERE "phone" IS NOT NULL;
UPDATE "parent_profiles" SET "phone"         = pg_temp.normalize_phone("phone")         WHERE "phone" IS NOT NULL;
UPDATE "parent_profiles" SET "altPhone"      = pg_temp.normalize_phone("altPhone")      WHERE "altPhone" IS NOT NULL;
UPDATE "students"        SET "phone"         = pg_temp.normalize_phone("phone")         WHERE "phone" IS NOT NULL;
UPDATE "students"        SET "guardianPhone" = pg_temp.normalize_phone("guardianPhone") WHERE "guardianPhone" IS NOT NULL;
