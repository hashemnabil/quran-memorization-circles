import { useId } from 'react';
import { SURAHS } from '@/lib/quran-surahs';
import { HEART_CELLS } from '@/lib/achievement-heart';
import type { SurahAchievement, SurahAchievementStage } from '@/lib/surah-achievements';

export const HEART_STAGE_COLORS: Record<SurahAchievementStage, string> = { MEMORIZED: '#f4cf58', REVIEWED: '#c94747', CONSOLIDATED: '#258263' };
export const HEART_STAGE_LABELS: Record<SurahAchievementStage, string> = { MEMORIZED: 'حفظ بممتاز', REVIEWED: 'مراجعة بممتاز', CONSOLIDATED: 'تثبيت بممتاز' };

function Flower({ x, y, size = 1, rotate = 0 }: { x: number; y: number; size?: number; rotate?: number }) {
  return <g transform={`translate(${x} ${y}) rotate(${rotate}) scale(${size})`} fill="#fff" stroke="#33443b" strokeWidth="1.5">
    {Array.from({ length: 6 }, (_, index) => <path key={index} transform={`rotate(${index * 60})`} d="M 0 -4 C -16 -9 -22 -31 -9 -36 C 0 -41 7 -27 0 -4 C 8 -25 21 -28 21 -17 C 22 -7 11 -3 0 -4 Z"/>)}
    <circle r="6" fill="#f4ecd8"/><circle r="2" fill="#33443b"/>
  </g>;
}

/** The heart, flowers, borders and all 114 names are native SVG, with no image or canvas dependency. */
export default function QuranAchievementHeart({ achievements = [] }: { achievements?: readonly SurahAchievement[] }) {
  const id = useId().replace(/:/g, '');
  const bySurah = new Map(achievements.map(achievement => [achievement.surah, achievement]));
  const total = SURAHS.filter(surah => bySurah.has(surah.name)).length;
  return <figure className="mx-auto w-full space-y-4" style={{ maxWidth: 662 }} dir="rtl">
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 100 662 1000" role="img" aria-labelledby={`${id}-title ${id}-description`} style={{ display: 'block', width: '100%', height: 'auto', background: '#fff', borderRadius: 20 }}>
      <title id={`${id}-title`}>قلبي القرآني: {total} سورة مكتملة بممتاز من 114</title>
      <desc id={`${id}-description`}>قلب مرسوم بأسماء سور القرآن. الأصفر للحفظ بممتاز، والأحمر للمراجعة بممتاز بعد الحفظ، والأخضر للتثبيت بممتاز بعد المراجعة. الأبيض لما لم يكتمل.</desc>
      <text x="331" y="126" textAnchor="middle" fontFamily="Tajawal, Tahoma, sans-serif" fontSize="22" fontWeight="700" fill="#243a30">بسم الله الرحمن الرحيم</text>
      <g fill="none" stroke="#33443b" strokeWidth="2" strokeLinecap="round">
        <path d="M 111 426 C 60 360 27 275 29 180 M 66 350 C 16 341 8 313 15 294 M 38 265 C 73 233 84 205 77 167 M 35 211 C 12 201 10 185 15 177 M 286 344 C 279 290 282 220 317 166 M 294 228 C 328 210 349 188 350 166 M 307 185 C 299 171 306 159 314 154 M 475 397 C 541 352 588 279 600 185 M 560 292 C 611 280 636 244 634 220 M 581 245 C 550 220 548 200 561 187 M 597 204 C 621 192 626 177 620 165"/>
        <path d="M 29 180 Q 6 160 15 150 Q 34 153 29 180 M 77 167 Q 68 140 81 137 Q 93 150 77 167 M 317 166 Q 315 140 327 137 Q 336 155 317 166 M 350 166 Q 359 143 372 148 Q 370 166 350 166 M 620 165 Q 601 147 610 138 Q 629 143 620 165 M 634 220 Q 648 202 656 209 Q 655 226 634 220"/>
      </g>
      <Flower x={44} y={248} size={0.85}/><Flower x={111} y={250} size={1} rotate={16}/><Flower x={52} y={315} size={0.94}/><Flower x={102} y={363} size={0.78}/><Flower x={151} y={313} size={0.8}/>
      <Flower x={537} y={200} size={0.9}/><Flower x={581} y={270} size={1.04} rotate={14}/><Flower x={536} y={346} size={0.96}/><Flower x={452} y={333} size={0.76}/>
      <g stroke="#34443b" strokeWidth="1.8" strokeLinejoin="round">
        {SURAHS.map((surah, index) => {
          const cell = HEART_CELLS[index];
          const achievement = bySurah.get(surah.name);
          const label = achievement ? HEART_STAGE_LABELS[achievement.stage] : 'لم يكتمل حفظها بممتاز';
          return <g key={surah.number} data-surah={surah.name} data-stage={achievement?.stage || 'NONE'}>
            <path d={cell.d} fill={achievement ? HEART_STAGE_COLORS[achievement.stage] : '#fffefb'}><title>{surah.name}: {label}</title></path>
            <text x={surah.number === 3 ? 213 : cell.x} y={surah.number === 3 ? 304 : cell.y} textAnchor="middle" dominantBaseline="central" direction="rtl" stroke="none" fill={achievement && achievement.stage !== 'MEMORIZED' ? '#fff' : '#263b31'} fontFamily="Tajawal, Tahoma, sans-serif" fontSize={surah.name.length > 9 ? 8.5 : surah.name.length > 6 ? 10 : 11.5} fontWeight="700">{surah.name}</text>
          </g>;
        })}
      </g>
    </svg>
    <figcaption className="space-y-3 text-center text-sm text-slate-600">
      <p className="font-bold">{total} من 114 سورة مكتملة بممتاز</p>
      <div className="flex flex-wrap justify-center gap-x-5 gap-y-2">{(['MEMORIZED', 'REVIEWED', 'CONSOLIDATED'] as const).map(stage => <span key={stage} className="inline-flex items-center gap-2"><i aria-hidden="true" className="inline-block h-3 w-3 rounded-full" style={{ background: HEART_STAGE_COLORS[stage] }}/>{HEART_STAGE_LABELS[stage]}</span>)}</div>
      <p className="text-xs leading-6">يتقدّم لون السورة بعد إتمام جميع آياتها بممتاز في كل مرحلة بالترتيب: الحفظ، ثم المراجعة، ثم التثبيت.</p>
    </figcaption>
    {total > 0 && <details className="rounded-xl border border-slate-200 p-3 text-sm"><summary className="cursor-pointer font-bold">تفاصيل السور المنجزة</summary><ul className="mt-3 grid gap-2 sm:grid-cols-2">{SURAHS.filter(surah => bySurah.has(surah.name)).map(surah => <li key={surah.number} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 p-2 text-slate-700"><strong>{surah.name}</strong><span>{HEART_STAGE_LABELS[bySurah.get(surah.name)!.stage]}</span></li>)}</ul></details>}
  </figure>;
}
