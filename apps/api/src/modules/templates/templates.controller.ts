import { Controller, Get, Inject, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { FileStore } from '../../common/file-store';
import { TemplateEntity } from '../../common/entities';
import { TEMPLATES_STORE } from '../../common/storage.module';
import { SettingsService } from '../settings/settings.service';
import { WatiService } from '../wati/wati.service';

@UseGuards(JwtAuthGuard)
@Controller('templates')
export class TemplatesController {
  constructor(
    @Inject(TEMPLATES_STORE) private readonly store: FileStore<TemplateEntity[]>,
    private readonly settings: SettingsService,
    private readonly wati: WatiService,
  ) {}

  @Get()
  async list(@Query('all') all?: string) {
    const rows = await this.store.read();
    const filtered = all === '1' ? rows : rows.filter((r) => r.status === 'APPROVED');
    return [...filtered].sort((a, b) => a.name.localeCompare(b.name));
  }

  @Post('sync')
  async sync(@Query('all') all?: string) {
    const s = await this.settings.require();
    const templates = await this.wati.listTemplates(s);
    const now = new Date().toISOString();
    const persist: TemplateEntity[] = templates.map((t) => ({
      id: t.id,
      templateId: t.templateId,
      name: t.name,
      language: t.language,
      status: t.status,
      updatedAt: now,
    }));
    await this.store.write(persist);
    const filtered = all === '1' ? persist : persist.filter((r) => r.status === 'APPROVED');
    return [...filtered].sort((a, b) => a.name.localeCompare(b.name));
  }
}
