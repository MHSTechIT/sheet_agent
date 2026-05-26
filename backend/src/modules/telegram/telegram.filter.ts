import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { TelegramService } from './telegram.service';

@Injectable()
@Catch()
export class TelegramExceptionFilter implements ExceptionFilter {
  private readonly log = new Logger('TelegramExceptionFilter');

  constructor(private readonly telegram: TelegramService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const req: any = ctx.getRequest();
    const res: any = ctx.getResponse();

    const isHttp = exception instanceof HttpException;
    const status = isHttp ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const message = isHttp
      ? (exception.getResponse() as any)?.message ?? exception.message
      : (exception as any)?.message ?? String(exception);
    const stack = (exception as any)?.stack;

    // Only alert on real problems — skip auth challenges and validation errors.
    if (status >= 500 || status === 0) {
      const title = `API ${status} on ${req?.method ?? '?'} ${req?.url ?? ''}`;
      this.telegram
        .sendError(title, Array.isArray(message) ? message.join('\n') : String(message), stack)
        .catch(() => {});
      this.log.error(`${title}: ${message}`);
    }

    if (!res.headersSent) {
      res.status(status).json({
        statusCode: status,
        message,
        error: isHttp ? exception.name : 'InternalServerError',
      });
    }
  }
}
