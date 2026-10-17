import { BadRequestException } from '@nestjs/common';
import { registerDecorator } from 'class-validator';
const common = new Set(['password1234', 'password12345', 'password123456', '123456789012', '1234567890123', 'qwerty123456', 'qwertyuiop12', 'administrator', 'letmein123456', 'welcome12345']);
export const PASSWORD_MESSAGE = 'اختر كلمة مرور من 12 حرفًا على الأقل، غير شائعة، ولا تتجاوز 72 بايت';
export function validNewPassword(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 12 && value.length <= 128 && Buffer.byteLength(value, 'utf8') <= 72 && !common.has(value.toLowerCase()) && !/^(.)\1+$/.test(value);
}
export function assertNewPassword(value: unknown) { if (!validNewPassword(value)) throw new BadRequestException(PASSWORD_MESSAGE); }
export function NewPassword() {
  return (target: object, propertyName: string) => registerDecorator({ name: 'newPassword', target: target.constructor, propertyName, validator: { validate: validNewPassword, defaultMessage: () => PASSWORD_MESSAGE } });
}
