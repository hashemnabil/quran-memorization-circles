-- Additive repair for the existing unmanaged public schema (Prisma P3005).
-- Run the whole file on the application's database branch. Never baseline old
-- migrations or reset/seed production to fix missing SMS tables.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '60s';

DO $sms_recovery$
DECLARE
  expected RECORD;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('quran-sms-schema-recovery'), 0);
  IF to_regclass('public.users') IS NULL OR to_regclass('public.students') IS NULL THEN
    RAISE EXCEPTION 'Expected application tables are missing; check the selected database branch';
  END IF;

  CREATE TABLE IF NOT EXISTS public.sms_campaigns (
    "id" TEXT PRIMARY KEY,
    "requestKey" TEXT NOT NULL UNIQUE,
    "requestHash" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS public.sms_messages (
    "id" TEXT PRIMARY KEY,
    "campaignId" TEXT NOT NULL REFERENCES public.sms_campaigns("id") ON DELETE CASCADE,
    "phone" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "encryptedText" TEXT NOT NULL,
    "credential" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "errorCode" TEXT,
    "claimedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL
  );
  CREATE TABLE IF NOT EXISTS public.sms_templates (
    "kind" TEXT PRIMARY KEY,
    "text" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL
  );
  CREATE INDEX IF NOT EXISTS "sms_messages_status_updatedAt_idx"
    ON public.sms_messages ("status", "updatedAt");
  CREATE INDEX IF NOT EXISTS "sms_messages_campaignId_idx"
    ON public.sms_messages ("campaignId");

  -- Existing tables must match the application. Refuse incompatible partial
  -- schemas rather than altering columns or discarding any existing data.
  FOR expected IN SELECT * FROM (VALUES
    ('sms_campaigns','id','text',true),
    ('sms_campaigns','requestKey','text',true),
    ('sms_campaigns','requestHash','text',true),
    ('sms_campaigns','createdById','text',true),
    ('sms_campaigns','createdAt','timestamp(3) without time zone',true),
    ('sms_messages','id','text',true),
    ('sms_messages','campaignId','text',true),
    ('sms_messages','phone','text',true),
    ('sms_messages','title','text',true),
    ('sms_messages','encryptedText','text',true),
    ('sms_messages','credential','boolean',true),
    ('sms_messages','status','text',true),
    ('sms_messages','attempts','integer',true),
    ('sms_messages','errorCode','text',false),
    ('sms_messages','claimedAt','timestamp(3) without time zone',false),
    ('sms_messages','updatedAt','timestamp(3) without time zone',true),
    ('sms_templates','kind','text',true),
    ('sms_templates','text','text',true),
    ('sms_templates','updatedAt','timestamp(3) without time zone',true)
  ) AS columns(table_name,column_name,column_type,not_null) LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_attribute a
      WHERE a.attrelid = to_regclass('public.' || expected.table_name)
        AND a.attname = expected.column_name AND NOT a.attisdropped
        AND format_type(a.atttypid,a.atttypmod) = expected.column_type
        AND a.attnotnull = expected.not_null
    ) THEN
      RAISE EXCEPTION 'Incompatible SMS schema: %.%; no repair committed', expected.table_name, expected.column_name;
    END IF;
  END LOOP;

  FOR expected IN SELECT * FROM (VALUES
    ('sms_campaigns','id'),('sms_messages','id'),('sms_templates','kind')
  ) AS keys(table_name,column_name) LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint c
      WHERE c.conrelid = to_regclass('public.' || expected.table_name) AND c.contype = 'p'
        AND c.conkey = ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid = c.conrelid AND attname = expected.column_name)]::smallint[]
    ) THEN RAISE EXCEPTION 'SMS primary key is missing on %', expected.table_name; END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    WHERE c.conrelid = 'public.sms_campaigns'::regclass AND c.contype IN ('u','p')
      AND c.conkey = ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid = c.conrelid AND attname = 'requestKey')]::smallint[]
  ) THEN RAISE EXCEPTION 'SMS requestKey must have a unique constraint'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    WHERE c.conrelid = 'public.sms_messages'::regclass AND c.contype = 'f'
      AND c.confrelid = 'public.sms_campaigns'::regclass AND c.confdeltype = 'c'
      AND c.conkey = ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid = c.conrelid AND attname = 'campaignId')]::smallint[]
      AND c.confkey = ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid = c.confrelid AND attname = 'id')]::smallint[]
  ) THEN RAISE EXCEPTION 'SMS campaign foreign key is missing or incompatible'; END IF;
END
$sms_recovery$;

COMMIT;

SELECT tablename FROM pg_tables
WHERE schemaname = 'public' AND tablename IN ('sms_campaigns','sms_messages','sms_templates')
ORDER BY tablename;
