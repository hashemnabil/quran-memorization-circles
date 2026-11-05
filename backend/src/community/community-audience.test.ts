import 'reflect-metadata';
import test from 'node:test';
import assert from 'node:assert/strict';
import { Role } from '@prisma/client';
import { CommunityController } from './community.controller';
import { audienceOf, identifiers, storyAppearance, visibility } from './community-policy';
import { SupportService } from '../support/support.service';

const actor={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',role:Role.ADMIN} as any;
const other='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
test('selected audience is bounded, explicit and deduplicated; legacy posts default to all',()=>{
  assert.deepEqual(audienceOf({body:'old client'}),{audience:'ALL',recipientIds:[]});
  assert.deepEqual(audienceOf({body:'x',audience:'SELECTED',recipientIds:[other,other]}).recipientIds,[other]);
  for(const dto of [{audience:'SELECTED'},{audience:'ALL',recipientIds:[other]},{audience:'STAFF'}])assert.throws(()=>audienceOf({body:'x',...dto}));
  assert.throws(()=>identifiers(['invalid']));
  assert.throws(()=>identifiers(Array(101).fill(other)));
});
test('visibility has no administrative bypass for a selected post',()=>{
  assert.deepEqual(visibility(actor.id),{OR:[{authorId:actor.id},{audience:'ALL'},{audience:'SELECTED',recipientIds:{has:actor.id}}]});
});
test('administrator contact scope remains unrestricted rather than self-only in Prisma OR',async()=>{
  let query:any;
  const controller=new CommunityController({user:{findMany:async(args:any)=>{query=args;return [{id:other,username:'student',fullName:'Student'}];}}} as any);
  assert.equal((await (controller as any).permitted(actor,[other]))[0].id,other);
  assert.deepEqual(query.where.AND[1],{});
});
test('story formatting rejects injected CSS and unbounded sizes',()=>{
  assert.equal(storyAppearance({body:'x'}).fontSize,28);
  assert.throws(()=>storyAppearance({body:'x',background:'url(https://example.test)'}));
  assert.throws(()=>storyAppearance({body:'x',fontSize:999}));
  assert.throws(()=>storyAppearance({body:'x',bold:'false' as any}));
});
test('feed enforces visibility together with profile and school filters',async()=>{
  let args:any;
  const controller=new CommunityController({communityPost:{findMany:async(value:any)=>{args=value;return [];}}} as any);
  await controller.feed(actor,other,'true');
  assert.deepEqual(args.where.AND,[visibility(actor.id)]);
  assert.equal(args.where.authorId,other);
  assert.equal(args.where.schoolPost,true);
});
test('hidden posts reject likes and comments before any write or notification',async()=>{
  const controller=new CommunityController({communityPost:{findFirst:async()=>null}} as any);
  await assert.rejects(()=>controller.like(actor,'private'),/غير متاح/);
  await assert.rejects(()=>controller.comment(actor,'private','text'),/غير متاح/);
});
test('comment likes and replies also require visibility of the parent post',async()=>{
  const controller=new CommunityController({communityPost:{findFirst:async()=>null},communityComment:{findUnique:async()=>({postId:'private'})}} as any);
  await assert.rejects(()=>controller.likeComment(actor,'comment'),/غير متاح/);
  await assert.rejects(()=>controller.reply(actor,'comment','text'),/غير متاح/);
});
test('private image access fails before loading bytes, even for an administrator',async()=>{
  const controller=new CommunityController({message:{count:async()=>0},communityMedia:{count:async()=>0},communityPost:{count:async()=>0},communityStory:{count:async()=>0}} as any);
  await assert.rejects(()=>controller.media(actor,'image',{} as any),/غير متاحة/);
});
test('school impersonation is rejected before creating a post or a story',async()=>{
  const controller=new CommunityController({} as any);
  const student={...actor,role:Role.STUDENT};
  await assert.rejects(()=>controller.post(student,{body:'x',schoolPost:true}),/للإدارة/);
  await assert.rejects(()=>controller.createStory(student,{body:'x',schoolStory:true}),/للإدارة/);
});
test('notification preference accepts only a boolean',()=>{
  const controller=new CommunityController({} as any);
  assert.throws(()=>controller.setPreferences(actor,'true' as any));
});

test('account deletion completion requires administration and an explicit retention decision',async()=>{
  const service=new SupportService({} as any,{} as any,{} as any,{} as any);
  await assert.rejects(()=>service.completeDeletion({...actor,role:Role.SUPPORT},'ticket',{confirmed:true,retentionNote:'A sufficiently detailed retention decision'}),/للإدارة/);
  await assert.rejects(()=>service.completeDeletion(actor,'ticket',{confirmed:false,retentionNote:'A sufficiently detailed retention decision'}),/أكد الإجراء/);
  await assert.rejects(()=>service.completeDeletion(actor,'ticket',{confirmed:true,retentionNote:'short'}),/أكد الإجراء/);
});
test('a normal support ticket cannot be reclassified as a verified deletion request',async()=>{
  const service=new SupportService({supportTicket:{findFirst:async()=>({category:'GENERAL'})}} as any,{} as any,{} as any,{} as any);
  await assert.rejects(()=>service.update(actor,'ticket',{category:'ACCOUNT_DELETION'} as any),/التحقق من الهوية/);
});
