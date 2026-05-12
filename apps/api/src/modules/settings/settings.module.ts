import { Module } from '@nestjs/common';
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
export class SettingsModule {}
