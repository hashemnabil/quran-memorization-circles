/** Shared learning contract. Keep the browser/server copies identical (checked by tests). */
export type ErrorCategory = 'mistake' | 'warning' | 'tajweed';
export interface ErrorType {
    id: string;
    label: string;
    category: ErrorCategory;
    penalty: number;
    enabled: boolean;
    mode: 'counter' | 'mushaf' | 'both';
    freeFirst: boolean;
}
export interface TypeCounter {
    typeId: string;
    count: number;
}
export interface WordError {
    id: string;
    wordId: string;
    typeId: string;
    note?: string;
}
export interface LearningRules {
    revision: string;
    base: 'verses' | 'fixed';
    baseMark: number;
    excellent: number;
    veryGood: number;
    good: number;
    acceptable: number;
    mistakePenalty: number;
    warningPenalty: number;
    tajweedPenalty: number;
    types: ErrorType[];
    attendance: {
        id: string;
        label: string;
        points: number;
        enabled: boolean;
    }[];
    weights: {
        recitation: number;
        attendance: number;
        achievement: number;
    };
}
export const DEFAULT_LEARNING_RULES: LearningRules = {
    revision: 'legacy', base: 'verses', baseMark: 100, mistakePenalty: 1, warningPenalty: 0.25, tajweedPenalty: 0.5, excellent: 90, veryGood: 80, good: 70, acceptable: 60,
    types: [['word', 'خطأ في كلمة', 'mistake', 1], ['omission', 'كلمة متروكة', 'mistake', 0.5], ['addition', 'زيادة', 'mistake', 0.75], ['warning', 'تنبيه', 'warning', 0.25], ['letter', 'خطأ في حرف', 'mistake', 0.25], ['tajweed', 'خطأ في حكم أو تشكيل', 'tajweed', 0.5]].map(([id, label, category, penalty]) => ({ id, label, category, penalty, enabled: true, mode: 'both', freeFirst: false })) as ErrorType[],
    attendance: [{ id: 'PRESENT', label: 'حاضر', points: 0, enabled: true }, { id: 'LATE', label: 'متأخر', points: 0, enabled: true }, { id: 'ABSENT', label: 'غائب', points: 0, enabled: true }, { id: 'EXCUSED', label: 'بعذر', points: 0, enabled: true }], weights: { recitation: 1, attendance: 1, achievement: 1 }
};
export function resolveRules(value?: Partial<LearningRules> | null): LearningRules { return { ...DEFAULT_LEARNING_RULES, ...value, weights: { ...DEFAULT_LEARNING_RULES.weights, ...value?.weights }, types: value?.types ?? DEFAULT_LEARNING_RULES.types, attendance: value?.attendance ?? DEFAULT_LEARNING_RULES.attendance }; }
export function scoreSession(input: {
    versesCount: number;
    mistakes?: number;
    warnings?: number;
    tajweedErrors?: number;
    wordErrors?: WordError[];
    typeCounters?: TypeCounter[];
}, value?: Partial<LearningRules>) {
    const rules = resolveRules(value);
    const annotations = input.wordErrors ?? [];
    const ids = new Set<string>();
    const counts = { mistake: 0, warning: 0, tajweed: 0 };
    let deducted = 0;
    const seen = new Map<string, number>();
    const details = annotations.map(error => {
        if (ids.has(error.id) || !/^\d{1,3}:\d{1,3}:\d{1,3}$/.test(error.wordId))
            throw Error('بيانات خطأ مكررة أو غير صالحة');
        ids.add(error.id);
        const type = rules.types.find(t => t.id === error.typeId);
        if (!type || !type.enabled || type.mode === 'counter')
            throw Error('نوع الخطأ غير متاح على المصحف');
        counts[type.category]++;
        const count = (seen.get(type.id) ?? 0) + 1;
        seen.set(type.id, count);
        const penalty = type.freeFirst && count === 1 ? 0 : type.penalty;
        deducted += penalty;
        return { ...error, category: type.category, label: type.label, penalty };
    });
    const typed = new Set<string>();
    const counterDetails = (input.typeCounters ?? []).map(counter => { const type = rules.types.find(t => t.id === counter.typeId); if (!type || !type.enabled || type.mode === 'mushaf' || typed.has(type.id) || !Number.isInteger(counter.count) || counter.count < 0 || counter.count > 9999)
        throw Error('عداد نوع الخطأ غير صالح'); typed.add(type.id); counts[type.category] += counter.count; const free = type.freeFirst && !(seen.get(type.id) ?? 0) && counter.count > 0 ? 1 : 0; const penalty = (counter.count - free) * type.penalty; deducted += penalty; return { ...counter, label: type.label, category: type.category, penalty }; });
    // Counters are TOTALS, including marked words. Subtract marked counts before manual deductions.
    const manual = { mistake: (input.mistakes ?? 0) - counts.mistake, warning: (input.warnings ?? 0) - counts.warning, tajweed: (input.tajweedErrors ?? 0) - counts.tajweed };
    if (Object.values(manual).some(n => !Number.isInteger(n) || n < 0 || n > 9999))
        throw Error('عدد الأخطاء أقل من الكلمات المحددة أو غير صالح');
    deducted += manual.mistake * rules.mistakePenalty + manual.warning * rules.warningPenalty + manual.tajweed * rules.tajweedPenalty;
    const base = rules.base === 'fixed' ? rules.baseMark : input.versesCount;
    const round = (n: number) => Math.round(n * 100) / 100;
    const points = round(Math.max(0, base - deducted));
    const percent = base ? points / base * 100 : 0;
    const evaluation: 'EXCELLENT' | 'VERY_GOOD' | 'GOOD' | 'ACCEPTABLE' | 'UNSATISFACTORY' = percent >= rules.excellent ? 'EXCELLENT' : percent >= rules.veryGood ? 'VERY_GOOD' : percent >= rules.good ? 'GOOD' : percent >= rules.acceptable ? 'ACCEPTABLE' : 'UNSATISFACTORY';
    return { points, percent: round(percent), evaluation, deducted: round(deducted), errorRatio: input.versesCount ? round(((input.mistakes ?? 0) + (input.warnings ?? 0) + (input.tajweedErrors ?? 0)) / input.versesCount * 100) : 0, details, counterDetails, manual, base };
}
