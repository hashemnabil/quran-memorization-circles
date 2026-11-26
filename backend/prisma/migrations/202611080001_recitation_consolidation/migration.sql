-- Additive enum extension: existing recitations and review types remain unchanged.
ALTER TYPE "RecitationType" ADD VALUE IF NOT EXISTS 'CONSOLIDATION';
