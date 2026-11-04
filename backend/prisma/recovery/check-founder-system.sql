-- READ ONLY: run this entire file in the official database's Neon SQL Editor.
-- Reports schema metadata only. No user records, credentials or mutations.
WITH expected(table_name, column_name, expected_type) AS (VALUES
  ('users', 'id', 'text'),
  ('announcements', 'id', 'text'),
  ('announcements', 'isPopup', 'boolean'),
  ('announcements', 'popup', 'jsonb'),
  ('founder_assets', 'id', 'text'),
  ('founder_assets', 'title', 'character varying'),
  ('founder_assets', 'kind', 'character varying'),
  ('founder_assets', 'mime', 'character varying'),
  ('founder_assets', 'content', 'bytea'),
  ('founder_assets', 'size', 'integer'),
  ('founder_assets', 'isActive', 'boolean'),
  ('founder_assets', 'createdById', 'text'),
  ('founder_assets', 'createdAt', 'timestamp without time zone'),
  ('announcement_receipts', 'id', 'text'),
  ('announcement_receipts', 'announcementId', 'text'),
  ('announcement_receipts', 'subject', 'text'),
  ('announcement_receipts', 'kind', 'text'),
  ('announcement_receipts', 'eventKey', 'text'),
  ('announcement_receipts', 'createdAt', 'timestamp without time zone'),
  ('presentation_choices', 'id', 'text'),
  ('presentation_choices', 'userId', 'text'),
  ('presentation_choices', 'kind', 'text'),
  ('presentation_choices', 'assetId', 'text'),
  ('presentation_choices', 'updatedAt', 'timestamp without time zone')
), report AS (
  SELECT e.table_name || '.' || e.column_name AS item,
    CASE WHEN c.column_name IS NULL THEN 'MISSING'
      WHEN c.data_type <> e.expected_type THEN 'TYPE_MISMATCH'
      ELSE 'OK' END AS status,
    e.expected_type, c.data_type AS actual_type
  FROM expected e LEFT JOIN information_schema.columns c
    ON c.table_schema = 'public' AND c.table_name = e.table_name AND c.column_name = e.column_name
)
SELECT item, status, expected_type, actual_type FROM report
UNION ALL
SELECT 'Role.FOUNDER', CASE WHEN EXISTS (
  SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
  JOIN pg_namespace n ON n.oid = t.typnamespace
  WHERE n.nspname = 'public' AND t.typname = 'Role' AND e.enumlabel = 'FOUNDER'
) THEN 'OK' ELSE 'MISSING' END, 'enum value', NULL
UNION ALL
SELECT '_prisma_migrations', CASE WHEN to_regclass('public._prisma_migrations') IS NULL
  THEN 'NO_HISTORY_TABLE' ELSE 'PRESENT_NOT_VERIFIED' END, 'audited migration history', NULL
ORDER BY item;
