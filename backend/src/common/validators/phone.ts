import { applyDecorators } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

/** A Saudi mobile number in its stored form: 10 digits starting with 05. */
export const PHONE_PATTERN = /^05\d{8}$/;

export const PHONE_MESSAGE =
  'رقم الجوال غير صالح، يجب أن يبدأ بـ 05 ويتكوّن من 10 أرقام (مثال: 0551234567)';

/**
 * Accepts the shapes people actually type — `0551234567`, `+966 55 123 4567`,
 * `00966551234567`, with or without spaces and dashes — and stores one of them.
 * Returns the input untouched when it cannot be understood, so validation (not
 * this function) is what reports the error.
 */
export function normalizePhone(value: unknown): unknown {
  if (typeof value !== 'string') return value;

  const trimmed = value.trim();
  if (trimmed === '') return undefined; // an empty field means "no number"

  let digits = trimmed.replace(/[\s\-()]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  if (!/^\d+$/.test(digits)) return trimmed;

  if (digits.startsWith('00966')) digits = digits.slice(5);
  else if (digits.startsWith('966')) digits = digits.slice(3);

  // At this point a local number may have lost its leading zero.
  if (/^5\d{8}$/.test(digits)) digits = `0${digits}`;

  return digits;
}

/** Optional phone field: normalised, then checked against the Saudi format. */
export function PhoneField(description = 'رقم الجوال') {
  return applyDecorators(
    ApiPropertyOptional({ example: '0551234567', description }),
    IsOptional(),
    Transform(({ value }) => normalizePhone(value)),
    IsString(),
    Matches(PHONE_PATTERN, { message: PHONE_MESSAGE }),
  );
}

/** Same rules, but the number has to be there. */
export function RequiredPhoneField(description = 'رقم الجوال') {
  return applyDecorators(
    ApiProperty({ example: '0551234567', description }),
    Transform(({ value }) => normalizePhone(value)),
    IsString(),
    IsNotEmpty({ message: 'رقم الجوال مطلوب' }),
    Matches(PHONE_PATTERN, { message: PHONE_MESSAGE }),
  );
}
