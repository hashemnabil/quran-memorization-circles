export function snapshotPatch(before: any, after: any): any {
  if (JSON.stringify(before) === JSON.stringify(after)) return null;
  if (Array.isArray(before) && Array.isArray(after)) {
    const field = ['id', 'date'].find(field => [...before, ...after].every(row => row && typeof row[field] === 'string') &&
      new Set(before.map(row => row[field])).size === before.length && new Set(after.map(row => row[field])).size === after.length);
    if (field) {
      const previous = new Map(before.map(row => [row[field], JSON.stringify(row)]));
      return { kind: 'rows', field, order: after.map(row => row[field]), changed: after.filter(row => previous.get(row[field]) !== JSON.stringify(row)) };
    }
  }
  if (before && after && typeof before === 'object' && typeof after === 'object' && !Array.isArray(before) && !Array.isArray(after)) {
    const fields: Record<string, any> = Object.create(null);
    for (const key of Object.keys(after)) {
      const patch = snapshotPatch(before[key], after[key]);
      if (patch) fields[key] = patch;
    }
    return { kind: 'object', fields, removed: Object.keys(before).filter(key => !(key in after)) };
  }
  return { kind: 'replace', value: after };
}
