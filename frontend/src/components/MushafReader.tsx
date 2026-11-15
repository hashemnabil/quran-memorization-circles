import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button, Input, Select } from '@/components/ui';
import { IconBook, IconChevronDown, IconChevronLeft, IconChevronRight, IconDownload, IconMenu, IconSearch, IconX } from '@/components/ui/Icons';
import { mushafAsset, loadMushafPage, loadMushafFont, downloadMushaf, type MushafPage, type MushafWord } from '@/lib/mushaf';
import { Capacitor } from '@capacitor/core';
import { type LearningRules, type WordError } from '@/lib/learning-rules';
import { SURAHS } from '@/lib/quran-surahs';
import toast from 'react-hot-toast';
import './mushaf.css';
export function MushafReader({ rules, errors, onChange, onClose, range, readOnly = false, browsing = false, context }: {
    rules: LearningRules;
    errors: WordError[];
    onChange?: (errors: WordError[]) => void;
    onClose: () => void;
    range: {
        from: number;
        fromAyah: number;
        to: number;
        toAyah: number;
    };
    readOnly?: boolean;
    browsing?: boolean;
    context?:string;
}) {
    const [panel, setPanel] = useState<'navigation' | 'search' | null>(null);
    const [navigationTab, setNavigationTab] = useState<'surah' | 'juz' | 'hizb' | 'page'>('surah');
    const [query, setQuery] = useState('');
    const [searchResults, setSearchResults] = useState<{ page: number; surah: number; ayah: number; text: string }[]>([]);
    const [searching, setSearching] = useState(false);
    const [jumpPage, setJumpPage] = useState('1');
    const [jumpSurah, setJumpSurah] = useState(range.from);
    const [jumpAyah, setJumpAyah] = useState(range.fromAyah);
    const [page, setPage] = useState(() => {
        if (!browsing) return 582;
        try { const saved = Number(localStorage.getItem('qc.reading.mushaf.page')); return Number.isInteger(saved) && saved >= 1 && saved <= 604 ? saved : 1; }
        catch { return 1; }
    });
    const [data, setData] = useState<MushafPage>();
    const [failure, setFailure] = useState('');
    const [selected, setSelected] = useState<MushafWord>();
    const [note, setNote] = useState('');
    const [details, setDetails] = useState(false);
    const [ready, setReady] = useState(false);
    const [progress, setProgress] = useState<number | null>(null);
    const [downloader, setDownloader] = useState<AbortController>();
    const swipeStart = useRef<{ x: number; y: number } | null>(null);
    const suppressWordClickUntil = useRef(0);
    useEffect(() => () => downloader?.abort(), [downloader]);
    useEffect(() => { let active = true; setReady(false); setFailure(''); Promise.all([loadMushafPage(page), loadMushafFont(page)]).then(([p]) => { if (active) {
        setData(p);
        if (browsing) { const first = p.words.find(word => word.kind === 'word'); if (first) { setJumpSurah(first.surah); setJumpAyah(first.ayah); } }
        setReady(true);
    } }).catch(e => active && setFailure(e.message)); return () => { active = false; }; }, [page, browsing]);
    useEffect(() => { if (browsing) return; let active = true; mushafAsset('/mushaf/verse-pages.json').then(r => r.json()).then(p => active && setPage(p[range.from + ':' + range.fromAyah] ?? 582)).catch(() => { }); return () => { active = false; }; }, [range.from, range.fromAyah, browsing]);
    useEffect(() => { if (browsing) { try { localStorage.setItem('qc.reading.mushaf.page', String(page)); } catch { /* Reading remains available without storage. */ } } }, [page, browsing]);
    useEffect(() => { const listener = (e: KeyboardEvent) => { if (e.key === 'Escape') {
        if (selected)
            setSelected(undefined);
        else
            onClose();
    } }; window.addEventListener('keydown', listener); return () => window.removeEventListener('keydown', listener); }, [selected, onClose]);
    const inside = (w: MushafWord) => w.kind === 'word' && w.surah * 1000 + w.ayah >= range.from * 1000 + range.fromAyah && w.surah * 1000 + w.ayah <= range.to * 1000 + range.toAyah;
    const types = rules.types.filter(t => t.enabled && t.mode !== 'counter');
    const chosen = errors.filter(e => e.wordId === selected?.id);
    const mark = (typeId: string) => { if (!selected)
        return; onChange?.([...errors, { id: crypto.randomUUID(), wordId: selected.id, typeId, note: note || undefined }]); setSelected(undefined); setNote(''); };
    const goPage = (target: number) => { if (Number.isInteger(target) && target >= 1 && target <= 604) { setPage(target); setPanel(null); } };
    const finishSwipe = (x: number, y: number) => {
        const start = swipeStart.current;
        swipeStart.current = null;
        if (!start || selected || panel) return;
        const horizontal = x - start.x;
        const vertical = y - start.y;
        if (Math.abs(horizontal) < 65 || Math.abs(horizontal) < Math.abs(vertical) * 1.35) return;
        suppressWordClickUntil.current = Date.now() + 500;
        setPage(current => Math.min(604, Math.max(1, current + (horizontal > 0 ? 1 : -1))));
    };
    const searchQuran = async () => {
        const term = query.trim().replace(/[\u064B-\u065F\u0670\u0640]/g, '');
        if (term.length < 2) { toast.error('اكتب حرفين على الأقل للبحث'); return; }
        setSearching(true); setSearchResults([]);
        try {
            const matches: { page: number; surah: number; ayah: number; text: string }[] = [];
            for (let start = 1; start <= 604; start += 12) {
                const batch = await Promise.all(Array.from({ length: Math.min(12, 605 - start) }, (_, i) => loadMushafPage(start + i)));
                for (const p of batch) {
                    const verses = new Map<string, { surah: number; ayah: number; words: string[] }>();
                    for (const word of p.words) {
                        if (word.kind !== 'word') continue;
                        const key = word.surah + ':' + word.ayah;
                        if (!verses.has(key)) verses.set(key, { surah: word.surah, ayah: word.ayah, words: [] });
                        verses.get(key)!.words.push(word.text);
                    }
                    for (const verse of verses.values()) {
                        const text = verse.words.join(' ');
                        if (text.replace(/[\u064B-\u065F\u0670\u0640]/g, '').includes(term)) matches.push({ page: p.page, surah: verse.surah, ayah: verse.ayah, text });
                    }
                }
                if (matches.length >= 60) break;
            }
            setSearchResults(matches.slice(0, 60));
        } catch { toast.error(Capacitor.isNativePlatform() ? 'تعذر إكمال البحث في المصحف' : 'تعذر إكمال البحث؛ تأكد من تنزيل المصحف للبحث دون إنترنت'); }
        finally { setSearching(false); }
    };
    const go = async (surah: number, ayah: number) => { try {
        const response = await mushafAsset('/mushaf/verse-pages.json');
        const index = await response.json();
        setPage(index[surah + ':' + ayah] ?? page);
    }
    catch {
        toast.error('تعذر فتح فهرس المصحف');
    } };
    return createPortal(<div data-app-modal className={'mushaf-overlay ' + (browsing ? 'mushaf-reading-mode' : '')} dir="rtl" role="dialog" aria-modal="true" aria-label={browsing ? 'المصحف الشريف' : readOnly ? 'أخطاء التسميع المحفوظة' : 'الأخطاء على المصحف'}>
 <header className="mushaf-toolbar"><button type="button" className="mushaf-icon-action" onClick={onClose} aria-label={browsing ? 'العودة للرئيسية' : readOnly ? 'إغلاق' : 'إنهاء والعودة للتسميع'} title="إغلاق المصحف"><IconX size={20}/></button><div className="mushaf-toolbar-title"><button type="button" className="mushaf-surah-trigger" onClick={() => { setNavigationTab('surah'); setPanel('navigation'); }}><IconBook size={17}/><span>{SURAHS.find(s => s.number === data?.words.find(w => w.kind === 'word')?.surah)?.name ?? 'المصحف الشريف'}</span><IconChevronDown size={15}/></button><small>الصفحة {page} من 604</small></div><div className="mushaf-toolbar-actions"><button type="button" className="mushaf-icon-action" onClick={() => setPanel('search')} aria-label="البحث في المصحف" title="البحث"><IconSearch size={20}/></button><button type="button" className="mushaf-icon-action" onClick={() => { setNavigationTab('surah'); setPanel('navigation'); }} aria-label="فهرس المصحف" title="الفهرس"><IconMenu size={20}/></button></div></header>
 <div className="mushaf-page-progress" role="progressbar" aria-label="تقدم صفحات المصحف" aria-valuemin={1} aria-valuemax={604} aria-valuenow={page}><span style={{ width: `${page / 604 * 100}%` }}/></div>
 {!browsing && <nav className="mushaf-review-nav" aria-label="التنقل بين صفحات المصحف"><button type="button" disabled={page <= 1} onClick={() => setPage(p => p - 1)}><IconChevronRight size={18}/> السابقة</button><span>صفحة {page} من 604</span><button type="button" disabled={page >= 604} onClick={() => setPage(p => p + 1)}>التالية <IconChevronLeft size={18}/></button></nav>}
 {!browsing && <div className="mushaf-session-info"><span>{readOnly ? 'اسحب للتنقل بين الصفحات' : 'اضغط على الكلمة للتعليم، واسحب لتغيير الصفحة'}</span>{context && <small>{context}</small>}<div className="mushaf-legend" aria-label="دليل ألوان الأخطاء"><span className="mushaf-legend-mistake">خطأ</span><span className="mushaf-legend-warning">تنبيه</span><span className="mushaf-legend-tajweed">تجويد</span></div></div>}
 {!browsing && <div className="mushaf-controls"><Select label="السورة" value={jumpSurah} onChange={e => { setJumpSurah(Number(e.target.value)); setJumpAyah(1); void go(Number(e.target.value), 1); }}><option value="">انتقل إلى سورة</option>{SURAHS.map(s => <option key={s.number} value={s.number}>{s.name}</option>)}</Select><Input label="الآية" type="number" min={1} max={SURAHS.find(s => s.number === jumpSurah)?.ayahs ?? 286} value={jumpAyah} onChange={e => setJumpAyah(Number(e.target.value))}/><Button variant="secondary" onClick={() => void go(jumpSurah, jumpAyah)}>انتقال</Button><Input label="الصفحة" type="number" min={1} max={604} value={page} onChange={e => { const n = Number(e.target.value); if (Number.isInteger(n) && n >= 1 && n <= 604) setPage(n); }}/></div>}
 {panel && <div className="mushaf-panel-backdrop" onClick={() => setPanel(null)}><section className="mushaf-panel" role="dialog" aria-label={panel === 'search' ? 'البحث في القرآن' : 'التنقل في المصحف'} onClick={e => e.stopPropagation()}><header><h2>{panel === 'search' ? 'البحث في القرآن' : 'التنقل في المصحف'}</h2><button type="button" onClick={() => setPanel(null)} aria-label="إغلاق القائمة"><IconX size={20}/></button></header>
 {panel === 'navigation' ? <><div className="mushaf-panel-tabs">{(['surah','juz','hizb','page'] as const).map((tab,i) => <button key={tab} className={navigationTab === tab ? 'active' : ''} onClick={() => setNavigationTab(tab)}>{['السورة','الجزء','الحزب','الصفحة'][i]}</button>)}</div>
 {navigationTab === 'surah' ? <><input className="mushaf-panel-input" placeholder="ابحث عن سورة..." value={query} onChange={e => setQuery(e.target.value)}/><div className="mushaf-panel-list">{SURAHS.filter(s => s.name.includes(query.trim()) || String(s.number) === query.trim()).map(s => <button key={s.number} onClick={() => { setJumpSurah(s.number); setJumpAyah(1); setPanel(null); void go(s.number,1); }}><span className="mushaf-number">{s.number}</span><span><strong>سورة {s.name}</strong><small>{s.ayahs} آية</small></span><span>‹</span></button>)}</div></> : navigationTab === 'page' ? <div className="mushaf-jump"><label htmlFor="mushaf-jump-page">رقم الصفحة (1–604)</label><input id="mushaf-jump-page" type="number" min={1} max={604} value={jumpPage} onChange={e => setJumpPage(e.target.value)}/><button onClick={() => goPage(Number(jumpPage))}>الانتقال إلى الصفحة</button></div> : <div className="mushaf-panel-list">{Array.from({length:navigationTab==='juz'?30:60},(_,i)=>i+1).map(n=><button key={n} onClick={() => goPage(navigationTab==='juz' ? [1,22,42,62,82,102,121,142,162,182,201,222,242,262,282,302,322,342,362,382,402,422,442,462,482,502,522,542,562,582][n-1] : [1,11,22,32,42,51,62,72,82,92,102,112,121,132,142,151,162,172,182,192,201,212,222,232,242,252,262,272,282,292,302,312,322,332,342,352,362,372,382,392,402,412,422,432,442,452,462,472,482,492,502,512,522,532,542,552,562,572,582,592][n-1])}><span className="mushaf-number">{n}</span><strong>{navigationTab==='juz'?'الجزء':'الحزب'} {n}</strong><span>‹</span></button>)}</div>}</> : <><input className="mushaf-panel-input" placeholder="ابحث عن كلمة أو عبارة من القرآن..." value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if(e.key==='Enter') void searchQuran(); }}/><button className="mushaf-search-button" disabled={searching} onClick={() => void searchQuran()}>{searching ? 'جارٍ البحث في صفحات المصحف…' : 'بحث في الآيات'}</button><div className="mushaf-panel-list">{searchResults.map((r,i)=><button key={i} onClick={() => goPage(r.page)}><span className="mushaf-result"><strong>{r.text}</strong><small>سورة {SURAHS.find(s=>s.number===r.surah)?.name} · الآية {r.ayah} · الصفحة {r.page}</small></span><span>‹</span></button>)}{!searching && query && searchResults.length===0 && <p className="mushaf-empty">اكتب عبارة ثم اضغط بحث لعرض النتائج.</p>}</div></>}
 </section></div>}
 <main className="mushaf-main" onTouchStart={e => { if (e.touches.length === 1) swipeStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; else swipeStart.current = null; }} onTouchEnd={e => { const touch = e.changedTouches[0]; if (touch) finishSwipe(touch.clientX, touch.clientY); }} onTouchCancel={() => { swipeStart.current = null; }}>{failure ? <div role="alert" className="p-8 text-center">{failure}<Button onClick={() => { setPage(page === 604 ? 603 : page + 1); }}>صفحة أخرى</Button></div> : !ready ? <p className="p-10 text-center" role="status">جارٍ تجهيز صفحة المصحف…</p> : <article className="mushaf-paper" aria-label={'صفحة ' + page}>
 <div className="mushaf-page-heading"><span>سورة {SURAHS.find(s => s.number === data?.words.find(w => w.kind === 'word')?.surah)?.name}</span><span>صفحة {page}</span></div>
 {Array.from({ length: 15 }, (_, i) => i + 1).map(line => { const words = data?.words.filter(w => w.line === line) ?? []; const layout = data?.lines?.find(l => l.number === line); if (!words.length)
            return <div key={line} className="mushaf-line mushaf-decoration">{layout?.type === 'surah' ? 'سورة ' + SURAHS.find(s => s.number === layout.surah)?.name : layout?.type === 'bismillah' ? 'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ' : ''}</div>; return <div key={line} className="mushaf-line" style={{ fontFamily: 'MushafPage' + page,justifyContent:layout?.centered?'center':'space-between',gap:layout?.centered?'0.2em':undefined }}>{words.map(w => { const marked = errors.filter(e => e.wordId === w.id); const category = rules.types.find(t => t.id === marked.at(-1)?.typeId)?.category; return <button key={w.id} type="button" aria-label={w.text + '، آية ' + w.ayah + (marked.length ? '، ' + marked.length + ' أخطاء' : '')} title={w.text} disabled={browsing || w.kind !== 'word' || (!readOnly && !inside(w))} className={'mushaf-word ' + (inside(w) ? 'in-range ' : '') + (category ? 'marked-' + category : '')} onClick={() => { if (Date.now() < suppressWordClickUntil.current) return; setSelected(w); setNote(marked[0]?.note ?? ''); }}>{w.glyph}</button>; })}</div>; })}
 <footer className="mushaf-paper-footer">۞ <span>{page}</span> ۞</footer></article>}
 </main><footer className="mushaf-footer">{browsing && <div className="mushaf-page-nav"><button type="button" disabled={page<=1} onClick={()=>setPage(p=>p-1)} aria-label="الصفحة السابقة"><IconChevronRight size={18}/><span>السابقة</span></button><button type="button" onClick={()=>{setNavigationTab('page');setJumpPage(String(page));setPanel('navigation');}} aria-label="الانتقال إلى صفحة">{page} <span>من 604</span></button><button type="button" disabled={page>=604} onClick={()=>setPage(p=>p+1)} aria-label="الصفحة التالية"><span>التالية</span><IconChevronLeft size={18}/></button></div>}{!browsing && <Button variant="secondary" onClick={() => setDetails(!details)}>تفاصيل الأخطاء ({errors.length})</Button>}{!readOnly && !browsing && <Button variant="secondary" disabled={!errors.length} onClick={() => onChange?.(errors.slice(0, -1))}>تراجع</Button>}{!Capacitor.isNativePlatform() && <Button variant="secondary" disabled={progress !== null} onClick={() => { const controller = new AbortController(); setDownloader(controller); setProgress(0); void downloadMushaf(setProgress, controller.signal).then(() => !controller.signal.aborted && toast.success('المصحف جاهز دون اتصال')).catch(e => toast.error(e.message)).finally(() => setProgress(null)); }}><IconDownload size={17}/>{progress === null ? 'حفظ المصحف دون نت' : 'تنزيل ' + progress + '/604'}</Button>}{!Capacitor.isNativePlatform() && progress !== null && <Button onClick={() => downloader?.abort()}>إيقاف</Button>}</footer>
 {details && <section className="mushaf-details"><h2 className="font-bold">الأخطاء المسجلة</h2>{!errors.length && <p>لم تسجل أخطاء على الكلمات</p>}{errors.map(e => <div key={e.id} className="flex flex-wrap items-center gap-3 border-b py-3"><span>{e.wordId} · {rules.types.find(t => t.id === e.typeId)?.label} · خصم {(e as WordError & {penalty?:number}).penalty??rules.types.find(t=>t.id===e.typeId)?.penalty??0}</span><span>{e.note}</span>{!readOnly && <Button size="sm" variant="secondary" onClick={() => onChange?.(errors.filter(x => x.id !== e.id))}>حذف</Button>}</div>)}</section>}
 {selected && <div className="mushaf-sheet-backdrop" onClick={() => setSelected(undefined)}><section className="mushaf-sheet" role="dialog" aria-label="نوع الخطأ" onClick={e => e.stopPropagation()}><header className="flex items-center justify-between"><h2 className="text-xl font-bold">{selected.text}</h2><Button variant="secondary" onClick={() => setSelected(undefined)}>إغلاق</Button></header><p className="my-2 text-xs text-slate-500">سورة {SURAHS.find(s => s.number === selected.surah)?.name} · آية {selected.ayah}</p>
 {!readOnly && <><Input label="ملاحظة اختيارية" value={note} onChange={e => setNote(e.target.value)}/><div className="mt-3 grid grid-cols-2 gap-2">{types.map(t => <button key={t.id} className={'mushaf-error-option option-' + t.category} onClick={() => mark(t.id)}>{t.label}<small className="block">خصم {t.penalty}{t.freeFirst ? ' · أول مرة دون خصم' : ''}</small></button>)}</div>{!types.length && <p>لم تفعّل الإدارة أنواع أخطاء على المصحف.</p>}</>}
 {chosen.map(e => <div key={e.id} className="mt-3 rounded-lg bg-slate-50 p-3"><p>{rules.types.find(t => t.id === e.typeId)?.label} · {e.note}</p>{!readOnly && <div className="flex gap-2"><Button size="sm" variant="secondary" onClick={() => { onChange?.(errors.map(x => x.id === e.id ? { ...x, note } : x)); setSelected(undefined); }}>حفظ الملاحظة</Button><Button size="sm" variant="secondary" onClick={() => { onChange?.(errors.filter(x => x.id !== e.id)); setSelected(undefined); }}>حذف الخطأ</Button></div>}</div>)}
 </section></div>}</div>, document.body);
}
