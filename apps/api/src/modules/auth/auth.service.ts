import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

const OWNER_ID = 'owner';

@Injectable()
export class AuthService {
  constructor(private readonly jwt: JwtService) {}

  /** No-op kept so AuthModule's onModuleInit hook still works. */
  async ensureOwner() {
    if (!process.env.OWNER_PASSWORD) {
      // eslint-disable-next-line no-console
      console.warn('[auth] OWNER_PASSWORD is not set — login will not work');
    }
  }

  async validate(password: string, _email?: string) {
    const expected = process.env.OWNER_PASSWORD;
    if (!expected) throw new UnauthorizedException('Auth not configured');
    if (password !== expected) throw new UnauthorizedException('Invalid credentials');
    return { id: OWNER_ID, email: process.env.OWNER_EMAIL ?? 'owner@localhost' };
  }

  async login(password: string, email?: string) {
    const user = await this.validate(password, email);
    const token = await this.jwt.signAsync({ sub: user.id, email: user.email });
    return { token, user };
  }
}
