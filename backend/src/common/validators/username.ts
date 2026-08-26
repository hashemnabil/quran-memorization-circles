import { applyDecorators } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

/**
 * Login name rules, deliberately permissive: letters on their own, digits on
 * their own, or any mix. Nothing is *required* — no forced digit, no forced
 * capital, no forced symbol — because the people using this system are mosque
 * staff, not security engineers, and a rule they cannot satisfy is a rule that
 * ends up written on a sticky note.
 *
 * A dot, dash or underscore is allowed as a separator but may not start or end
 * the name, so `ahmed.ali` works while `.ahmed` does not.
 */
export const USERNAME_PATTERN = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;

export const USERNAME_MESSAGE =
  'اسم المستخدم يجب أن يتكوّن من حروف إنجليزية أو أرقام (أو كليهما)، ويمكن استخدام . _ - كفاصل';

export const USERNAME_HINT = 'حروف أو أرقام أو كليهما — مثال: ahmed، ahmed2026، ahmed.ali';

/** Login names are case-insensitive, so they are stored and compared lower-cased. */
export function normalizeUsername(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  return value.trim().toLowerCase();
}

/** Reserved names that would be confusing or dangerous to hand out. */
const RESERVED = new Set(['admin', 'administrator', 'root', 'system', 'support', 'null', 'undefined']);

export function isReservedUsername(username: string, allowAdmin = false) {
  if (allowAdmin && username === 'admin') return false;
  return RESERVED.has(username);
}

export function UsernameField(description = 'اسم المستخدم — يُستخدم لتسجيل الدخول') {
  return applyDecorators(
    ApiProperty({ example: 'ahmed2026', description, minLength: 3, maxLength: 32 }),
    Transform(({ value }) => normalizeUsername(value)),
    IsString(),
    MinLength(3, { message: 'اسم المستخدم يجب أن يكون 3 أحرف على الأقل' }),
    MaxLength(32, { message: 'اسم المستخدم يجب ألا يتجاوز 32 حرفاً' }),
    Matches(USERNAME_PATTERN, { message: USERNAME_MESSAGE }),
  );
}
