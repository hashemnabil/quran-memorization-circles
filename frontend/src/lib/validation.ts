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
