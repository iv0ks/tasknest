// Session auth guard.
//
// Every task route requires a logged-in session. The guard only checks that
// *a* session exists — it says nothing about *which organization's* tasks you
// may read, change or delete. That is authentication, not authorization; the
// missing tenant check on the single-task endpoints is the lab.
import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';

export interface SessionData {
  userId?: number;
  orgId?: number;
  username?: string;
}

@Injectable()
export class AuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request & { session: SessionData }>();
    if (!req.session?.userId || !req.session?.orgId) {
      throw new UnauthorizedException('Not authenticated. POST /api/login first.');
    }
    return true;
  }
}
