import { BadRequestException } from '@nestjs/common';

export function normalizePhone(value: unknown): string {
  let phone = String(value ?? '').replace(/[٠-٩]/g, c => String(c.charCodeAt(0) - 1632)).replace(/[۰-۹]/g, c => String(c.charCodeAt(0) - 1776)).replace(/[\s()+.-]/g, '');
  if (phone.startsWith('00')) phone = phone.slice(2);
  if (/^05[69]\d{7}$/.test(phone)) phone = '970' + phone.slice(1);
  if (/^5[69]\d{7}$/.test(phone)) phone = '970' + phone;
  if (!/^[1-9]\d{7,14}$/.test(phone)) throw new BadRequestException('رقم هاتف غير صالح؛ استخدم الصيغة الدولية');
  if (/^970/.test(phone) && !/^9705[69]\d{7}$/.test(phone)) throw new BadRequestException('رقم فلسطيني غير صالح');
  return '+' + phone;
}
export function renderSms(template: string, values: Record<string, unknown>) {
  return template.replace(/\{([^{}]+)\}/g, (_, key: string) => {
    const value = values[key.trim()];
    if (value == null || !String(value).trim()) throw new BadRequestException(`حقل ناقص: ${key}`);
    return String(value);
  });
}
export const smsTemplates: Record<string, string> = {
  CREDENTIALS: 'ولي أمر الطالب {اسم الطالب}، اسم المستخدم: {اسم المستخدم}. كلمة المرور المؤقتة: {كلمة السر}. يجب تغييرها عند أول دخول. {محتوى الإشعار}',
  NOTICE: 'ولي أمر الطالب {اسم الطالب} المحترم، نعلمكم بالتالي: {محتوى الإشعار}. إدارة {اسم المدرسة}.',
  WARNING: 'ولي أمر الطالب {اسم الطالب} المحترم، تم إصدار إنذار بحق الطالب بسبب: {سبب الإنذار}. يرجى متابعة إدارة {اسم المدرسة}.',
  SUMMONS: 'ولي أمر الطالب {اسم الطالب} المحترم، يرجى حضوركم إلى {اسم المدرسة} بتاريخ {التاريخ} الساعة {الوقت}، وذلك بسبب: {سبب الاستدعاء}.',
};
