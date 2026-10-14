import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { AuthUser } from '../common/decorators';
import { CreateRecitationDto, UpdateRecitationDto } from '../recitations/dto/recitation.dto';
import { transactionalRecitations } from '../recitations/recitations.service';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Operation = { opId: string; entity: string; kind?: unknown; data?: unknown; baseUpdatedAt?: unknown };
function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
export function validateRecitationOperation(op: Operation): Record<string, unknown> {
  if (Object.keys(op).some(key => !['opId', 'entity', 'kind', 'data', 'baseUpdatedAt'].includes(key)) || !record(op.data)) throw new BadRequestException('بيانات التسميع غير صالحة');
  const data = op.data;
  let raw = data;
  if (op.kind !== 'create') {
    if (Object.keys(data).some(key => !['id', ...(op.kind === 'correct' ? ['patch'] : [])].includes(key)) || typeof data.id !== 'string' || !uuid.test(data.id) || typeof op.baseUpdatedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(op.baseUpdatedAt) || !Number.isFinite(Date.parse(op.baseUpdatedAt)) || new Date(op.baseUpdatedAt).toISOString() !== op.baseUpdatedAt) throw new BadRequestException('يلزم معرّف وإصدار السجل الأصلي');
    if (op.kind === 'delete') return data;
    if (!record(data.patch) || !Object.keys(data.patch).length || 'studentId' in data.patch) throw new BadRequestException('حقول تصحيح التسميع غير صالحة');
    raw = data.patch;
  } else if (op.baseUpdatedAt !== undefined) throw new BadRequestException('إصدار غير مطلوب للإنشاء');
  if (Object.entries(raw).some(([key, value]) => value === null && !['pagesCount', 'versesCount', 'evaluation', 'notes'].includes(key))) throw new BadRequestException('حقول مطلوبة لا تقبل قيمة فارغة');
  const dto = op.kind === 'create' ? plainToInstance(CreateRecitationDto, raw) : plainToInstance(UpdateRecitationDto, raw);
  if (validateSync(dto, { whitelist: true, forbidNonWhitelisted: true, forbidUnknownValues: true }).length) throw new BadRequestException('بيانات التسميع لا تطابق الحقول المسموح بها');
  if (raw.date !== undefined) {
    if (typeof raw.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw.date) || new Date(raw.date + 'T00:00:00.000Z').toISOString().slice(0, 10) !== raw.date || raw.date > new Date().toISOString().slice(0, 10)) throw new BadRequestException('تاريخ التسميع غير صالح أو مستقبلي');
  }
  return op.kind === 'create' ? dto as unknown as Record<string, unknown> : { id: data.id, patch: dto };
}
export async function applyRecitationOperation(tx: Prisma.TransactionClient, user: AuthUser, op: Operation, data: Record<string, unknown>) {
  const service = transactionalRecitations(tx);
  if (op.kind !== 'create') {
    // Read through the existing service to enforce live student access first.
    const row = await service.findOne(user, data.id as string);
    if (row.updatedAt.toISOString() !== op.baseUpdatedAt) return { opId: op.opId, status: 'conflict' as const, code: 'STALE_VERSION', message: 'تغيّر سجل التسميع؛ راجعه قبل التصحيح' };
  }
  const result = op.kind === 'create' ? await service.create(user, data as unknown as CreateRecitationDto, true)
    : op.kind === 'correct' ? await service.update(user, data.id as string, data.patch as UpdateRecitationDto, true)
    : await service.remove(user, data.id as string, true);
  const saved = JSON.parse(JSON.stringify(result)) as Prisma.JsonObject;
  return { opId: op.opId, status: 'applied' as const, data: saved };
}
