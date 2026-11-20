import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { PUBLIC_KEY } from '../../common/decorators';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    if (context.getType() === 'ws') {
      // The gateway verifies the handshake token and each privileged message's
      // current session. Passport's HTTP extractor cannot read a Socket.IO event.
      const client = context.switchToWs().getClient();
      return typeof client.data?.user?.id === 'string' &&
        typeof client.data?.sessionId === 'string' &&
        Number.isFinite(client.data?.tokenExpiresAt) && client.data.tokenExpiresAt > Date.now();
    }
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    return super.canActivate(context);
  }
}
