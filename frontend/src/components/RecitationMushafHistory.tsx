import { useState } from 'react';
import { MushafReader } from './MushafReader';
import { Button } from '@/components/ui';
import { resolveRules } from '@/lib/learning-rules';
import { SURAHS } from '@/lib/quran-surahs';
import type { Recitation } from '@/types';
export function RecitationMushafHistory({ record }: {
    record: Recitation;
}) { const [open, setOpen] = useState(false); if (!record.wordErrors?.length)
    return null; return <><span className="mx-2 text-xs text-slate-500">نسبة الأخطاء {record.errorRatio ?? 0}٪ · النقاط {record.points}</span><Button size="sm" variant="secondary" onClick={() => setOpen(true)}>أخطاء المصحف ({record.wordErrors.length})</Button>{open && <MushafReader readOnly rules={resolveRules(record.gradingSnapshot)} errors={record.wordErrors} range={{ from: SURAHS.find(s => s.name === record.fromSurah)?.number ?? 1, fromAyah: record.fromAyah, to: SURAHS.find(s => s.name === record.toSurah)?.number ?? 114, toAyah: record.toAyah }} onClose={() => setOpen(false)}/>}</>; }
