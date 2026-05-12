import type { FlowStatus, SettingsDTO } from '@sheet-agent/types';

/** A flow record (configuration of one automation pipeline). */
export interface FlowEntity {
  id: string;
  metaFormId: string | null;
  metaFormName: string | null;
  sheetUrl: string | null;
  googleSheetId: string | null;
  sheetHeaders: string[] | null;
  templateId: string | null;
  templateName: string | null;
  status: FlowStatus;
  totalLeads: number;
  todayLeads: number;
  todayLeadsResetAt: string | null; // date (YYYY-MM-DD) of the last counter rollover
  lastSyncAt: string | null;
  lastPolledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Cached WATI template. */
export interface TemplateEntity {
  id: string;
  templateId: string;
  name: string;
  language: string;
  status: string;
  updatedAt: string;
}

/** Encrypted settings on disk. Decrypted in memory by SettingsService. */
export interface SettingsOnDisk {
  metaSystemToken: string;
  metaAppId: string;
  metaAppSecret: string;
  metaPageId: string;
  metaAdAccountId: string;
  googleClientId: string;
  googleClientSecret: string;
  googleRefreshToken: string;
  watiApiEndpoint: string;
  watiAccessToken: string;
}

/** Per-flow lead-id set (used for dedup). Map from flowId → list of leadIds. */
export type LeadIdsByFlow = Record<string, string[]>;

/** Decrypted settings shape (same as SettingsDTO, re-exported for clarity). */
export type Settings = SettingsDTO;
