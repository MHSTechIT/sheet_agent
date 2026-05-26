import { forwardRef, Module } from '@nestjs/common';
import { BossService } from './boss.service';
import { QueueProducer } from './queue.producer';
import { MetaPollerService } from './meta-poller.service';
import { SheetSyncProcessor } from './processors/sheet-sync.processor';
import { WatiSendProcessor } from './processors/wati-send.processor';
import { SettingsModule } from '../settings/settings.module';
import { MetaModule } from '../meta/meta.module';
import { GoogleModule } from '../google/google.module';
import { WatiModule } from '../wati/wati.module';
import { LeadsModule } from '../leads/leads.module';
import { RealtimeModule } from '../realtime/realtime.module';

export { QUEUES } from './queues.constants';

@Module({
  imports: [
    SettingsModule,
    MetaModule,
    GoogleModule,
    WatiModule,
    LeadsModule,
    RealtimeModule,
  ],
  providers: [
    BossService,
    QueueProducer,
    MetaPollerService,
    SheetSyncProcessor,
    WatiSendProcessor,
  ],
  exports: [QueueProducer, BossService, MetaPollerService],
})
export class QueuesModule {}
