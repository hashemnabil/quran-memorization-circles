-- Restore the actual progression shown in the student table:
-- Hizb 60, Hizb 59, Juz 30, Hizb 58, Hizb 57, Juz 29, ...
-- Move both kinds out of the unique order range before assigning the canonical order.
UPDATE "exam_sections"
SET "order" = "order" + 3000
WHERE "kind" IN ('HIZB', 'JUZ');

UPDATE "exam_sections"
SET
  "order" = ((FLOOR((60 - CAST(SUBSTRING("code" FROM 6) AS INTEGER)) / 2)::INTEGER) * 3)
             + ((60 - CAST(SUBSTRING("code" FROM 6) AS INTEGER)) % 2) + 1,
  "isActive" = true,
  "isRequired" = true
WHERE "kind" = 'HIZB'
  AND "code" ~ '^HIZB-[0-9]{2}$';

UPDATE "exam_sections"
SET
  "order" = (30 - CAST(SUBSTRING("code" FROM 5) AS INTEGER)) * 3 + 3,
  "isActive" = true,
  "isRequired" = true
WHERE "kind" = 'JUZ'
  AND "code" ~ '^JUZ-[0-9]{2}$';
