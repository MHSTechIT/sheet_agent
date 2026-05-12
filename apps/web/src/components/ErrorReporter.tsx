'use client';
import { useEffect } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/** Captures uncaught errors and unhandled promise rejections, POSTs them to
 *  the backend's /errors endpoint, which forwards to Telegram. */
export function ErrorReporter() {
  useEffect(() => {
    function report(body: { message: string; source?: string; stack?: string; url?: string }) {
      try {
        fetch(`${API_BASE}/errors`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...body, url: body.url ?? window.location.href }),
          keepalive: true,
        }).catch(() => {});
      } catch {}
    }

    const onError = (e: ErrorEvent) => {
      report({
        message: e.message || 'Uncaught error',
        source: 'window.onerror',
        stack: e.error?.stack,
      });
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      const reason = (e.reason as any) ?? {};
      report({
        message: reason?.message ?? String(e.reason),
        source: 'unhandledrejection',
        stack: reason?.stack,
      });
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  return null;
}
