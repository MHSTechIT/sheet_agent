'use client';
import { useEffect, useState } from 'react';
import { Play, Trash2, RefreshCw, ClipboardList } from 'lucide-react';
import { toast } from 'sonner';
import type { FlowDTO } from '@sheet-agent/types';
import { useApi } from '@/lib/api';
import { FormDropdown } from './FormDropdown';
import { SheetInput } from './SheetInput';
import { TemplateDropdown } from './TemplateDropdown';
import { StatusBadge } from './StatusBadge';
import { ConfirmDialog } from './ConfirmDialog';

function relativeTime(iso: string | null): string {
  if (!iso) return '—';
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  if (diff < 5_000) return 'just now';
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  return new Date(iso).toLocaleTimeString();
}

export function FlowRow({
  flow,
  onUpdated,
  onDelete,
}: {
  flow: FlowDTO;
  onUpdated: (f: FlowDTO) => void;
  onDelete: () => void;
}) {
  const api = useApi();
  const [running, setRunning] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [, force] = useState(0);

  // Avoid SSR/client clock mismatch on the relative-time string.
  useEffect(() => { setMounted(true); }, []);

  // re-render every 5s so "polled Xs ago" stays accurate
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 5000);
    return () => clearInterval(id);
  }, []);

  async function onAutomate() {
    setRunning(true);
    try {
      const updated = await api.post<FlowDTO>(`/flows/${flow.id}/automate`);
      onUpdated(updated);
      toast.success('Automation live');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setRunning(false);
    }
  }

  async function onSync() {
    setSyncing(true);
    try {
      const updated = await api.post<FlowDTO>(`/flows/${flow.id}/sync`);
      onUpdated(updated);
      toast.success('Synced from Meta');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSyncing(false);
    }
  }

  async function onCopyHeaders() {
    if (!flow.metaFormId) {
      toast.error('Pick a Meta form first');
      return;
    }
    try {
      const r = await api.get<{ recommended: string[] }>(
        `/flows/meta/forms/${flow.metaFormId}/headers`,
      );
      // Tab-separated so Google Sheets pastes across columns in one go.
      const row = r.recommended.join('\t');
      await navigator.clipboard.writeText(row);
      toast.success(
        `Copied ${r.recommended.length} headers. Open your sheet, click A1, paste.`,
      );
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  const canAutomate = !!(flow.metaFormId && flow.googleSheetId);

  return (
    <div className="card p-3">
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2">
          <StatusBadge status={flow.status} />
          <div className="text-xs text-lavender-700">
            <span className="font-medium text-lavender-900">{flow.totalLeads}</span> total ·{' '}
            <span className="font-medium text-lavender-900">{flow.todayLeads}</span> today
            {flow.lastSyncAt && mounted && (
              <span className="ml-1.5">· last lead {new Date(flow.lastSyncAt).toLocaleTimeString()}</span>
            )}
            {flow.status === 'active' && mounted && (
              <span className="ml-1.5 text-lavender-500">· polled {relativeTime(flow.lastPolledAt)}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {flow.metaFormId && (
            <button
              onClick={onCopyHeaders}
              className="pill-ghost gap-1 !px-2 !py-0.5 !text-[11px]"
              title="Copy the exact column headers Meta will use for this form"
            >
              <ClipboardList className="size-2.5" /> Copy headers
            </button>
          )}
          {flow.status === 'active' && (
            <button
              onClick={onSync}
              disabled={syncing}
              className="pill-ghost gap-1 !px-2 !py-0.5 !text-[11px]"
              title="Pull leads from Meta right now"
            >
              <RefreshCw className={'size-2.5 ' + (syncing ? 'animate-spin' : '')} />
              {syncing ? 'Syncing' : 'Sync now'}
            </button>
          )}
          <button
            onClick={() => setConfirmOpen(true)}
            className="pill !px-1.5 !py-0.5 bg-white/70 text-red-600 border border-red-200/80 hover:bg-red-50 hover:border-red-300 shadow-[inset_0_0_10px_rgba(239,68,68,0.45),inset_0_1px_0_rgba(255,255,255,0.65)]"
            title="Delete"
          >
            <Trash2 className="size-2.5" />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <FormDropdown flow={flow} onUpdated={onUpdated} />
        <Arrow />
        <SheetInput flow={flow} onUpdated={onUpdated} />
        <Arrow />
        <TemplateDropdown flow={flow} onUpdated={onUpdated} />
        <Arrow />
        <button
          onClick={onAutomate}
          disabled={!canAutomate || running}
          className="pill-primary gap-1.5 disabled:cursor-not-allowed"
          title={canAutomate ? 'Activate this flow (WhatsApp template is optional)' : 'Pick a Meta form and a Google Sheet first'}
        >
          <Play className="size-3.5" />
          {running ? 'Automating…' : 'Automate'}
        </button>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Delete this automation?"
        message={
          flow.metaFormName
            ? `The flow for "${flow.metaFormName}" will be removed along with its leads and logs. The Google Sheet itself is not affected.`
            : 'This draft flow will be removed. The Google Sheet itself is not affected.'
        }
        confirmLabel="Delete"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          onDelete();
        }}
      />
    </div>
  );
}

function Arrow() {
  return <span className="text-lavender-400 select-none text-xs">›</span>;
}
