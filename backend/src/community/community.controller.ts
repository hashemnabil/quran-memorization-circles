import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser, CurrentUser } from '../common/decorators';
import { Role, NotificationType } from '@prisma/client';

@Controller('community')
export class CommunityController {
  constructor(private readonly prisma:PrismaService){}
  private async notifyInteraction(actorId:string, recipientId:string, title:string, link:string){
    if(actorId===recipientId)return;
    const actor=await this.prisma.user.findUnique({where:{id:actorId},select:{fullName:true}});
    await this.prisma.notification.create({data:{userId:recipientId,type:NotificationType.SYSTEM,title:(actor?.fullName??'أحد الأعضاء')+' '+title,link}});
  }
  @Get('school')
  async school(){
    const settings=await this.prisma.schoolSettings.findUnique({where:{id:'default'},select:{name:true,logoUrl:true,about:true,address:true,phone:true}});
    return settings??{name:'صفحة المدرسة',logoUrl:null,about:null,address:null,phone:null};
  }
  @Get('feed')
  feed(@Query('userId') userId?:string,@Query('school') school?:string){
    return this.prisma.communityPost.findMany({where:{...(userId?{authorId:userId,schoolPost:false}:{}),...(school==='true'?{schoolPost:true}:{})},orderBy:{createdAt:'desc'},take:100,include:{author:{select:{id:true,fullName:true,nickname:true,avatarUrl:true,role:true}},_count:{select:{likes:true,comments:true}},likes:{take:100,include:{user:{select:{id:true,fullName:true,nickname:true,avatarUrl:true}}}},comments:{take:100,orderBy:{createdAt:'asc'},include:{user:{select:{id:true,fullName:true,nickname:true,avatarUrl:true}},_count:{select:{likes:true}}}}}});
  }
  @Get('users/:id')
  async profile(@Param('id') id:string){
    const user=await this.prisma.user.findFirst({where:{id,isActive:true,deletedAt:null},select:{id:true,fullName:true,nickname:true,avatarUrl:true,role:true,createdAt:true}});
    if(!user)throw new BadRequestException('المستخدم غير موجود');
    return user;
  }
  @Patch('nickname')
  nickname(@CurrentUser() user:AuthUser,@Body('nickname') nickname:string){
    if(typeof nickname!=='string'||nickname.length>60)throw new BadRequestException('الكنية غير صالحة');
    return this.prisma.user.update({where:{id:user.id},data:{nickname:nickname.trim()||null},select:{id:true,nickname:true}});
  }
  @Post('posts')
  post(@CurrentUser() user:AuthUser,@Body() dto:{body:string;schoolPost?:boolean}){
    if(typeof dto?.body!=='string'||!dto.body.trim()||dto.body.length>2000)throw new BadRequestException('المنشور يجب أن يكون نصاً لا يتجاوز 2000 حرف');
    if(dto.schoolPost&&user.role!==Role.ADMIN)throw new ForbiddenException('النشر باسم المدرسة للإدارة فقط');
    return this.prisma.communityPost.create({data:{authorId:user.id,body:dto.body.trim(),schoolPost:!!dto.schoolPost}});
  }
  @Delete('posts/:id')
  async remove(@CurrentUser() user:AuthUser,@Param('id') id:string){
    const post=await this.prisma.communityPost.findUnique({where:{id}});
    if(!post)throw new BadRequestException('المنشور غير موجود');
    if(post.authorId!==user.id&&user.role!==Role.ADMIN)throw new ForbiddenException();
    await this.prisma.communityPost.delete({where:{id}});
    return {deleted:true};
  }
  @Post('posts/:id/like')
  async like(@CurrentUser() user:AuthUser,@Param('id') id:string){
    const existing=await this.prisma.communityLike.findUnique({where:{userId_postId:{userId:user.id,postId:id}}});
    if(existing){await this.prisma.communityLike.delete({where:{userId_postId:{userId:user.id,postId:id}}});return {liked:false};}
    await this.prisma.communityLike.create({data:{userId:user.id,postId:id}});const post=await this.prisma.communityPost.findUnique({where:{id},select:{authorId:true}});if(post)await this.notifyInteraction(user.id,post.authorId,'أعجب بمنشورك','/community/posts?post='+id);return {liked:true};
  }
  @Post('posts/:id/comments')
  async comment(@CurrentUser() user:AuthUser,@Param('id') id:string,@Body('body') body:string){
    if(typeof body!=='string'||!body.trim()||body.length>500)throw new BadRequestException('التعليق غير صالح');
    const result=await this.prisma.communityComment.create({data:{userId:user.id,postId:id,body:body.trim()},include:{post:{select:{authorId:true}}}});await this.notifyInteraction(user.id,result.post.authorId,'علّق على منشورك','/community/posts?post='+id+'&comment='+result.id);return result;
  }

  @Post('comments/:id/like')
  async likeComment(@CurrentUser() user:AuthUser,@Param('id') id:string){
    const found=await this.prisma.communityComment.findUnique({where:{id}});
    if(!found)throw new BadRequestException('التعليق غير موجود');
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
    const reply=await this.prisma.communityComment.create({data:{userId:user.id,postId:parent.postId,parentId:id,body:body.trim()}});await this.notifyInteraction(user.id,parent.userId,'رد على تعليقك','/community/posts?post='+parent.postId+'&comment='+reply.id);return reply;
  }
  @Get('stories')
  async stories(@CurrentUser() user:AuthUser){
    const stories=await this.prisma.communityStory.findMany({where:{expiresAt:{gt:new Date()}},orderBy:{createdAt:'desc'},take:100,include:{author:{select:{id:true,fullName:true,avatarUrl:true}},views:{include:{user:{select:{id:true,fullName:true,avatarUrl:true}}}}}});
    return stories.map(story=>({...story,views:story.authorId===user.id||user.role===Role.ADMIN?story.views:story.views.filter(view=>view.userId===user.id)}));
  }
  @Post('stories')
  createStory(@CurrentUser() user:AuthUser,@Body() dto:{body:string;schoolStory?:boolean}){
    const body=dto?.body;
    if(dto?.schoolStory&&user.role!==Role.ADMIN)throw new ForbiddenException('قصص المدرسة للإدارة فقط');
    if(typeof body!=='string'||!body.trim()||body.length>500)throw new BadRequestException('القصة غير صالحة');
    return this.prisma.communityStory.create({data:{authorId:user.id,body:body.trim(),schoolStory:!!dto.schoolStory,expiresAt:new Date(Date.now()+86400000)}});
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
  @Get('school/follow')
  async following(@CurrentUser() user:AuthUser){
    const [follow,count]=await Promise.all([this.prisma.schoolFollow.findUnique({where:{userId:user.id}}),this.prisma.schoolFollow.count()]);
    return {following:!!follow,count};
  }
}
