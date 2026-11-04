import test from 'node:test';
import assert from 'node:assert/strict';
import { Role } from '@prisma/client';
import { CommunityController } from './community.controller';
import { MemorizationPlansController } from '../students/memorization-plans.controller';
import { ActivityService } from '../realtime/activity.service';
import { publicActivity } from '../realtime/activity-policy';

const actor = {id: 'owner', role: Role.TEACHER} as any;

test('hidden or unknown activity never exposes online status or last seen', () => {
  assert.deepEqual(publicActivity({hidden: true, lastActiveAt: new Date()}, true), {isOnline: false, lastActiveAt: null});
  assert.deepEqual(publicActivity(undefined, true), {isOnline: false, lastActiveAt: null});
});
test('an idle connected socket is not active and last seen comes from app interaction', () => {
  const at = new Date(100_000);
  assert.equal(publicActivity({hidden: false, lastActiveAt: at}, true, 110_000).isOnline, true);
  assert.equal(publicActivity({hidden: false, lastActiveAt: at}, true, 200_000).isOnline, false);
  assert.equal(publicActivity({hidden: false, lastActiveAt: at}, false, 110_000).lastActiveAt, at);
});
test('activity privacy fails closed during migration or database outage', async () => {
  const service = new ActivityService({$queryRaw: async () => {throw new Error('unavailable');}} as any);
  assert.equal((await service.read(['owner'])).get('owner')?.hidden, true);
});
test('privacy accepts boolean values only, without a database write on invalid input', async () => {
  const service = new ActivityService({} as any);
  await assert.rejects(() => service.setHidden('owner', 'false' as any), /غير صالح/);
});
test('administrators cannot delete or edit another author’s post', async () => {
  const controller = new CommunityController({communityPost: {findUnique: async () => ({authorId: 'owner'})}} as any);
  const admin = {id: 'admin', role: Role.ADMIN} as any;
  await assert.rejects(() => controller.remove(admin, 'post'), /لصاحبه فقط/);
  await assert.rejects(() => controller.editPost(admin, 'post', 'new body'), /لصاحبه فقط/);
});
test('authors can edit their own post and comments; persisted text is trimmed', async () => {
  const saved: any[] = [];
  const controller = new CommunityController({
    communityPost: {findUnique: async () => ({authorId: actor.id}), update: async (args: any) => {saved.push(args); return args.data;}},
    communityComment: {findUnique: async () => ({userId: actor.id}), update: async (args: any) => {saved.push(args); return args.data;}},
  } as any);
  await controller.editPost(actor, 'post', ' edited post ');
  await controller.editComment(actor, 'comment', ' edited comment ');
  assert.deepEqual(saved.map(row => row.data.body), ['edited post', 'edited comment']);
});
test('a user cannot edit another author’s comment', async () => {
  const controller = new CommunityController({communityComment: {findUnique: async () => ({userId: 'other'})}} as any);
  await assert.rejects(() => controller.editComment(actor, 'comment', 'text'), /لصاحبه فقط/);
});
test('expired stories cannot create private messages', async () => {
  const controller = new CommunityController({communityStory: {findUnique: async () => ({expiresAt: new Date(0), authorId: 'other'})}} as any);
  await assert.rejects(() => controller.directReply(actor, 'story', 'reply'), /انتهت/);
});
test('private story replies preserve context and use existing chat access checks', async () => {
  const sent: any[] = [];
  const controller = new CommunityController({communityStory: {findUnique: async () => ({expiresAt: new Date(Date.now()+60_000), authorId: 'other', body: 'story context'})}} as any, {
    createDirect: async (_: any, dto: any) => {assert.equal(dto.userId, 'other'); return {id: 'conversation'};},
    send: async (...args: any[]) => sent.push(args),
  } as any);
  assert.deepEqual(await controller.directReply(actor, 'story', 'reply text'), {conversationId: 'conversation'});
  assert.match(sent[0][2].body, /story context/);
  assert.match(sent[0][2].body, /reply text/);
});
test('students cannot create or approve their own plans', async () => {
  const controller = new MemorizationPlansController({} as any, {} as any);
  const student = {id: 'student', role: Role.STUDENT} as any;
  await assert.rejects(() => controller.create(student, 'student', {}), /للمسؤول/);
  await assert.rejects(() => controller.progress(student, 'student', 'plan', {} as any), /للمسؤول/);
});
test('a teacher outside the student’s circle cannot mutate plans', async () => {
  const controller = new MemorizationPlansController({} as any, {assertStudentWriteAccess: async () => {throw new Error('outside scope');}} as any);
  await assert.rejects(() => controller.create(actor, 'student', {}), /outside scope/);
});
test('plan progress rejects values exceeding the remaining target', async () => {
  const tx = {$queryRaw: async () => [{id: 'plan', completed: 9, target: 10, archived: false}]};
  let reads = 0;
  tx.$queryRaw = async () => ++reads === 1 ? [{id: 'plan', completed: 9, target: 10, archived: false}] : [];
  const controller = new MemorizationPlansController({$transaction: async (fn: any) => fn(tx)} as any, {assertStudentWriteAccess: async () => ({})} as any);
  await assert.rejects(() => controller.progress(actor, 'student', 'plan', {amount: 2, requestId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'}), /يتجاوز المتبقي/);
});
test('retrying a successful progress request does not add the achievement again', async () => {
  let reads = 0;
  const plan = {id: 'plan', completed: 10, target: 10, archived: false};
  const tx = {$queryRaw: async () => ++reads === 1 ? [plan] : [{id: 'request'}], $executeRaw: async () => {throw new Error('must not write twice');}};
  const controller = new MemorizationPlansController({$transaction: async (fn: any) => fn(tx)} as any, {assertStudentWriteAccess: async () => ({})} as any);
  assert.equal(await controller.progress(actor, 'student', 'plan', {amount: 2, requestId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'}), plan);
});
