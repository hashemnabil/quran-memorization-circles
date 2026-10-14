/** Convert stored PDF data URLs to download blobs instead of blocked top-level data navigation. */
export function pdfDataUrlToBlob(value) {
  const prefix = 'data:application/pdf;base64,';
  if (typeof value !== 'string' || !value.startsWith(prefix)) throw new Error('ملف PDF غير صالح');
  const encoded = value.slice(prefix.length);
  if (encoded.length > 11 * 1024 * 1024 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw new Error('ملف PDF غير صالح');
  const binary = atob(encoded);
  if (!binary.startsWith('%PDF-')) throw new Error('ملف PDF غير صالح');
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new Blob([bytes], { type: 'application/pdf' });
}
export function safeDownloadHref(value) {
  if (typeof value !== 'string') return undefined;
  if (/^\/uploads\/[A-Za-z0-9_./-]+$/.test(value) && !value.includes('..')) return value;
  try {
    const url = new URL(value);
    if (['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !/[\u0000-\u0020]/.test(value)) return value;
  } catch { /* An unsafe stored URL must not become a clickable executable link. */ }
  return undefined;
}
