import { BadRequestException, ConflictException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_LEARNING_RULES, LearningRules, resolveRules } from '../common/learning-rules';
export async function learningPolicy(prisma: PrismaService, circleId?: string, revision?: string, fallback?: Partial<LearningRules>): Promise<LearningRules> {
    const rows = revision && revision !== 'legacy'
        ? await prisma.$queryRaw<Array<{
            id: string;
            rules: LearningRules;
        }>> `SELECT id,rules FROM learning_rule_sets WHERE id=${revision} AND "scopeId" IN ('school',${circleId ?? 'school'}) LIMIT 1`
        : await prisma.$queryRaw<Array<{
            id: string;
            rules: LearningRules;
        }>> `SELECT id,rules FROM learning_rule_sets WHERE "scopeId" IN ('school',${circleId ?? 'school'}) ORDER BY ("scopeId" <> 'school') DESC,"createdAt" DESC,id DESC LIMIT 1`;
    if (revision && revision !== 'legacy' && !rows[0])
        throw new ConflictException('نسخة قواعد التقييم غير موجودة لهذه الحلقة؛ حدّث القواعد قبل المزامنة');
    return rows[0] ? resolveRules({ ...rows[0].rules, revision: rows[0].id }) : resolveRules({ ...fallback, revision: 'legacy' });
}
export function validatePolicy(raw: LearningRules): LearningRules {
    const rules = resolveRules(raw);
    const number = (n: unknown, max = 100) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= max;
    if (!['verses', 'fixed'].includes(rules.base) || !number(rules.baseMark, 6236) || !number(rules.mistakePenalty) || !number(rules.warningPenalty) || !number(rules.tajweedPenalty) || ![rules.excellent, rules.veryGood, rules.good, rules.acceptable].every(n => number(n)) || !(rules.excellent > rules.veryGood && rules.veryGood > rules.good && rules.good > rules.acceptable))
        throw new BadRequestException('قواعد التقييم غير صالحة');
    if (!Array.isArray(rules.types) || rules.types.length > 60 || new Set(rules.types.map(t => t.id)).size !== rules.types.length || rules.types.some(t => !/^[-a-zA-Z0-9_]{1,60}$/.test(t.id) || typeof t.label !== 'string' || !t.label.trim() || t.label.length > 100 || !['mistake', 'warning', 'tajweed'].includes(t.category) || !['counter', 'mushaf', 'both'].includes(t.mode) || typeof t.enabled !== 'boolean' || typeof t.freeFirst !== 'boolean' || !number(t.penalty)))
        throw new BadRequestException('أنواع الأخطاء غير صالحة');
    if (!Array.isArray(rules.attendance) || rules.attendance.length > 30 || new Set(rules.attendance.map(t => t.id)).size !== rules.attendance.length || rules.attendance.some(t => !/^[-a-zA-Z0-9_]{1,60}$/.test(t.id) || typeof t.label !== 'string' || !t.label.trim() || t.label.length > 100 || typeof t.enabled !== 'boolean' || !number(Math.abs(t.points), 1000)) || DEFAULT_LEARNING_RULES.attendance.some(t => !rules.attendance.find(a => a.id === t.id)))
        throw new BadRequestException('حالات الحضور غير صالحة');
    if (!Object.values(rules.weights).every(n => number(n, 10)))
        throw new BadRequestException('أوزان النقاط بين صفر وعشرة');
    return rules;
}
export async function savePolicy(prisma: PrismaService, actorId: string, circleId: string | undefined, value: LearningRules) { const rules = validatePolicy(value); const id = randomUUID(); await prisma.$executeRaw `INSERT INTO learning_rule_sets (id,"scopeId",rules,"createdById") VALUES (${id},${circleId ?? 'school'},${JSON.stringify(rules)}::jsonb,${actorId})`; return { ...rules, revision: id }; }
