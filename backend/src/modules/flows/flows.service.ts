import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectPrisma, Prisma } from '../../common/prisma';
import { SettingsService } from '../settings/settings.service';
import { MetaService } from '../meta/meta.service';
import { GoogleService } from '../google/google.service';
import { WatiService } from '../wati/wati.service';
import { LeadsService } from '../leads/leads.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { MetaPollerService } from '../queues/meta-poller.service';
import { TelegramService } from '../telegram/telegram.service';

@Injectable()
export class FlowsService {
  constructor(
    @InjectPrisma() private readonly prisma: Prisma,
    private readonly settings: SettingsService,
    private readonly meta: MetaService,
    private readonly google: GoogleService,
    private readonly wati: WatiService,
    private readonly leads: LeadsService,
    private readonly rt: RealtimeGateway,
    @Inject(forwardRef(() => MetaPollerService))
    private readonly poller: MetaPollerService,
    private readonly telegram: TelegramService,
  ) {}

  list() {
    return this.prisma.flow.findMany({ orderBy: { createdAt: 'asc' } });
  }

  async findById(id: string) {
    return this.prisma.flow.findUnique({ where: { id } });
  }

  async create() {
    return this.prisma.flow.create({ data: { status: 'draft' } });
  }

  async remove(id: string) {
    await this.prisma.flow.delete({ where: { id } });
    return { ok: true };
  }

  async setForm(id: string, formId: string, formName?: string) {
    const flow = await this.prisma.flow.findUnique({ where: { id } });
    if (!flow) throw new NotFoundException();
    let name = formName;
    if (!name) {
      const s = await this.settings.require();
      const forms = await this.meta.listLeadForms(s);
      name = forms.find((f) => f.id === formId)?.name ?? formId;
    }
    return this.prisma.flow.update({
      where: { id },
      data: { metaFormId: formId, metaFormName: name },
    });
  }

  async setSheet(id: string, url: string) {
    const sheetId = this.google.extractSheetId(url);
    if (!sheetId) throw new BadRequestException('Invalid Google Sheet URL');
    const s = await this.settings.require();
    const headers = await this.google.readHeaders(s, sheetId);
    return this.prisma.flow.update({
      where: { id },
      data: { sheetUrl: url, googleSheetId: sheetId, sheetHeaders: headers },
    });
  }

  async setTemplate(id: string, templateId: string | null) {
    if (!templateId) {
      return this.prisma.flow.update({
        where: { id },
        data: { templateId: null, templateName: null },
      });
    }
    const t = await this.prisma.template.findUnique({ where: { templateId } });
    if (!t) throw new NotFoundException('Template not found in local cache');
    return this.prisma.flow.update({
      where: { id },
      data: { templateId: t.templateId, templateName: t.name },
    });
  }

  async automate(id: string) {
    const flow = await this.prisma.flow.findUnique({ where: { id } });
    if (!flow) throw new NotFoundException();

    const missing: string[] = [];
    if (!flow.metaFormId) missing.push('Meta form');
    if (!flow.googleSheetId) missing.push('Google Sheet');
    if (missing.length) throw new BadRequestException(`Missing: ${missing.join(', ')}`);

    const s = await this.settings.require();

    await this.setStatus(flow.id, 'testing', 'Running test automation');

    await this.meta.validate(s.metaSystemToken);
    await this.google.validate(s);

    try {
      const headers = (flow.sheetHeaders as string[]) ?? ['Name', 'Phone', 'Email'];
      const row = this.leads.buildSheetRow(headers, {
        name: 'Test Lead',
        phone: '0000000000',
        email: 'test@example.com',
        rawData: { synthetic: true },
      });
      await this.google.appendRow(s, flow.googleSheetId!, row);
      await this.log(flow.id, 'success', 'Test row appended to Google Sheet');
    } catch (e: any) {
      await this.log(flow.id, 'failed', `Sheet test failed: ${e?.message ?? e}`);
      await this.setStatus(flow.id, 'failed', 'Sheet test failed');
      throw e;
    }

    // Pin cursor to "now" so only future leads count
    await this.prisma.flow.update({
      where: { id: flow.id },
      data: { lastPolledAt: new Date() },
    });
    await this.setStatus(flow.id, 'active', 'Automation live');

    return this.prisma.flow.findUnique({ where: { id } });
  }

  async setStatus(flowId: string, status: string, message?: string) {
    await this.prisma.flow.update({ where: { id: flowId }, data: { status } });
    this.rt.emit('flow:status', { flowId, status });
    if (message) await this.log(flowId, 'info', message);
  }

  async log(
    flowId: string,
    status: 'info' | 'success' | 'failed',
    message: string,
    payload?: any,
  ) {
    const row = await this.prisma.automationLog.create({
      data: { flowId, status, message, payload: payload ?? undefined },
    });
    this.rt.emit('flow:log', {
      id: row.id,
      flowId: row.flowId,
      status: row.status as any,
      message: row.message,
      payload: row.payload,
      createdAt: row.createdAt.toISOString(),
    });
    if (status === 'failed') {
      const flow = await this.prisma.flow.findUnique({ where: { id: flowId } });
      const formName = flow?.metaFormName ?? flowId;
      void this.telegram.sendError(`Flow failed · ${formName}`, message, payload);
    }
  }
}
