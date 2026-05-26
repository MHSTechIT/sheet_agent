import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { FlowsService } from './flows.service';
import { MetaService } from '../meta/meta.service';
import { SettingsService } from '../settings/settings.service';
import { MetaPollerService } from '../queues/meta-poller.service';
import { InjectPrisma, Prisma } from '../../common/prisma';

class SetFormDto {
  @IsString() formId!: string;
  @IsOptional() @IsString() formName?: string;
}
class SetSheetDto {
  @IsString() url!: string;
}
class SetTemplateDto {
  @IsOptional() @IsString() templateId?: string | null;
}

@UseGuards(JwtAuthGuard)
@Controller('flows')
export class FlowsController {
  constructor(
    private readonly flows: FlowsService,
    private readonly meta: MetaService,
    private readonly settings: SettingsService,
    private readonly poller: MetaPollerService,
    @InjectPrisma() private readonly prisma: Prisma,
  ) {}

  @Get()
  list() {
    return this.flows.list();
  }

  @Post()
  create() {
    return this.flows.create();
  }

  @Get('meta/forms')
  async forms() {
    const s = await this.settings.require();
    return this.meta.listLeadForms(s);
  }

  /**
   * Returns the recommended sheet column headers for a Meta form — the
   * exact keys that field_data will use, plus the Meta top-level fields we
   * always populate. Copy these into row 1 of the sheet for 100% column-fill.
   */
  @Get('meta/forms/:formId/headers')
  async headers(@Param('formId') formId: string) {
    const s = await this.settings.require();
    const questions = await this.meta.getFormQuestions(s, formId);
    const topLevel = [
      'id',
      'created_time',
      'ad_id',
      'ad_name',
      'adset_id',
      'adset_name',
      'campaign_id',
      'campaign_name',
      'form_id',
      'form_name',
      'is_organic',
      'platform',
    ];
    return {
      topLevel,
      questions, // [{ key, label, type }]
      // ready-to-paste row (tab-separated done client-side)
      recommended: [...topLevel, ...questions.map((q) => q.key)],
    };
  }

  @Get(':id/logs')
  logs(@Param('id') id: string) {
    return this.prisma.automationLog.findMany({
      where: { flowId: id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  @Patch(':id/form')
  setForm(@Param('id') id: string, @Body() body: SetFormDto) {
    return this.flows.setForm(id, body.formId, body.formName);
  }

  @Patch(':id/sheet')
  setSheet(@Param('id') id: string, @Body() body: SetSheetDto) {
    return this.flows.setSheet(id, body.url);
  }

  @Patch(':id/template')
  setTemplate(@Param('id') id: string, @Body() body: SetTemplateDto) {
    return this.flows.setTemplate(id, body.templateId ?? null);
  }

  @Post(':id/automate')
  automate(@Param('id') id: string) {
    return this.flows.automate(id);
  }

  @Post(':id/sync')
  sync(@Param('id') id: string) {
    return this.poller.pollOne(id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.flows.remove(id);
  }
}
