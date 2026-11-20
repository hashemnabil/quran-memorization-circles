-- Run once in the Neon SQL editor before deploying if production migrations are baselined manually.
ALTER TABLE public.school_settings
  ADD COLUMN IF NOT EXISTS "donationBankPalestine" TEXT,
  ADD COLUMN IF NOT EXISTS "donationIslamicBank" TEXT,
  ADD COLUMN IF NOT EXISTS "donationJawwal" TEXT,
  ADD COLUMN IF NOT EXISTS "donationPalPay" TEXT;
