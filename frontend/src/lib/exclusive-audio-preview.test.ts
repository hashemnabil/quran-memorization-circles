import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createExclusiveAudioPreview, type PreviewState } from './exclusive-audio-preview';
function fixture() {
  const events:string[]=[];const players:{stop():void;ended?:()=>void}[]=[];
  const controller=createExclusiveAudioPreview({
    create(source){const player={stop:()=>{events.push(`stop:${source}`);},ended:undefined as (()=>void)|undefined};players.push(player);return {play:async()=>{events.push(`play:${source}`);},stop:player.stop,onEnd:callback=>{player.ended=callback;}};},
    startDevice:async()=>{events.push('device:play');},stopDevice:async()=>{events.push('device:stop');},
  });
  let state:PreviewState=null;controller.subscribe(value=>{state=value;});return {controller,events,players,state:()=>state};
}
test('mounting/subscribing never starts audio and switching previews pauses the previous player first',async()=>{
  const f=fixture();assert.equal(f.events.length,0);
  await f.controller.play('one','school','school.wav');await f.controller.play('one','soft','soft.wav');
  assert(f.events.indexOf('stop:school.wav')<f.events.indexOf('play:soft.wav'));
  f.players[0].ended?.();assert.equal(f.state()?.id,'soft');
  await f.controller.stop();assert.equal(f.state(),null);
});
test('unmounting another picker cannot stop the active picker',async()=>{
  const f=fixture();await f.controller.play('one','school','school.wav');await f.controller.play('two','soft','soft.wav');
  await f.controller.stop('one');assert.equal(f.state()?.owner,'two');assert(!f.events.includes('stop:soft.wav'));await f.controller.stop();
});
test('a pending native preview is stopped before HTML playback can begin',async()=>{
  const events:string[]=[];let release!:()=>void;let started!:()=>void;
  const begun=new Promise<void>(resolve=>{started=resolve;});const hold=new Promise<void>(resolve=>{release=resolve;});
  const controller=createExclusiveAudioPreview({create:()=>({play:async()=>{events.push('html:play');},stop:()=>{},onEnd:()=>{}}),startDevice:async()=>{events.push('native:play');started();await hold;},stopDevice:async()=>{events.push('native:stop');}});
  const first=controller.play('one','default');await begun;
  const second=controller.play('two','school','school.wav');assert(!events.includes('html:play'));
  release();await Promise.all([first,second]);
  assert(events.lastIndexOf('native:stop')<events.indexOf('html:play'));await controller.stop();
});
test('a rejected playback request clears its selection without starting another audio',async()=>{
  let stopped=0;const controller=createExclusiveAudioPreview({create:()=>({play:async()=>{throw new Error('unsupported');},stop:()=>{stopped++;},onEnd:()=>{}}),startDevice:async()=>{},stopDevice:async()=>{}});
  let state:PreviewState=null;controller.subscribe(value=>{state=value;});await assert.rejects(controller.play('one','custom','bad.wav'));assert.equal(state,null);assert.equal(stopped,1);
});
