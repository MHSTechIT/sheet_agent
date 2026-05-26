import { Module, forwardRef } from '@nestjs/common';
import { FlowsService } from './flows.service';
import { FlowsController } from './flows.controller';
import { SettingsModule } from '../settings/settings.module';
import { MetaModule } from '../meta/meta.module';
import { GoogleModule } from '../google/google.module';
import { WatiModule } from '../wati/wati.module';
import { LeadsModule } from '../leads/leads.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { QueuesModule } from '../queues/queues.module';

@Module({
  imports: [
    SettingsModule,
    MetaModule,
    GoogleModule,
    WatiModule,
    LeadsModule,
    RealtimeModule,
    forwardRef(() => QueuesModule),
  ],
  providers: [FlowsService],
  controllers: [FlowsController],
  exports: [FlowsService],
})
export class FlowsModule {}
