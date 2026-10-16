export const DEFAULT_SCHOOL_NAME = 'مدرسة عبدالله بن عمر لتحفيظ القرآن الكريم والسنة النبوية';
export const DEFAULT_SCHOOL_LOGO = '/brand-logo.png';
export const BRANDING_CACHE_KEY = 'qc.schoolBranding';

export function cachedSchoolBranding(): { name?: string; logoUrl?: string | null } {
  try {
    const value = JSON.parse(localStorage.getItem(BRANDING_CACHE_KEY) || '{}');
    return { name: typeof value.name === 'string' ? value.name : undefined, logoUrl: typeof value.logoUrl === 'string' ? value.logoUrl : undefined };
  } catch { return {}; }
}
