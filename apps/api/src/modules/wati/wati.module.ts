import { Module } from '@nestjs/common';
import { WatiService } from './wati.service';

@Module({
  providers: [WatiService],
  exports: [WatiService],
})
export class WatiModule {}
