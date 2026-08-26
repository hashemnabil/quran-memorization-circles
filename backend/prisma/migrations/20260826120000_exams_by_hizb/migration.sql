-- Exams are now sat by the hizb only.
--
-- The 30 juz' rows are kept so historical exams, requests and certificates still
-- resolve their section, but they are retired: nothing new can be requested
-- against them. The 60 ahzab become the whole programme.
--
-- `order` is unique, so the rows are moved through spare bands rather than
-- renumbered in place, which would trip the constraint mid-statement.

-- 1. Park the juz' rows above everything else and retire them.
UPDATE "exam_sections"
SET "order" = "order" + 1000,
    "isActive" = false
WHERE "kind" = 'JUZ';

-- 2. Park the ahzab out of the way of their own new numbering.
UPDATE "exam_sections"
SET "order" = "order" + 2000
WHERE "kind" = 'HIZB';

-- 3. The ahzab are now the programme: numbered 1..60, all required, all open.
--    Nothing gates one behind another -- a student may start at hizb 1 or at
--    hizb 60 -- so `order` only decides how the grid reads.
UPDATE "exam_sections"
SET "order" = CAST(substring("code" FROM 6) AS INTEGER),
    "isRequired" = true,
    "isActive" = true
WHERE "kind" = 'HIZB';
