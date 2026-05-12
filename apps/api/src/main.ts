import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { TelegramExceptionFilter } from './modules/telegram/telegram.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });

  app.use(helmet({ crossOriginResourcePolicy: false }));
  app.enableCors({
    origin: (process.env.WEB_ORIGIN ?? 'http://localhost:3000').split(','),
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );
  app.useWebSocketAdapter(new IoAdapter(app));
  app.useGlobalFilters(app.get(TelegramExceptionFilter));

  const port = Number(process.env.API_PORT ?? 4000);
  await app.listen(port, process.env.API_HOST ?? '0.0.0.0');
  // eslint-disable-next-line no-console
  console.log(`[api] listening on http://localhost:${port}`);
}

bootstrap();
