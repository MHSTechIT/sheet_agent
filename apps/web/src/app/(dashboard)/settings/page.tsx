'use client';
import { useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { useApi } from '@/lib/api';
import type { ValidationResult } from '@sheet-agent/types';

export default function SettingsPage() {
  const api = useApi();
  const [hasSettings, setHasSettings] = useState(false);
  const [validating, setValidating] = useState(false);
  const [result, setResult] = useState<ValidationResult | null>(null);

  useEffect(() => {
    if (!api.token) return;
    api
      .get<{ hasSettings: boolean }>('/settings')
      .then((s) => setHasSettings(!!s.hasSettings))
      .catch(() => {});
  }, [api.token]);

  async function onValidate() {
    if (!hasSettings) {
      toast.error('No credentials in .env');
      return;
    }
    if (validating) return;
    setValidating(true);
    try {
      setResult(await api.post<ValidationResult>('/settings/validate'));
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setValidating(false);
    }
  }

  useEffect(() => {
    const handler = () => onValidate();
    window.addEventListener('settings:validate', handler);
    return () => window.removeEventListener('settings:validate', handler);
  }, [api.token, hasSettings, validating]);

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="card p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Integration credentials</h2>
          <p className="text-sm text-lavender-700 mt-1">
            Meta, Google Sheets, and WATI credentials are read from{' '}
            <code className="text-xs px-1 py-0.5 rounded bg-lavender-100 text-lavender-800">
              .env
            </code>
            . To change them, edit <code className="text-xs">.env</code> and restart the API.
            Click <span className="font-medium">Validate</span> in the header to verify all three
            connections.
          </p>
        </div>
        {result && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <ResultBadge label="Meta" ok={result.meta.ok} message={result.meta.message} />
            <ResultBadge
              label="Google"
              ok={result.google.ok}
              message={result.google.message}
              extra={result.google.email}
            />
            <ResultBadge
              label="WATI"
              ok={result.wati.ok}
              message={result.wati.message}
              extra={
                result.wati.templateCount != null
                  ? `${result.wati.templateCount} templates`
                  : undefined
              }
            />
          </div>
        )}
      </div>
    </div>
  );
}

function ResultBadge({
  label,
  ok,
  message,
  extra,
}: {
  label: string;
  ok: boolean;
  message?: string;
  extra?: string;
}) {
  return (
    <div className="card p-3 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="font-medium">{label}</span>
        {extra && <span className="text-xs text-lavender-700">{extra}</span>}
      </div>
      {ok ? (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-pill bg-green-100 text-green-800 text-xs">
          <Check className="size-3" /> Connected
        </span>
      ) : (
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-pill bg-red-100 text-red-800 text-xs"
          title={message}
        >
          <X className="size-3" /> Failed
        </span>
      )}
    </div>
  );
}
