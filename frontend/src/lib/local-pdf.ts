import { PDFDocument } from 'pdf-lib';
import { drawSchoolPdfHeader } from './pdf-branding';

/** Arabic is drawn with the bundled font, in a paginated RTL table. */
export async function exportLocalPdf(title: string, rows: Record<string, unknown>[]) {
  await document.fonts.load('20px Tajawal');
  await document.fonts.load('bold 20px Tajawal');
  const columns = [...new Set(rows.flatMap(Object.keys))];
  const pdf = await PDFDocument.create();
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(2400, columns.length * 240 + 120);
  canvas.height = 1240;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('تعذر إنشاء مستند PDF على هذا الجهاز');
  const margin = 60, bottom = 1150, lineHeight = 34;
  const weights = columns.map(column => /الطالب|المعلم|الحلقة|ولي الأمر|الأم|الاسم/.test(column) ? 2.3 : /تاريخ الميلاد/.test(column) ? 1.35 : /الهوية|رقم الطالب/.test(column) ? 1.45 : /النقاط|الأجزاء|جزء|نقطة/.test(column) ? 0.65 : 1);
  const unit = (canvas.width - margin * 2) / Math.max(1, weights.reduce((a, b) => a + b, 0));
  const widths = weights.map(weight => weight * unit);
  const positions = widths.map((_, i) => canvas.width - margin - widths.slice(0, i + 1).reduce((a, b) => a + b, 0));
  const text = (value: unknown) => {
    if (value == null || value === '') return '—';
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10).split('-').reverse().join('/');
    if (typeof value === 'string' && /^\\d{4}-\\d{2}-\\d{2}(?:T.*)?$/.test(value)) return value.slice(0, 10).split('-').reverse().join('/');
    return typeof value === 'object' ? JSON.stringify(value) : String(value);
  };
  const wrap = (value: string, maxWidth: number) => {
    const lines: string[] = [];
    for (const paragraph of value.replace(/\\r/g, '').split('\\n')) {
      let current = '';
      for (const word of paragraph.split(/\\s+/).filter(Boolean)) {
        const candidate = current ? current + ' ' + word : word;
        if (current && ctx.measureText(candidate).width > maxWidth) {
          lines.push(current);
          current = '';
        }
        if (ctx.measureText(word).width <= maxWidth) {
          current = current ? current + ' ' + word : word;
        } else {
          for (const character of Array.from(word)) {
            if (current && ctx.measureText(current + character).width > maxWidth) {
              lines.push(current);
              current = '';
            }
            current += character;
          }
        }
      }
      lines.push(current);
    }
    return lines;
  };
  let y = 0, page = 0;
  const drawRow = (cells: string[][], offset: number, count: number, heading: boolean, stripe = false) => {
    const height = count * lineHeight + 22;
    cells.forEach((lines, index) => {
      const x = positions[index];
      const width = widths[index];
      ctx.fillStyle = heading ? '#14543f' : stripe ? '#f1f6f3' : '#ffffff';
      ctx.fillRect(x, y, width, height);
      ctx.strokeStyle = '#d5e1da'; ctx.lineWidth = 1; ctx.strokeRect(x, y, width, height);
      ctx.save(); ctx.beginPath(); ctx.rect(x + 8, y + 4, width - 16, height - 8); ctx.clip();
      ctx.fillStyle = heading ? '#ffffff' : '#1e293b';
      ctx.textAlign = 'right'; ctx.direction = 'rtl';
      lines.slice(offset, offset + count).forEach((line, i) => ctx.fillText(line, x + width - 12, y + 30 + i * lineHeight));
      ctx.restore();
    });
    y += height;
  };
  const begin = async () => {
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    await drawSchoolPdfHeader(ctx, canvas, { compact: true });
    ctx.font = 'bold 28px Tajawal'; ctx.textAlign = 'right'; ctx.direction = 'rtl'; ctx.fillStyle = '#14543f';
    ctx.fillText(title, canvas.width - margin, 158, canvas.width - margin * 2);
    y = 195; page++;
    if (columns.length) {
      ctx.font = 'bold 23px Tajawal';
      const headers = columns.map((column, index) => wrap(column, widths[index] - 24));
      drawRow(headers, 0, Math.max(...headers.map(lines => lines.length)), true);
    }
    ctx.font = '24px Tajawal';
  };
  const flush = async () => {
    ctx.font = '18px Tajawal'; ctx.fillStyle = '#64748b'; ctx.textAlign = 'center'; ctx.direction = 'rtl';
    ctx.fillText(`صفحة ${page}`, canvas.width / 2, 1200);
    const image = await pdf.embedPng(canvas.toDataURL('image/png'));
    const size = [canvas.width / 2.083, canvas.height / 2.083] as const;
    pdf.addPage([size[0], size[1]]).drawImage(image, { x: 0, y: 0, width: size[0], height: size[1] });
  };
  await begin();
  for (const [index, row] of rows.entries()) {
    ctx.font = '24px Tajawal';
    const cells = columns.map((column, index) => wrap(text(row[column]), widths[index] - 24));
    const total = Math.max(1, ...cells.map(lines => lines.length));
    if (y + total * lineHeight + 22 > bottom && total * lineHeight + 22 < bottom - 300) { await flush(); await begin(); }
    let offset = 0;
    while (offset < total) {
      const available = Math.floor((bottom - y - 22) / lineHeight);
      if (available < 1) { await flush(); await begin(); continue; }
      const count = Math.min(total - offset, available);
      drawRow(cells, offset, count, false, index % 2 === 1);
      offset += count;
      if (offset < total) { await flush(); await begin(); }
    }
  }
  if (!rows.length) { ctx.fillStyle = '#64748b'; ctx.textAlign = 'right'; ctx.fillText('لا توجد سجلات', canvas.width - margin, y + 40); }
  await flush();
  return new Blob([new Uint8Array(await pdf.save())], { type: 'application/pdf' });
}
