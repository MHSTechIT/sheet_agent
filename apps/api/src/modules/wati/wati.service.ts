import { Injectable } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import type { SettingsDTO, WatiTemplate } from '@sheet-agent/types';

@Injectable()
export class WatiService {
  private http(s: SettingsDTO): AxiosInstance {
    const base = s.watiApiEndpoint.replace(/\/$/, '');
    const token = s.watiAccessToken.startsWith('Bearer ')
      ? s.watiAccessToken
      : `Bearer ${s.watiAccessToken}`;
    return axios.create({
      baseURL: base,
      headers: { Authorization: token, 'Content-Type': 'application/json' },
      timeout: 15000,
    });
  }

  async listTemplates(s: SettingsDTO): Promise<WatiTemplate[]> {
    const r = await this.http(s).get('/api/v1/getMessageTemplates', {
      validateStatus: () => true,
    });
    if (r.status !== 200) {
      throw new Error(`WATI getMessageTemplates HTTP ${r.status}`);
    }
    const items: any[] = r.data?.messageTemplates ?? r.data?.data ?? r.data ?? [];
    return items.map((t: any) => {
      const lang =
        typeof t.language === 'string'
          ? t.language
          : (t.language?.text ?? t.language?.value ?? t.language?.key ?? t.languageCode ?? '');
      return {
        id: String(t.id ?? t.elementName ?? t.name),
        templateId: String(t.id ?? t.elementName ?? t.name),
        name: String(t.elementName ?? t.name ?? ''),
        language: String(lang),
        status: String(t.status ?? 'UNKNOWN'),
      };
    });
  }

  async sendTemplate(
    s: SettingsDTO,
    args: { phone: string; templateName: string; broadcastName?: string },
  ) {
    const phone = args.phone.replace(/\D+/g, '');
    if (!phone) throw new Error('Lead has no phone number');

    const r = await this.http(s).post(
      `/api/v1/sendTemplateMessage?whatsappNumber=${encodeURIComponent(phone)}`,
      {
        template_name: args.templateName,
        broadcast_name: args.broadcastName ?? args.templateName,
        parameters: [],
      },
      { validateStatus: () => true },
    );
    if (r.status >= 300 || r.data?.result === false) {
      throw new Error(
        r.data?.info ?? r.data?.message ?? `WATI send failed (HTTP ${r.status})`,
      );
    }
    return r.data;
  }
}
