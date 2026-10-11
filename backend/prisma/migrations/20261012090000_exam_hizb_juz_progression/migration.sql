-- Restore the full hizb/juz programme in the requested interleaved order:
-- hizb 60, hizb 59, juz 30, hizb 58, hizb 57, juz 29, ... hizb 1, juz 1.
--
-- Park EVERY existing section in a disjoint range first. The previous migration
-- left JUZ rows at orders 1001..1030 and HIZB rows at 1..60, so shifting only
-- HIZB by 1000 would violate the unique index on "order".
UPDATE "exam_sections"
SET "order" = "order" + 10000;

-- Number the 60 hizb rows in their slots. PostgreSQL integer division is
-- intentional here: adjacent hizb rows share a juz slot pair.
UPDATE "exam_sections"
SET "order" =
  (((60 - substring("code" from 6)::integer) / 2) * 3)
  + ((60 - substring("code" from 6)::integer) % 2) + 1,
    "isRequired" = true,
    "isActive" = true
WHERE "kind" = 'HIZB'
  AND "code" ~ '^HIZB-[0-9]{2}$';

-- Reuse existing retired JUZ rows when present (the 2026-08 migration kept
-- them inactive for historical records); insert only genuinely missing rows.
INSERT INTO "exam_sections"
  ("id", "name", "code", "order", "kind", "isRequired", "pagesCount", "minScore", "description", "isActive", "createdAt")
SELECT
  md5(random()::text || clock_timestamp()::text),
  'الجزء ' || n,
  'JUZ-' || lpad(n::text, 2, '0'),
  ((30 - n) * 3) + 3,
  'JUZ',
  true,
  20,
  60,
  'اختبار حفظ وإتقان الجزء ' || n,
  true,
  CURRENT_TIMESTAMP
FROM generate_series(1, 30) AS n
ON CONFLICT ("code") DO UPDATE
SET "name" = EXCLUDED."name",
    "order" = EXCLUDED."order",
    "kind" = EXCLUDED."kind",
    "isRequired" = EXCLUDED."isRequired",
    "pagesCount" = EXCLUDED."pagesCount",
    "minScore" = EXCLUDED."minScore",
    "description" = EXCLUDED."description",
    "isActive" = EXCLUDED."isActive";
