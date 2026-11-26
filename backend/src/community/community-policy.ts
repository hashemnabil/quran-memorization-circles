import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export const storyBackgrounds = ['#123c30', '#183153', '#5b315e', '#7c402b', '#27303f', '#f3e8d2'];
export const storyTextColors = ['#ffffff', '#fff4c2', '#123c30', '#172033'];
export type CommunityDraft = { body: string; mediaIds?: string[]; schoolPost?: boolean; schoolStory?: boolean; audience?: string; recipientIds?: string[]; mentionIds?: string[]; background?: string; textColor?: string; fontSize?: number; bold?: boolean };
export function visibility(userId: string): Prisma.CommunityPostWhereInput {
  return { OR: [{ authorId: userId }, { audience: 'ALL' }, { audience: 'SELECTED', recipientIds: { has: userId } }] };
}
export function identifiers(value: unknown, maximum = 100): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > maximum || value.some(id => typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id))) throw new BadRequestException('قائمة الحسابات غير صالحة');
  return [...new Set(value)];
}
export function audienceOf(dto: CommunityDraft) {
  const audience = dto.audience ?? 'ALL';
  const recipientIds = identifiers(dto.recipientIds);
  if (!['ALL', 'SELECTED'].includes(audience) || (audience === 'SELECTED' ? !recipientIds.length : recipientIds.length > 0)) throw new BadRequestException('حدد جمهور المنشور بصورة صحيحة');
  return { audience, recipientIds };
}
export function storyAppearance(dto: CommunityDraft) {
  const background = dto.background ?? storyBackgrounds[0], textColor = dto.textColor ?? '#ffffff', fontSize = dto.fontSize ?? 28, bold = dto.bold ?? true;
  if (!storyBackgrounds.includes(background) || !storyTextColors.includes(textColor) || ![22, 28, 36].includes(fontSize) || typeof bold !== 'boolean') throw new BadRequestException('تنسيق القصة غير صالح');
  return { background, textColor, fontSize, bold };
}
