export const placements = ['BEFORE', 'AFTER', 'BOTH'] as const;
export const repeats = ['ONCE_USER', 'ONCE_DEVICE', 'DAILY', 'OPEN', 'UNTIL_ACK'] as const;
export interface PopupConfig {
  placement: typeof placements[number];
  repeat: typeof repeats[number];
  state: 'DRAFT' | 'PUBLISHED' | 'STOPPED' | 'ARCHIVED';
  priority: number;
  requireAck: boolean;
  important: boolean;
  buttonText: string;
  imageAssetId: string;
  videoAssetId?: string;
}
export function safePopupLink(value: unknown): boolean {
  if (typeof value !== 'string' || value.length > 500 || /[\s\\\u0000-\u001f]/.test(value)) return false;
  if (!value) return true;
  if (value.startsWith('/')) return !value.startsWith('//') && !/%(?:2f|5c)/i.test(value);
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; } catch { return false; }
}
export function validPopup(value: unknown): value is PopupConfig {
  if (!value || typeof value !== 'object') return false;
  const p = value as PopupConfig;
  return placements.includes(p.placement) && repeats.includes(p.repeat) && ['DRAFT', 'PUBLISHED', 'STOPPED', 'ARCHIVED'].includes(p.state)
    && Number.isInteger(p.priority) && p.priority >= 0 && p.priority <= 100
    && typeof p.requireAck === 'boolean' && typeof p.important === 'boolean'
    && typeof p.buttonText === 'string' && p.buttonText.length <= 60
    && typeof p.imageAssetId === 'string' && p.imageAssetId.length <= 60
    && (p.videoAssetId === undefined || typeof p.videoAssetId === 'string' && p.videoAssetId.length <= 60);
}
export function popupVisible(row: { isActive: boolean; audience: string[]; publishedAt: Date; expiresAt: Date | null; popup: unknown }, role?: string, now = new Date()): boolean {
  if (!row.isActive || !validPopup(row.popup) || row.popup.state !== 'PUBLISHED' || row.publishedAt > now || row.expiresAt && row.expiresAt <= now) return false;
  if (!role) return !row.audience.length && ['BEFORE', 'BOTH'].includes(row.popup.placement);
  return ['AFTER', 'BOTH'].includes(row.popup.placement) && (!row.audience.length || row.audience.includes(role));
}
