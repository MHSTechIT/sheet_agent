import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { MetaLeadForm, SettingsDTO } from '@sheet-agent/types';

const GRAPH = 'https://graph.facebook.com/v21.0';

@Injectable()
export class MetaService {
  private readonly log = new Logger(MetaService.name);

  async validate(token: string): Promise<void> {
    // /me works for both User Access Tokens and Page Access Tokens.
    const r = await axios.get(`${GRAPH}/me`, {
      params: { access_token: token, fields: 'id,name' },
      validateStatus: () => true,
    });
    if (r.status !== 200 || r.data?.error) {
      throw new Error(r.data?.error?.message ?? `Meta token invalid (HTTP ${r.status})`);
    }
  }

  /**
   * Returns the questions configured on a Meta lead form. The `key` of each
   * question matches the `name` field that comes back in `field_data` on
   * every lead — so if the user uses these keys as sheet column headers,
   * every column will fill 1:1 with no fuzzy matching.
   */
  async getFormQuestions(
    s: SettingsDTO,
    formId: string,
  ): Promise<{ key: string; label: string; type?: string }[]> {
    const r = await axios.get(`${GRAPH}/${formId}`, {
      params: { access_token: s.metaSystemToken, fields: 'questions{key,label,type}' },
      validateStatus: () => true,
    });
    if (r.status !== 200 || r.data?.error) {
      throw new Error(r.data?.error?.message ?? `Meta getFormQuestions HTTP ${r.status}`);
    }
    return (r.data?.questions ?? []).map((q: any) => ({
      key: String(q.key ?? ''),
      label: String(q.label ?? q.key ?? ''),
      type: q.type ? String(q.type) : undefined,
    }));
  }

  async listLeadForms(s: SettingsDTO): Promise<MetaLeadForm[]> {
    const forms: MetaLeadForm[] = [];
    let url: string | null = `${GRAPH}/${s.metaPageId}/leadgen_forms`;
    let params: Record<string, string> | undefined = {
      access_token: s.metaSystemToken,
      fields: 'id,name,status',
      limit: '50',
    };
    while (url) {
      const r: any = await axios.get(url, { params });
      for (const f of r.data?.data ?? []) {
        forms.push({ id: f.id, name: f.name, status: f.status });
      }
      url = r.data?.paging?.next ?? null;
      params = undefined; // next URL already has params
    }
    return forms;
  }

  /**
   * Polls Meta for leads on a form created after `since` (unix seconds, exclusive).
   * Returns leads in chronological order. Handles pagination.
   */
  async listLeads(
    s: SettingsDTO,
    formId: string,
    sinceUnixSeconds?: number,
  ): Promise<{
    id: string;
    created_time: string;
    field_data: { name: string; values: string[] }[];
  }[]> {
    const out: any[] = [];
    let url: string | null = `${GRAPH}/${formId}/leads`;
    let params: Record<string, string> | undefined = {
      access_token: s.metaSystemToken,
      fields:
        'id,created_time,field_data,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,form_id,is_organic,platform',
      limit: '50',
    };
    if (sinceUnixSeconds && Number.isFinite(sinceUnixSeconds)) {
      params!.filtering = JSON.stringify([
        { field: 'time_created', operator: 'GREATER_THAN', value: sinceUnixSeconds },
      ]);
    }
    while (url) {
      const r: any = await axios.get(url, { params, validateStatus: () => true });
      if (r.status !== 200 || r.data?.error) {
        throw new Error(r.data?.error?.message ?? `Meta listLeads HTTP ${r.status}`);
      }
      for (const lead of r.data?.data ?? []) out.push(lead);
      url = r.data?.paging?.next ?? null;
      params = undefined;
    }
    // Meta returns newest first; flip so we process oldest -> newest.
    return out.reverse();
  }

  async getLead(s: SettingsDTO, leadId: string): Promise<{
    id: string;
    field_data: { name: string; values: string[] }[];
    created_time?: string;
    form_id?: string;
  }> {
    const r = await axios.get(`${GRAPH}/${leadId}`, {
      params: { access_token: s.metaSystemToken },
    });
    return r.data;
  }

  /** Subscribes the configured page to the leadgen event. */
  async subscribePageToLeadgen(s: SettingsDTO): Promise<void> {
    const r = await axios.post(
      `${GRAPH}/${s.metaPageId}/subscribed_apps`,
      null,
      {
        params: {
          access_token: s.metaSystemToken,
          subscribed_fields: 'leadgen',
        },
        validateStatus: () => true,
      },
    );
    if (r.status >= 300 || r.data?.error) {
      throw new Error(
        r.data?.error?.message ?? `Failed to subscribe page (HTTP ${r.status})`,
      );
    }
  }

  /** Verifies x-hub-signature-256 header against the raw body using metaAppSecret. */
  verifySignature(appSecret: string, rawBody: Buffer, signature: string | undefined): boolean {
    if (!signature || !signature.startsWith('sha256=')) return false;
    const expected = createHmac('sha256', appSecret).update(rawBody).digest('hex');
    const provided = signature.slice('sha256='.length);
    try {
      return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(provided, 'hex'));
    } catch {
      return false;
    }
  }

  parseLeadFields(fd: { name: string; values: string[] }[]) {
    // Try exact matches first (fast path), then fall back to fuzzy "any field
    // whose name contains this word" matching. Handles Meta field names like
    // "Name (பெயர்)", "First Name", "Mobile Number", "Email Address" etc.
    const get = (exact: string[], contains: string[]) => {
      for (const k of exact) {
        const f = fd.find((x) => x.name?.toLowerCase().trim() === k);
        if (f?.values?.[0]) return f.values[0];
      }
      for (const word of contains) {
        const f = fd.find((x) => x.name?.toLowerCase().includes(word));
        if (f?.values?.[0]) return f.values[0];
      }
      return null;
    };
    return {
      name: get(
        ['full_name', 'name', 'first_name', 'full name', 'first name'],
        ['name'],
      ),
      phone: get(
        ['phone_number', 'phone', 'mobile', 'mobile_number', 'whatsapp_number'],
        ['phone', 'mobile', 'whatsapp'],
      ),
      email: get(['email', 'email_address', 'e-mail'], ['email', 'e-mail']),
    };
  }
}
