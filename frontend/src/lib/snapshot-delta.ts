export function applySnapshotPatch(before: any, patch: any): any {
  if (patch === null) return before;
  if (patch?.kind === 'replace') return patch.value;
  if (patch?.kind === 'rows' && Array.isArray(before) && ['id', 'date'].includes(patch.field) && Array.isArray(patch.order) && Array.isArray(patch.changed)) {
    const rows = new Map(before.map(row => [row[patch.field], row]));
    for (const row of patch.changed) rows.set(row[patch.field], row);
    return patch.order.map((id: string) => { if (!rows.has(id)) throw new Error('استجابة تحديث ناقصة'); return rows.get(id); });
  }
  if (patch?.kind === 'object' && before && typeof before === 'object' && !Array.isArray(before)) {
    const result = { ...before };
    for (const key of patch.removed || []) delete result[key];
    for (const [key, value] of Object.entries(patch.fields || {})) Object.defineProperty(result, key, { value: applySnapshotPatch(before[key], value), enumerable: true, writable: true, configurable: true });
    return result;
  }
  throw new Error('استجابة تحديث غير صالحة؛ بقيت النسخة المحلية محفوظة');
}
