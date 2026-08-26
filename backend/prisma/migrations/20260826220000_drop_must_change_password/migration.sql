-- Removes the forced-password-change mechanism entirely.
--
-- Setting a password for someone made the system demand they replace it at the
-- next sign-in, and flagged them in the users list until they did. In a school
-- the administration hands out accounts in person; the extra step interrupted
-- the person being helped and told the administrator nothing they did not
-- already know. Whoever sets a password is trusted to have chosen it.
--
-- Nothing reads the column any more, so it goes with the behaviour.
ALTER TABLE "users" DROP COLUMN IF EXISTS "mustChangePassword";
