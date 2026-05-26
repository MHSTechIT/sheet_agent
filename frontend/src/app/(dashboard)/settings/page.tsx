'use client';
import { useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { useApi } from '@/lib/api';
import type { SettingsDTO, ValidationResult } from '@sheet-agent/types';

const EMPTY: SettingsDTO = {
  metaSystemToken: '', metaAppId: '', metaAppSecret: '', metaPageId: '', metaAdAccountId: '',
  googleClientId: '', googleClientSecret: '', googleRefreshToken: '',
  watiApiEndpoint: '', watiAccessToken: '',
};

export default function SettingsPage() {
  const api = useApi();
  const [form, setForm] = useState<SettingsDTO>(EMPTY);
  const [hasSettings, setHasSettings] = useState(false);
  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState(false);
  const [result, setResult] = useState<ValidationResult | null>(null);

  useEffect(() => {
    if (!api.token) return;
    api.get<Partial<SettingsDTO> & { hasSettings: boolean }>('/settings').then((s) => {
      setHasSettings(!!s.hasSettings);
      if (s.hasSettings) setForm({ ...EMPTY, ...s } as SettingsDTO);
    });
  }, [api.token]);

  function update<K extends keyof SettingsDTO>(k: K, v: SettingsDTO[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function onSave() {
    setSaving(true);
    try {
      const res = await api.post<ValidationResult>('/settings', form);
      setResult(res);
      setHasSettings(true);
      toast.success('Settings saved');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function onValidate() {
    if (!hasSettings) { toast.error('Save settings first'); return; }
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
    <div className="space-y-6 max-w-3xl">
      <Section title="Meta" status={result?.meta}>
        <Field label="System User Token" value={form.metaSystemToken} type="password"
               onChange={(v) => update('metaSystemToken', v)} />
        <Field label="App ID" value={form.metaAppId} onChange={(v) => update('metaAppId', v)} />
        <Field label="App Secret" value={form.metaAppSecret} type="password"
               onChange={(v) => update('metaAppSecret', v)} />
        <Field label="Page ID" value={form.metaPageId} onChange={(v) => update('metaPageId', v)} />
        <Field label="Ad Account ID" value={form.metaAdAccountId}
               onChange={(v) => update('metaAdAccountId', v)} />
      </Section>

      <Section
        title="Google Sheets"
        status={result?.google}
        extra={
          result?.google?.ok && result.google.email
            ? <span className="text-xs text-lavender-700">connected as <span className="font-medium">{result.google.email}</span></span>
            : null
        }
      >
        <Field label="Client ID" value={form.googleClientId} onChange={(v) => update('googleClientId', v)} />
        <Field label="Client Secret" value={form.googleClientSecret} type="password"
               onChange={(v) => update('googleClientSecret', v)} />
        <Field label="Refresh Token" value={form.googleRefreshToken} type="password"
               onChange={(v) => update('googleRefreshToken', v)} />
      </Section>

      <Section title="WATI" status={result?.wati} extra={
        result?.wati?.ok && typeof result.wati.templateCount === 'number'
          ? <span className="text-xs text-lavender-700">{result.wati.templateCount} templates synced</span>
          : null
      }>
        <Field label="API Endpoint" value={form.watiApiEndpoint}
               placeholder="https://live-mt-server.wati.io/xxxxx"
               onChange={(v) => update('watiApiEndpoint', v)} />
        <Field label="Access Token" value={form.watiAccessToken} type="password"
               onChange={(v) => update('watiAccessToken', v)} />
      </Section>

      <div className="flex justify-end">
        <button onClick={onSave} disabled={saving} className="pill-primary">
          {saving ? 'Saving…' : 'Save & Validate'}
        </button>
      </div>
    </div>
  );
}

function Section({
  title, status, children, extra,
}: {
  title: string;
  status?: { ok: boolean; message?: string };
  children: React.ReactNode;
  extra?: React.ReactNode;
}) {
  return (
    <div className="card p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{title}</h2>
        <div className="flex items-center gap-2">
          {extra}
          {status && (
            status.ok
              ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-pill bg-green-100 text-green-800 text-xs"><Check className="size-3" />Connected</span>
              : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-pill bg-red-100 text-red-800 text-xs" title={status.message}><X className="size-3" />{status.message ?? 'Failed'}</span>
          )}
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{children}</div>
    </div>
  );
}

function Field({
  label, value, onChange, type = 'text', placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: 'text' | 'password';
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-lavender-700">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-2xl bg-white border border-lavender-200 px-4 py-2.5 outline-none focus:border-lavender-400"
      />
    </label>
  );
}
