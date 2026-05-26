import { Module, OnModuleInit } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { SettingsController } from './settings.controller';
import { MetaModule } from '../meta/meta.module';
import { GoogleModule } from '../google/google.module';
import { WatiModule } from '../wati/wati.module';

@Module({
  imports: [MetaModule, GoogleModule, WatiModule],
  providers: [SettingsService],
  controllers: [SettingsController],
  exports: [SettingsService],
})
export class SettingsModule implements OnModuleInit {
  constructor(private readonly settings: SettingsService) {}

  async onModuleInit() {
    // First-boot convenience: if Settings is empty and env vars are populated
    // (META_*, GOOGLE_*, WATI_*), copy them into the encrypted DB row so the
    // user doesn't have to paste them into the UI.
    try {
      await this.settings.ensureSeedFromEnv();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[settings] env seed failed (non-fatal):', (e as Error).message);
    }
  }
}
