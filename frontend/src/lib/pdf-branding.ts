import { cachedSchoolBranding, DEFAULT_SCHOOL_LOGO, DEFAULT_SCHOOL_NAME } from '@/config/branding';

/** Draws the school identity into a canvas so exported PDFs work offline too. */
export async function drawSchoolPdfHeader(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  options: { compact?: boolean } = {},
) {
  const compact = options.compact ?? false;
  const branding = cachedSchoolBranding();
  const name = branding.name?.trim() || DEFAULT_SCHOOL_NAME;
  const center = canvas.width / 2;
  const bandHeight = compact ? 112 : 174;
  const logoSize = compact ? 58 : 92;

  ctx.save();
  ctx.fillStyle = '#14543f';
  ctx.fillRect(0, 0, canvas.width, bandHeight);
  ctx.fillStyle = '#d8b86a';
  ctx.fillRect(canvas.width * 0.08, compact ? 106 : 166, canvas.width * 0.84, compact ? 4 : 6);

  const logo = await loadLogo(branding.logoUrl || DEFAULT_SCHOOL_LOGO);
  if (logo) {
    const margin = compact ? 28 : 44;
    const x = canvas.width - margin - logoSize;
    const y = (bandHeight - logoSize) / 2;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x + logoSize / 2, y + logoSize / 2, logoSize / 2 + 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.drawImage(logo, x, y, logoSize, logoSize);
  }

  ctx.direction = 'rtl';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  const fontSize = compact ? 25 : 32;
  const textWidth = logo ? canvas.width - logoSize - (compact ? 92 : 140) : canvas.width * 0.86;
  const textCenter = logo ? (canvas.width - logoSize - (compact ? 64 : 100)) / 2 : center;
  ctx.font = `bold ${fontSize}px Tajawal, Tahoma, Arial, sans-serif`;
  ctx.fillText(name, textCenter, bandHeight / 2 + fontSize * 0.36, textWidth);
  ctx.restore();
}

async function loadLogo(url: string): Promise<HTMLImageElement | null> {
  try {
    const response = await fetch(url, { credentials: 'same-origin' });
    if (!response.ok) return null;
    const objectUrl = URL.createObjectURL(await response.blob());
    const image = new Image();
    image.src = objectUrl;
    await image.decode();
    URL.revokeObjectURL(objectUrl);
    return image;
  } catch {
    return null;
  }
}
