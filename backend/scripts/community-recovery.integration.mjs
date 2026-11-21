import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const source=new URL(process.env.DATABASE_URL||'postgresql://localhost/missing');
assert(['localhost','127.0.0.1'].includes(source.hostname)&&source.pathname==='/quran_test',
  'Recovery rehearsal requires disposable local quran_test, never production');
const name='quran_community_recovery_'+randomBytes(6).toString('hex');
const target=new URL(source);target.pathname='/'+name;
const admin=new PrismaClient({datasources:{db:{url:source.href}}});
const env={...process.env,DATABASE_URL:target.href,DIRECT_URL:target.href};
const cwd=fileURLToPath(new URL('../',import.meta.url));
const cli=fileURLToPath(new URL('../node_modules/prisma/build/index.js',import.meta.url));
const run=args=>{const result=spawnSync(process.execPath,[cli,...args],{cwd,env,shell:false,stdio:'inherit'});assert.equal(result.status,0,'Community recovery rehearsal failed');};
const repair=()=>run(['db','execute','--schema','prisma/schema.prisma','--file','prisma/recovery/add-mobile-community.sql']);
let fixture,created=false;
try{
  await admin.$connect();await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);created=true;
  run(['migrate','deploy']);
  fixture=new PrismaClient({datasources:{db:{url:target.href}}});
  const user=await fixture.user.create({data:{username:'recovery-user',fullName:'Preserved user',passwordHash:'synthetic-test-only',role:'STUDENT'}});
  const post=await fixture.communityPost.create({data:{authorId:user.id,body:'Preserved historical post'}});
  const story=await fixture.communityStory.create({data:{authorId:user.id,body:'Preserved historical story',expiresAt:new Date(Date.now()+86400000)}});
  // Reproduce an unmanaged, older production schema, only in the isolated test database.
  await fixture.$executeRawUnsafe('DROP TABLE "CommunityMedia"');
  await fixture.$executeRawUnsafe('ALTER TABLE users DROP COLUMN bio, DROP COLUMN "communityMentionNotifications"');
  await fixture.$executeRawUnsafe('ALTER TABLE "CommunityPost" DROP COLUMN audience, DROP COLUMN "recipientIds", DROP COLUMN mentions, DROP COLUMN "mediaIds"');
  await fixture.$executeRawUnsafe('ALTER TABLE "CommunityStory" DROP COLUMN mentions, DROP COLUMN background, DROP COLUMN "textColor", DROP COLUMN "fontSize", DROP COLUMN bold, DROP COLUMN "mediaIds"');
  await fixture.$executeRawUnsafe('ALTER TABLE support_tickets DROP COLUMN "deletionCompletedAt", DROP COLUMN "retentionNote"');
  await fixture.$executeRawUnsafe('DROP TABLE _prisma_migrations');
  await assert.rejects(()=>fixture.user.findUnique({where:{id:user.id}}),error=>error.code==='P2022');
  await fixture.$disconnect();repair();
  assert.equal((await fixture.user.findUniqueOrThrow({where:{id:user.id}})).fullName,user.fullName);
  const restored=await fixture.communityPost.findUniqueOrThrow({where:{id:post.id}});
  assert.equal(restored.body,post.body);assert.equal(restored.audience,'ALL');assert.deepEqual(restored.mediaIds,[]);
  assert.equal((await fixture.communityStory.findUniqueOrThrow({where:{id:story.id}})).body,story.body);
  await fixture.user.update({where:{id:user.id},data:{bio:'Keep this bio',communityMentionNotifications:false}});
  await fixture.communityPost.update({where:{id:post.id},data:{audience:'SELECTED',recipientIds:[user.id]}});
  const media=await fixture.communityMedia.create({data:{ownerId:user.id,mime:'image/png',bytes:Buffer.from([1,2,3])}});
  await fixture.$disconnect();repair();
  const again=await fixture.user.findUniqueOrThrow({where:{id:user.id}});
  assert.equal(again.bio,'Keep this bio');assert.equal(again.communityMentionNotifications,false);
  assert.equal((await fixture.communityPost.findUniqueOrThrow({where:{id:post.id}})).audience,'SELECTED');
  assert.deepEqual((await fixture.communityMedia.findUniqueOrThrow({where:{id:media.id}})).bytes,Buffer.from([1,2,3]));
  assert.equal((await fixture.$queryRawUnsafe("SELECT to_regclass('public._prisma_migrations')::text AS relation"))[0].relation,null);
  console.log('Community recovery restored login/feed/story fields, preserved data and private audiences, survived rerun, and did not invent migration history.');
}finally{
  await fixture?.$disconnect();
  if(created)await admin.$executeRawUnsafe(`DROP DATABASE "${name}"`);
  await admin.$disconnect();
}
