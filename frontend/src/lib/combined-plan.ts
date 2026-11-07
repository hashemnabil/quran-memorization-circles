export type CombinedStage = {
  code: string;
  label: string;
  at: number;
  fromJuz: number;
  toJuz: number;
  phase: 'INTERNAL' | 'EXTERNAL';
  prerequisite?: string;
};

/** Combined exams follow the school order: partial section exams, then the
 * checkpoints listed in the approved plan, from Juz 30 down to Juz 1. */
export function combinedPlan(): CombinedStage[] {
  const stages: CombinedStage[] = [];
  const addPair = (kind: number, fromJuz: number, toJuz: number) => {
    for (const phase of ['INTERNAL', 'EXTERNAL'] as const) {
      const code = `COMBINED-${kind}-${fromJuz}-${toJuz}-${phase}`;
      stages.push({
        code,
        label: `مجتمعة ${kind} ${phase === 'INTERNAL' ? 'داخلي' : 'خارجي'} (الأجزاء ${toJuz}–${fromJuz})`,
        at: 31 - fromJuz,
        fromJuz,
        toJuz,
        phase,
        prerequisite: stages[stages.length - 1]?.code,
      });
    }
  };

  const checkpoints: Record<number, Array<{ kind: number; from: number; to: number }>> = {
    3: [{ kind: 3, from: 28, to: 30 }],
    5: [{ kind: 5, from: 26, to: 30 }],
    8: [{ kind: 3, from: 23, to: 25 }],
    10: [{ kind: 5, from: 21, to: 25 }, { kind: 10, from: 21, to: 30 }],
    13: [{ kind: 3, from: 18, to: 20 }],
    15: [{ kind: 5, from: 16, to: 20 }],
    18: [{ kind: 3, from: 13, to: 15 }],
    20: [{ kind: 5, from: 11, to: 15 }, { kind: 20, from: 11, to: 30 }],
    23: [{ kind: 3, from: 8, to: 10 }],
    25: [{ kind: 5, from: 6, to: 10 }],
    30: [{ kind: 5, from: 1, to: 5 }, { kind: 30, from: 1, to: 30 }],
  };

  for (let juz = 30; juz >= 1; juz--) {
    const completed = 31 - juz;
    for (const checkpoint of checkpoints[completed] || []) addPair(checkpoint.kind, checkpoint.from, checkpoint.to);
  }
  stages.push({
    code: 'KHATMA-MUSHAF',
    label: 'ختمة المصحف',
    at: 30,
    fromJuz: 1,
    toJuz: 30,
    phase: 'EXTERNAL',
    prerequisite: stages[stages.length - 1]?.code,
  });
  return stages;
}
