import { Global, Module } from '@nestjs/common';
import { AppendLog, FileStore } from './file-store';
import type { FlowEntity, LeadIdsByFlow, TemplateEntity } from './entities';

export const FLOWS_STORE = Symbol('FLOWS_STORE');
export const TEMPLATES_STORE = Symbol('TEMPLATES_STORE');
export const LEAD_IDS_STORE = Symbol('LEAD_IDS_STORE');
export const AUTOMATION_LOG = Symbol('AUTOMATION_LOG');

@Global()
@Module({
  providers: [
    {
      provide: FLOWS_STORE,
      useFactory: () => new FileStore<FlowEntity[]>('flows.json', []),
    },
    {
      provide: TEMPLATES_STORE,
      useFactory: () => new FileStore<TemplateEntity[]>('templates.json', []),
    },
    {
      provide: LEAD_IDS_STORE,
      useFactory: () => new FileStore<LeadIdsByFlow>('lead-ids.json', {}),
    },
    {
      provide: AUTOMATION_LOG,
      useFactory: () => new AppendLog('automation.log'),
    },
  ],
  exports: [FLOWS_STORE, TEMPLATES_STORE, LEAD_IDS_STORE, AUTOMATION_LOG],
})
export class StorageModule {}
