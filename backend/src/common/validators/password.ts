import { BadRequestException } from '@nestjs/common';
import { registerDecorator } from 'class-validator';

export const PASSWORD_MESSAGE = 'كلمة المرور مطلوبة، ويجب ألا تتجاوز 72 بايت لأسباب تقنية';
export function validNewPassword(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 128 && Buffer.byteLength(value, 'utf8') <= 72;
}
export function assertNewPassword(value: unknown) { if (!validNewPassword(value)) throw new BadRequestException(PASSWORD_MESSAGE); }
export function NewPassword() {
  return (target: object, propertyName: string) => registerDecorator({ name: 'newPassword', target: target.constructor, propertyName, validator: { validate: validNewPassword, defaultMessage: () => PASSWORD_MESSAGE } });
}
