import { type ReactNode } from 'react';
import toast from 'react-hot-toast';
import { pdfDataUrlToBlob, safeDownloadHref } from '@/lib/pdf-download.js';

export default function PdfDownloadLink({ url, title, children }: { url: string; title?: string; children: ReactNode }) {
  const embedded = url?.startsWith('data:application/pdf;base64,');
  const href = embedded ? undefined : safeDownloadHref(url);
  if (!embedded && !href) return <span className="text-sm text-slate-500">ملف غير متاح</span>;
  return <a className="text-primary-700 underline" href={href ?? '#'} target="_blank" rel="noreferrer" onClick={(event) => {
    if (!embedded) return;
    event.preventDefault();
    try {
      const objectUrl = URL.createObjectURL(pdfDataUrlToBlob(url));
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `${(title || 'document').replace(/[\\/:*?"<>|]/g, '_')}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
    } catch { toast.error('تعذر تنزيل ملف PDF؛ راجع الإدارة'); }
  }}>{children}</a>;
}
