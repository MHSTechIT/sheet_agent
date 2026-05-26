import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import axios from 'axios';

const DEDUP_WINDOW_MS = 60_000; // suppress identical messages for 1 minute
const MAX_TEXT_LEN = 3500; // Telegram limit is 4096

@Injectable()
export class TelegramService implements OnModuleInit {
  private readonly log = new Logger(TelegramService.name);
  private lastSent = new Map<string, number>();

  onModuleInit() {
    // Send a startup ping so you know the integration is live.
    void this.sendInternal(
      `🟢 <b>Sheet Agent online</b>\nAPI started at <code>${new Date().toISOString()}</code>`,
      'startup',
    );
  }

  /**
   * Sends an error/info message to the configured Telegram chat. Identical
   * messages within DEDUP_WINDOW_MS are silently suppressed to avoid spam.
   */
  async sendError(title: string, detail: string, payload?: unknown) {
    let text = `🔴 <b>${escapeHtml(title)}</b>\n<code>${escapeHtml(truncate(detail, 2000))}</code>`;
    if (payload !== undefined) {
      const payloadStr =
        typeof payload === 'string' ? payload : safeJson(payload);
      text += `\n\n<pre>${escapeHtml(truncate(payloadStr, 1000))}</pre>`;
    }
    return this.sendInternal(text, `error:${title}:${detail.slice(0, 80)}`);
  }

  async sendInfo(text: string) {
    return this.sendInternal(`ℹ️ ${escapeHtml(text)}`, `info:${text.slice(0, 80)}`);
  }

  private async sendInternal(text: string, dedupKey: string) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!token || !chatId) return;

    // Dedup
    const now = Date.now();
    const last = this.lastSent.get(dedupKey);
    if (last && now - last < DEDUP_WINDOW_MS) return;
    this.lastSent.set(dedupKey, now);

    // Prune old dedup entries occasionally
    if (this.lastSent.size > 200) {
      for (const [k, t] of this.lastSent) {
        if (now - t > DEDUP_WINDOW_MS * 5) this.lastSent.delete(k);
      }
    }

    try {
      await axios.post(
        `https://api.telegram.org/bot${token}/sendMessage`,
        {
          chat_id: chatId,
          text: truncate(text, MAX_TEXT_LEN),
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        },
        { timeout: 5_000, validateStatus: () => true },
      );
    } catch (e: any) {
      // Never let Telegram failures cascade
      this.log.warn(`Telegram send failed: ${e?.message ?? e}`);
    }
  }
}

function escapeHtml(s: string): string {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + '…';
}

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}
