ALTER TABLE "school_settings"
  ADD COLUMN "donationsEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "donationTitle" TEXT,
  ADD COLUMN "donationDescription" TEXT,
  ADD COLUMN "donationGoalAmount" INTEGER,
  ADD COLUMN "donationRaisedAmount" INTEGER,
  ADD COLUMN "donationCurrency" TEXT,
  ADD COLUMN "donationMethod" TEXT,
  ADD COLUMN "donationLink" TEXT;
