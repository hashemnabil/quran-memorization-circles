import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button, Input, Select } from '@/components/ui';
import { mushafAsset, loadMushafPage, loadMushafFont, downloadMushaf, type MushafPage, type MushafWord } from '@/lib/mushaf';
import { type LearningRules, type WordError } from '@/lib/learning-rules';
import { SURAHS } from '@/lib/quran-surahs';
import toast from 'react-hot-toast';
import './mushaf.css';
export function MushafReader({ rules, errors, onChange, onClose, range, readOnly = false, context }: {
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
    context?:string;
}) {
    const [jumpSurah, setJumpSurah] = useState(range.from);
    const [jumpAyah, setJumpAyah] = useState(range.fromAyah);
    const [page, setPage] = useState(582);
    const [data, setData] = useState<MushafPage>();
    const [failure, setFailure] = useState('');
    const [selected, setSelected] = useState<MushafWord>();
    const [note, setNote] = useState('');
    const [details, setDetails] = useState(false);
    const [ready, setReady] = useState(false);
    const [progress, setProgress] = useState<number | null>(null);
    const [downloader, setDownloader] = useState<AbortController>();
    useEffect(() => () => downloader?.abort(), [downloader]);
    useEffect(() => { let active = true; setReady(false); setFailure(''); Promise.all([loadMushafPage(page), loadMushafFont(page)]).then(([p]) => { if (active) {
        setData(p);
        setReady(true);
    } }).catch(e => active && setFailure(e.message)); return () => { active = false; }; }, [page]);
    useEffect(() => { let active = true; mushafAsset('/mushaf/verse-pages.json').then(r => r.json()).then(p => active && setPage(p[range.from + ':' + range.fromAyah] ?? 582)).catch(() => { }); return () => { active = false; }; }, [range.from, range.fromAyah]);
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
    const go = async (surah: number, ayah: number) => { try {
        const response = await mushafAsset('/mushaf/verse-pages.json');
        const index = await response.json();
        setPage(index[surah + ':' + ayah] ?? page);
    }
    catch {
        toast.error('تعذر فتح فهرس المصحف');
    } };
    return createPortal(<div data-app-modal className="mushaf-overlay" dir="rtl" role="dialog" aria-modal="true" aria-label={readOnly ? 'أخطاء التسميع المحفوظة' : 'الأخطاء على المصحف'}><header className="mushaf-toolbar"><div><strong>المصحف الشريف</strong><p className="text-xs opacity-80">{context??(readOnly ? 'عرض سجل التسميع' : 'اضغط على الكلمة ثم اختر نوع الخطأ')}</p></div><Button onClick={onClose}>{readOnly ? 'إغلاق' : 'إنهاء والعودة للتسميع'}</Button></header>
 <div className="mushaf-controls"><Select label="السورة" value={jumpSurah} onChange={e => { setJumpSurah(Number(e.target.value)); setJumpAyah(1); void go(Number(e.target.value), 1); }}><option value="">انتقل إلى سورة</option>{SURAHS.map(s => <option key={s.number} value={s.number}>{s.name}</option>)}</Select><Input label="الآية" type="number" min={1} max={SURAHS.find(s => s.number === jumpSurah)?.ayahs ?? 286} value={jumpAyah} onChange={e => setJumpAyah(Number(e.target.value))}/><Button variant="secondary" onClick={() => void go(jumpSurah, jumpAyah)}>انتقال</Button><Input label="الصفحة" type="number" min={1} max={604} value={page} onChange={e => { const n = Number(e.target.value); if (Number.isInteger(n) && n >= 1 && n <= 604)
        setPage(n); }}/><Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>السابقة</Button><Button variant="secondary" disabled={page >= 604} onClick={() => setPage(page + 1)}>التالية</Button></div>
 <main className="mushaf-main">{failure ? <div role="alert" className="p-8 text-center">{failure}<Button onClick={() => { setPage(page === 604 ? 603 : page + 1); }}>صفحة أخرى</Button></div> : !ready ? <p className="p-10 text-center" role="status">جارٍ تجهيز صفحة المصحف…</p> : <article className="mushaf-paper" aria-label={'صفحة ' + page}>
 <div className="mushaf-page-heading"><span>{SURAHS.find(s => s.number === data?.words[0]?.surah)?.name}</span><span>صفحة {page}</span></div>
 {Array.from({ length: 15 }, (_, i) => i + 1).map(line => { const words = data?.words.filter(w => w.line === line) ?? []; const layout = data?.lines?.find(l => l.number === line); if (!words.length)
            return <div key={line} className="mushaf-line mushaf-decoration">{layout?.type === 'surah' ? 'سورة ' + SURAHS.find(s => s.number === layout.surah)?.name : layout?.type === 'bismillah' ? 'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ' : ''}</div>; return <div key={line} className="mushaf-line" style={{ fontFamily: 'MushafPage' + page,justifyContent:layout?.centered?'center':'space-between',gap:layout?.centered?'0.2em':undefined }}>{words.map(w => { const marked = errors.filter(e => e.wordId === w.id); const category = rules.types.find(t => t.id === marked.at(-1)?.typeId)?.category; return <button key={w.id} type="button" aria-label={w.text + '، آية ' + w.ayah + (marked.length ? '، ' + marked.length + ' أخطاء' : '')} title={w.text} disabled={w.kind !== 'word' || (!readOnly && !inside(w))} className={'mushaf-word ' + (inside(w) ? 'in-range ' : '') + (category ? 'marked-' + category : '')} onClick={() => { setSelected(w); setNote(marked[0]?.note ?? ''); }}>{w.glyph}</button>; })}</div>; })}
 <footer className="text-center text-sm">{page}</footer></article>}
 </main><footer className="mushaf-footer"><Button variant="secondary" onClick={() => setDetails(!details)}>تفاصيل الأخطاء ({errors.length})</Button>{!readOnly && <Button variant="secondary" disabled={!errors.length} onClick={() => onChange?.(errors.slice(0, -1))}>تراجع</Button>}<Button variant="secondary" disabled={progress !== null} onClick={() => { const controller = new AbortController(); setDownloader(controller); setProgress(0); void downloadMushaf(setProgress, controller.signal).then(() => !controller.signal.aborted && toast.success('المصحف جاهز دون اتصال')).catch(e => toast.error(e.message)).finally(() => setProgress(null)); }}>{progress === null ? 'تنزيل المصحف دون اتصال' : 'تنزيل ' + progress + '/604'}</Button>{progress !== null && <Button onClick={() => downloader?.abort()}>إيقاف</Button>}</footer>
 {details && <section className="mushaf-details"><h2 className="font-bold">الأخطاء المسجلة</h2>{!errors.length && <p>لم تسجل أخطاء على الكلمات</p>}{errors.map(e => <div key={e.id} className="flex flex-wrap items-center gap-3 border-b py-3"><span>{e.wordId} · {rules.types.find(t => t.id === e.typeId)?.label} · خصم {(e as WordError & {penalty?:number}).penalty??rules.types.find(t=>t.id===e.typeId)?.penalty??0}</span><span>{e.note}</span>{!readOnly && <Button size="sm" variant="secondary" onClick={() => onChange?.(errors.filter(x => x.id !== e.id))}>حذف</Button>}</div>)}</section>}
 {selected && <div className="mushaf-sheet-backdrop" onClick={() => setSelected(undefined)}><section className="mushaf-sheet" role="dialog" aria-label="نوع الخطأ" onClick={e => e.stopPropagation()}><header className="flex items-center justify-between"><h2 className="text-xl font-bold">{selected.text}</h2><Button variant="secondary" onClick={() => setSelected(undefined)}>إغلاق</Button></header><p className="my-2 text-xs text-slate-500">سورة {SURAHS.find(s => s.number === selected.surah)?.name} · آية {selected.ayah}</p>
 {!readOnly && <><Input label="ملاحظة اختيارية" value={note} onChange={e => setNote(e.target.value)}/><div className="mt-3 grid grid-cols-2 gap-2">{types.map(t => <button key={t.id} className={'mushaf-error-option option-' + t.category} onClick={() => mark(t.id)}>{t.label}<small className="block">خصم {t.penalty}{t.freeFirst ? ' · أول مرة دون خصم' : ''}</small></button>)}</div>{!types.length && <p>لم تفعّل الإدارة أنواع أخطاء على المصحف.</p>}</>}
 {chosen.map(e => <div key={e.id} className="mt-3 rounded-lg bg-slate-50 p-3"><p>{rules.types.find(t => t.id === e.typeId)?.label} · {e.note}</p>{!readOnly && <div className="flex gap-2"><Button size="sm" variant="secondary" onClick={() => { onChange?.(errors.map(x => x.id === e.id ? { ...x, note } : x)); setSelected(undefined); }}>حفظ الملاحظة</Button><Button size="sm" variant="secondary" onClick={() => { onChange?.(errors.filter(x => x.id !== e.id)); setSelected(undefined); }}>حذف الخطأ</Button></div>}</div>)}
 </section></div>}</div>, document.body);
}
