export type FlowStatus = 'draft' | 'testing' | 'active' | 'failed';

export interface SettingsDTO {
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

export interface ValidationResult {
  meta: { ok: boolean; message?: string; pageName?: string };
  google: { ok: boolean; message?: string; email?: string; displayName?: string };
  wati: { ok: boolean; message?: string; templateCount?: number };
}

export interface MetaLeadForm {
  id: string;
  name: string;
  status?: string;
}

export interface WatiTemplate {
  id: string;
  templateId: string;
  name: string;
  language: string;
  status: string;
}

export interface FlowDTO {
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
  lastSyncAt: string | null;
  lastPolledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AutomationLogDTO {
  id: string;
  flowId: string;
  status: 'success' | 'failed' | 'info';
  message: string;
  payload?: unknown;
  createdAt: string;
}

export interface SocketEvents {
  'flow:status': { flowId: string; status: FlowStatus };
  'flow:lead': { flowId: string; totalLeads: number; todayLeads: number; lastSyncAt: string };
  'flow:poll': { flowId: string; lastPolledAt: string; newCount: number };
  'flow:log': AutomationLogDTO;
}
