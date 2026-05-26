import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { BossService } from '../boss.service';
import { QUEUES } from '../queues.constants';
import { SettingsService } from '../../settings/settings.service';
import { WatiService } from '../../wati/wati.service';
import { LeadsService } from '../../leads/leads.service';
import { InjectPrisma, Prisma } from '../../../common/prisma';

interface WatiJob {
  flowId: string;
  leadDbId: string;
}

@Injectable()
export class WatiSendProcessor implements OnModuleInit {
  private readonly log = new Logger(WatiSendProcessor.name);

  constructor(
    private readonly bossSvc: BossService,
    private readonly settings: SettingsService,
    private readonly wati: WatiService,
    private readonly leads: LeadsService,
    @InjectPrisma() private readonly prisma: Prisma,
  ) {}

  async onModuleInit() {
    await this.bossSvc.boss.work<WatiJob>(
      QUEUES.WATI,
      { batchSize: 3 },
      async (jobs) => {
        for (const job of jobs) await this.handle(job.data);
      },
    );
  }

  private async handle({ flowId, leadDbId }: WatiJob) {
    const flow = await this.prisma.flow.findUnique({ where: { id: flowId } });
    const lead = await this.prisma.lead.findUnique({ where: { id: leadDbId } });
    if (!flow || !lead) throw new Error('flow or lead missing');
    if (!flow.templateName) throw new Error('Flow has no template');
    if (!lead.phone) {
      await this.leads.markSynced(lead.id, 'wati_skipped_no_phone');
      await this.prisma.automationLog.create({
        data: { flowId, status: 'failed', message: `Lead ${lead.leadId} has no phone` },
      });
      return { skipped: true };
    }

    const s = await this.settings.require();
    await this.wati.sendTemplate(s, { phone: lead.phone, templateName: flow.templateName });
    await this.leads.markSynced(lead.id, 'done');
    await this.prisma.automationLog.create({
      data: {
        flowId,
        status: 'success',
        message: `WATI template '${flow.templateName}' sent to ${lead.phone}`,
      },
    });
    return { ok: true };
  }
}
