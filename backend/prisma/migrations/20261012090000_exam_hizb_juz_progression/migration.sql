-- Add the 30 juz' as independent exam milestones and impose the requested
-- order: hizb 60, hizb 59, juz 30, hizb 58, hizb 57, juz 29, ...
-- Shift existing orders first to avoid collisions with the unique order index.
UPDATE "exam_sections"
SET "order" = "order" + 1000
WHERE "kind" = 'HIZB';

UPDATE "exam_sections"
SET "order" =
  (((60 - substring("code" from 6)::integer) / 2) * 3)
  + ((60 - substring("code" from 6)::integer) % 2) + 1
WHERE "kind" = 'HIZB'
  AND "code" ~ '^HIZB-[0-9]{2}$';

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
ON CONFLICT DO NOTHING;
