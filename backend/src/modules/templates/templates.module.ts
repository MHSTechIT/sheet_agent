import { Module } from '@nestjs/common';
import { TemplatesController } from './templates.controller';
import { SettingsModule } from '../settings/settings.module';
import { WatiModule } from '../wati/wati.module';

@Module({
  imports: [SettingsModule, WatiModule],
  controllers: [TemplatesController],
})
export class TemplatesModule {}
