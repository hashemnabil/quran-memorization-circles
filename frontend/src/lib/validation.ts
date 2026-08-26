/**
 * Client-side mirror of `backend/src/common/validators/phone.ts`. The server is
 * still the authority — this only gives the person filling the form an answer
 * before they press save.
 */

/** A Saudi mobile number in its stored form: 10 digits starting with 05. */
export const PHONE_PATTERN = /^05\d{8}$/;

export const PHONE_HINT = 'مثال: 0551234567';

/** Accepts `+966…`, `00966…`, spaces and dashes; returns the stored form. */
export function normalizePhone(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';

  let digits = trimmed.replace(/[\s\-()]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  if (!/^\d+$/.test(digits)) return trimmed;

  if (digits.startsWith('00966')) digits = digits.slice(5);
  else if (digits.startsWith('966')) digits = digits.slice(3);

  if (/^5\d{8}$/.test(digits)) digits = `0${digits}`;
  return digits;
}

/**
 * Returns an Arabic error message, or an empty string when the value is fine.
 * A blank optional field is fine; a blank required one is not.
 */
export function phoneError(value: string | undefined | null, required = false): string {
  const normalized = normalizePhone(value ?? '');
  if (!normalized) return required ? 'رقم الجوال مطلوب' : '';
  if (!PHONE_PATTERN.test(normalized)) {
    return 'رقم الجوال غير صالح، يجب أن يبدأ بـ 05 ويتكوّن من 10 أرقام';
  }
  return '';
}

/**
 * Client-side mirror of `backend/src/common/validators/username.ts`.
 *
 * Deliberately permissive: letters alone, digits alone, or any mix. A dot,
 * dash or underscore may separate but not start or end the name.
 */
export const USERNAME_PATTERN = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;

export const USERNAME_HINT = 'حروف إنجليزية أو أرقام أو كليهما — مثال: ahmed2026';

export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

export function usernameError(value: string | undefined | null): string {
  const name = normalizeUsername(value ?? '');
  if (!name) return 'اسم المستخدم مطلوب';
  if (name.length < 3) return 'اسم المستخدم يجب أن يكون 3 أحرف على الأقل';
  if (name.length > 32) return 'اسم المستخدم يجب ألا يتجاوز 32 حرفاً';
  if (!USERNAME_PATTERN.test(name)) {
    return 'اسم المستخدم يجب أن يتكوّن من حروف إنجليزية أو أرقام، ويمكن استخدام . _ - كفاصل';
  }
  return '';
}

/** Optional e-mail: blank is fine, malformed is not. */
export function emailError(value: string | undefined | null): string {
  const email = (value ?? '').trim();
  if (!email) return '';
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? '' : 'البريد الإلكتروني غير صالح';
}
