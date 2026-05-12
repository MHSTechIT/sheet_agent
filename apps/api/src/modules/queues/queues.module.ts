import { forwardRef, Module } from '@nestjs/common';
import { MetaPollerService } from './meta-poller.service';
import { SettingsModule } from '../settings/settings.module';
import { MetaModule } from '../meta/meta.module';
import { GoogleModule } from '../google/google.module';
import { WatiModule } from '../wati/wati.module';
import { LeadsModule } from '../leads/leads.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { FlowsModule } from '../flows/flows.module';

@Module({
  imports: [
    SettingsModule,
    MetaModule,
    GoogleModule,
    WatiModule,
    LeadsModule,
    RealtimeModule,
    forwardRef(() => FlowsModule),
  ],
  providers: [MetaPollerService],
  exports: [MetaPollerService],
})
export class QueuesModule {}
