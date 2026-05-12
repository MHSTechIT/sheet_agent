import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { SettingsDTO, ValidationResult } from '@sheet-agent/types';
import { FileStore } from '../../common/file-store';
import { TemplateEntity } from '../../common/entities';
import { TEMPLATES_STORE } from '../../common/storage.module';
import { MetaService } from '../meta/meta.service';
import { GoogleService } from '../google/google.service';
import { WatiService } from '../wati/wati.service';

/**
 * All integration credentials are read directly from process.env. No UI or
 * disk file is involved — to change credentials, edit `.env` and restart.
 */
@Injectable()
export class SettingsService {
  constructor(
    @Inject(TEMPLATES_STORE) private readonly templatesStore: FileStore<TemplateEntity[]>,
    private readonly meta: MetaService,
    private readonly google: GoogleService,
    private readonly wati: WatiService,
  ) {}

  /** Returns the credentials assembled from env, or null if none are set. */
  async getDecrypted(): Promise<SettingsDTO | null> {
    const s: SettingsDTO = {
      metaSystemToken: process.env.META_SYSTEM_TOKEN ?? '',
      metaAppId: process.env.META_APP_ID ?? '',
      metaAppSecret: process.env.META_APP_SECRET ?? '',
      metaPageId: process.env.META_PAGE_ID ?? '',
      metaAdAccountId: process.env.META_AD_ACCOUNT_ID ?? '',
      googleClientId: process.env.GOOGLE_CLIENT_ID ?? '',
      googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      googleRefreshToken: process.env.GOOGLE_REFRESH_TOKEN ?? '',
      watiApiEndpoint: process.env.WATI_API_ENDPOINT ?? '',
      watiAccessToken: process.env.WATI_ACCESS_TOKEN ?? '',
    };
    // If nothing is configured, return null so callers can give a clear error.
    if (!s.metaSystemToken && !s.googleClientId && !s.watiApiEndpoint) return null;
    return s;
  }

  async require(): Promise<SettingsDTO> {
    const s = await this.getDecrypted();
    if (!s) {
      throw new NotFoundException(
        'Credentials are not configured. Set META_/GOOGLE_/WATI_ variables in .env and restart.',
      );
    }
    return s;
  }

  /** Quick boolean for endpoints that need to know whether env is populated. */
  async getMasked() {
    const s = await this.getDecrypted();
    if (!s) return { hasSettings: false };
    return { hasSettings: true };
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
      const now = new Date().toISOString();
      const persist: TemplateEntity[] = templates.map((t) => ({
        id: t.id,
        templateId: t.templateId,
        name: t.name,
        language: t.language,
        status: t.status,
        updatedAt: now,
      }));
      await this.templatesStore.write(persist);
      result.wati = { ok: true, templateCount: templates.length };
    } catch (e: any) {
      result.wati = { ok: false, message: e?.message ?? 'WATI validation failed' };
    }

    return result;
  }
}
