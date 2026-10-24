import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { PUBLIC_KEY } from '../../common/decorators';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    if (context.getType() === 'ws') {
      // The realtime gateway authenticates the handshake and stores the verified
      // identity/session on socket.data. Never pass a Socket to passport-jwt's
      // HTTP request extractor (it expects req.headers.authorization).
      const socket = context.switchToWs().getClient();
      const data = socket?.data;
      if (!data?.user || !data?.sessionId ||
          !Number.isFinite(data?.tokenExpiresAt) ||
          data.tokenExpiresAt <= Date.now()) {
        throw new UnauthorizedException('جلسة الاتصال غير صالحة');
      }
      return true;
    }
    return super.canActivate(context);
  }
}
