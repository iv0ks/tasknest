// Authentication controller: session login / logout / me.
//
// On login the session records the user's id AND their organization id. The
// org id in the session is the only trustworthy statement of "which tenant am I
// in" — the lab is that most task endpoints never consult it.
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { orgs, users } from '../db/schema.js';
import { verifyPassword } from '../auth.js';
import type { SessionData } from '../tasks/auth.guard.js';

@Controller('api')
export class AuthController {
  @Post('login')
  @HttpCode(200)
  async login(
    @Req() req: Request & { session: SessionData },
    @Body() body: { username?: unknown; password?: unknown },
  ) {
    const { username, password } = body ?? {};
    if (typeof username !== 'string' || typeof password !== 'string') {
      throw new BadRequestException('username and password are required');
    }

    const [user] = await db.select().from(users).where(eq(users.username, username)).limit(1);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const [org] = await db.select().from(orgs).where(eq(orgs.id, user.orgId)).limit(1);

    req.session.userId = user.id;
    req.session.orgId = user.orgId;
    req.session.username = user.username;
    return {
      ok: true,
      user: { id: user.id, username: user.username, displayName: user.displayName },
      org: org ? { id: org.id, name: org.name, slug: org.slug } : null,
    };
  }

  @Get('me')
  async me(@Req() req: Request & { session: SessionData }) {
    if (!req.session?.userId || !req.session?.orgId) {
      throw new UnauthorizedException('Not authenticated.');
    }
    const [org] = await db.select().from(orgs).where(eq(orgs.id, req.session.orgId)).limit(1);
    return {
      id: req.session.userId,
      username: req.session.username,
      org: org ? { id: org.id, name: org.name, slug: org.slug } : null,
    };
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@Req() req: Request & { session: { destroy: (cb: () => void) => void } }) {
    return new Promise((resolve) => {
      req.session.destroy(() => resolve({ ok: true }));
    });
  }
}
