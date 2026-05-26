import { Injectable } from '@nestjs/common';
import { BossService } from './boss.service';
import { QUEUES } from './queues.constants';

const DEFAULTS = {
  retryLimit: 3,
  retryBackoff: true,
  retryDelay: 2,
  expireInHours: 1,
};

@Injectable()
export class QueueProducer {
  constructor(private readonly boss: BossService) {}

  enqueueLead(payload: { leadId: string; formId: string }) {
    return this.boss.boss.send(QUEUES.LEAD, payload, {
      ...DEFAULTS,
      singletonKey: `lead:${payload.leadId}`,
    });
  }

  enqueueSheet(payload: { flowId: string; leadDbId: string }) {
    return this.boss.boss.send(QUEUES.SHEET, payload, {
      ...DEFAULTS,
      singletonKey: `sheet:${payload.leadDbId}`,
    });
  }

  enqueueWati(payload: { flowId: string; leadDbId: string }) {
    return this.boss.boss.send(QUEUES.WATI, payload, {
      ...DEFAULTS,
      singletonKey: `wati:${payload.leadDbId}`,
    });
  }
}
