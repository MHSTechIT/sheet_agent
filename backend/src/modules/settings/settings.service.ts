import { Injectable, NotFoundException } from '@nestjs/common';
import { decrypt, encrypt, maskSecret } from '@sheet-agent/crypto';
import type { SettingsDTO, ValidationResult } from '@sheet-agent/types';
import { InjectPrisma, Prisma as PrismaInstance } from '../../common/prisma';
import { Prisma } from '@prisma/client';
import { MetaService } from '../meta/meta.service';
import { GoogleService } from '../google/google.service';
import { WatiService } from '../wati/wati.service';

@Injectable()
export class SettingsService {
  constructor(
    @InjectPrisma() private readonly prisma: PrismaInstance,
    private readonly meta: MetaService,
    private readonly google: GoogleService,
    private readonly wati: WatiService,
  ) {}

  async getDecrypted(): Promise<SettingsDTO | null> {
    const row = await this.prisma.settings.findFirst();
    if (!row) return null;
    return {
      metaSystemToken: decrypt(row.metaSystemToken),
      metaAppId: row.metaAppId,
      metaAppSecret: decrypt(row.metaAppSecret),
      metaPageId: row.metaPageId,
      metaAdAccountId: row.metaAdAccountId,
      googleClientId: row.googleClientId,
      googleClientSecret: decrypt(row.googleClientSecret),
      googleRefreshToken: decrypt(row.googleRefreshToken),
      watiApiEndpoint: row.watiApiEndpoint,
      watiAccessToken: decrypt(row.watiAccessToken),
    };
  }

  async require(): Promise<SettingsDTO> {
    const s = await this.getDecrypted();
    if (!s) throw new NotFoundException('Settings not configured');
    return s;
  }

  async getMasked() {
    const s = await this.getDecrypted();
    if (!s) return null;
    return {
      metaSystemToken: maskSecret(s.metaSystemToken),
      metaAppId: s.metaAppId,
      metaAppSecret: maskSecret(s.metaAppSecret),
      metaPageId: s.metaPageId,
      metaAdAccountId: s.metaAdAccountId,
      googleClientId: s.googleClientId,
      googleClientSecret: maskSecret(s.googleClientSecret),
      googleRefreshToken: maskSecret(s.googleRefreshToken),
      watiApiEndpoint: s.watiApiEndpoint,
      watiAccessToken: maskSecret(s.watiAccessToken),
      hasSettings: true,
    };
  }

  async save(input: SettingsDTO): Promise<ValidationResult> {
    const data = {
      ...input,
      metaSystemToken: encrypt(input.metaSystemToken),
      metaAppSecret: encrypt(input.metaAppSecret),
      googleClientSecret: encrypt(input.googleClientSecret),
      googleRefreshToken: encrypt(input.googleRefreshToken),
      watiAccessToken: encrypt(input.watiAccessToken),
    };
    const existing = await this.prisma.settings.findFirst();
    if (existing) {
      await this.prisma.settings.update({ where: { id: existing.id }, data });
    } else {
      await this.prisma.settings.create({ data });
    }
    return this.validate();
  }

  /**
   * Seed the Settings table from environment variables on first boot.
   * If the table already has a row, this is a no-op. If the env is missing
   * required values, we leave the table empty so the user can fill the UI.
   * Returns true if a row was created.
   */
  async ensureSeedFromEnv(): Promise<boolean> {
    const existing = await this.prisma.settings.findFirst();
    if (existing) return false;

    const env = process.env;
    const dto: SettingsDTO = {
      metaSystemToken:    env.META_SYSTEM_TOKEN ?? '',
      metaAppId:          env.META_APP_ID ?? '',
      metaAppSecret:      env.META_APP_SECRET ?? '',
      metaPageId:         env.META_PAGE_ID ?? '',
      metaAdAccountId:    env.META_AD_ACCOUNT_ID ?? '',
      googleClientId:     env.GOOGLE_CLIENT_ID ?? '',
      googleClientSecret: env.GOOGLE_CLIENT_SECRET ?? '',
      googleRefreshToken: env.GOOGLE_REFRESH_TOKEN ?? '',
      watiApiEndpoint:    env.WATI_API_ENDPOINT ?? '',
      watiAccessToken:    env.WATI_ACCESS_TOKEN ?? '',
    };

    // Only seed if the bare minimum (Meta + Google) is present — otherwise
    // the row would be a half-populated stub and validate() would mislead.
    const minRequired = [
      dto.metaSystemToken, dto.metaAppId, dto.metaAppSecret, dto.metaPageId,
      dto.googleClientId, dto.googleClientSecret, dto.googleRefreshToken,
    ];
    if (minRequired.some((v) => !v)) return false;

    await this.prisma.settings.create({
      data: {
        ...dto,
        metaSystemToken:    encrypt(dto.metaSystemToken),
        metaAppSecret:      encrypt(dto.metaAppSecret),
        googleClientSecret: encrypt(dto.googleClientSecret),
        googleRefreshToken: encrypt(dto.googleRefreshToken),
        watiAccessToken:    encrypt(dto.watiAccessToken),
      },
    });
    // eslint-disable-next-line no-console
    console.log('[settings] seeded Settings row from environment variables');
    return true;
  }

  async validate(): Promise<ValidationResult> {
    const s = await this.require();
    const result: ValidationResult = {
      meta: { ok: false },
      google: { ok: false },
      wati: { ok: false },
    };

    try {
      await this.meta.validate(s.metaSystemToken);
      result.meta = { ok: true };
    } catch (e: any) {
      result.meta = { ok: false, message: e?.message ?? 'Meta validation failed' };
    }

    try {
      const info = await this.google.validate(s);
      result.google = { ok: true, ...info };
    } catch (e: any) {
      result.google = { ok: false, message: e?.message ?? 'Google validation failed' };
    }

    try {
      const templates = await this.wati.listTemplates(s);
      if (templates.length > 0) {
        // Single bulk upsert avoids 100 sequential Supabase round-trips.
        const now = new Date();
        const values: Prisma.Sql[] = templates.map(
          (t) =>
            Prisma.sql`(${`tmpl_${t.templateId}`}, ${t.templateId}, ${t.name}, ${t.language}, ${t.status}, ${now}, ${now})`,
        );
        await this.prisma.$executeRaw`
          INSERT INTO "Template" ("id", "templateId", "name", "language", "status", "createdAt", "updatedAt")
          VALUES ${Prisma.join(values)}
          ON CONFLICT ("templateId") DO UPDATE
          SET "name" = EXCLUDED."name",
              "language" = EXCLUDED."language",
              "status" = EXCLUDED."status",
              "updatedAt" = EXCLUDED."updatedAt"
        `;
      }
      result.wati = { ok: true, templateCount: templates.length };
    } catch (e: any) {
      result.wati = { ok: false, message: e?.message ?? 'WATI validation failed' };
    }

    return result;
  }
}
