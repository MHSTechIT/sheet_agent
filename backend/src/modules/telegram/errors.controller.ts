import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import { Throttle } from '@nestjs/throttler';
import { TelegramService } from './telegram.service';

class ReportErrorDto {
  @IsString() message!: string;
  @IsOptional() @IsString() source?: string;
  @IsOptional() @IsString() stack?: string;
  @IsOptional() @IsString() url?: string;
}

/** Frontend posts captured errors here; we forward to Telegram. No auth — it's
 *  trivially abusable but the throttler + dedup limit damage. */
@Controller('errors')
export class ErrorsController {
  constructor(private readonly telegram: TelegramService) {}

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @HttpCode(204)
  @Post()
  async report(@Body() body: ReportErrorDto) {
    const title = `Frontend error${body.source ? ` · ${body.source}` : ''}`;
    const detail = body.url ? `${body.message}\n@ ${body.url}` : body.message;
    await this.telegram.sendError(title, detail, body.stack);
  }
}
