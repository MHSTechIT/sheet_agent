import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { FileStore, AppendLog } from '../../common/file-store';
import { FlowEntity, TemplateEntity } from '../../common/entities';
import { AUTOMATION_LOG, FLOWS_STORE, TEMPLATES_STORE } from '../../common/storage.module';
import { SettingsService } from '../settings/settings.service';
import { MetaService } from '../meta/meta.service';
import { GoogleService } from '../google/google.service';
import { LeadsService } from '../leads/leads.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { MetaPollerService } from '../queues/meta-poller.service';
import { TelegramService } from '../telegram/telegram.service';

function newId(): string {
  return 'fl_' + randomBytes(8).toString('hex');
}

@Injectable()
export class FlowsService {
  constructor(
    @Inject(FLOWS_STORE) private readonly flowsStore: FileStore<FlowEntity[]>,
    @Inject(TEMPLATES_STORE) private readonly templatesStore: FileStore<TemplateEntity[]>,
    @Inject(AUTOMATION_LOG) private readonly logFile: AppendLog,
    private readonly settings: SettingsService,
    private readonly meta: MetaService,
    private readonly google: GoogleService,
    private readonly leads: LeadsService,
    private readonly rt: RealtimeGateway,
    @Inject(forwardRef(() => MetaPollerService))
    private readonly poller: MetaPollerService,
    private readonly telegram: TelegramService,
  ) {}

  async list(): Promise<FlowEntity[]> {
    return this.flowsStore.read();
  }

  async findById(id: string): Promise<FlowEntity | null> {
    const flows = await this.flowsStore.read();
    return flows.find((f) => f.id === id) ?? null;
  }

  async create(): Promise<FlowEntity> {
    const now = new Date().toISOString();
    const flow: FlowEntity = {
      id: newId(),
      metaFormId: null,
      metaFormName: null,
      sheetUrl: null,
      googleSheetId: null,
      sheetHeaders: null,
      templateId: null,
      templateName: null,
      status: 'draft',
      totalLeads: 0,
      todayLeads: 0,
      todayLeadsResetAt: null,
      lastSyncAt: null,
      lastPolledAt: null,
      createdAt: now,
      updatedAt: now,
    };
    await this.flowsStore.update((rows) => [...rows, flow]);
    return flow;
  }

  async remove(id: string): Promise<{ ok: true }> {
    await this.flowsStore.update((rows) => rows.filter((r) => r.id !== id));
    return { ok: true };
  }

  private async patch(id: string, patch: Partial<FlowEntity>): Promise<FlowEntity> {
    let updated: FlowEntity | null = null;
    await this.flowsStore.update((rows) =>
      rows.map((r) => {
        if (r.id !== id) return r;
        updated = { ...r, ...patch, updatedAt: new Date().toISOString() };
        return updated;
      }),
    );
    if (!updated) throw new NotFoundException();
    return updated;
  }

  async setForm(id: string, formId: string, formName?: string): Promise<FlowEntity> {
    let name = formName;
    if (!name) {
      const s = await this.settings.require();
      const forms = await this.meta.listLeadForms(s);
      name = forms.find((f) => f.id === formId)?.name ?? formId;
    }
    return this.patch(id, { metaFormId: formId, metaFormName: name });
  }

  async setSheet(id: string, url: string): Promise<FlowEntity> {
    const sheetId = this.google.extractSheetId(url);
    if (!sheetId) throw new BadRequestException('Invalid Google Sheet URL');
    const s = await this.settings.require();
    const headers = await this.google.readHeaders(s, sheetId);
    return this.patch(id, { sheetUrl: url, googleSheetId: sheetId, sheetHeaders: headers });
  }

  async setTemplate(id: string, templateId: string | null): Promise<FlowEntity> {
    if (!templateId) {
      return this.patch(id, { templateId: null, templateName: null });
    }
    const templates = await this.templatesStore.read();
    const t = templates.find((x) => x.templateId === templateId);
    if (!t) throw new NotFoundException('Template not found in local cache');
    return this.patch(id, { templateId: t.templateId, templateName: t.name });
  }

  async automate(id: string): Promise<FlowEntity | null> {
    const flow = await this.findById(id);
    if (!flow) throw new NotFoundException();

    const missing: string[] = [];
    if (!flow.metaFormId) missing.push('Meta form');
    if (!flow.googleSheetId) missing.push('Google Sheet');
    if (missing.length) throw new BadRequestException(`Missing: ${missing.join(', ')}`);

    const s = await this.settings.require();

    await this.setStatus(flow.id, 'testing', 'Running test automation');

    // STEP 1: validate
    await this.meta.validate(s.metaSystemToken);
    await this.google.validate(s);

    // STEP 2: dry-run a synthetic lead through sheet
    try {
      const headers = flow.sheetHeaders ?? ['Name', 'Phone', 'Email'];
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

    // STEP 3: activate with cursor pinned to "now" so only future leads count
    await this.patch(flow.id, { lastPolledAt: new Date().toISOString() });
    await this.setStatus(flow.id, 'active', 'Automation live');

    return this.findById(id);
  }

  async setStatus(flowId: string, status: FlowEntity['status'], message?: string) {
    await this.patch(flowId, { status });
    this.rt.emit('flow:status', { flowId, status });
    if (message) await this.log(flowId, 'info', message);
  }

  async log(
    flowId: string,
    status: 'info' | 'success' | 'failed',
    message: string,
    payload?: unknown,
  ) {
    const line = `[${flowId}] ${status}  ${message}` +
      (payload !== undefined ? ` :: ${JSON.stringify(payload)}` : '');
    await this.logFile.append(line);
    this.rt.emit('flow:log', {
      id: 'log_' + Date.now(),
      flowId,
      status: status as any,
      message,
      payload,
      createdAt: new Date().toISOString(),
    });
    if (status === 'failed') {
      const flow = await this.findById(flowId);
      const formName = flow?.metaFormName ?? flowId;
      void this.telegram.sendError(`Flow failed · ${formName}`, message, payload);
    }
  }
}
