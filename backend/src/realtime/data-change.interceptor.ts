import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { tap } from 'rxjs/operators';
import { RealtimeGateway } from './realtime.gateway';

@Injectable()
export class DataChangeInterceptor implements NestInterceptor {
  constructor(private readonly realtime: RealtimeGateway) {}
  intercept(context: ExecutionContext, next: CallHandler) {
    if (context.getType() !== 'http') return next.handle();
    const request = context.switchToHttp().getRequest();
    const path = request.originalUrl || request.url || '';
    const write = ['POST', 'PATCH', 'PUT', 'DELETE'].includes(request.method);
    if (!write || /\/auth(?:\/|$)|\/registry\/access(?:\?|$)/.test(path)) return next.handle();
    return next.handle().pipe(tap(result => {
      // A rejected batch must not generate an endless refresh/retry loop.
      if (/\/sync-all(?:\?|$)/.test(path) &&
          !result?.outcomes?.some((outcome: any) => outcome.status === 'applied')) return;
      this.realtime.notifyDataChanged();
    }));
  }
}
