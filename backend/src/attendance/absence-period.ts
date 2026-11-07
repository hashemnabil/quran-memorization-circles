import { BadRequestException } from '@nestjs/common';

export type AbsenceInput = { studentId?: string; requesterId?: string; date: string; endDate?: string; reason: string; note?: string; durationMinutes?: number };
export function absencePeriod(input: AbsenceInput) {
  const parse = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) throw new BadRequestException('التاريخ غير صالح');
    const date = new Date(`${value}T00:00:00.000Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new BadRequestException('التاريخ غير صالح');
    return date;
  };
  const date = parse(input.date);
  const days = input.durationMinutes ?? 1;
  if (!input.endDate && (!Number.isInteger(days) || days < 1 || days > 366)) throw new BadRequestException('مدة الإذن من يوم إلى 366 يوماً');
  const endDate = input.endDate ? parse(input.endDate) : new Date(date.getTime() + (days - 1) * 86400000);
  const duration = (endDate.getTime() - date.getTime()) / 86400000 + 1;
  if (duration < 1 || duration > 366) throw new BadRequestException('تاريخ النهاية يجب أن يلي البداية، بحد أقصى 366 يوماً');
  if (typeof input.reason !== 'string' || !input.reason.trim() || input.reason.length > 500 || input.note != null && (typeof input.note !== 'string' || input.note.length > 1000)) throw new BadRequestException('السبب مطلوب بحد أقصى 500 حرف، والملاحظة اختيارية حتى 1000 حرف');
  return { date, endDate, durationMinutes: duration, reason: input.reason.trim(), note: input.note?.trim() || null };
}
