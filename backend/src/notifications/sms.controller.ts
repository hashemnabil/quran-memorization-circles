import { BadRequestException, Body, Controller, Post, ServiceUnavailableException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators';

type SmsRow = { phone: string; title?: string; text: string };
type SmsRequest = { messages: SmsRow[]; confirm?: boolean };

/** Outbound SMS is server-only; credentials never enter browser bundles or logs. */
@Controller('sms')
@Roles(Role.ADMIN)
export class SmsController {
  @Post('send')
  async send(@Body() body: SmsRequest) {
    if (body?.confirm !== true) throw new BadRequestException('يجب تأكيد الإرسال أولًا');
    if (!Array.isArray(body.messages) || !body.messages.length || body.messages.length > 200)
      throw new BadRequestException('حدد من 1 إلى 200 رسالة في كل دفعة');
    const messages = body.messages.map(row => ({
      phone: String(row.phone ?? '').replace(/[\s()-]/g, ''),
      title: String(row.title ?? 'رسالة من المدرسة').trim().slice(0, 160),
      text: String(row.text ?? '').trim(),
    }));
    if (messages.some(row => !/^\+?[0-9]{8,15}$/.test(row.phone) || !row.text || row.text.length > 1000))
      throw new BadRequestException('تحقق من أرقام الهواتف والنصوص (الحد 1000 حرف)');
    const key = process.env.OFFLINESMS_API_KEY;
    if (!key) throw new ServiceUnavailableException('لم يتم إعداد مفتاح OfflineSMS على الخادم');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
    try {
      const response = await fetch('https://business.offlinesms.com/api/v1/org/messages/send', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages }),
        signal: controller.signal,
      });
      if (!response.ok) throw new ServiceUnavailableException(`رفض مزوّد الرسائل الطلب (HTTP ${response.status})`);
      // Do not echo potentially sensitive SMS contents to clients or logs.
      return { accepted: true, count: messages.length, providerStatus: response.status };
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException('تعذر الاتصال بخدمة الرسائل؛ تحقق من حالة الإرسال قبل إعادة المحاولة');
    } finally { clearTimeout(timeout); }
  }
}
