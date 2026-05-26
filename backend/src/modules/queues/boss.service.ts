import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import PgBoss from 'pg-boss';
import { QUEUES } from './queues.constants';

@Injectable()
export class BossService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('PgBoss');
  public boss!: PgBoss;

  async onModuleInit() {
    const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
    if (!url) throw new Error('DIRECT_URL or DATABASE_URL must be set for pg-boss');

    this.boss = new PgBoss({
      connectionString: url,
      ssl: { rejectUnauthorized: false },
      schema: 'pgboss',
      archiveCompletedAfterSeconds: 24 * 60 * 60,
      deleteAfterDays: 7,
    });

    this.boss.on('error', (e) => this.log.error(e?.message ?? String(e)));

    // Retry pg-boss start with exponential backoff so a transient Supabase
    // outage at boot doesn't take the whole API down.
    let attempt = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        await this.boss.start();
        break;
      } catch (e: any) {
        attempt++;
        const delay = Math.min(30_000, 1_000 * Math.pow(2, attempt));
        this.log.warn(
          `pg-boss start failed (attempt ${attempt}): ${e?.message ?? e}; retrying in ${delay}ms`,
        );
        if (attempt >= 10) {
          this.log.error('pg-boss could not start after 10 attempts; giving up');
          throw e;
        }
        await new Promise((r) => setTimeout(r, delay));
      }
    }

    for (const name of Object.values(QUEUES)) {
      try {
        await this.boss.createQueue(name);
      } catch (e: any) {
        if (!/already exists/i.test(e?.message ?? ''))
          this.log.warn(`createQueue ${name}: ${e?.message}`);
      }
    }
    this.log.log('pg-boss started, queues created');
  }

  async onModuleDestroy() {
    try {
      await this.boss?.stop({ graceful: true, close: true } as any);
    } catch {
      // ignore
    }
  }
}
