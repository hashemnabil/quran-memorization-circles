import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConversationType, NotificationType, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AccessControlService } from '../common/services/access-control.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { AuthUser } from '../common/decorators';
import { paginate } from '../common/dto/pagination.dto';
import {
  AddMembersDto,
  CreateDirectConversationDto,
  CreateGroupConversationDto,
  QueryMessagesDto,
  SendMessageDto,
  UpdateConversationDto,
} from './dto/chat.dto';

const MEMBER_SELECT = {
  id: true,
  isAdmin: true,
  lastReadAt: true,
  user: { select: { id: true, fullName: true, role: true, avatarUrl: true } },
} satisfies Prisma.ConversationMemberSelect;

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
    private readonly notifications: NotificationsService,
    private readonly acl: AccessControlService,
  ) {}

  /** Every conversation the user belongs to, with unread counts and last message. */
  async listConversations(user: AuthUser) {
    const memberships = await this.prisma.conversationMember.findMany({
      where: { userId: user.id, leftAt: null },
      include: {
        conversation: {
          include: {
            members: { where: { leftAt: null }, select: MEMBER_SELECT },
            messages: {
              where: { deletedAt: null },
              orderBy: { createdAt: 'desc' },
              take: 1,
              include: { sender: { select: { id: true, fullName: true } } },
            },
          },
        },
      },
      orderBy: { conversation: { lastMessageAt: 'desc' } },
    });

    const results = await Promise.all(
      memberships.map(async (m) => {
        const unreadCount = await this.prisma.message.count({
          where: {
            conversationId: m.conversationId,
            deletedAt: null,
            senderId: { not: user.id },
            ...(m.lastReadAt ? { createdAt: { gt: m.lastReadAt } } : {}),
          },
        });

        const other =
          m.conversation.type === ConversationType.DIRECT
            ? m.conversation.members.find((x) => x.user.id !== user.id)
            : null;

        const isGroup = m.conversation.type === ConversationType.GROUP;
        return {
          id: m.conversation.id,
          type: m.conversation.type,
          title: m.conversation.title ?? other?.user.fullName ?? 'محادثة',
          description: m.conversation.description,
          avatarUrl: m.conversation.avatarUrl ?? other?.user.avatarUrl ?? null,
          otherUser: other?.user ?? null,
          isOnline: other ? this.realtime.isOnline(other.user.id) : false,
          members: m.conversation.members,
          memberCount: m.conversation.members.length,
          lastMessage: m.conversation.messages[0] ?? null,
          lastMessageAt: m.conversation.lastMessageAt,
          unreadCount,
          isClosed: m.conversation.isClosed,
          adminOnly: m.conversation.adminOnly,
          isAdmin: m.isAdmin,
          // Mirrors the checks in `send()` so the UI can disable the composer.
          canPost: !isGroup || (!m.conversation.isClosed && (!m.conversation.adminOnly || m.isAdmin)),
        };
      }),
    );

    // Newest activity first; conversations with no messages fall back to creation order.
    return results.sort(
      (a, b) => new Date(b.lastMessageAt ?? 0).getTime() - new Date(a.lastMessageAt ?? 0).getTime(),
    );
  }

  async unreadTotal(user: AuthUser) {
    const memberships = await this.prisma.conversationMember.findMany({
      where: { userId: user.id, leftAt: null },
      select: { conversationId: true, lastReadAt: true },
    });
    if (!memberships.length) return { count: 0 };

    const counts = await Promise.all(
      memberships.map((m) =>
        this.prisma.message.count({
          where: {
            conversationId: m.conversationId,
            deletedAt: null,
            senderId: { not: user.id },
            ...(m.lastReadAt ? { createdAt: { gt: m.lastReadAt } } : {}),
          },
        }),
      ),
    );
    return { count: counts.reduce((a, b) => a + b, 0) };
  }

  /** Throws on the first member the actor is not permitted to contact. */
  private async assertAllContactable(user: AuthUser, memberIds: string[]) {
    for (const id of memberIds) {
      if (id === user.id) continue;
      await this.acl.assertCanContact(user, id);
    }
  }

  async createDirect(user: AuthUser, dto: CreateDirectConversationDto) {
    // Role-based: a parent cannot open a thread with another parent, a teacher
    // cannot reach every family in the school, and so on. The rules live in
    // AccessControlService so the directory and this check cannot drift apart.
    const target = await this.acl.assertCanContact(user, dto.userId);

    // Reuse the existing 1:1 thread rather than creating duplicates.
    const existing = await this.prisma.conversation.findFirst({
      where: {
        type: ConversationType.DIRECT,
        AND: [
          { members: { some: { userId: user.id, leftAt: null } } },
          { members: { some: { userId: dto.userId, leftAt: null } } },
        ],
      },
      include: { members: { where: { leftAt: null }, select: MEMBER_SELECT } },
    });
    if (existing) return existing;

    return this.prisma.conversation.create({
      data: {
        type: ConversationType.DIRECT,
        createdById: user.id,
        members: {
          create: [{ userId: user.id }, { userId: dto.userId }],
        },
      },
      include: { members: { where: { leftAt: null }, select: MEMBER_SELECT } },
    });
  }

  async createGroup(user: AuthUser, dto: CreateGroupConversationDto) {
    const memberIds = [...new Set([...dto.memberIds, user.id])];

    const valid = await this.prisma.user.count({
      where: { id: { in: memberIds }, deletedAt: null, isActive: true },
    });
    if (valid !== memberIds.length) throw new BadRequestException('بعض الأعضاء المحددين غير متاحين');

    // Every member has to be someone the creator is allowed to talk to; a group
    // must not become a way around the direct-message rules.
    await this.assertAllContactable(user, memberIds);

    const conversation = await this.prisma.conversation.create({
      data: {
        type: ConversationType.GROUP,
        title: dto.title,
        description: dto.description,
        createdById: user.id,
        members: {
          create: memberIds.map((id) => ({ userId: id, isAdmin: id === user.id })),
        },
      },
      include: { members: { where: { leftAt: null }, select: MEMBER_SELECT } },
    });

    await this.notifications.notifyMany(
      memberIds.filter((id) => id !== user.id),
      {
        type: NotificationType.CHAT_MESSAGE,
        title: 'تمت إضافتك إلى مجموعة',
        body: `تمت إضافتك إلى مجموعة "${dto.title}"`,
        link: `/chat/${conversation.id}`,
      },
    );

    return conversation;
  }

  async findOne(user: AuthUser, id: string) {
    const membership = await this.assertMember(user, id);
    const conversation = await this.prisma.conversation.findUnique({
      where: { id },
      include: {
        members: {
          where: { leftAt: null },
          select: MEMBER_SELECT,
          orderBy: [{ isAdmin: 'desc' }, { joinedAt: 'asc' }],
        },
      },
    });
    if (!conversation) throw new NotFoundException('المحادثة غير موجودة');

    const isGroup = conversation.type === ConversationType.GROUP;
    const other = !isGroup ? conversation.members.find((m) => m.user.id !== user.id) : null;

    return {
      ...conversation,
      title: conversation.title ?? other?.user.fullName ?? 'محادثة',
      // A direct thread has no picture of its own, so it wears the other
      // person's — the same fallback `listConversations` applies, without which
      // the same user showed a photo in the list and initials in the header.
      avatarUrl: conversation.avatarUrl ?? other?.user.avatarUrl ?? null,
      otherUser: other?.user ?? null,
      isOnline: other ? this.realtime.isOnline(other.user.id) : false,
      memberCount: conversation.members.length,
      isAdmin: membership.isAdmin,
      canPost: !isGroup || (!conversation.isClosed && (!conversation.adminOnly || membership.isAdmin)),
    };
  }

  async messages(user: AuthUser, id: string, query: QueryMessagesDto) {
    await this.assertMember(user, id);

    const where: Prisma.MessageWhereInput = { conversationId: id, deletedAt: null };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.message.findMany({
        where,
        include: { sender: { select: { id: true, fullName: true, role: true, avatarUrl: true } } },
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.message.count({ where }),
    ]);

    // Oldest first for rendering, while pagination walks backwards through history.
    return paginate(data.reverse(), total, query.page, query.limit);
  }

  async send(user: AuthUser, id: string, dto: SendMessageDto) {
    const membership = await this.assertMember(user, id);

    // Group moderation: archived groups accept nothing, announcement-style
    // groups accept messages from their admins only.
    const settings = await this.prisma.conversation.findUnique({
      where: { id },
      select: { isClosed: true, adminOnly: true, type: true },
    });
    if (settings?.type === ConversationType.GROUP) {
      if (settings.isClosed) {
        throw new BadRequestException('هذه المجموعة مغلقة، لا يمكن إرسال رسائل جديدة');
      }
      if (settings.adminOnly && !membership.isAdmin) {
        throw new ForbiddenException('الإرسال في هذه المجموعة متاح لمشرفيها فقط');
      }
    }

    const message = await this.prisma.$transaction(async (tx) => {
      const created = await tx.message.create({
        data: {
          conversationId: id,
          senderId: user.id,
          body: dto.body,
          attachmentUrl: dto.attachmentUrl,
        },
        include: { sender: { select: { id: true, fullName: true, role: true, avatarUrl: true } } },
      });
      await tx.conversation.update({
        where: { id },
        data: { lastMessageAt: created.createdAt },
      });
      await tx.conversationMember.update({
        where: { id: membership.id },
        data: { lastReadAt: created.createdAt },
      });
      return created;
    });

    this.realtime.emitToConversation(id, 'chat:message', message);

    // Members who are offline get a persistent notification instead.
    const others = await this.prisma.conversationMember.findMany({
      where: { conversationId: id, leftAt: null, userId: { not: user.id } },
      select: { userId: true },
    });

    const conversation = await this.prisma.conversation.findUnique({
      where: { id },
      select: { title: true, type: true },
    });

    for (const member of others) {
      this.realtime.emitToUser(member.userId, 'chat:inbox', { conversationId: id, message });
      if (!this.realtime.isOnline(member.userId)) {
        await this.notifications.notify({
          userId: member.userId,
          type: NotificationType.CHAT_MESSAGE,
          title:
            conversation?.type === ConversationType.GROUP
              ? `رسالة في "${conversation.title}"`
              : `رسالة من ${user.fullName}`,
          body: dto.body.slice(0, 120),
          link: `/chat/${id}`,
        });
      }
    }

    return message;
  }

  async markRead(user: AuthUser, id: string) {
    const membership = await this.assertMember(user, id);
    await this.prisma.conversationMember.update({
      where: { id: membership.id },
      data: { lastReadAt: new Date() },
    });
    this.realtime.emitToConversation(id, 'chat:read', { conversationId: id, userId: user.id });
    return { message: 'تم تعليم الرسائل كمقروءة' };
  }

  async addMembers(user: AuthUser, id: string, dto: AddMembersDto) {
    const membership = await this.assertMember(user, id);
    const conversation = await this.prisma.conversation.findUnique({ where: { id } });
    if (!conversation) throw new NotFoundException('المحادثة غير موجودة');
    if (conversation.type !== ConversationType.GROUP) {
      throw new BadRequestException('يمكن إضافة أعضاء إلى المجموعات فقط');
    }
    if (!membership.isAdmin) throw new ForbiddenException('إضافة الأعضاء متاحة لمشرف المجموعة فقط');

    await this.assertAllContactable(user, dto.memberIds);

    const existing = await this.prisma.conversationMember.findMany({
      where: { conversationId: id, userId: { in: dto.memberIds } },
      select: { id: true, userId: true, leftAt: true },
    });
    const existingMap = new Map(existing.map((e) => [e.userId, e]));

    for (const userId of dto.memberIds) {
      const prior = existingMap.get(userId);
      if (prior) {
        if (prior.leftAt) {
          await this.prisma.conversationMember.update({
            where: { id: prior.id },
            data: { leftAt: null, joinedAt: new Date() },
          });
        }
      } else {
        await this.prisma.conversationMember.create({ data: { conversationId: id, userId } });
      }
    }

    return this.findOne(user, id);
  }

  async leave(user: AuthUser, id: string) {
    const membership = await this.assertMember(user, id);
    const conversation = await this.prisma.conversation.findUnique({ where: { id } });
    if (conversation?.type === ConversationType.DIRECT) {
      throw new BadRequestException('لا يمكن مغادرة محادثة فردية');
    }
    await this.prisma.conversationMember.update({
      where: { id: membership.id },
      data: { leftAt: new Date() },
    });
    return { message: 'تمت مغادرة المجموعة' };
  }

  /** Editing is limited to the author; the message is flagged as edited. */
  async editMessage(user: AuthUser, conversationId: string, messageId: string, body: string) {
    await this.assertMember(user, conversationId);

    const message = await this.prisma.message.findFirst({
      where: { id: messageId, conversationId, deletedAt: null },
    });
    if (!message) throw new NotFoundException('الرسالة غير موجودة');
    if (message.senderId !== user.id) {
      throw new ForbiddenException('يمكن تعديل الرسالة من قبل مرسلها فقط');
    }

    const updated = await this.prisma.message.update({
      where: { id: messageId },
      data: { body, editedAt: new Date() },
      include: { sender: { select: { id: true, fullName: true, role: true, avatarUrl: true } } },
    });

    this.realtime.emitToConversation(conversationId, 'chat:message-edited', updated);
    return updated;
  }

  async deleteMessage(user: AuthUser, conversationId: string, messageId: string) {
    await this.assertMember(user, conversationId);
    const message = await this.prisma.message.findFirst({
      where: { id: messageId, conversationId, deletedAt: null },
    });
    if (!message) throw new NotFoundException('الرسالة غير موجودة');

    // The author, a group admin (moderation) or a system admin may delete.
    const membership = await this.prisma.conversationMember.findFirst({
      where: { conversationId, userId: user.id, leftAt: null },
      select: { isAdmin: true },
    });
    const mayDelete =
      message.senderId === user.id || membership?.isAdmin || user.role === Role.ADMIN;
    if (!mayDelete) {
      throw new ForbiddenException('يمكن حذف الرسالة من قبل مرسلها أو مشرف المجموعة');
    }

    await this.prisma.message.update({ where: { id: messageId }, data: { deletedAt: new Date() } });
    this.realtime.emitToConversation(conversationId, 'chat:message-deleted', {
      conversationId,
      messageId,
    });
    return { message: 'تم حذف الرسالة' };
  }

  // --- group administration -------------------------------------------------

  /** Group settings: rename, archive, or restrict posting to admins. */
  async updateConversation(user: AuthUser, id: string, dto: UpdateConversationDto) {
    await this.assertGroupAdmin(user, id);

    const updated = await this.prisma.conversation.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        isClosed: dto.isClosed,
        adminOnly: dto.adminOnly,
      },
      include: { members: { where: { leftAt: null }, select: MEMBER_SELECT } },
    });

    this.realtime.emitToConversation(id, 'chat:conversation-updated', {
      conversationId: id,
      title: updated.title,
      isClosed: updated.isClosed,
      adminOnly: updated.adminOnly,
    });

    return updated;
  }

  async setMemberAdmin(user: AuthUser, id: string, memberUserId: string, isAdmin: boolean) {
    await this.assertGroupAdmin(user, id);

    const membership = await this.prisma.conversationMember.findFirst({
      where: { conversationId: id, userId: memberUserId, leftAt: null },
    });
    if (!membership) throw new NotFoundException('العضو غير موجود في المجموعة');

    // Never let the last admin step down and leave the group unmanaged.
    if (!isAdmin) await this.assertNotLastAdmin(id, memberUserId);

    await this.prisma.conversationMember.update({
      where: { id: membership.id },
      data: { isAdmin },
    });

    this.realtime.emitToConversation(id, 'chat:conversation-updated', { conversationId: id });
    return this.findOne(user, id);
  }

  async removeMember(user: AuthUser, id: string, memberUserId: string) {
    await this.assertGroupAdmin(user, id);
    if (memberUserId === user.id) {
      throw new BadRequestException('استخدم "مغادرة المجموعة" لإزالة نفسك');
    }

    const membership = await this.prisma.conversationMember.findFirst({
      where: { conversationId: id, userId: memberUserId, leftAt: null },
    });
    if (!membership) throw new NotFoundException('العضو غير موجود في المجموعة');

    await this.assertNotLastAdmin(id, memberUserId);
    await this.prisma.conversationMember.update({
      where: { id: membership.id },
      data: { leftAt: new Date() },
    });

    this.realtime.emitToUser(memberUserId, 'chat:conversation-updated', { conversationId: id });
    this.realtime.emitToConversation(id, 'chat:conversation-updated', { conversationId: id });
    return this.findOne(user, id);
  }

  // --- helpers --------------------------------------------------------------

  private async assertMember(user: AuthUser, conversationId: string) {
    const membership = await this.prisma.conversationMember.findFirst({
      where: { conversationId, userId: user.id, leftAt: null },
    });
    if (!membership) throw new ForbiddenException('لست عضواً في هذه المحادثة');
    return membership;
  }

  /** Group admins manage the group; a system ADMIN can always step in. */
  private async assertGroupAdmin(user: AuthUser, conversationId: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { type: true },
    });
    if (!conversation) throw new NotFoundException('المحادثة غير موجودة');
    if (conversation.type !== ConversationType.GROUP) {
      throw new BadRequestException('هذا الإجراء متاح للمجموعات فقط');
    }

    const membership = await this.assertMember(user, conversationId);
    if (!membership.isAdmin && user.role !== Role.ADMIN) {
      throw new ForbiddenException('هذا الإجراء متاح لمشرفي المجموعة فقط');
    }
    return membership;
  }

  private async assertNotLastAdmin(conversationId: string, excludeUserId: string) {
    const remaining = await this.prisma.conversationMember.count({
      where: {
        conversationId,
        leftAt: null,
        isAdmin: true,
        userId: { not: excludeUserId },
      },
    });
    if (remaining === 0) {
      throw new BadRequestException('يجب أن يبقى مشرف واحد على الأقل في المجموعة');
    }
  }
}
