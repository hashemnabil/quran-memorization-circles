/** Date / number formatting helpers, all in Arabic with Latin digits. */

const DATE_LOCALE = 'ar-EG';

export function formatDate(value?: string | Date | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(DATE_LOCALE, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    numberingSystem: 'latn',
  }).format(d);
}

export function formatDateShort(value?: string | Date | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(DATE_LOCALE, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    numberingSystem: 'latn',
  }).format(d);
}

export function formatDateTime(value?: string | Date | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(DATE_LOCALE, {
    dateStyle: 'medium',
    timeStyle: 'short',
    numberingSystem: 'latn',
  }).format(d);
}

export function formatTime(value?: string | null): string {
  if (!value) return '—';
  const [h, m] = value.split(':').map(Number);
  if (Number.isNaN(h)) return value;
  const period = h < 12 ? 'ص' : 'م';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m ?? 0).padStart(2, '0')} ${period}`;
}

/** "منذ 3 أيام" style relative labels for feeds and chat lists. */
export function timeAgo(value?: string | Date | null): string {
  if (!value) return '';
  const d = new Date(value);
  const diff = Date.now() - d.getTime();
  const minutes = Math.floor(diff / 60000);

  if (minutes < 1) return 'الآن';
  if (minutes < 60) return `منذ ${minutes} دقيقة`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `منذ ${hours} ساعة`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'أمس';
  if (days < 30) return `منذ ${days} يوم`;
  const months = Math.floor(days / 30);
  if (months < 12) return `منذ ${months} شهر`;
  return `منذ ${Math.floor(months / 12)} سنة`;
}

export function toInputDate(value?: string | Date | null): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

export function toInputDateTime(value?: string | Date | null): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  // datetime-local expects local time, not UTC.
  const offset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - offset).toISOString().slice(0, 16);
}

export function todayInput(): string {
  const d = new Date();
  const offset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - offset).toISOString().slice(0, 10);
}

export function calcAge(birthDate?: string | null): string {
  if (!birthDate) return '—';
  const d = new Date(birthDate);
  if (Number.isNaN(d.getTime())) return '—';
  const years = Math.floor((Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000));
  return `${years} سنة`;
}

export function initials(name?: string | null): string {
  if (!name) return '؟';
  const parts = name.trim().split(/\s+/);
  return parts.length === 1 ? parts[0].slice(0, 2) : `${parts[0][0]}${parts[1][0]}`;
}

export function num(value?: number | string | null): string {
  if (value === null || value === undefined || value === '') return '0';
  return String(value);
}

/**
 * True for a link that leaves the app.
 *
 * Announcements may point at a path inside the system or at an outside page;
 * the two are opened differently — a router navigation versus a new tab — so
 * every consumer asks here rather than testing for a slash on its own.
 */
export function isExternalLink(link?: string | null): boolean {
  return !!link && /^https?:\/\//i.test(link);
}

/**
 * A count that may carry a half: 3 stays "3", 2.5 becomes "2.5".
 *
 * Memorization is derived from ahzab passed, two to a juz', so half values are
 * the norm rather than an edge case — but printing "3.0" everywhere would be
 * noise.
 */
export function formatParts(value?: number | null): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return '0';
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}
