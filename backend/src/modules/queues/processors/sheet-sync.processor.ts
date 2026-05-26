import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { BossService } from '../boss.service';
import { QUEUES } from '../queues.constants';
import { SettingsService } from '../../settings/settings.service';
import { GoogleService } from '../../google/google.service';
import { LeadsService } from '../../leads/leads.service';
import { QueueProducer } from '../queue.producer';
import { InjectPrisma, Prisma } from '../../../common/prisma';

interface SheetJob {
  flowId: string;
  leadDbId: string;
}

@Injectable()
export class SheetSyncProcessor implements OnModuleInit {
  private readonly log = new Logger(SheetSyncProcessor.name);

  constructor(
    private readonly bossSvc: BossService,
    private readonly settings: SettingsService,
    private readonly google: GoogleService,
    private readonly leads: LeadsService,
    private readonly producer: QueueProducer,
    @InjectPrisma() private readonly prisma: Prisma,
  ) {}

  async onModuleInit() {
    await this.bossSvc.boss.work<SheetJob>(
      QUEUES.SHEET,
      { batchSize: 3 },
      async (jobs) => {
        for (const job of jobs) await this.handle(job.data);
      },
    );
  }

  private async handle({ flowId, leadDbId }: SheetJob) {
    const flow = await this.prisma.flow.findUnique({ where: { id: flowId } });
    const lead = await this.prisma.lead.findUnique({ where: { id: leadDbId } });
    if (!flow || !lead) throw new Error('flow or lead missing');
    if (!flow.googleSheetId) throw new Error('Flow has no sheet configured');

    const s = await this.settings.require();
    const headers = (flow.sheetHeaders as string[]) ?? ['Name', 'Phone', 'Email'];
    const row = this.leads.buildSheetRow(headers, {
      name: lead.name,
      phone: lead.phone,
      email: lead.email,
      rawData: lead.rawData,
    });

    await this.google.appendRow(s, flow.googleSheetId, row);
    await this.prisma.automationLog.create({
      data: { flowId, status: 'success', message: `Sheet row appended for lead ${lead.leadId}` },
    });

    if (flow.templateName) {
      await this.leads.markSynced(lead.id, 'sheet_ok');
      await this.producer.enqueueWati({ flowId, leadDbId });
    } else {
      await this.leads.markSynced(lead.id, 'done');
    }
    return { ok: true };
  }
}
