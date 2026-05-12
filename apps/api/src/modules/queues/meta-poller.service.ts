import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { FileStore } from '../../common/file-store';
import { FlowEntity } from '../../common/entities';
import { FLOWS_STORE } from '../../common/storage.module';
import { SettingsService } from '../settings/settings.service';
import { MetaService } from '../meta/meta.service';
import { GoogleService } from '../google/google.service';
import { WatiService } from '../wati/wati.service';
import { LeadsService } from '../leads/leads.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { FlowsService } from '../flows/flows.service';
import { forwardRef, Inject as NestInject } from '@nestjs/common';

const MAX_RETRIES = 3;

async function withRetry<T>(label: string, fn: () => Promise<T>, log: Logger): Promise<T> {
  let lastErr: any;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (e: any) {
      lastErr = e;
      if (attempt < MAX_RETRIES) {
        const wait = 1000 * Math.pow(2, attempt - 1); // 1s, 2s, 4s
        log.warn(`${label} attempt ${attempt} failed (${e?.message}); retrying in ${wait}ms`);
        await new Promise((r) => setTimeout(r, wait));
      }
    }
  }
  throw lastErr;
}

@Injectable()
export class MetaPollerService {
  private readonly log = new Logger(MetaPollerService.name);
  private running = false;

  constructor(
    @Inject(FLOWS_STORE) private readonly flowsStore: FileStore<FlowEntity[]>,
    private readonly settings: SettingsService,
    private readonly meta: MetaService,
    private readonly google: GoogleService,
    private readonly wati: WatiService,
    private readonly leads: LeadsService,
    private readonly rt: RealtimeGateway,
    @NestInject(forwardRef(() => FlowsService))
    private readonly flows: FlowsService,
  ) {}

  @Cron(CronExpression.EVERY_30_SECONDS)
  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      await this.pollAll();
    } catch (e: any) {
      this.log.error(`poller error: ${e?.message ?? e}`);
    } finally {
      this.running = false;
    }
  }

  /** Manual on-demand poll for a single flow (triggered from the UI). */
  async pollOne(flowId: string) {
    const flow = await this.flows.findById(flowId);
    if (!flow || !flow.metaFormId) throw new Error('Flow has no form attached');
    const s = await this.settings.require();
    await this.pollFlow(flow, s);
    return this.flows.findById(flowId);
  }

  private async pollAll() {
    const all = await this.flowsStore.read();
    const flows = all.filter((f) => f.status === 'active' && f.metaFormId);
    if (flows.length === 0) return;

    let settings;
    try {
      settings = await this.settings.require();
    } catch {
      return;
    }

    for (const flow of flows) {
      try {
        await this.pollFlow(flow, settings);
      } catch (e: any) {
        this.log.error(`flow ${flow.id} poll failed: ${e?.message ?? e}`);
        await this.flows.log(
          flow.id,
          'failed',
          `Meta poll failed: ${e?.message ?? e}`,
        );
      }
    }
  }

  private async pollFlow(flow: FlowEntity, s: any) {
    const pollStartUnix = Math.floor(Date.now() / 1000);
    const since = flow.lastPolledAt
      ? Math.floor(new Date(flow.lastPolledAt).getTime() / 1000)
      : pollStartUnix - 5 * 60;

    const fetched = await this.meta.listLeads(s, flow.metaFormId!, since);
    let newCount = 0;

    for (const raw of fetched) {
      const isProcessed = await this.leads.isProcessed(flow.id, raw.id);
      if (isProcessed) continue;

      const fields = this.meta.parseLeadFields(raw.field_data ?? []);
      const enrichedRaw = { ...raw, form_name: flow.metaFormName ?? null };

      try {
        // 1. Append to Google Sheet (with retries)
        const headers = flow.sheetHeaders ?? ['Name', 'Phone', 'Email'];
        const row = this.leads.buildSheetRow(headers, {
          name: fields.name,
          phone: fields.phone,
          email: fields.email,
          rawData: enrichedRaw,
        });
        await withRetry(
          `sheet append (lead ${raw.id})`,
          () => this.google.appendRow(s, flow.googleSheetId!, row),
          this.log,
        );

        // 2. Send WATI template (if configured, with retries)
        if (flow.templateName && fields.phone) {
          await withRetry(
            `wati send (lead ${raw.id})`,
            () => this.wati.sendTemplate(s, {
              phone: fields.phone!,
              templateName: flow.templateName!,
            }),
            this.log,
          );
        }

        // 3. Mark as processed only after sheet + (optional) wati both succeed
        await this.leads.markProcessed(flow.id, raw.id);
        newCount++;

        await this.flows.log(
          flow.id,
          'success',
          `Lead ${raw.id} → sheet${flow.templateName ? ' + wati' : ''}`,
        );
      } catch (e: any) {
        await this.flows.log(
          flow.id,
          'failed',
          `Lead ${raw.id} failed after retries: ${e?.message ?? e}`,
        );
        // Don't mark as processed — will retry on next poll
      }
    }

    // Update heartbeat + counters
    const heartbeat = new Date((pollStartUnix - 30) * 1000).toISOString();
    const totalLeads = await this.leads.count(flow.id);

    // Today counter: count leadIds processed today by checking timestamps?
    // Simpler approach: increment per-tick, reset at midnight.
    const today = new Date().toISOString().slice(0, 10);
    let todayLeads = flow.todayLeads;
    let todayLeadsResetAt = flow.todayLeadsResetAt;
    if (todayLeadsResetAt !== today) {
      todayLeads = 0;
      todayLeadsResetAt = today;
    }
    todayLeads += newCount;

    await this.flowsStore.update((rows) =>
      rows.map((r) =>
        r.id === flow.id
          ? {
              ...r,
              lastPolledAt: heartbeat,
              totalLeads,
              todayLeads,
              todayLeadsResetAt,
              lastSyncAt: newCount > 0 ? new Date().toISOString() : r.lastSyncAt,
            }
          : r,
      ),
    );

    this.rt.emit('flow:poll', { flowId: flow.id, lastPolledAt: heartbeat, newCount });

    if (newCount > 0) {
      this.rt.emit('flow:lead', {
        flowId: flow.id,
        totalLeads,
        todayLeads,
        lastSyncAt: new Date().toISOString(),
      });
      this.log.log(`flow ${flow.id} ingested ${newCount} new lead(s)`);
    }
  }
}
