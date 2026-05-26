import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { resolve } from 'node:path';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD } from '@nestjs/core';

import { PrismaModule } from './common/prisma.module';
import { TelegramModule } from './modules/telegram/telegram.module';
import { AuthModule } from './modules/auth/auth.module';
import { SettingsModule } from './modules/settings/settings.module';
import { MetaModule } from './modules/meta/meta.module';
import { GoogleModule } from './modules/google/google.module';
import { WatiModule } from './modules/wati/wati.module';
import { TemplatesModule } from './modules/templates/templates.module';
import { FlowsModule } from './modules/flows/flows.module';
import { LeadsModule } from './modules/leads/leads.module';
import { QueuesModule } from './modules/queues/queues.module';
import { RealtimeModule } from './modules/realtime/realtime.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        resolve(process.cwd(), '.env'),
        resolve(process.cwd(), '../.env'),
        resolve(process.cwd(), '../../.env'),
      ],
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    ScheduleModule.forRoot(),
    PrismaModule,
    TelegramModule,
    RealtimeModule,
    AuthModule,
    SettingsModule,
    MetaModule,
    GoogleModule,
    WatiModule,
    TemplatesModule,
    FlowsModule,
    LeadsModule,
    QueuesModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
