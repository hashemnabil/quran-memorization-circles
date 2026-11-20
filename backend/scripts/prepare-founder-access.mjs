// Generates local operator files only; never connects to or changes a database.
import { randomBytes, randomUUID } from 'node:crypto';
import { writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
const directory = new URL('../', import.meta.url);
const sqlPath = new URL('.env.founder-create.sql', directory);
const accessPath = new URL('.env.founder-access.txt', directory);
if (existsSync(sqlPath) || existsSync(accessPath)) throw new Error('Owner files already exist; refusing to overwrite credentials.');
const username = 'school.founder';
const password = randomBytes(24).toString('base64url');
const hash = await bcrypt.hash(password, 12);
const id = randomUUID(), auditId = randomUUID();
const sql = `-- Operator-only: verify database ownership before running. Creates one NEW founder; does not promote or update users.
BEGIN;
SET LOCAL lock_timeout = '10s';
DO $guard$
BEGIN
  IF EXISTS (SELECT 1 FROM public.users WHERE username = '${username}' OR role::text = 'FOUNDER') THEN
    RAISE EXCEPTION 'Founder or requested username already exists; stop and verify ownership.';
  END IF;
END
$guard$;
INSERT INTO public.users (id, username, "passwordHash", "fullName", role, "isActive", "mustChangePassword", "createdAt", "updatedAt")
VALUES ('${id}', '${username}', '${hash}', 'مؤسس النظام', 'FOUNDER', true, true, now(), now());
INSERT INTO public.activity_logs (id, "userId", action, summary, "entityType", "entityId", "createdAt")
VALUES ('${auditId}', '${id}', 'FOUNDER_CREATE_VERIFIED', 'إنشاء حساب مؤسس جديد بإجراء مشغّل قاعدة البيانات', 'User', '${id}', now());
COMMIT;
SELECT id, username, role, "mustChangePassword" FROM public.users WHERE id = '${id}';
`;
writeFileSync(sqlPath, sql, { flag: 'wx', mode: 0o600 });
writeFileSync(accessPath, `Username: ${username}\nTemporary password: ${password}\nChange the password immediately at /profile/settings after sign-in.\nThe account exists only after the private SQL file is successfully executed on the verified database.\n`, { flag: 'wx', mode: 0o600 });
console.log(`Prepared operator files (credentials are not printed):\n${fileURLToPath(sqlPath)}\n${fileURLToPath(accessPath)}`);
