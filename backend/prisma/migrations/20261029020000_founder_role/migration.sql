-- Defines a role only. No existing account is promoted.
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'FOUNDER';
