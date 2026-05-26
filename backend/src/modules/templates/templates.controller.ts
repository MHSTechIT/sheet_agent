import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { InjectPrisma, Prisma as PrismaInstance } from '../../common/prisma';
import { Prisma } from '@prisma/client';
import { SettingsService } from '../settings/settings.service';
import { WatiService } from '../wati/wati.service';

@UseGuards(JwtAuthGuard)
@Controller('templates')
export class TemplatesController {
  constructor(
    @InjectPrisma() private readonly prisma: PrismaInstance,
    private readonly settings: SettingsService,
    private readonly wati: WatiService,
  ) {}

  @Get()
  async list(@Query('all') all?: string) {
    return this.prisma.template.findMany({
      where: all === '1' ? undefined : { status: 'APPROVED' },
      orderBy: { name: 'asc' },
    });
  }

  @Post('sync')
  async sync(@Query('all') all?: string) {
    const s = await this.settings.require();
    const templates = await this.wati.listTemplates(s);

    if (templates.length > 0) {
      const now = new Date();
      const values: Prisma.Sql[] = templates.map(
        (t) =>
          Prisma.sql`(${`tmpl_${t.templateId}`}, ${t.templateId}, ${t.name}, ${t.language}, ${t.status}, ${now}, ${now})`,
      );
      await this.prisma.$executeRaw`
        INSERT INTO "Template" ("id", "templateId", "name", "language", "status", "createdAt", "updatedAt")
        VALUES ${Prisma.join(values)}
        ON CONFLICT ("templateId") DO UPDATE
        SET "name" = EXCLUDED."name",
            "language" = EXCLUDED."language",
            "status" = EXCLUDED."status",
            "updatedAt" = EXCLUDED."updatedAt"
      `;
    }

    return this.prisma.template.findMany({
      where: all === '1' ? undefined : { status: 'APPROVED' },
      orderBy: { name: 'asc' },
    });
  }
}
