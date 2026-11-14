import 'fake-indexeddb/auto';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { openDB, deleteDB } from 'idb';
import { activateDataKey } from './local-encryption';
import { cacheActiveIdentity } from './active-identity';
import { readGeneralPreferences, readImportedAudio, storeImportedAudio, saveGeneralSound } from './notification-sounds';
const account='11111111-1111-4111-8111-111111111111';
let values:Map<string,string>;
const tone={name:'my-private-tone.wav',mime:'audio/wav',data:'data:audio/wav;base64,UklGRg=='};
function identity(id=account){cacheActiveIdentity({id,username:'test',fullName:'Test',role:'STUDENT',isActive:true});activateDataKey(id,new Uint8Array(32).fill(id===account?7:8));}
beforeEach(async()=>{
 await deleteDB('qc-notification-audio');values=new Map();
 const storage={getItem:(key:string)=>values.get(key)||null,setItem:(key:string,value:string)=>{values.set(key,value);},removeItem:(key:string)=>{values.delete(key);}};
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:storage});Object.defineProperty(globalThis,'sessionStorage',{configurable:true,value:storage});Object.defineProperty(globalThis,'window',{configurable:true,value:new EventTarget()});identity();
});
async function media(){return openDB('qc-notification-audio',1,{upgrade(db){db.createObjectStore('files');}});}
test('a selected device file is encrypted and can be read only by its signed-in account',async()=>{
 await storeImportedAudio(account,'general',tone);const db=await media();const raw=await db.get('files',account+':general');db.close();
 assert.equal(raw.__localCipher,1);assert(!JSON.stringify(raw).includes(tone.name));assert(!JSON.stringify(raw).includes(tone.data));
 assert.deepEqual(await readImportedAudio(account,'general'),tone);
 identity('22222222-2222-4222-8222-222222222222');await assert.rejects(readImportedAudio(account,'general'));assert.equal(await readImportedAudio('22222222-2222-4222-8222-222222222222','general'),undefined);
});
test('a pre-upgrade plain device recording is protected without losing its contents',async()=>{
 const db=await media();await db.put('files',tone,account+':general');db.close();assert.deepEqual(await readImportedAudio(account,'general'),tone);
 const check=await media();assert.equal((await check.get('files',account+':general')).__localCipher,1);check.close();
});
test('sound and independent vibration persist while device default remains opt-in to restore',async()=>{
 localStorage.setItem('qc.notification-sound.v1:'+account,'clear');assert.equal(readGeneralPreferences(account).sound,'clear');
 await saveGeneralSound(account,'school',undefined,true);assert.equal(readGeneralPreferences(account).sound,'school');assert.equal(readGeneralPreferences(account).vibrate,true);
 await saveGeneralSound(account,'silent',undefined,true);assert.equal(readGeneralPreferences(account).sound,'silent');assert.equal(readGeneralPreferences(account).vibrate,true);
 await saveGeneralSound(account,'default',undefined,true);assert.equal(readGeneralPreferences(account).sound,'default');assert.equal(readGeneralPreferences(account).vibrate,true);
});
test('failed preference persistence restores the previously encrypted file and selection',async()=>{
 await saveGeneralSound(account,'custom',tone,false);
 const original=localStorage.setItem.bind(localStorage);localStorage.setItem=(key:string,value:string)=>{if(key.startsWith('qc.notification-preferences'))throw new Error('storage full');original(key,value);};
 await assert.rejects(saveGeneralSound(account,'custom',{...tone,name:'replacement.wav'},true));
 assert.deepEqual(await readImportedAudio(account,'general'),tone);assert.equal(readGeneralPreferences(account).vibrate,false);assert.equal(readGeneralPreferences(account).sound,'custom');
});
