import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Gender } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import * as XLSX from 'xlsx';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateRegistryUserDto } from './dto/registry.dto';

type RegistryToken = { sub: string; kind: 'registry-user' };

@Injectable()
export class RegistryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  private normalizeId(value: string) {
    return value.trim().replace(/\\s+/g, '');
  }

  private async verifyToken(token: string) {
    try {
      const payload = await this.jwt.verifyAsync<RegistryToken>(token, {
        secret: this.config.get<string>('JWT_ACCESS_SECRET'),
      });
      if (payload.kind !== 'registry-user' || !payload.sub) throw new Error('invalid');
      const user = await this.prisma.registryUser.findFirst({ where: { id: payload.sub, isActive: true } });
      if (!user) throw new Error('inactive');
      return user;
    } catch {
      throw new UnauthorizedException('جلسة المستخدم غير صالحة أو منتهية.');
    }
  }

  async access(nationalId: string) {
    const id = this.normalizeId(nationalId);
    const user = await this.prisma.registryUser.findFirst({ where: { nationalId: id, isActive: true } });
    if (!user) throw new NotFoundException('رقم الهوية غير موجود في النظام.');
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, kind: 'registry-user' },
      { secret: this.config.get<string>('JWT_ACCESS_SECRET'), expiresIn: '30m' },
    );
    return { accessToken, user: this.present(user) };
  }

  async me(token: string) {
    return this.present(await this.verifyToken(token));
  }

  async update(token: string, dto: UpdateRegistryUserDto) {
    const user = await this.verifyToken(token);
    const data: Record<string, unknown> = {};
    if (dto.fullName !== undefined) data.fullName = dto.fullName.trim();
    if (dto.phone !== undefined) data.phone = dto.phone.trim() || null;
    if (dto.email !== undefined) data.email = dto.email.trim().toLowerCase() || null;
    if (dto.dateOfBirth !== undefined) {
      const d = new Date(dto.dateOfBirth);
      if (Number.isNaN(d.getTime())) throw new BadRequestException('تاريخ الميلاد غير صالح.');
      data.dateOfBirth = d;
    }
    if (dto.gender !== undefined) data.gender = dto.gender as Gender;
    if (dto.city !== undefined) data.city = dto.city.trim() || null;
    if (dto.address !== undefined) data.address = dto.address.trim() || null;
    if (dto.notes !== undefined) data.notes = dto.notes.trim() || null;
    data.completed = Boolean(
      (data.fullName ?? user.fullName)?.toString().trim() &&
      (data.phone ?? user.phone)?.toString().trim() &&
      (data.email ?? user.email)?.toString().trim() &&
      (data.dateOfBirth ?? user.dateOfBirth) &&
      (data.gender ?? user.gender) &&
      (data.city ?? user.city)?.toString().trim() &&
      (data.address ?? user.address)?.toString().trim(),
    );
    const updated = await this.prisma.registryUser.update({ where: { id: user.id }, data });
    return this.present(updated);
  }

  async list(query: QueryRegistryUsersDto) {
    const page = Math.max(1, Number(query.page || 1));
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize || 20)));
    const search = query.search?.trim();
    const where = search ? { OR: [{ nationalId: { contains: search } }, { fullName: { contains: search, mode: 'insensitive' as const } }] } : {};
    const [items, total, completed, inactive] = await this.prisma.$transaction([
      this.prisma.registryUser.findMany({ where, orderBy: { updatedAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.registryUser.count({ where }),
      this.prisma.registryUser.count({ where: { ...where, completed: true, isActive: true } }),
      this.prisma.registryUser.count({ where: { ...where, isActive: false } }),
    ]);
    return { items: items.map((u) => this.present(u)), total, page, pageSize, completed, inactive, pages: Math.ceil(total / pageSize) };
  }

  async stats() {
    const [total, completed, latest] = await this.prisma.$transaction([
      this.prisma.registryUser.count({ where: { isActive: true } }),
      this.prisma.registryUser.count({ where: { isActive: true, completed: true } }),
      this.prisma.registryUser.findMany({ where: { isActive: true, completed: true }, orderBy: { updatedAt: 'desc' }, take: 5 }),
    ]);
    return { total, completed, incomplete: total - completed, latest: latest.map((u) => this.present(u)) };
  }

  async setActive(id: string, isActive: boolean) {
    const user = await this.prisma.registryUser.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('المستخدم غير موجود.');
    return this.present(await this.prisma.registryUser.update({ where: { id }, data: { isActive } }));
  }

  async remove(id: string) {
    const user = await this.prisma.registryUser.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('المستخدم غير موجود.');
    await this.prisma.registryUser.delete({ where: { id } });
    return { success: true };
  }

  async exportExcel(completed?: string) {
    const where = completed === 'true' ? { completed: true, isActive: true } : completed === 'false' ? { completed: false, isActive: true } : { isActive: true };
    const users = await this.prisma.registryUser.findMany({ where, orderBy: { nationalId: 'asc' } });
    const rows = users.map((u) => ({
      'رقم الهوية': u.nationalId, 'الاسم': u.fullName || '', 'الهاتف': u.phone || '', 'البريد': u.email || '',
      'تاريخ الميلاد': u.dateOfBirth ? new Date(u.dateOfBirth).toISOString().slice(0, 10) : '',
      'الجنس': u.gender || '', 'المدينة': u.city || '', 'العنوان': u.address || '', 'الملاحظات': u.notes || '',
    }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'المستخدمون');
    ws['!cols'] = [18, 28, 18, 30, 16, 12, 18, 40, 50].map((wch) => ({ wch }));
    return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  }

  templateExcel() {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet([{ national_id: '123456789' }]);
    XLSX.utils.book_append_sheet(wb, ws, 'national_ids');
    return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  }

  async importExcel(buffer: Buffer) {
    let rows: unknown[] = [];
    try {
      const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    } catch {
      throw new BadRequestException('تعذر قراءة ملف Excel.');
    }
    const seen = new Set<string>();
    let duplicates = 0;
    let invalid = 0;
    const ids: string[] = [];
    for (const row of rows as Record<string, unknown>[]) {
      const raw = row.national_id ?? row.nationalId ?? row['رقم الهوية'];
      const id = raw == null ? '' : this.normalizeId(String(raw));
      if (!/^\\d{3,30}$/.test(id)) { invalid++; continue; }
      if (seen.has(id)) { duplicates++; continue; }
      seen.add(id); ids.push(id);
    }
    const existing = ids.length ? await this.prisma.registryUser.findMany({ where: { nationalId: { in: ids } }, select: { nationalId: true } }) : [];
    const existingSet = new Set(existing.map((x) => x.nationalId));
    const newIds = ids.filter((id) => !existingSet.has(id));
    if (newIds.length) {
      await this.prisma.registryUser.createMany({ data: newIds.map((nationalId) => ({ nationalId })), skipDuplicates: true });
    }
    return { read: rows.length, added: newIds.length, duplicates: duplicates + (ids.length - newIds.length), invalid };
  }

  private present(user: any) {
    return {
      id: user.id, nationalId: user.nationalId, fullName: user.fullName, phone: user.phone,
      email: user.email, dateOfBirth: user.dateOfBirth, gender: user.gender, city: user.city,
      address: user.address, notes: user.notes, completed: user.completed, isActive: user.isActive,
      createdAt: user.createdAt, updatedAt: user.updatedAt,
    };
  }
}
