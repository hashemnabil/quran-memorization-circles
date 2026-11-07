import { useId, useMemo } from 'react';
import { SURAHS } from '@/lib/quran-surahs';

type Point = { x: number; y: number };
const outline = 'M 222 181 C 193 146 157 137 124 160 C 79 194 84 264 106 322 C 131 390 170 441 197 516 C 228 601 262 661 318 691 C 368 721 416 694 450 643 C 483 592 487 537 501 482 C 515 420 553 357 553 301 C 553 245 526 213 485 201 C 456 189 437 204 416 222 C 385 177 347 171 315 190 C 278 211 252 201 222 181 Z';

// Spread all 114 labels across the actual heart body, not a rectangular grid
// that gets cut off at the edge. Irregular offsets give organic cell boundaries.
const bands: Array<[number, number, number, number]> = [
  [204, 155, 468, 7], [245, 115, 523, 10], [288, 108, 535, 11],
  [331, 119, 530, 11], [374, 139, 516, 11], [417, 162, 502, 10],
  [460, 185, 489, 10], [503, 204, 482, 10], [546, 223, 474, 9],
  [589, 249, 461, 9], [632, 279, 433, 8], [671, 307, 394, 8],
];
const seeds: Point[] = bands.flatMap(([y, left, right, count], row) =>
  Array.from({ length: count }, (_, col) => {
    const step = (right - left) / count;
    return { x: left + step * (col + 0.5) + Math.sin((row + 1) * 3.7 + col * 2.1) * Math.min(7, step * 0.15),
      y: y + Math.sin(col * 2.9 + row * 1.8) * 7 };
  }),
).slice(0, 114);

function clipCell(polygon: Point[], a: number, b: number, c: number): Point[] {
  const inside = (p: Point) => a * p.x + b * p.y <= c + 0.001;
  const intersection = (p: Point, q: Point): Point => {
    const t = (c - a * p.x - b * p.y) / (a * (q.x - p.x) + b * (q.y - p.y));
    return { x: p.x + t * (q.x - p.x), y: p.y + t * (q.y - p.y) };
  };
  const output: Point[] = [];
  for (let i = 0; i < polygon.length; i++) {
    const current = polygon[i], next = polygon[(i + 1) % polygon.length];
    const one = inside(current), two = inside(next);
    if (one) output.push(current);
    if (one !== two) output.push(intersection(current, next));
  }
  return output;
}
const cells = seeds.map((seed, index) => {
  let polygon: Point[] = [{ x: 60, y: 145 }, { x: 570, y: 145 }, { x: 570, y: 735 }, { x: 60, y: 735 }];
  for (let j = 0; j < seeds.length && polygon.length; j++) {
    if (index === j) continue;
    const other = seeds[j];
    polygon = clipCell(polygon, 2 * (other.x - seed.x), 2 * (other.y - seed.y),
      other.x * other.x + other.y * other.y - seed.x * seed.x - seed.y * seed.y);
  }
  return polygon.map(point => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');
});

export default function QuranAchievementHeart({ completed }: { completed: ReadonlySet<string> }) {
  const id = useId().replace(/:/g, '');
  const total = useMemo(() => SURAHS.filter(surah => completed.has(surah.name)).length, [completed]);
  return <div className="mx-auto w-full max-w-[760px] space-y-3" dir="rtl">
    <h2 className="text-center font-serif text-2xl font-bold text-emerald-950 sm:text-3xl">بسم الله الرحمن الرحيم</h2>
    <svg viewBox="45 30 550 725" role="img" aria-label={`القلب القرآني التشريحي: ${total} سورة مكتملة من 114`} className="mx-auto h-auto w-full">
      <defs>
        <clipPath id={id}><path d={outline}/></clipPath>
      </defs>
      {/* Coronary vessels and aorta sit behind the chamber and stay separate from its cells. */}
      <g fill="#fffdfb" stroke="#292524" strokeWidth="3.3" strokeLinejoin="round">
        <path d="M 279 198 C 271 143 278 89 302 57 L 344 57 C 356 103 344 153 337 191 Z"/>
        <path d="M 351 189 C 357 133 377 100 418 88 L 447 111 C 425 142 409 178 417 221 Z"/>
        <path d="M 217 179 C 196 128 165 112 133 123 L 121 152 C 156 154 181 172 193 196 Z"/>
        <path d="M 479 210 C 494 172 532 150 567 165 L 574 198 C 541 196 516 216 506 240 Z"/>
      </g>
      <path d={outline} fill="#fffdfb" stroke="#292524" strokeWidth="4"/>
      <g clipPath={`url(#${id})`}>
        {SURAHS.map((surah, index) => {
          const point = seeds[index], done = completed.has(surah.name);
          if (!point) return null;
          return <g key={surah.number}>
            <polygon points={cells[index]} fill={done ? '#c91e31' : '#fffdfb'} stroke="#292524" strokeWidth="1.5" strokeLinejoin="round"/>
            <text x={point.x} y={point.y} textAnchor="middle" dominantBaseline="central" fontFamily="Tajawal, sans-serif" fontSize={surah.name.length > 10 ? 8.5 : 10} fontWeight="600" fill={done ? '#fff' : '#292524'}>{surah.name}</text>
            <title>{surah.name} — {done ? 'مكتملة' : 'غير مكتملة'}</title>
          </g>;
        })}
      </g>
      <path d={outline} fill="none" stroke="#292524" strokeWidth="4.5"/>
      <path d="M 222 181 C 244 219 262 246 277 282 M 416 222 C 392 252 382 276 375 306" fill="none" stroke="#292524" strokeWidth="2.3" strokeLinecap="round"/>
    </svg>
    <p className="text-center text-sm text-slate-600">{total} من 114 سورة مكتملة — الأحمر للمكتمل والأبيض لما لم يكتمل.</p>
  </div>;
}
