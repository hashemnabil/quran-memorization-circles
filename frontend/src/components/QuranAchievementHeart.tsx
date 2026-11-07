import { useEffect, useRef, useState } from 'react';
import heartArtwork from '@/assets/quran-achievement-heart.jpg';
import { SURAHS } from '@/lib/quran-surahs';
import { HEART_SURAH_POINTS, heartCellPixels } from '@/lib/achievement-heart';

export default function QuranAchievementHeart({ completed }: { completed: ReadonlySet<string> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const completedKey = SURAHS.filter(surah => completed.has(surah.name)).map(surah => surah.number).join(',');
  const total = completedKey ? completedKey.split(',').length : 0;

  useEffect(() => {
    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (cancelled) return;
      const canvas = canvasRef.current;
      const context = canvas?.getContext('2d');
      if (!canvas || !context) return;
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      context.drawImage(image, 0, 0);
      const original = context.getImageData(0, 0, canvas.width, canvas.height);
      const coloured = new ImageData(new Uint8ClampedArray(original.data), canvas.width, canvas.height);
      for (const number of completedKey.split(',').filter(Boolean).map(Number)) {
        const point = HEART_SURAH_POINTS[number - 1];
        if (!point) continue;
        for (const index of heartCellPixels(original.data, canvas.width, canvas.height, point)) {
          const offset = index * 4;
          // Multiply a soft red into the paper, preserving the photographed text and shading.
          coloured.data[offset + 1] = Math.round(original.data[offset + 1] * 0.57);
          coloured.data[offset + 2] = Math.round(original.data[offset + 2] * 0.62);
        }
      }
      context.putImageData(coloured, 0, 0);
      setReady(true);
    };
    image.src = heartArtwork;
    return () => { cancelled = true; };
  }, [completedKey]);

  return <figure className="mx-auto w-full max-w-[662px] space-y-3" dir="rtl">
    <div className="overflow-hidden rounded-2xl bg-white">
      {!ready && <img src={heartArtwork} alt="قلب قرآني مزخرف بالزهور ومقسّم إلى أسماء سور القرآن" width={662} height={1176} className="h-auto w-full" />}
      <canvas ref={canvasRef} role="img" aria-label={`قلبي القرآني: ${total} سورة مكتملة من 114، المساحات الحمراء للسور المكتملة`} className={ready ? 'h-auto w-full' : 'hidden'} />
    </div>
    <figcaption className="text-center text-sm text-slate-600">{total} من 114 سورة مكتملة — الأحمر للمكتمل والأبيض لما لم يكتمل.</figcaption>
    {total > 0 && <details className="rounded-xl border border-slate-200 p-3 text-sm text-slate-700"><summary className="cursor-pointer font-bold">السور المكتملة</summary><p className="mt-2 leading-7">{SURAHS.filter(surah => completed.has(surah.name)).map(surah => surah.name).join('، ')}</p></details>}
  </figure>;
}
