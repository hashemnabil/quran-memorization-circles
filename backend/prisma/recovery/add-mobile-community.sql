-- Apply this WHOLE file to the application's Neon database after a backup.
-- Additive repair for 202611050001_mobile_community on an unmanaged schema.
-- Does not delete application data or invent Prisma migration history.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '90s';
SET LOCAL search_path = public, pg_catalog;

DO $guard$
BEGIN
  IF to_regclass('public.users') IS NULL
     OR to_regclass('public."CommunityPost"') IS NULL
     OR to_regclass('public."CommunityStory"') IS NULL
     OR to_regclass('public.support_tickets') IS NULL THEN
    RAISE EXCEPTION 'Expected application tables are missing. Check the selected database branch.';
  END IF;
END
$guard$;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS bio VARCHAR(280),
  ADD COLUMN IF NOT EXISTS "communityMentionNotifications" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public."CommunityPost"
  ADD COLUMN IF NOT EXISTS audience TEXT NOT NULL DEFAULT 'ALL',
  ADD COLUMN IF NOT EXISTS "recipientIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS mentions JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS "mediaIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

DO $constraint$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='community_audience_valid'
                 AND conrelid='public."CommunityPost"'::regclass) THEN
    ALTER TABLE public."CommunityPost" ADD CONSTRAINT community_audience_valid
      CHECK ((audience='ALL' AND cardinality("recipientIds")=0)
        OR (audience='SELECTED' AND cardinality("recipientIds") BETWEEN 1 AND 100));
  END IF;
END
$constraint$;
CREATE INDEX IF NOT EXISTS "CommunityPost_recipientIds_idx"
  ON public."CommunityPost" USING GIN ("recipientIds");

ALTER TABLE public."CommunityStory"
  ADD COLUMN IF NOT EXISTS mentions JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS background TEXT NOT NULL DEFAULT '#123c30',
  ADD COLUMN IF NOT EXISTS "textColor" TEXT NOT NULL DEFAULT '#ffffff',
  ADD COLUMN IF NOT EXISTS "fontSize" INTEGER NOT NULL DEFAULT 28,
  ADD COLUMN IF NOT EXISTS bold BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "mediaIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE TABLE IF NOT EXISTS public."CommunityMedia" (
  id TEXT PRIMARY KEY,
  "ownerId" TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  mime TEXT NOT NULL,
  bytes BYTEA NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "CommunityMedia_ownerId_createdAt_idx"
  ON public."CommunityMedia" ("ownerId", "createdAt");

ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS "deletionCompletedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "retentionNote" VARCHAR(2000);

-- Existing incompatible columns must abort the transaction, not look repaired.
DO $verify$
DECLARE mismatch TEXT;
BEGIN
  SELECT string_agg(expected.tbl||'.'||expected.col, ', ') INTO mismatch
  FROM (VALUES
    ('users','bio','character varying','YES'),
    ('users','communityMentionNotifications','boolean','NO'),
    ('CommunityPost','audience','text','NO'),
    ('CommunityPost','recipientIds','ARRAY','NO'),
    ('CommunityPost','mentions','jsonb','NO'),
    ('CommunityPost','mediaIds','ARRAY','NO'),
    ('CommunityStory','mentions','jsonb','NO'),
    ('CommunityStory','background','text','NO'),
    ('CommunityStory','textColor','text','NO'),
    ('CommunityStory','fontSize','integer','NO'),
    ('CommunityStory','bold','boolean','NO'),
    ('CommunityStory','mediaIds','ARRAY','NO'),
    ('CommunityMedia','id','text','NO'),
    ('CommunityMedia','ownerId','text','NO'),
    ('CommunityMedia','mime','text','NO'),
    ('CommunityMedia','bytes','bytea','NO'),
    ('CommunityMedia','createdAt','timestamp without time zone','NO'),
    ('support_tickets','deletionCompletedAt','timestamp without time zone','YES'),
    ('support_tickets','retentionNote','character varying','YES')
  ) AS expected(tbl,col,typ,nullable)
  LEFT JOIN information_schema.columns actual
    ON actual.table_schema='public' AND actual.table_name=expected.tbl AND actual.column_name=expected.col
  WHERE actual.column_name IS NULL OR actual.data_type<>expected.typ OR actual.is_nullable<>expected.nullable
    OR (expected.typ='ARRAY' AND actual.udt_name<>'_text');
  IF mismatch IS NOT NULL THEN
    RAISE EXCEPTION 'Incompatible community columns; transaction aborted: %', mismatch;
  END IF;
END
$verify$;

COMMIT;

-- Expected: all newly added columns listed here. No migration rows are changed.
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema='public' AND (
  (table_name='users' AND column_name IN ('bio','communityMentionNotifications')) OR
  (table_name='CommunityPost' AND column_name IN ('audience','recipientIds','mentions','mediaIds')) OR
  (table_name='CommunityStory' AND column_name IN ('mentions','background','textColor','fontSize','bold','mediaIds')) OR
  (table_name='CommunityMedia' AND column_name IN ('id','ownerId','mime','bytes','createdAt')) OR
  (table_name='support_tickets' AND column_name IN ('deletionCompletedAt','retentionNote'))
)
ORDER BY table_name,column_name;
