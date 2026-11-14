import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { assetMime } from '../founder/asset-policy';
import { Response } from 'express';
import { recordNotificationChange } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser, CurrentUser } from '../common/decorators';
import { Role, NotificationType } from '@prisma/client';
import { AccessControlService } from '../common/services/access-control.service';
import { audienceOf, CommunityDraft, identifiers, storyAppearance, visibility } from './community-policy';
import { ChatService } from '../chat/chat.service';

@Controller('community')
export class CommunityController {
  constructor(private readonly prisma:PrismaService, private readonly chat?:ChatService){}
  @Post('profile-cover')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }))
  async uploadProfileCover(@CurrentUser() user:AuthUser, @UploadedFile() file:Express.Multer.File, @Body('requestId') requestId:string) {
    const mime = file?.buffer && assetMime('PROFILE_COVER', file.buffer);
    if (!mime || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId || '')) throw new BadRequestException('اختر صورة JPEG أو PNG أو WebP بحجم لا يتجاوز 5 ميجابايت');
    return this.prisma.$transaction(async tx => {
      const existing = await tx.communityMedia.findUnique({ where: { id: requestId } });
      if (existing && (existing.ownerId !== user.id || existing.mime !== mime || !existing.bytes.equals(file.buffer))) throw new ForbiddenException('طلب رفع الصورة لا يخص هذا الحساب');
      const media = existing || await tx.communityMedia.create({ data: { id: requestId, ownerId: user.id, mime, bytes: file.buffer } });
      await tx.presentationChoice.upsert({ where: { userId_kind: { userId: user.id, kind: 'PROFILE_COVER_UPLOAD' } }, create: { userId: user.id, kind: 'PROFILE_COVER_UPLOAD', assetId: media.id }, update: { assetId: media.id } });
      return { coverMediaId: media.id };
    });
  }
  @Delete('profile-cover')
  async removeProfileCover(@CurrentUser() user:AuthUser) {
    await this.prisma.presentationChoice.deleteMany({ where: { userId: user.id, kind: 'PROFILE_COVER_UPLOAD' } });
    return { coverMediaId: null };
  }
  @Get('capabilities')
  capabilities(){return {privateAudienceVersion:1,imageUploads:false};}
  @Post('media')
  async uploadMedia(){
    throw new ForbiddenException('إضافة الصور متوقفة؛ يمكنك النشر وإرسال الرسائل نصياً');
  }
  @Get('media/:id')
  async media(@CurrentUser() user:AuthUser,@Param('id') id:string,@Res() response:Response){
    const [own,post,story,message]=await Promise.all([
      this.prisma.communityMedia.count({where:{id,ownerId:user.id}}),
      this.prisma.communityPost.count({where:{AND:[{mediaIds:{has:id}},visibility(user.id)]}}),
      this.prisma.communityStory.count({where:{mediaIds:{has:id},expiresAt:{gt:new Date()}}}),
      this.prisma.message.count({where:{attachmentUrl:'community-media:'+id,deletedAt:null,conversation:{members:{some:{userId:user.id,leftAt:null}}}}}),
    ]);
    if(!own&&!post&&!story&&!message){
      const cover = await this.prisma.presentationChoice.findFirst({ where: { kind: 'PROFILE_COVER_UPLOAD', assetId: id }, select: { userId: true } });
      const visibleCover = cover && await this.prisma.communityMedia.count({ where: { id, ownerId: cover.userId, owner: { is: { isActive: true, deletedAt: null, role: { not: Role.PARENT } } } } });
      if(!visibleCover)throw new ForbiddenException('الصورة غير متاحة');
    }
    const media=await this.prisma.communityMedia.findUnique({where:{id}});
    if(!media)throw new BadRequestException('الصورة غير موجودة');
    response.set({'Content-Type':media.mime,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Disposition':'inline'}).send(media.bytes);
  }
  private async images(user:AuthUser,dto:CommunityDraft){
    const ids=identifiers(dto.mediaIds,3);
    if(ids.length!==await this.prisma.communityMedia.count({where:{id:{in:ids},ownerId:user.id}}))throw new ForbiddenException('اختر صوراً تملكها');
    return ids;
  }
  @Get('preferences')
  preferences(@CurrentUser() user:AuthUser){return this.prisma.user.findUnique({where:{id:user.id},select:{communityMentionNotifications:true}});}
  @Patch('preferences')
  setPreferences(@CurrentUser() user:AuthUser,@Body('communityMentionNotifications') enabled:boolean){
    if(typeof enabled!=='boolean')throw new BadRequestException('إعداد غير صالح');
    return this.prisma.user.update({where:{id:user.id},data:{communityMentionNotifications:enabled},select:{communityMentionNotifications:true}});
  }
  private async notifyInteraction(actorId:string, recipientId:string, title:string, link:string){
    if(actorId===recipientId)return;
    const actor=await this.prisma.user.findUnique({where:{id:actorId},select:{fullName:true}});
    await this.prisma.notification.create({data:{userId:recipientId,type:NotificationType.SYSTEM,title:(actor?.fullName??'أحد الأعضاء')+' '+title,link}});
  }
  private async mentionNotices(tx:import('@prisma/client').Prisma.TransactionClient,user:AuthUser,ids:string[],link:string){
    const recipients=await tx.user.findMany({where:{id:{in:ids,not:user.id},isActive:true,deletedAt:null,communityMentionNotifications:true},select:{id:true}});
    for(const recipient of recipients){
      const notice=await tx.notification.create({data:{userId:recipient.id,type:NotificationType.SYSTEM,title:'تمت الإشارة إليك في المجتمع',link,data:{source:'COMMUNITY_MENTION',actorId:user.id}}});
      await recordNotificationChange(tx,notice);
    }
  }
  private async readable(user:AuthUser,id:string){
    const post=await this.prisma.communityPost.findFirst({where:{AND:[{id},visibility(user.id)]}});
    if(!post)throw new ForbiddenException('المنشور غير متاح');
    return post;
  }
  private async permitted(user:AuthUser, ids:string[]){
    if(!ids.length)return [];
    const scope=await new AccessControlService(this.prisma).contactableUserFilter(user);
    // Prisma drops empty objects inside OR; an unrestricted staff scope must
    // remain an unrestricted AND clause rather than turning into self-only.
    const allowed=scope===null?{id:user.id}:Object.keys(scope).length?{OR:[{id:user.id},scope]}:{};
    const rows=await this.prisma.user.findMany({where:{AND:[{id:{in:ids},isActive:true,deletedAt:null,role:{not:Role.PARENT}},allowed]},select:{id:true,username:true,fullName:true}});
    if(rows.length!==ids.length)throw new ForbiddenException('بعض الحسابات خارج نطاق صلاحياتك');
    return rows;
  }
  @Get('directory')
  async directory(@CurrentUser() user:AuthUser,@Query('q') q?:string){
    if(typeof q!=='string'||q.length>80)throw new BadRequestException('بحث غير صالح');
    const scope=await new AccessControlService(this.prisma).contactableUserFilter(user);
    return this.prisma.user.findMany({where:{AND:[{isActive:true,deletedAt:null,role:{not:Role.PARENT},id:{not:user.id}},scope??{id:'__none__'},{OR:[{fullName:{contains:q,mode:'insensitive'}},{username:{contains:q,mode:'insensitive'}}]}]},take:30,orderBy:{fullName:'asc'},select:{id:true,fullName:true,username:true,avatarUrl:true}});
  }
  private async mentions(user:AuthUser,dto:CommunityDraft,recipients?:string[]){
    const rows=await this.permitted(user,identifiers(dto.mentionIds,20));
    if(rows.some(row=>!dto.body.split(/\s+/u).includes('@'+row.username)||recipients&&!recipients.includes(row.id)&&row.id!==user.id))throw new BadRequestException('المنشن يجب أن يطابق النص والجمهور');
    return rows;
  }
  @Get('school')
  async school(){
    const settings=await this.prisma.schoolSettings.findUnique({where:{id:'default'},select:{name:true,logoUrl:true,about:true,address:true,phone:true}});
    const [circles,students,teachers]=await Promise.all([
      this.prisma.circle.count({where:{isActive:true,deletedAt:null}}),
      this.prisma.student.count({where:{status:'ACTIVE',deletedAt:null}}),
      this.prisma.teacherProfile.count({where:{isActive:true,deletedAt:null,user:{isActive:true,deletedAt:null}}}),
    ]);
    return {...(settings??{name:'صفحة المدرسة',logoUrl:null,about:null,address:null,phone:null}),stats:{circles,students,teachers}};
  }
  @Get('feed')
  feed(@CurrentUser() user:AuthUser,@Query('userId') userId?:string,@Query('school') school?:string){
    return this.prisma.communityPost.findMany({where:{AND:[visibility(user.id)],...(userId?{authorId:userId,schoolPost:false}:{}),...(school==='true'?{schoolPost:true}:{})},orderBy:{createdAt:'desc'},take:100,include:{author:{select:{id:true,fullName:true,nickname:true,avatarUrl:true,role:true}},_count:{select:{likes:true,comments:true}},likes:{take:100,include:{user:{select:{id:true,fullName:true,nickname:true,avatarUrl:true}}}},comments:{take:100,orderBy:{createdAt:'asc'},include:{user:{select:{id:true,fullName:true,nickname:true,avatarUrl:true}},_count:{select:{likes:true}}}}}});
  }
  @Get('users/:id')
  async profile(@Param('id') id:string){
    const user=await this.prisma.user.findFirst({where:{id,isActive:true,deletedAt:null,role:{not:Role.PARENT}},select:{id:true,fullName:true,nickname:true,username:true,bio:true,avatarUrl:true,role:true,createdAt:true}});
    if(!user)throw new BadRequestException('المستخدم غير موجود');
    const cover = await this.prisma.presentationChoice.findUnique({ where: { userId_kind: { userId: id, kind: 'PROFILE_COVER' } } });
    const asset = cover?.assetId ? await this.prisma.founderAsset.findFirst({ where: { id: cover.assetId, kind: 'PROFILE_COVER', isActive: true }, select: { id: true } }) : null;
    const uploaded = await this.prisma.presentationChoice.findUnique({ where: { userId_kind: { userId: id, kind: 'PROFILE_COVER_UPLOAD' } } });
    const coverMedia = uploaded?.assetId ? await this.prisma.communityMedia.findFirst({ where: { id: uploaded.assetId, ownerId: id }, select: { id: true } }) : null;
    return { ...user, coverAssetId: asset?.id || null, coverMediaId: coverMedia?.id || null };
  }
  @Patch('bio')
  bio(@CurrentUser() user:AuthUser,@Body('bio') bio:string){
    if(typeof bio!=='string'||bio.length>280)throw new BadRequestException('النبذة لا تتجاوز 280 حرفاً');
    return this.prisma.user.update({where:{id:user.id},data:{bio:bio.trim()||null},select:{id:true,bio:true}});
  }
  @Patch('nickname')
  nickname(@CurrentUser() user:AuthUser,@Body('nickname') nickname:string){
    if(typeof nickname!=='string'||nickname.length>60)throw new BadRequestException('الكنية غير صالحة');
    return this.prisma.user.update({where:{id:user.id},data:{nickname:nickname.trim()||null},select:{id:true,nickname:true}});
  }
  @Post('posts')
  async post(@CurrentUser() user:AuthUser,@Body() dto:CommunityDraft){
    if(typeof dto?.body!=='string'||!dto.body.trim()||dto.body.length>2000)throw new BadRequestException('المنشور يجب أن يكون نصاً لا يتجاوز 2000 حرف');
    if(dto.schoolPost&&user.role!==Role.ADMIN)throw new ForbiddenException('النشر باسم المدرسة للإدارة فقط');
    const audience=audienceOf(dto);
    await this.permitted(user,audience.recipientIds);
    const mentions=await this.mentions(user,dto,audience.audience==='SELECTED'?audience.recipientIds:undefined);
    const mediaIds=await this.images(user,dto);
    return this.prisma.$transaction(async tx=>{
      const post=await tx.communityPost.create({data:{authorId:user.id,body:dto.body.trim(),schoolPost:!!dto.schoolPost,...audience,mentions,mediaIds}});
      await this.mentionNotices(tx,user,mentions.map(row=>row.id),'/community/posts?post='+post.id);
      return post;
    });
  }
  @Delete('posts/:id')
  async remove(@CurrentUser() user:AuthUser,@Param('id') id:string){
    const post=await this.prisma.communityPost.findUnique({where:{id}});
    if(!post)throw new BadRequestException('المنشور غير موجود');
    if(post.authorId!==user.id)throw new ForbiddenException('حذف المنشور لصاحبه فقط');
    await this.prisma.communityPost.delete({where:{id}});
    return {deleted:true};
  }
  @Patch('posts/:id')
  async editPost(@CurrentUser() user:AuthUser,@Param('id') id:string,@Body('body') body:string){
    if(typeof body!=='string'||!body.trim()||body.length>2000)throw new BadRequestException('المنشور يجب أن يكون نصاً لا يتجاوز 2000 حرف');
    const post=await this.prisma.communityPost.findUnique({where:{id}});
    if(!post)throw new BadRequestException('المنشور غير موجود');
    if(post.authorId!==user.id)throw new ForbiddenException('تعديل المنشور لصاحبه فقط');
    return this.prisma.communityPost.update({where:{id},data:{body:body.trim()}});
  }
  @Patch('comments/:id')
  async editComment(@CurrentUser() user:AuthUser,@Param('id') id:string,@Body('body') body:string){
    if(typeof body!=='string'||!body.trim()||body.length>500)throw new BadRequestException('التعليق غير صالح');
    const comment=await this.prisma.communityComment.findUnique({where:{id}});
    if(!comment)throw new BadRequestException('التعليق غير موجود');
    if(comment.userId!==user.id)throw new ForbiddenException('تعديل التعليق لصاحبه فقط');
    return this.prisma.communityComment.update({where:{id},data:{body:body.trim()}});
  }
  @Post('posts/:id/like')
  async like(@CurrentUser() user:AuthUser,@Param('id') id:string){
    await this.readable(user,id);
    const existing=await this.prisma.communityLike.findUnique({where:{userId_postId:{userId:user.id,postId:id}}});
    if(existing){await this.prisma.communityLike.delete({where:{userId_postId:{userId:user.id,postId:id}}});return {liked:false};}
    await this.prisma.communityLike.create({data:{userId:user.id,postId:id}});const post=await this.prisma.communityPost.findUnique({where:{id},select:{authorId:true}});if(post)await this.notifyInteraction(user.id,post.authorId,'أعجب بمنشورك','/community/posts?post='+id);return {liked:true};
  }
  @Post('posts/:id/comments')
  async comment(@CurrentUser() user:AuthUser,@Param('id') id:string,@Body('body') body:string){
    if(typeof body!=='string'||!body.trim()||body.length>500)throw new BadRequestException('التعليق غير صالح');
    await this.readable(user,id);
    const result=await this.prisma.communityComment.create({data:{userId:user.id,postId:id,body:body.trim()},include:{post:{select:{authorId:true}}}});await this.notifyInteraction(user.id,result.post.authorId,'علّق على منشورك','/community/posts?post='+id+'&comment='+result.id);return result;
  }

  @Post('comments/:id/like')
  async likeComment(@CurrentUser() user:AuthUser,@Param('id') id:string){
    const found=await this.prisma.communityComment.findUnique({where:{id}});
    if(!found)throw new BadRequestException('التعليق غير موجود');
    await this.readable(user,found.postId);
    const where={userId_commentId:{userId:user.id,commentId:id}};
    const existing=await this.prisma.communityCommentLike.findUnique({where});
    if(existing){await this.prisma.communityCommentLike.delete({where});return {liked:false};}
    await this.prisma.communityCommentLike.create({data:{userId:user.id,commentId:id}});
    await this.notifyInteraction(user.id,found.userId,'أعجب بتعليقك','/community/posts?post='+found.postId+'&comment='+id);return {liked:true};
  }
  @Post('comments/:id/replies')
  async reply(@CurrentUser() user:AuthUser,@Param('id') id:string,@Body('body') body:string){
    if(typeof body!=='string'||!body.trim()||body.length>500)throw new BadRequestException('الرد غير صالح');
    const parent=await this.prisma.communityComment.findUnique({where:{id}});
    if(!parent)throw new BadRequestException('التعليق غير موجود');
    await this.readable(user,parent.postId);
    const reply=await this.prisma.communityComment.create({data:{userId:user.id,postId:parent.postId,parentId:id,body:body.trim()}});await this.notifyInteraction(user.id,parent.userId,'رد على تعليقك','/community/posts?post='+parent.postId+'&comment='+reply.id);return reply;
  }
  @Get('stories')
  async stories(@CurrentUser() user:AuthUser){
    const stories=await this.prisma.communityStory.findMany({where:{expiresAt:{gt:new Date()}},orderBy:{createdAt:'desc'},take:100,include:{author:{select:{id:true,fullName:true,avatarUrl:true}},views:{include:{user:{select:{id:true,fullName:true,avatarUrl:true}}}}}});
    return stories.map(story=>({...story,views:story.authorId===user.id||user.role===Role.ADMIN?story.views:story.views.filter(view=>view.userId===user.id)}));
  }
  @Post('stories')
  async createStory(@CurrentUser() user:AuthUser,@Body() dto:CommunityDraft){
    const body=dto?.body;
    if(dto?.schoolStory&&user.role!==Role.ADMIN)throw new ForbiddenException('قصص المدرسة للإدارة فقط');
    if(typeof body!=='string'||!body.trim()||body.length>500)throw new BadRequestException('القصة غير صالحة');
    const mentions=await this.mentions(user,dto);
    const mediaIds=await this.images(user,dto),appearance=storyAppearance(dto);
    return this.prisma.$transaction(async tx=>{
      const story=await tx.communityStory.create({data:{authorId:user.id,body:body.trim(),schoolStory:!!dto.schoolStory,mentions,mediaIds,...appearance,expiresAt:new Date(Date.now()+86400000)}});
      await this.mentionNotices(tx,user,mentions.map(row=>row.id),'/community/stories?story='+story.id);
      return story;
    });
  }
  @Delete('stories/:id')
  async deleteStory(@CurrentUser() user:AuthUser,@Param('id') id:string){
    const story=await this.prisma.communityStory.findUnique({where:{id}});
    if(!story)throw new BadRequestException('القصة غير موجودة');
    if(story.authorId!==user.id&&user.role!==Role.ADMIN)throw new ForbiddenException('ليس لديك صلاحية حذف القصة');
    await this.prisma.communityStory.delete({where:{id}});
    return {deleted:true};
  }
  @Post('stories/:id/replies')
  async replyStory(@CurrentUser() user:AuthUser,@Param('id') id:string,@Body('body') body:string){
    const story=await this.prisma.communityStory.findUnique({where:{id}});
    if(!story||story.expiresAt<=new Date())throw new BadRequestException('القصة انتهت');
    if(!story.schoolStory)throw new ForbiddenException('الرد متاح على قصص المدرسة فقط');
    if(typeof body!=='string'||!body.trim()||body.length>500)throw new BadRequestException('الرد غير صالح');
    const reply=await this.prisma.communityStoryReply.create({data:{storyId:id,userId:user.id,body:body.trim()}});
    const admins=await this.prisma.user.findMany({where:{role:Role.ADMIN,isActive:true,deletedAt:null},select:{id:true}});
    await Promise.all(admins.map(a=>this.notifyInteraction(user.id,a.id,'رد على ستوري المدرسة','/community/school')));
    return reply;
  }
  @Post('stories/:id/direct-reply')
  async directReply(@CurrentUser() user:AuthUser,@Param('id') id:string,@Body('body') body:string){
    if(typeof body!=='string'||!body.trim()||body.length>500)throw new BadRequestException('الرد غير صالح');
    const story=await this.prisma.communityStory.findUnique({where:{id}});
    if(!story||story.expiresAt<=new Date())throw new BadRequestException('القصة انتهت');
    if(story.authorId===user.id)throw new BadRequestException('هذه قصتك');
    if(!this.chat)throw new BadRequestException('المحادثات غير متاحة');
    const conversation=await this.chat.createDirect(user,{userId:story.authorId});
    await this.chat.send(user,conversation.id,{body:`رد على الستوري: «${story.body}»\n\n${body.trim()}`});
    return {conversationId:conversation.id};
  }
  @Get('stories/:id/replies')
  async storyReplies(@CurrentUser() user:AuthUser,@Param('id') id:string){
    const story=await this.prisma.communityStory.findUnique({where:{id}});
    if(!story||!story.schoolStory)throw new BadRequestException('القصة غير موجودة');
    return this.prisma.communityStoryReply.findMany({where:{storyId:id,...(user.role===Role.ADMIN?{}:{userId:user.id})},orderBy:{createdAt:'asc'},take:100,include:{user:{select:{id:true,fullName:true,avatarUrl:true}}}});
  }
  @Post('stories/:id/view')
  async viewStory(@CurrentUser() user:AuthUser,@Param('id') id:string){
    const story=await this.prisma.communityStory.findUnique({where:{id}});
    if(!story||story.expiresAt<=new Date())throw new BadRequestException('القصة انتهت');
    return this.prisma.communityStoryView.upsert({where:{storyId_userId:{storyId:id,userId:user.id}},create:{storyId:id,userId:user.id},update:{}});
  }
  @Post('stories/:id/like')
  async likeStory(@CurrentUser() user:AuthUser,@Param('id') id:string){
    const story=await this.prisma.communityStory.findUnique({where:{id}});
    if(!story||story.expiresAt<=new Date())throw new BadRequestException('القصة انتهت');
    const where={storyId_userId:{storyId:id,userId:user.id}};
    const existing=await this.prisma.communityStoryView.findUnique({where});
    return this.prisma.communityStoryView.upsert({where,create:{storyId:id,userId:user.id,liked:true},update:{liked:!existing?.liked}});
  }
  @Post('school/follow')
  async follow(@CurrentUser() user:AuthUser){
    const existing=await this.prisma.schoolFollow.findUnique({where:{userId:user.id}});
    if(existing){await this.prisma.schoolFollow.delete({where:{userId:user.id}});return {following:false};}
    await this.prisma.schoolFollow.create({data:{userId:user.id}});const admins=await this.prisma.user.findMany({where:{role:Role.ADMIN,isActive:true,deletedAt:null},select:{id:true}});await Promise.all(admins.map(a=>this.notifyInteraction(user.id,a.id,'تابع صفحة المدرسة','/community/school')));return {following:true};
  }
  @Get('school/followers')
  async followers(@Query('page') rawPage?:string){
    const page=Number(rawPage??1);
    if(!Number.isSafeInteger(page)||page<1||page>1000000)throw new BadRequestException('رقم الصفحة غير صالح');
    const rows=await this.prisma.schoolFollow.findMany({
      where:{user:{isActive:true,deletedAt:null}},
      orderBy:[{createdAt:'desc'},{userId:'asc'}],skip:(page-1)*50,take:51,
      select:{user:{select:{id:true,fullName:true,nickname:true,avatarUrl:true}}},
    });
    return {data:rows.slice(0,50).map(row=>row.user),hasMore:rows.length>50};
  }
  @Get('school/follow')
  async following(@CurrentUser() user:AuthUser){
    const [follow,count]=await Promise.all([this.prisma.schoolFollow.findUnique({where:{userId:user.id}}),this.prisma.schoolFollow.count({where:{user:{isActive:true,deletedAt:null}}})]);
    return {following:!!follow,count};
  }
}
