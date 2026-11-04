import { useEffect, useId, useRef, useState } from 'react';
import { libraryAssetBlob, type Asset } from './CuratedBackground';
import { notificationPreview } from '@/lib/notification-preview';
import { importAudio, type SoundScope } from '@/lib/notification-sounds';
import type { PreviewState } from '@/lib/exclusive-audio-preview';

export async function importLibrarySound(account:string,scope:SoundScope,asset:Asset){
  const blob=await libraryAssetBlob(asset.id);
  return importAudio(account,scope,new File([blob],asset.title,{type:blob.type.startsWith('audio/')?blob.type:asset.mime||'audio/mpeg'}));
}
export function LibrarySoundOptions({assets,selected,name,onSelect,disabled=false}:{assets:Asset[];selected:string;name:string;onSelect:(asset:Asset)=>void;disabled?:boolean}){
  const owner=useId();const [preview,setPreview]=useState<PreviewState>(null);const [error,setError]=useState('');
  const source=useRef('');const revision=useRef(0);
  const stop=async()=>{revision.current++;await notificationPreview.stop(owner);if(source.current){URL.revokeObjectURL(source.current);source.current='';}};
  useEffect(()=>{
    const unsubscribe=notificationPreview.subscribe(setPreview);
    const hidden=()=>{if(document.visibilityState!=='visible')void stop();};
    document.addEventListener('visibilitychange',hidden);
    return()=>{unsubscribe();document.removeEventListener('visibilitychange',hidden);void stop();};
  },[owner]);
  const play=async(asset:Asset)=>{
    if(preview?.owner===owner&&preview.id===asset.id){await stop();return;}
    await stop();const token=++revision.current;setError('');
    try{const blob=await libraryAssetBlob(asset.id);if(token!==revision.current)return;source.current=URL.createObjectURL(blob);await notificationPreview.play(owner,asset.id,source.current);}
    catch{setError('تعذرت معاينة الصوت؛ تحقق من الاتصال وحاول مرة أخرى');}
  };
  return <>{assets.map(asset=>{
    const playing=preview?.owner===owner&&preview.id===asset.id;
    return <div key={asset.id} className={`notification-sound-card ${selected===asset.id?'is-selected':''}`}>
      <label className="notification-sound-choice"><input type="radio" name={name} checked={selected===asset.id} disabled={disabled} onChange={()=>{void stop();onSelect(asset);}}/><span><strong>{asset.title}</strong><small>تسجيل صوتي</small></span>{selected===asset.id&&<span className="sound-selected-label">محدد</span>}</label>
      <button type="button" disabled={disabled} className="sound-preview-button" aria-label={`${playing?'إيقاف':'معاينة'} ${asset.title}`} aria-pressed={playing} onClick={()=>void play(asset)}>{playing?'إيقاف':'معاينة'}</button>
    </div>;
  })}{error&&<p role="alert" className="prayer-status">{error}</p>}</>;
}
