import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { MetaLeadForm, SettingsDTO } from '@sheet-agent/types';

const GRAPH = 'https://graph.facebook.com/v21.0';
// Hard ceiling on Meta API calls so a hung connection can't freeze the cron.
const META_TIMEOUT_MS = 15_000;

@Injectable()
export class MetaService {
  private readonly log = new Logger(MetaService.name);

  /**
   * Per-form token cache. Many of our reads (questions, leads, single lead)
   * are scoped to one form id, but Meta tokens are scoped to specific Pages.
   * In multi-account setups a form belongs to one Page that only a subset of
   * tokens can read. We discover which token works on first access and cache
   * it so subsequent calls go straight to the right token.
   */
  private readonly formTokenCache = new Map<string, string>();

  /** Ordered list of candidate tokens to try for a form whose owning token
   *  isn't known: s.metaSystemToken first, then META_ACCESS_TOKEN, then every
   *  per-account override. Duplicates removed. */
  private candidateTokens(s: SettingsDTO): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    const add = (t: string | undefined | null) => {
      if (t && !seen.has(t)) { out.push(t); seen.add(t); }
    };
    add(s.metaSystemToken);
    add(process.env.META_ACCESS_TOKEN);
    const accounts = (process.env.META_AD_ACCOUNTS ?? '')
      .split(',').map((x) => x.trim()).filter(Boolean);
    for (const id of accounts) add(process.env[`META_ACCESS_TOKEN_${id}`]);
    return out;
  }

  /** Run `fn(token)` against the cached token for `formId` first; on failure,
   *  walk every candidate token and cache whichever works. */
  private async withFormToken<T>(
    s: SettingsDTO,
    formId: string,
    fn: (token: string) => Promise<T>,
  ): Promise<T> {
    const cached = this.formTokenCache.get(formId);
    if (cached) {
      try { return await fn(cached); }
      catch (e: any) {
        this.log.warn(`cached token for form ${formId} failed: ${e?.message}`);
        this.formTokenCache.delete(formId);
        // fall through to discovery
      }
    }
    const candidates = this.candidateTokens(s).filter((t) => t !== cached);
    let lastErr: any;
    for (const tok of candidates) {
      try {
        const result = await fn(tok);
        this.formTokenCache.set(formId, tok);
        return result;
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr ?? new Error(`No configured Meta token can access form ${formId}`);
  }

  async validate(token: string): Promise<void> {
    // /me works for both User Access Tokens and Page Access Tokens.
    const r = await axios.get(`${GRAPH}/me`, {
      params: { access_token: token, fields: 'id,name' },
      validateStatus: () => true,
      timeout: META_TIMEOUT_MS,
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
    return this.withFormToken(s, formId, async (token) => {
      const r = await axios.get(`${GRAPH}/${formId}`, {
        params: { access_token: token, fields: 'questions{key,label,type}' },
        validateStatus: () => true,
        timeout: META_TIMEOUT_MS,
      });
      if (r.status !== 200 || r.data?.error) {
        throw new Error(r.data?.error?.message ?? `Meta getFormQuestions HTTP ${r.status}`);
      }
      return (r.data?.questions ?? []).map((q: any) => ({
        key: String(q.key ?? ''),
        label: String(q.label ?? q.key ?? ''),
        type: q.type ? String(q.type) : undefined,
      }));
    });
  }

  /**
   * Lists every lead form across every Page that the configured Meta
   * token(s) can see.
   *
   * Strategy when META_AD_ACCOUNTS is set (multi-account mode):
   *   1. For every (ad_account_id, token) pair, call /me/accounts with
   *      that token to discover the Pages it manages.
   *   2. For every unique (pageId, pageAccessToken) pair, walk that
   *      Page's leadgen_forms edge.
   *   3. Merge and deduplicate by form id.
   *
   * Falls back to single-page mode (s.metaPageId + s.metaSystemToken) when
   * no env override is configured.
   */
  async listLeadForms(s: SettingsDTO): Promise<MetaLeadForm[]> {
    const accountIds = (process.env.META_AD_ACCOUNTS ?? '')
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);

    // Legacy single-page mode.
    if (accountIds.length === 0) {
      return this.listFormsAtEdge(`${s.metaPageId}/leadgen_forms`, s.metaSystemToken);
    }

    const defaultToken = process.env.META_ACCESS_TOKEN || s.metaSystemToken;

    // Step 1: discover Pages for every configured token.
    const tokens = accountIds.map((id) => ({
      id,
      token: process.env[`META_ACCESS_TOKEN_${id}`] || defaultToken,
    }));
    const pageMap = new Map<string, string>(); // pageId -> best access token
    const errors: string[] = [];

    const pageLists = await Promise.allSettled(
      tokens.map((t) => this.listPagesForToken(t.token)),
    );
    for (let i = 0; i < pageLists.length; i++) {
      const r = pageLists[i];
      const acct = tokens[i].id;
      if (r.status === 'fulfilled') {
        for (const p of r.value) {
          // Prefer a page-access-token (from /me/accounts) over a user-access-token.
          if (p.access_token) {
            pageMap.set(p.id, p.access_token);
          } else if (!pageMap.has(p.id)) {
            pageMap.set(p.id, tokens[i].token);
          }
        }
      } else {
        const msg = (r as PromiseRejectedResult).reason?.message ?? r.reason;
        this.log.warn(`/me/accounts failed for act_${acct}: ${msg}`);
        errors.push(`act_${acct}: ${msg}`);
      }
    }

    // Always include the explicitly-configured page so legacy setups keep working.
    if (s.metaPageId && !pageMap.has(s.metaPageId)) {
      pageMap.set(s.metaPageId, s.metaSystemToken);
    }

    if (pageMap.size === 0) {
      throw new Error(
        `Could not discover any Meta Pages. ${errors.join('; ') || 'No pages returned.'}`,
      );
    }

    // Step 2: pull leadgen_forms from every discovered page (in parallel).
    const pageEntries = [...pageMap.entries()];
    const formLists = await Promise.allSettled(
      pageEntries.map(([pageId, pageToken]) =>
        this.listFormsAtEdge(`${pageId}/leadgen_forms`, pageToken),
      ),
    );

    const dedup = new Map<string, MetaLeadForm>();
    for (let i = 0; i < formLists.length; i++) {
      const r = formLists[i];
      const [pageId, pageToken] = pageEntries[i];
      if (r.status === 'fulfilled') {
        for (const f of r.value) {
          if (!dedup.has(f.id)) {
            dedup.set(f.id, f);
            // Seed token cache: the page-access-token reads its own forms.
            this.formTokenCache.set(f.id, pageToken);
          }
        }
      } else {
        const msg = (r as PromiseRejectedResult).reason?.message ?? r.reason;
        this.log.warn(`leadgen_forms failed for page ${pageId}: ${msg}`);
        errors.push(`page ${pageId}: ${msg}`);
      }
    }

    // Step 3: ad-creative discovery — catches forms on Pages that the System
    // User can read via Business Manager but doesn't directly manage (those
    // pages don't show up in /me/accounts, so step 1+2 misses them).
    // We walk /act_<id>/adcreatives, pluck every lead_gen_form_id, then
    // fetch each form's name + status with the account's own token.
    const creativeFormIds = new Map<string, string>(); // formId -> token that found it
    const creativeResults = await Promise.allSettled(
      tokens.map((t) => this.collectFormIdsFromAdCreatives(t.id, t.token)),
    );
    for (let i = 0; i < creativeResults.length; i++) {
      const r = creativeResults[i];
      const acct = tokens[i].id;
      if (r.status === 'fulfilled') {
        for (const formId of r.value) {
          if (!dedup.has(formId) && !creativeFormIds.has(formId)) {
            creativeFormIds.set(formId, tokens[i].token);
          }
        }
      } else {
        const msg = (r as PromiseRejectedResult).reason?.message ?? r.reason;
        this.log.warn(`adcreatives scan failed for act_${acct}: ${msg}`);
        errors.push(`act_${acct} adcreatives: ${msg}`);
      }
    }

    // Step 4: fetch name + status for each form discovered via creatives.
    if (creativeFormIds.size > 0) {
      const entries = [...creativeFormIds.entries()];
      const details = await Promise.allSettled(
        entries.map(([id, tok]) => this.getFormById(id, tok)),
      );
      for (let i = 0; i < details.length; i++) {
        const r = details[i];
        const [id, tok] = entries[i];
        if (r.status === 'fulfilled' && r.value) {
          if (!dedup.has(r.value.id)) {
            dedup.set(r.value.id, r.value);
            this.formTokenCache.set(r.value.id, tok); // token that worked
          }
        } else if (r.status === 'rejected') {
          this.log.warn(`form fetch failed for ${id}: ${r.reason?.message ?? r.reason}`);
        }
      }
    }

    // Step 5: explicit allow-list — META_EXTRA_FORM_IDS lets the operator
    // surface forms that aren't reachable via /me/accounts or adcreatives
    // (typically draft forms not yet attached to a live ad). We try each
    // configured token until one succeeds.
    const extraIds = (process.env.META_EXTRA_FORM_IDS ?? '')
      .split(',')
      .map((x) => x.trim())
      .filter((id) => id && !dedup.has(id));
    if (extraIds.length > 0) {
      const candidateTokens = [
        ...tokens.map((t) => t.token),
        s.metaSystemToken,
      ].filter((t, i, a) => t && a.indexOf(t) === i); // unique, non-empty

      const extraResults = await Promise.allSettled(
        extraIds.map(async (id) => {
          for (const tok of candidateTokens) {
            try {
              const f = await this.getFormById(id, tok);
              if (f) return { form: f, token: tok };
            } catch {
              // try next token
            }
          }
          throw new Error(`no configured token can read ${id}`);
        }),
      );
      for (let i = 0; i < extraResults.length; i++) {
        const r = extraResults[i];
        if (r.status === 'fulfilled' && r.value) {
          dedup.set(r.value.form.id, r.value.form);
          this.formTokenCache.set(r.value.form.id, r.value.token);
        } else if (r.status === 'rejected') {
          this.log.warn(`META_EXTRA_FORM_IDS lookup failed for ${extraIds[i]}: ${
            r.reason?.message ?? r.reason
          }`);
          errors.push(`extra ${extraIds[i]}: ${r.reason?.message ?? r.reason}`);
        }
      }
    }

    if (dedup.size === 0) {
      throw new Error(`No lead forms found. ${errors.join('; ')}`);
    }

    this.log.log(
      `listLeadForms: ${dedup.size} forms (${pageMap.size} pages + ` +
      `${creativeFormIds.size} via adcreatives + ${extraIds.length} extras) ` +
      `across ${accountIds.length} ad accounts`,
    );
    return [...dedup.values()];
  }

  /** Walks /act_<id>/adcreatives and extracts every unique lead_gen_form_id. */
  private async collectFormIdsFromAdCreatives(
    adAccountId: string,
    token: string,
  ): Promise<string[]> {
    const ids = new Set<string>();
    let url: string | null = `${GRAPH}/act_${adAccountId}/adcreatives`;
    let params: Record<string, string> | undefined = {
      access_token: token,
      // Lead-form CTAs live under multiple sub-shapes — link_data (image/link
      // ads), video_data (video ads), photo_data (photo ads). Asking for all
      // three lets us catch every variant.
      fields:
        'object_story_spec{link_data{call_to_action{value}},video_data{call_to_action{value}},photo_data{call_to_action{value}}}',
      limit: '100',
    };
    let pages = 0;
    const MAX_PAGES = 15; // safety cap: 15 × 100 creatives = 1500/account
    while (url && pages < MAX_PAGES) {
      const r: any = await axios.get(url, {
        params,
        validateStatus: () => true,
        timeout: META_TIMEOUT_MS,
      });
      if (r.status !== 200 || r.data?.error) {
        throw new Error(
          r.data?.error?.message ?? `Meta adcreatives HTTP ${r.status}`,
        );
      }
      for (const c of r.data?.data ?? []) {
        const spec = c?.object_story_spec;
        const variants = [spec?.link_data, spec?.video_data, spec?.photo_data];
        for (const v of variants) {
          const id = v?.call_to_action?.value?.lead_gen_form_id;
          if (id) ids.add(String(id));
        }
      }
      url = r.data?.paging?.next ?? null;
      params = undefined;
      pages++;
    }
    return [...ids];
  }

  /** Fetch a single lead form's name+status by id. */
  private async getFormById(
    formId: string,
    token: string,
  ): Promise<MetaLeadForm | null> {
    const r: any = await axios.get(`${GRAPH}/${formId}`, {
      params: { access_token: token, fields: 'id,name,status' },
      validateStatus: () => true,
      timeout: META_TIMEOUT_MS,
    });
    if (r.status !== 200 || r.data?.error) {
      throw new Error(
        r.data?.error?.message ?? `Meta /${formId} HTTP ${r.status}`,
      );
    }
    if (!r.data?.id) return null;
    return { id: r.data.id, name: r.data.name, status: r.data.status };
  }

  /** Lists Pages that a token manages, returning each Page's own access token. */
  private async listPagesForToken(
    token: string,
  ): Promise<{ id: string; name: string; access_token?: string }[]> {
    const pages: { id: string; name: string; access_token?: string }[] = [];
    let url: string | null = `${GRAPH}/me/accounts`;
    let params: Record<string, string> | undefined = {
      access_token: token,
      fields: 'id,name,access_token',
      limit: '100',
    };
    while (url) {
      const r: any = await axios.get(url, {
        params,
        validateStatus: () => true,
        timeout: META_TIMEOUT_MS,
      });
      if (r.status !== 200 || r.data?.error) {
        throw new Error(
          r.data?.error?.message ?? `Meta /me/accounts HTTP ${r.status}`,
        );
      }
      for (const p of r.data?.data ?? []) {
        pages.push({
          id: String(p.id),
          name: String(p.name ?? ''),
          access_token: p.access_token ? String(p.access_token) : undefined,
        });
      }
      url = r.data?.paging?.next ?? null;
      params = undefined;
    }
    return pages;
  }

  /** Walks one paginated leadgen_forms edge and returns the full list. */
  private async listFormsAtEdge(edge: string, token: string): Promise<MetaLeadForm[]> {
    const forms: MetaLeadForm[] = [];
    let url: string | null = `${GRAPH}/${edge}`;
    let params: Record<string, string> | undefined = {
      access_token: token,
      fields: 'id,name,status',
      limit: '50',
    };
    while (url) {
      const r: any = await axios.get(url, {
        params,
        validateStatus: () => true,
        timeout: META_TIMEOUT_MS,
      });
      if (r.status !== 200 || r.data?.error) {
        throw new Error(
          r.data?.error?.message ?? `Meta leadgen_forms HTTP ${r.status} (${edge})`,
        );
      }
      for (const f of r.data?.data ?? []) {
        forms.push({ id: f.id, name: f.name, status: f.status });
      }
      url = r.data?.paging?.next ?? null;
      params = undefined; // next URL already carries the params
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
    return this.withFormToken(s, formId, async (token) => {
      const out: any[] = [];
      let url: string | null = `${GRAPH}/${formId}/leads`;
      let params: Record<string, string> | undefined = {
        access_token: token,
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
        const r: any = await axios.get(url, {
          params,
          validateStatus: () => true,
          timeout: META_TIMEOUT_MS,
        });
        if (r.status !== 200 || r.data?.error) {
          throw new Error(r.data?.error?.message ?? `Meta listLeads HTTP ${r.status}`);
        }
        for (const lead of r.data?.data ?? []) out.push(lead);
        url = r.data?.paging?.next ?? null;
        params = undefined;
      }
      // Meta returns newest first; flip so we process oldest -> newest.
      return out.reverse();
    });
  }

  /**
   * Fetch a single lead. We need `form_id` to pick the right token, so the
   * first call uses the default token to read just the form_id, and the
   * second uses the cached/discovered form token to fetch the full record.
   * If `formId` is already known, callers can supply it to skip the probe.
   */
  async getLead(
    s: SettingsDTO,
    leadId: string,
    knownFormId?: string,
  ): Promise<{
    id: string;
    field_data: { name: string; values: string[] }[];
    created_time?: string;
    form_id?: string;
  }> {
    let formId = knownFormId;
    if (!formId) {
      // Probe with default token just to learn form_id; if even that fails,
      // we fall through to candidate tokens.
      for (const tok of this.candidateTokens(s)) {
        try {
          const r = await axios.get(`${GRAPH}/${leadId}`, {
            params: { access_token: tok, fields: 'form_id' },
            validateStatus: () => true,
            timeout: META_TIMEOUT_MS,
          });
          if (r.status === 200 && r.data?.form_id) {
            formId = r.data.form_id;
            break;
          }
        } catch { /* try next token */ }
      }
      if (!formId) {
        throw new Error(`Cannot resolve form_id for lead ${leadId} with any configured token`);
      }
    }
    return this.withFormToken(s, formId, async (token) => {
      const r = await axios.get(`${GRAPH}/${leadId}`, {
        params: { access_token: token },
        timeout: META_TIMEOUT_MS,
        validateStatus: () => true,
      });
      if (r.status !== 200 || r.data?.error) {
        throw new Error(r.data?.error?.message ?? `Meta getLead HTTP ${r.status}`);
      }
      return r.data;
    });
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
        timeout: META_TIMEOUT_MS,
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
