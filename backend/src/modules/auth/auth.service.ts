import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { InjectPrisma, Prisma } from '../../common/prisma';

@Injectable()
export class AuthService {
  constructor(
    @InjectPrisma() private readonly prisma: Prisma,
    private readonly jwt: JwtService,
  ) {}

  async ensureOwner() {
    const email = process.env.OWNER_EMAIL;
    const password = process.env.OWNER_PASSWORD;
    if (!email || !password) return;
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) return;
    const hash = await bcrypt.hash(password, 10);
    await this.prisma.user.create({ data: { email, password: hash } });
    // eslint-disable-next-line no-console
    console.log(`[auth] seeded owner ${email}`);
  }

  async validate(password: string, email?: string) {
    const user = email
      ? await this.prisma.user.findUnique({ where: { email } })
      : await this.prisma.user.findFirst({ orderBy: { createdAt: 'asc' } });
    if (!user) throw new UnauthorizedException('Invalid credentials');
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) throw new UnauthorizedException('Invalid credentials');
    return { id: user.id, email: user.email };
  }

  async login(password: string, email?: string) {
    const user = await this.validate(password, email);
    const token = await this.jwt.signAsync({ sub: user.id, email: user.email });
    return { token, user };
  }
}
