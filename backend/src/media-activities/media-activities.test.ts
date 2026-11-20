import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Role } from '@prisma/client';
import { MediaActivitiesService } from './media-activities.service';
const previous = { type: 'DESIGN', title: 'Original', description: 'Details', activityDate: '2026-10-28T00:00:00.000Z', workUrl: null };
const actor = { id: 'author', role: Role.SUPERVISOR } as any;
test('media editing compares all original fields atomically and preserves author ownership', async () => {
 let query: any;
 const service = new MediaActivitiesService({mediaActivity:{updateMany:async(args:any)=>{query=args;return {count:1};},findUnique:async()=>({id:'activity',title:'Edited'})}} as any);
 await service.update(actor,'activity',{...previous,title:'Edited',previous,createdById:'forged'});
 assert.deepEqual(query.where,{id:'activity',...previous,activityDate:new Date(previous.activityDate)});
 assert.equal(query.data.title,'Edited');assert(!('createdById' in query.data));
});
test('concurrent edits block media update and deletion without falling through to an unconditional mutation', async () => {
 const service = new MediaActivitiesService({mediaActivity:{updateMany:async()=>({count:0}),deleteMany:async()=>({count:0})}} as any);
 await assert.rejects(service.update(actor,'activity',{...previous,title:'Edited',previous}),/تغيّر النشاط/);
 await assert.rejects(service.remove('activity',previous),/تغيّر النشاط/);
});
test('media editing refuses unauthorized actors, unsafe URLs and missing baselines', async () => {
 const service = new MediaActivitiesService({} as any);
 await assert.rejects(service.update({...actor,role:Role.STUDENT},'activity',{...previous,previous}));
 await assert.rejects(service.update(actor,'activity',{...previous,previous,workUrl:'javascript:alert(1)'}));
 await assert.rejects(service.update(actor,'activity',{...previous}));
});
