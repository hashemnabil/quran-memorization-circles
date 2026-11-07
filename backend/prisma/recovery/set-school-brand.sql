-- Optional one-time branding update for installations that do not use migrations.
-- Apply only after confirming the `default` school_settings row exists.
ALTER TABLE public.school_settings
  ALTER COLUMN "name" SET DEFAULT 'مدرسة عبدالله بن عمر';

UPDATE public.school_settings
SET "name" = 'مدرسة عبدالله بن عمر'
WHERE "id" = 'default'
  AND "name" IN (
    'حلقات تحفيظ القرآن الكريم',
    'حلقات تحفيظ السوسي',
    'مدرسة النور لتحفيظ القرآن الكريم'
  );