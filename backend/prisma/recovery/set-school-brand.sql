-- Use in the production SQL editor only if the database does not apply Prisma migrations.
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
