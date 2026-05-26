import { Injectable } from '@nestjs/common';
import { google, sheets_v4 } from 'googleapis';
import type { SettingsDTO } from '@sheet-agent/types';

@Injectable()
export class GoogleService {
  private clientFor(s: SettingsDTO) {
    const oauth = new google.auth.OAuth2(s.googleClientId, s.googleClientSecret);
    oauth.setCredentials({ refresh_token: s.googleRefreshToken });
    return oauth;
  }

  private sheets(s: SettingsDTO): sheets_v4.Sheets {
    return google.sheets({ version: 'v4', auth: this.clientFor(s) });
  }

  extractSheetId(url: string): string | null {
    // Accepts full URLs or bare IDs
    const m = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (m) return m[1];
    if (/^[a-zA-Z0-9-_]{20,}$/.test(url.trim())) return url.trim();
    return null;
  }

  /**
   * Validates the OAuth refresh token AND returns who the token actually
   * represents on Google's side. Critical so the user can verify they
   * authorized with the expected account before saving.
   */
  async validate(s: SettingsDTO): Promise<{ email?: string; displayName?: string }> {
    const oauth = this.clientFor(s);
    const { credentials } = await oauth.refreshAccessToken();
    if (!credentials.access_token) {
      throw new Error('Google refresh token did not yield an access token');
    }
    try {
      const drive = google.drive({ version: 'v3', auth: oauth });
      const { data } = await drive.about.get({ fields: 'user(emailAddress,displayName)' });
      return {
        email: data.user?.emailAddress ?? undefined,
        displayName: data.user?.displayName ?? undefined,
      };
    } catch {
      // Token refresh worked but /about call failed — don't fail the overall validate
      return {};
    }
  }

  async readHeaders(s: SettingsDTO, sheetId: string): Promise<string[]> {
    const r = await this.sheets(s).spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: '1:1',
    });
    return (r.data.values?.[0] ?? []).map(String);
  }

  async getMeta(s: SettingsDTO, sheetId: string) {
    const r = await this.sheets(s).spreadsheets.get({ spreadsheetId: sheetId });
    return r.data;
  }

  async appendRow(s: SettingsDTO, sheetId: string, row: (string | number | null)[]) {
    await this.sheets(s).spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: 'A1',
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [row.map((v) => (v == null ? '' : String(v)))] },
    });
  }
}
