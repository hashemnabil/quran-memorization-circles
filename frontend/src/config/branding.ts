export const DEFAULT_SCHOOL_NAME = 'مدرسة عبدالله بن عمر لتعليم القران الكريم والسنة النبوية';
export const DEFAULT_SCHOOL_LOGO = '/brand-logo.png';
export const BRANDING_CACHE_KEY = 'qc.schoolBranding';
export function schoolName(name?: string | null): string {
  const oldNames = ['مدرسة عبدالله بن عمر', 'مدرسة عبدالله بن عمر لتحفيظ القرآن الكريم', 'مدرسة عبدالله بن عمر لتعلم القرآن الكريم والسنة النبوية', 'مدرسة عبدالله بن عمر لتحفيظ القرآن الكريم والسنة النبوية'];
  return !name?.trim() || oldNames.includes(name.trim()) ? DEFAULT_SCHOOL_NAME : name.trim();
}

export function cachedSchoolBranding(): { name?: string; logoUrl?: string | null } {
  try {
    const value = JSON.parse(localStorage.getItem(BRANDING_CACHE_KEY) || '{}');
    return { name: schoolName(value.name), logoUrl: typeof value.logoUrl === 'string' ? value.logoUrl : undefined };
  } catch { return {}; }
}
