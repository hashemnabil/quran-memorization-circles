import { useId } from 'react';
import { SURAHS } from '@/lib/quran-surahs';

/** Anatomical-style heart with one colored region for each recorded surah. */
export default function QuranAchievementHeart({ completed }: { completed: ReadonlySet<string> }) {
  const clipId = useId().replace(/:/g, '');
  const body = 'M 220 178 C 191 139 147 141 117 168 C 77 206 79 275 104 329 C 128 388 170 441 195 511 C 220 585 259 655 317 689 C 365 719 415 698 449 652 C 485 603 491 541 501 483 C 512 420 555 361 553 303 C 552 248 525 215 485 201 C 455 190 437 207 416 222 C 385 176 347 169 315 188 C 278 211 251 198 220 178 Z';
  return <div className="mx-auto w-full max-w-[650px]" dir="rtl">
    <svg viewBox="0 0 650 800" role="img" aria-label={`القلب القرآني: ${SURAHS.filter(s => completed.has(s.name)).length} سورة مكتملة من 114`} className="h-auto w-full">
      <defs><clipPath id={clipId}><path d={body}/></clipPath></defs>
      <g fill="#fffdfb" stroke="#292524" strokeWidth="3.5" strokeLinejoin="round">
        <path d="M 280 200 C 267 140 273 86 303 58 L 344 58 C 354 103 344 147 337 189 Z"/>
        <path d="M 350 188 C 355 131 375 99 418 88 L 447 111 C 425 141 410 175 416 222 Z"/>
        <path d="M 219 179 C 198 126 167 113 133 123 L 121 153 C 154 155 178 170 191 197 Z"/>
        <path d="M 477 209 C 493 170 531 149 567 165 L 574 198 C 540 197 516 217 506 238 Z"/>
      </g>
      <path d={body} fill="#fffdfb" stroke="#292524" strokeWidth="5"/>
      <g clipPath={`url(#${clipId})`}>
        {SURAHS.map((surah, index) => {
          const row = Math.floor(index / 10);
          const col = index % 10;
          const x = 78 + col * 49 + (row % 2 ? -13 : 0);
          const y = 142 + row * 49;
          const done = completed.has(surah.name);
          return <g key={surah.number}>
            <path d={`M ${x} ${y} l 54 -6 l 10 57 l -59 9 Z`} fill={done ? '#dc2626' : '#fffdfb'} stroke="#292524" strokeWidth="2.2"/>
            <text x={x + 29} y={y + 27} fontSize="10.5" fontFamily="sans-serif" textAnchor="middle" dominantBaseline="middle" fill={done ? '#ffffff' : '#292524'}>{surah.name}</text>
            <title>{surah.name} — {done ? 'مكتملة' : 'غير مكتملة'}</title>
          </g>;
        })}
      </g>
      <path d={body} fill="none" stroke="#292524" strokeWidth="5"/>
    </svg>
    <p className="mt-2 text-center text-sm text-slate-600">السور المكتملة بالأحمر، وغير المكتملة بالأبيض.</p>
  </div>;
}
