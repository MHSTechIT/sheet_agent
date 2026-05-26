import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectPrisma, Prisma } from '../../common/prisma';
import { SettingsService } from '../settings/settings.service';
import { MetaService } from '../meta/meta.service';
import { LeadsService } from '../leads/leads.service';
import { QueueProducer } from './queue.producer';
import { RealtimeGateway } from '../realtime/realtime.gateway';

@Injectable()
export class MetaPollerService {
  private readonly log = new Logger(MetaPollerService.name);
  private running = false;
  private runningSince: number | null = null;
  /** Max time a single tick is allowed to hold the lock. After this the next
   *  tick force-resets the flag so a stuck poll can't permanently freeze the cron. */
  private static readonly STALE_LOCK_MS = 2 * 60 * 1000;

  constructor(
    @InjectPrisma() private readonly prisma: Prisma,
    private readonly settings: SettingsService,
    private readonly meta: MetaService,
    private readonly leads: LeadsService,
    private readonly producer: QueueProducer,
    private readonly rt: RealtimeGateway,
  ) {}

  @Cron(CronExpression.EVERY_30_SECONDS)
  async tick() {
    if (this.running) {
      const age = this.runningSince ? Date.now() - this.runningSince : 0;
      if (age > MetaPollerService.STALE_LOCK_MS) {
        this.log.warn(`previous tick stuck for ${age}ms — force-resetting lock`);
        this.running = false;
      } else {
        return;
      }
    }
    this.running = true;
    this.runningSince = Date.now();
    try {
      await this.pollAll();
    } catch (e: any) {
      this.log.error(`poller error: ${e?.message ?? e}`);
    } finally {
      this.running = false;
      this.runningSince = null;
    }
  }

  async pollOne(flowId: string) {
    const flow = await this.prisma.flow.findUnique({ where: { id: flowId } });
    if (!flow || !flow.metaFormId) throw new Error('Flow has no form attached');
    const s = await this.settings.require();
    await this.pollFlow(flow, s);
    return this.prisma.flow.findUnique({ where: { id: flowId } });
  }

  private async pollAll() {
    const flows = await this.prisma.flow.findMany({
      where: { status: 'active', metaFormId: { not: null } },
    });
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
        await this.prisma.automationLog.create({
          data: {
            flowId: flow.id,
            status: 'failed',
            message: `Meta poll failed: ${e?.message ?? e}`,
          },
        });
      }
    }
  }

  private async pollFlow(flow: any, s: any) {
    const pollStartUnix = Math.floor(Date.now() / 1000);
    // Subtract a 30s safety window from lastPolledAt so leads arriving at the
    // boundary aren't missed. Duplicates are filtered by the dedup check below.
    const since = flow.lastPolledAt
      ? Math.floor(new Date(flow.lastPolledAt).getTime() / 1000) - 30
      : pollStartUnix - 5 * 60;

    const fetched = await this.meta.listLeads(s, flow.metaFormId, since);
    let newCount = 0;
    let latestLeadAt: Date | null = null; // Meta-side created_time of newest new lead

    if (fetched.length > 0) {
      // Batch the dedup lookup: one query per poll instead of N.
      const ids = fetched.map((r) => r.id);
      const known = await this.prisma.lead.findMany({
        where: { flowId: flow.id, leadId: { in: ids } },
        select: { leadId: true },
      });
      const knownSet = new Set(known.map((k) => k.leadId));

      for (const raw of fetched) {
        if (knownSet.has(raw.id)) continue; // already processed

        const fields = this.meta.parseLeadFields(raw.field_data ?? []);
        const enrichedRaw = { ...raw, form_name: flow.metaFormName ?? null };

        const lead = await this.leads.upsertFromMeta({
          flowId: flow.id,
          leadId: raw.id,
          name: fields.name,
          phone: fields.phone,
          email: fields.email,
          rawData: enrichedRaw,
        });
        newCount++;
        // Track the newest Meta-side timestamp among new leads.
        if (raw.created_time) {
          const t = new Date(raw.created_time);
          if (!latestLeadAt || t > latestLeadAt) latestLeadAt = t;
        }
        await this.prisma.automationLog.create({
          data: {
            flowId: flow.id,
            status: 'info',
            message: `Lead ${raw.id} fetched from Meta`,
            payload: { fields } as any,
          },
        });
        await this.producer.enqueueSheet({ flowId: flow.id, leadDbId: lead.id });
      }
    }

    // Store actual poll time (NOT minus 30s) — the "since - 30s" overlap is
    // applied at read time in the line above. This makes the UI's "polled Xs
    // ago" reflect real elapsed time since the last cron tick.
    const heartbeat = new Date(pollStartUnix * 1000);
    await this.prisma.flow.update({
      where: { id: flow.id },
      data: { lastPolledAt: heartbeat },
    });

    this.rt.emit('flow:poll', {
      flowId: flow.id,
      lastPolledAt: heartbeat.toISOString(),
      newCount,
    });

    if (newCount > 0) {
      await this.bumpCounters(flow.id, latestLeadAt);
      this.log.log(`flow ${flow.id} ingested ${newCount} new lead(s)`);
    }
  }

  private async bumpCounters(flowId: string, latestLeadAt: Date | null) {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const today = await this.prisma.lead.count({
      where: { flowId, createdAt: { gte: startOfDay } },
    });
    const total = await this.prisma.lead.count({ where: { flowId } });
    // Use the Meta `created_time` of the newest lead — that's the "last lead"
    // moment from the user's perspective. Fall back to now() only if Meta
    // didn't return a timestamp (shouldn't happen).
    const stamp = latestLeadAt ?? now;
    await this.prisma.flow.update({
      where: { id: flowId },
      data: { totalLeads: total, todayLeads: today, lastSyncAt: stamp },
    });
    this.rt.emit('flow:lead', {
      flowId,
      totalLeads: total,
      todayLeads: today,
      lastSyncAt: stamp.toISOString(),
    });
  }
}
