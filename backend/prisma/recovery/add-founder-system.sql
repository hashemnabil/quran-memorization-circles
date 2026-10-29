-- Additive install for an existing unmanaged public schema (P3005).
-- Review and rehearse on a restored database before production use.
-- Does not baseline migration history, seed data, or promote any user.
-- Apply the WHOLE file on the confirmed application database branch.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '90s';
SET LOCAL search_path = public, pg_catalog;

DO $guard$
BEGIN
  IF to_regclass('public.users') IS NULL OR to_regclass('public.announcements') IS NULL THEN
    RAISE EXCEPTION 'Expected school tables are missing. Check the selected database branch.';
  END IF;
END
$guard$;

ALTER TYPE public."Role" ADD VALUE IF NOT EXISTS 'FOUNDER';
ALTER TABLE public.announcements
  ADD COLUMN IF NOT EXISTS "isPopup" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "popup" JSONB;

CREATE TABLE IF NOT EXISTS public.founder_assets (
  "id" TEXT PRIMARY KEY,
  "title" VARCHAR(100) NOT NULL,
  "kind" VARCHAR(30) NOT NULL,
  "mime" VARCHAR(40) NOT NULL,
  "content" BYTEA NOT NULL,
  "size" INTEGER NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "founder_assets_kind_isActive_idx"
  ON public.founder_assets("kind", "isActive");

CREATE TABLE IF NOT EXISTS public.announcement_receipts (
  "id" TEXT PRIMARY KEY,
  "announcementId" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "eventKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "announcement_receipts_announcementId_subject_kind_eventKey_key"
  ON public.announcement_receipts("announcementId", "subject", "kind", "eventKey");
CREATE INDEX IF NOT EXISTS "announcement_receipts_announcementId_kind_idx"
  ON public.announcement_receipts("announcementId", "kind");

CREATE TABLE IF NOT EXISTS public.presentation_choices (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "assetId" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "presentation_choices_userId_kind_key"
  ON public.presentation_choices("userId", "kind");

COMMIT;

-- Presence checks only; IF NOT EXISTS is not proof of a matching old definition.
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (table_name IN ('founder_assets', 'announcement_receipts', 'presentation_choices')
    OR table_name = 'announcements' AND column_name IN ('isPopup', 'popup'))
ORDER BY table_name, ordinal_position;
SELECT enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
JOIN pg_namespace n ON n.oid = t.typnamespace
WHERE n.nspname = 'public' AND t.typname = 'Role' AND e.enumlabel = 'FOUNDER';
