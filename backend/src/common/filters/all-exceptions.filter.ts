import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';

/**
 * Normalises every error into `{ statusCode, message, errors?, path, timestamp }`
 * and translates the Prisma errors the API can realistically produce.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string = 'حدث خطأ غير متوقع في الخادم';
    let errors: unknown = undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res !== null) {
        const body = res as Record<string, any>;
        message = Array.isArray(body.message) ? body.message[0] : body.message || exception.message;
        if (Array.isArray(body.message)) errors = body.message;
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      switch (exception.code) {
        case 'P2002': {
          status = HttpStatus.CONFLICT;
          const target = (exception.meta?.target as string[] | undefined)?.join('، ');
          message = target ? `القيمة مستخدمة مسبقاً في الحقل: ${target}` : 'هذا السجل موجود مسبقاً';
          break;
        }
        case 'P2025':
          status = HttpStatus.NOT_FOUND;
          message = 'السجل المطلوب غير موجود';
          break;
        case 'P2003':
          status = HttpStatus.BAD_REQUEST;
          message = 'لا يمكن تنفيذ العملية لوجود سجلات مرتبطة';
          break;
        default:
          status = HttpStatus.BAD_REQUEST;
          message = 'خطأ في قاعدة البيانات';
      }
    } else if (exception instanceof Prisma.PrismaClientValidationError) {
      status = HttpStatus.BAD_REQUEST;
      message = 'بيانات غير صالحة';
    }

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} -> ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(status).json({
      statusCode: status,
      message,
      ...(errors ? { errors } : {}),
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
}
