'use client';
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, MessageSquare, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { useApi } from '@/lib/api';
import { useExclusiveOpen } from '@/lib/useExclusiveOpen';
import type { FlowDTO, WatiTemplate } from '@sheet-agent/types';

// Module-level cache so reopening the dropdown is instant.
let cache: WatiTemplate[] | null = null;
let lastSyncAt = 0;
const SYNC_TTL_MS = 60_000; // background-sync at most once a minute

export function TemplateDropdown({
  flow,
  onUpdated,
}: { flow: FlowDTO; onUpdated: (f: FlowDTO) => void }) {
  const api = useApi();
  const [open, setOpen] = useExclusiveOpen();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [templates, setTemplates] = useState<WatiTemplate[] | null>(cache);
  const [syncing, setSyncing] = useState(false);
  const inflight = useRef(false);

  async function loadCached() {
    if (cache) { setTemplates(cache); return; }
    try {
      const list = await api.get<WatiTemplate[]>('/templates');
      cache = list;
      setTemplates(list);
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function syncFromWati(force = false) {
    if (inflight.current) return;
    if (!force && Date.now() - lastSyncAt < SYNC_TTL_MS) return;
    inflight.current = true;
    setSyncing(true);
    try {
      const fresh = await api.post<WatiTemplate[]>('/templates/sync');
      cache = fresh;
      lastSyncAt = Date.now();
      setTemplates(fresh);
    } catch (e: any) {
      toast.error(`Couldn't refresh templates: ${e.message}`);
    } finally {
      setSyncing(false);
      inflight.current = false;
    }
  }

  useEffect(() => {
    if (!open) return;
    // 1) Show whatever we have right away.
    loadCached();
    // 2) Refresh in the background (throttled).
    syncFromWati(false);
  }, [open]);

  async function pick(t: WatiTemplate | null) {
    setOpen(false);
    try {
      const updated = await api.patch<FlowDTO>(`/flows/${flow.id}/template`, {
        templateId: t?.templateId ?? null,
      });
      onUpdated(updated);
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  // Close on outside click / Escape — matches FormDropdown UX.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={wrapRef}>
      <button onClick={() => setOpen(!open)} className="flow-pill">
        <span className="flex items-center gap-1.5 truncate">
          <MessageSquare className="size-3.5 shrink-0" />
          <span className="truncate max-w-[140px]">
            {flow.templateName ?? <span className="text-lavender-500">Template (optional)</span>}
          </span>
        </span>
        <ChevronDown className="size-3.5 shrink-0" />
      </button>
      {open && (
        <div className="absolute z-30 mt-2 w-80 dropdown-panel p-2 max-h-80 overflow-auto right-0 scrollbar-hide">
          <div className="flex items-center justify-between px-2 pb-2 pt-1 border-b border-lavender-100 mb-1 sticky top-0 bg-white/95 backdrop-blur z-10">
            <span className="text-xs font-medium text-lavender-700">
              {templates ? `${templates.length} approved` : 'Loading…'}
              {syncing && <span className="ml-2 text-lavender-500">syncing…</span>}
            </span>
            <button
              onClick={(e) => { e.stopPropagation(); syncFromWati(true); }}
              disabled={syncing}
              className="text-xs flex items-center gap-1 text-lavender-700 hover:text-lavender-900"
              title="Re-sync from WATI"
            >
              <RefreshCw className={'size-3 ' + (syncing ? 'animate-spin' : '')} />
              Refresh
            </button>
          </div>
          {!templates && <div className="p-3 text-sm text-lavender-700">Loading…</div>}
          <button
            onClick={() => pick(null)}
            className="w-full text-left px-3 py-2 rounded-xl hover:bg-lavender-100 border-b border-lavender-100 mb-1"
          >
            <div className="font-medium text-sm">No template</div>
            <div className="text-xs text-lavender-600">Skip the WhatsApp step for this flow</div>
          </button>
          {templates?.length === 0 && (
            <div className="p-3 text-sm text-lavender-700">
              No approved templates found in WATI yet.
            </div>
          )}
          {templates?.map((t) => (
            <button
              key={t.templateId}
              onClick={() => pick(t)}
              className="w-full text-left px-3 py-2 rounded-xl hover:bg-lavender-100"
            >
              <div className="font-medium text-sm">{t.name}</div>
              <div className="text-xs text-lavender-600">
                {t.language} ·{' '}
                <span className={t.status === 'APPROVED' ? 'text-green-600' : 'text-amber-600'}>
                  {t.status}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
