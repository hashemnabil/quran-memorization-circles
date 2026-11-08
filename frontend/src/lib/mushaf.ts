export interface MushafWord {
    id: string;
    surah: number;
    ayah: number;
    position: number;
    line: number;
    text: string;
    glyph: string;
    kind: string;
}
export interface MushafPage {
    page: number;
    words: MushafWord[];
    lines?: {
        number: number;
        type: string;
        surah?: number;
        centered?: boolean;
    }[];
}
const cacheName = 'halaqat-mushaf-v2-1';
export async function mushafAsset(url: string): Promise<Response> { if (typeof caches === 'undefined') {
    const response = await fetch(url);
    if (!response.ok)
        throw Error('تعذر فتح صفحة المصحف');
    return response;
} const cache = await caches.open(cacheName); const saved = await cache.match(url); if (saved)
    return saved; const response = await fetch(url); if (!response.ok)
    throw Error('تعذر تنزيل صفحة المصحف؛ نزّلها عند الاتصال'); await cache.put(url, response.clone()); return response; }
export async function loadMushafPage(page: number): Promise<MushafPage> { const data = await (await mushafAsset('/mushaf/' + page + '.json')).json(); if (data.page !== page || !Array.isArray(data.words))
    throw Error('بيانات صفحة المصحف غير صالحة'); return data; }
const fonts = new Map<number, Promise<void>>();
export function loadMushafFont(page: number): Promise<void> { if (!fonts.has(page))
    fonts.set(page, (async () => { const response = await mushafAsset('/mushaf/fonts/' + page + '.woff2'); const font = new FontFace('MushafPage' + page, await response.arrayBuffer()); await font.load(); document.fonts.add(font); })().catch(e => { fonts.delete(page); throw e; })); return fonts.get(page)!; }
export async function downloadMushaf(onProgress: (n: number) => void, signal?: AbortSignal) { await mushafAsset('/mushaf/verse-pages.json'); for (let page = 1; page <= 604; page++) {
    if (signal?.aborted)
        return;
    await loadMushafPage(page);
    await mushafAsset('/mushaf/fonts/' + page + '.woff2');
    onProgress(page);
} }
