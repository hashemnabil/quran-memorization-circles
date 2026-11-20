export async function draftPdf(fileUrl: string) {
  const { PDFDocument, degrees } = await import('pdf-lib');
  const bytes = Uint8Array.from(atob(fileUrl.split(',')[1]), character => character.charCodeAt(0));
  const pdf = await PDFDocument.load(bytes);
  const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 160;
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('تعذر تجهيز علامة المسودة');
  await document.fonts.ready;
  ctx.direction = 'rtl'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = 'bold 46px Tajawal, Tahoma, sans-serif';
  ctx.fillStyle = '#9a5729'; ctx.fillText('مسودة — بانتظار اعتماد الخادم', canvas.width / 2, canvas.height / 2);
  const stamp = await pdf.embedPng(canvas.toDataURL('image/png'));
  for (const page of pdf.getPages()) {
    const { width, height } = page.getSize();
    page.drawImage(stamp, { x: width * .09, y: height * .48, width: width * .86, height: width * .115, rotate: degrees(-12), opacity: .55 });
  }
  pdf.setSubject('مسودة محلية — بانتظار اعتماد الخادم');
  return 'data:application/pdf;base64,' + (await pdf.saveAsBase64());
}
