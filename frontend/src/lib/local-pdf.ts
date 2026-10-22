import { PDFDocument } from 'pdf-lib';
import { drawSchoolPdfHeader } from './pdf-branding';

/** Rasterized Arabic text uses the bundled font, with no server or remote font. */
export async function exportLocalPdf(title: string, rows: Record<string, unknown>[]) {
  await document.fonts.load('20px Tajawal');
  const pdf = await PDFDocument.create();
  const canvas = document.createElement('canvas'); canvas.width = 1240; canvas.height = 1754;
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('تعذر إنشاء مستند PDF على هذا الجهاز');
  let y = 0; let page = 0;
  const begin = async () => {
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    await drawSchoolPdfHeader(ctx, canvas, { compact: true });
    ctx.font = 'bold 28px Tajawal'; ctx.textAlign = 'right'; ctx.direction = 'rtl'; ctx.fillStyle = '#14543f';
    ctx.fillText(title, 1180, 158, 1120); y = 205; page++;
  };
  const flush = async () => {
    ctx.font = '18px Tajawal'; ctx.fillStyle = '#64748b'; ctx.fillText(`صفحة ${page}`, 1180, 1710);
    const image = await pdf.embedPng(canvas.toDataURL('image/png'));
    pdf.addPage([595.28, 841.89]).drawImage(image, { x: 0, y: 0, width: 595.28, height: 841.89 });
  };
  const line = async (text: string, heading = false) => {
    ctx.font = `${heading ? 'bold ' : ''}22px Tajawal`;
    const words = text.replace(/\r/g, '').split(/\s+/); let current = '';
    for (const word of words) {
      // Split even long identifiers so no field is silently clipped.
      for (const part of word.match(/.{1,60}/gu) || ['']) {
        const next = current ? `${current} ${part}` : part;
        if (ctx.measureText(next).width > 1110 && current) {
          if (y > 1640) { await flush(); await begin(); ctx.font = `${heading ? 'bold ' : ''}22px Tajawal`; }
          ctx.fillStyle = heading ? '#14543f' : '#1e293b'; ctx.fillText(current, 1180, y); y += 36; current = part;
        } else current = next;
      }
    }
    if (y > 1640) { await flush(); await begin(); ctx.font = `${heading ? 'bold ' : ''}22px Tajawal`; }
    ctx.fillStyle = heading ? '#14543f' : '#1e293b'; ctx.fillText(current || '—', 1180, y); y += 36;
  };
  await begin();
  for (let i = 0; i < rows.length; i++) {
    await line(`السجل ${i + 1}`, true);
    for (const [key, value] of Object.entries(rows[i])) await line(`${key}: ${value == null ? '—' : typeof value === 'object' ? JSON.stringify(value) : String(value)}`);
    y += 18;
  }
  if (!rows.length) await line('لا توجد سجلات');
  await flush();
  return new Blob([new Uint8Array(await pdf.save())], { type: 'application/pdf' });
}
