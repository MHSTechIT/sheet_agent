import { Global, Module } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { TelegramExceptionFilter } from './telegram.filter';
import { ErrorsController } from './errors.controller';

@Global()
@Module({
  providers: [TelegramService, TelegramExceptionFilter],
  controllers: [ErrorsController],
  exports: [TelegramService, TelegramExceptionFilter],
})
export class TelegramModule {}
