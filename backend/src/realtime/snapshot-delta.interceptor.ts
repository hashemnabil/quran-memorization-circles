import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { map } from 'rxjs/operators';
import { createHash } from 'node:crypto';
import { snapshotPatch } from './snapshot-delta';

@Injectable()
export class SnapshotDeltaInterceptor implements NestInterceptor {
  private snapshots = new Map<string, { data: any; size: number }>();
  private size = 0;
  intercept(context: ExecutionContext, next: CallHandler) {
    if (context.getType() !== 'http') return next.handle();
    const request = context.switchToHttp().getRequest();
    if (request.method !== 'GET' || request.headers?.['x-offline-snapshot'] !== '1' || !request.user?.id) return next.handle();
    return next.handle().pipe(map(result => {
      const serialized = JSON.stringify(result);
      if (!serialized) return result;
      const data = JSON.parse(serialized);
      const token = createHash('sha256').update(serialized).digest('hex');
      const scope = `${request.user.id}:${request.originalUrl || request.url}:`;
      const baseToken = request.headers['x-offline-base'];
      const before = typeof baseToken === 'string' ? this.snapshots.get(scope + baseToken)?.data : undefined;
      if (!this.snapshots.has(scope + token) && serialized.length <= 1000000) {
        while (this.size + serialized.length > 8000000 && this.snapshots.size) {
          const oldest = this.snapshots.keys().next().value!;
          this.size -= this.snapshots.get(oldest)!.size; this.snapshots.delete(oldest);
        }
        this.snapshots.set(scope + token, { data, size: serialized.length }); this.size += serialized.length;
      }
      return before !== undefined
        ? { offlineDelta: { token, baseToken, patch: snapshotPatch(before, data) } }
        : { offlineSnapshot: { token, data } };
    }));
  }
}
