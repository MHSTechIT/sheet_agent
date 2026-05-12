import { Inject, Injectable } from '@nestjs/common';
import { FileStore } from '../../common/file-store';
import { LeadIdsByFlow } from '../../common/entities';
import { LEAD_IDS_STORE } from '../../common/storage.module';

interface LeadCore {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  rawData: unknown;
}

@Injectable()
export class LeadsService {
  /** In-memory mirror of lead-ids.json for fast O(1) dedup checks. */
  private dedup: Map<string, Set<string>> = new Map();
  private loaded = false;

  constructor(
    @Inject(LEAD_IDS_STORE) private readonly store: FileStore<LeadIdsByFlow>,
  ) {}

  private async ensureLoaded() {
    if (this.loaded) return;
    const data = await this.store.read();
    for (const [flowId, ids] of Object.entries(data)) {
      this.dedup.set(flowId, new Set(ids));
    }
    this.loaded = true;
  }

  /** Returns true if this leadId has already been processed for this flow. */
  async isProcessed(flowId: string, leadId: string): Promise<boolean> {
    await this.ensureLoaded();
    return this.dedup.get(flowId)?.has(leadId) ?? false;
  }

  /** Marks a lead as processed and persists to disk. */
  async markProcessed(flowId: string, leadId: string): Promise<void> {
    await this.ensureLoaded();
    let set = this.dedup.get(flowId);
    if (!set) {
      set = new Set();
      this.dedup.set(flowId, set);
    }
    if (set.has(leadId)) return;
    set.add(leadId);
    await this.store.update((cur) => ({
      ...cur,
      [flowId]: Array.from(set!),
    }));
  }

  /** Counts processed leads for a flow. */
  async count(flowId: string): Promise<number> {
    await this.ensureLoaded();
    return this.dedup.get(flowId)?.size ?? 0;
  }

  /** Removes a flow's dedup data (called on flow delete). */
  async forgetFlow(flowId: string): Promise<void> {
    await this.ensureLoaded();
    this.dedup.delete(flowId);
    await this.store.update((cur) => {
      const next = { ...cur };
      delete next[flowId];
      return next;
    });
  }

  /** Maps a lead onto sheet header columns by matching common header names. */
  buildSheetRow(headers: string[], lead: LeadCore): (string | null)[] {
    const raw = (lead.rawData ?? {}) as any;
    const fd = (raw.field_data ?? []) as { name: string; values: string[] }[];

    // Normalize a name to its comparison key: lowercase, trimmed, with leading
    // and trailing whitespace / underscores stripped.
    const norm = (s: string) =>
      s.toLowerCase().trim().replace(/^[_\s]+|[_\s]+$/g, '');

    const fieldMap = new Map<string, string>();
    for (const f of fd) {
      if (f.name && f.values?.[0] != null) {
        fieldMap.set(norm(f.name), String(f.values[0]));
      }
    }

    const topLevel: Record<string, () => string | null> = {
      id: () => raw.id ?? null,
      lead_id: () => raw.id ?? null,
      leadid: () => raw.id ?? null,
      created_time: () => raw.created_time ?? null,
      'created time': () => raw.created_time ?? null,
      createdtime: () => raw.created_time ?? null,
      created_at: () => raw.created_time ?? new Date().toISOString(),
      createdat: () => raw.created_time ?? new Date().toISOString(),
      date: () => raw.created_time ?? new Date().toISOString(),
      timestamp: () => raw.created_time ?? new Date().toISOString(),
      ad_id: () => raw.ad_id ?? null,
      adid: () => raw.ad_id ?? null,
      ad_name: () => raw.ad_name ?? null,
      adname: () => raw.ad_name ?? null,
      adset_id: () => raw.adset_id ?? null,
      adsetid: () => raw.adset_id ?? null,
      adset_name: () => raw.adset_name ?? null,
      adsetname: () => raw.adset_name ?? null,
      campaign_id: () => raw.campaign_id ?? null,
      campaignid: () => raw.campaign_id ?? null,
      campaign_name: () => raw.campaign_name ?? null,
      campaignname: () => raw.campaign_name ?? null,
      form_id: () => raw.form_id ?? null,
      formid: () => raw.form_id ?? null,
      form_name: () => raw.form_name ?? null,
      formname: () => raw.form_name ?? null,
      is_organic: () => (raw.is_organic == null ? null : String(raw.is_organic)),
      isorganic: () => (raw.is_organic == null ? null : String(raw.is_organic)),
      platform: () => raw.platform ?? null,
    };

    const parsed: Record<string, () => string | null> = {
      name: () => lead.name ?? null,
      'full name': () => lead.name ?? null,
      full_name: () => lead.name ?? null,
      fullname: () => lead.name ?? null,
      first_name: () => lead.name ?? null,
      'first name': () => lead.name ?? null,
      firstname: () => lead.name ?? null,
      last_name: () => lead.name ?? null,
      'last name': () => lead.name ?? null,
      phone: () => lead.phone ?? null,
      'phone number': () => lead.phone ?? null,
      phone_number: () => lead.phone ?? null,
      phonenumber: () => lead.phone ?? null,
      mobile: () => lead.phone ?? null,
      'mobile number': () => lead.phone ?? null,
      mobile_number: () => lead.phone ?? null,
      whatsapp: () => lead.phone ?? null,
      whatsapp_number: () => lead.phone ?? null,
      email: () => lead.email ?? null,
      'e-mail': () => lead.email ?? null,
      'email address': () => lead.email ?? null,
      email_address: () => lead.email ?? null,
    };

    return headers.map((h) => {
      const k = h.trim().toLowerCase();
      const nk = norm(h);
      if (parsed[k]) return parsed[k]();
      if (topLevel[k]) return topLevel[k]();
      if (fieldMap.has(nk)) return fieldMap.get(nk)!;
      for (const [fieldKey, val] of fieldMap) {
        if (fieldKey.includes(nk) || nk.includes(fieldKey)) return val;
      }
      return null;
    });
  }
}
