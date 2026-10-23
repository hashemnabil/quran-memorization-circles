import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser, CurrentUser } from '../common/decorators';
import { Role } from '@prisma/client';

@Controller('community')
export class CommunityController {
  constructor(private readonly prisma:PrismaService){}
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
    await this.prisma.communityLike.create({data:{userId:user.id,postId:id}});return {liked:true};
  }
  @Post('posts/:id/comments')
  comment(@CurrentUser() user:AuthUser,@Param('id') id:string,@Body('body') body:string){
    if(typeof body!=='string'||!body.trim()||body.length>500)throw new BadRequestException('التعليق غير صالح');
    return this.prisma.communityComment.create({data:{userId:user.id,postId:id,body:body.trim()}});
  }

  @Post('comments/:id/like')
  async likeComment(@CurrentUser() user:AuthUser,@Param('id') id:string){
    const found=await this.prisma.communityComment.findUnique({where:{id}});
    if(!found)throw new BadRequestException('التعليق غير موجود');
    const where={userId_commentId:{userId:user.id,commentId:id}};
    const existing=await this.prisma.communityCommentLike.findUnique({where});
    if(existing){await this.prisma.communityCommentLike.delete({where});return {liked:false};}
    await this.prisma.communityCommentLike.create({data:{userId:user.id,commentId:id}});
    return {liked:true};
  }
  @Post('comments/:id/replies')
  async reply(@CurrentUser() user:AuthUser,@Param('id') id:string,@Body('body') body:string){
    if(typeof body!=='string'||!body.trim()||body.length>500)throw new BadRequestException('الرد غير صالح');
    const parent=await this.prisma.communityComment.findUnique({where:{id}});
    if(!parent)throw new BadRequestException('التعليق غير موجود');
    return this.prisma.communityComment.create({data:{userId:user.id,postId:parent.postId,parentId:id,body:body.trim()}});
  }
  @Get('stories')
  stories(){
    return this.prisma.communityStory.findMany({where:{expiresAt:{gt:new Date()}},orderBy:{createdAt:'desc'},take:100,include:{author:{select:{id:true,fullName:true,avatarUrl:true}},views:{include:{user:{select:{id:true,fullName:true,avatarUrl:true}}}}}});
  }
  @Post('stories')
  createStory(@CurrentUser() user:AuthUser,@Body('body') body:string){
    if(typeof body!=='string'||!body.trim()||body.length>500)throw new BadRequestException('القصة غير صالحة');
    return this.prisma.communityStory.create({data:{authorId:user.id,body:body.trim(),expiresAt:new Date(Date.now()+86400000)}});
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
    await this.prisma.schoolFollow.create({data:{userId:user.id}});return {following:true};
  }
  @Get('school/follow')
  async following(@CurrentUser() user:AuthUser){
    const [follow,count]=await Promise.all([this.prisma.schoolFollow.findUnique({where:{userId:user.id}}),this.prisma.schoolFollow.count()]);
    return {following:!!follow,count};
  }
}
