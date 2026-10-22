-- Apply once in the production SQL editor before deploying the donation page.
ALTER TABLE public.school_settings
  ADD COLUMN IF NOT EXISTS "donationsEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "donationTitle" TEXT,
  ADD COLUMN IF NOT EXISTS "donationDescription" TEXT,
  ADD COLUMN IF NOT EXISTS "donationGoalAmount" INTEGER,
  ADD COLUMN IF NOT EXISTS "donationRaisedAmount" INTEGER,
  ADD COLUMN IF NOT EXISTS "donationCurrency" TEXT,
  ADD COLUMN IF NOT EXISTS "donationMethod" TEXT,
  ADD COLUMN IF NOT EXISTS "donationLink" TEXT,
  ADD COLUMN IF NOT EXISTS "donationBankPalestine" TEXT,
  ADD COLUMN IF NOT EXISTS "donationIslamicBank" TEXT,
  ADD COLUMN IF NOT EXISTS "donationJawwal" TEXT,
  ADD COLUMN IF NOT EXISTS "donationPalPay" TEXT;
