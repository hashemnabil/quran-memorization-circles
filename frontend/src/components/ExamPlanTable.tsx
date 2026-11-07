import { combinedPlan } from '@/lib/combined-plan';

export function ExamPlanTable({ onSelect, selected }: { onSelect?: (code: string) => void; selected?: string }) {
  const checkpoints = combinedPlan();
  let order = 0;
  const rows: Array<{ label: string; order?: number; code: string }> = [];
  for (let juz = 30; juz >= 1; juz--) {
    for (const [label, code] of [[`حزب ${juz * 2}`, `HIZB-${String(juz * 2).padStart(2, '0')}`], [`حزب ${juz * 2 - 1}`, `HIZB-${String(juz * 2 - 1).padStart(2, '0')}`], [`جزء ${juz}`, `JUZ-${String(juz).padStart(2, '0')}`]]) rows.push({ label, code, order: ++order });
    for (const stage of checkpoints.filter(stage => stage.at === 31 - juz)) rows.push({ label: stage.label, code: stage.code });
  }
  return <details className="rounded-xl border p-3" open><summary className="cursor-pointer font-bold">جدول الاختبارات من جزء 30 إلى جزء 1</summary><div className="mt-3 max-h-72 overflow-auto"><table className="w-full text-start text-sm"><thead><tr><th>الترتيب</th><th>المطلوب</th></tr></thead><tbody>{rows.map(row => <tr key={row.code} className={row.order ? 'border-t' : 'border-t bg-emerald-50 font-semibold'}><td className="p-2">{row.order ?? '—'}</td><td className="p-2">{onSelect ? <button type="button" aria-pressed={selected === row.code} className="min-h-11 text-start" onClick={() => onSelect(row.code)}>{selected === row.code ? '✓ ' : ''}{row.label}</button> : row.label}</td></tr>)}</tbody></table></div></details>;
}
