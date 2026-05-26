import 'reflect-metadata';
// Load .env files BEFORE anything else (CORS, JWT, integrations all read process.env eagerly).
// We don't depend on `dotenv` directly — a tiny inline parser keeps the dep tree small.
// Order: backend/.env wins, then repo-root .env. Existing process.env values are not overridden.
import { existsSync, readFileSync } from 'node:fs';
import { resolve as pathResolve } from 'node:path';
function loadEnvFile(path: string) {
  if (!existsSync(path)) return;
  for (const raw of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = raw.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
    if (!m) continue;
    let val = m[2];
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[m[1]] === undefined) process.env[m[1]] = val;
  }
}
loadEnvFile(pathResolve(__dirname, '..', '.env'));
loadEnvFile(pathResolve(__dirname, '..', '..', '.env'));
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { TelegramExceptionFilter } from './modules/telegram/telegram.filter';
import { TelegramService } from './modules/telegram/telegram.service';

/**
 * Install crash handlers BEFORE Nest boots so even bootstrap-time errors get
 * surfaced to Telegram. The handlers don't exit the process — we let it keep
 * running so a single rogue async error can't tear down the cron poller.
 */
function installCrashHandlers(telegram?: TelegramService) {
  const notify = (title: string, err: any) => {
    const msg = err?.stack || err?.message || String(err);
    // eslint-disable-next-line no-console
    console.error(`[${title}]`, msg);
    if (telegram) {
      telegram
        .sendError(title, err?.message ?? String(err), err?.stack)
        .catch(() => {});
    }
  };
  process.on('uncaughtException', (err) => notify('uncaughtException', err));
  process.on('unhandledRejection', (reason) => notify('unhandledRejection', reason as any));
}

async function bootstrap() {
  installCrashHandlers(); // first-pass without Telegram, in case bootstrap fails
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

  // Re-install handlers with a live TelegramService so we can DM the crash.
  installCrashHandlers(app.get(TelegramService));

  const port = Number(process.env.API_PORT ?? 4000);
  await app.listen(port, process.env.API_HOST ?? '0.0.0.0');
  // eslint-disable-next-line no-console
  console.log(`[api] listening on http://localhost:${port}`);
}

bootstrap().catch((e) => {
  // eslint-disable-next-line no-console
  console.error('[bootstrap-fatal]', e);
  process.exit(1);
});
