'use client';
import { useEffect, useState } from 'react';
import { ChevronDown, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { useApi } from '@/lib/api';
import type { FlowDTO, MetaLeadForm } from '@sheet-agent/types';

export function FormDropdown({
  flow,
  onUpdated,
}: { flow: FlowDTO; onUpdated: (f: FlowDTO) => void }) {
  const api = useApi();
  const [open, setOpen] = useState(false);
  const [forms, setForms] = useState<MetaLeadForm[] | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    if (forms || loading) return;
    setLoading(true);
    try {
      setForms(await api.get<MetaLeadForm[]>('/flows/meta/forms'));
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function pick(f: MetaLeadForm) {
    setOpen(false);
    try {
      const updated = await api.patch<FlowDTO>(`/flows/${flow.id}/form`, {
        formId: f.id, formName: f.name,
      });
      onUpdated(updated);
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => { setOpen((o) => !o); load(); }}
        className="flow-pill"
      >
        <span className="flex items-center gap-1.5 truncate">
          <FileText className="size-3.5 shrink-0" />
          <span className="truncate max-w-[120px]">{flow.metaFormName ?? 'Select Form'}</span>
        </span>
        <ChevronDown className="size-3.5 shrink-0" />
      </button>
      {open && (
        <div className="absolute z-30 mt-2 w-72 dropdown-panel p-2 max-h-72 overflow-auto scrollbar-hide">
          {loading && <div className="p-3 text-sm text-lavender-700">Loading forms…</div>}
          {!loading && forms?.length === 0 && (
            <div className="p-3 text-sm text-lavender-700">No lead forms on this page.</div>
          )}
          {forms?.map((f) => (
            <button
              key={f.id}
              onClick={() => pick(f)}
              className="w-full text-left px-3 py-2 rounded-xl hover:bg-lavender-100"
            >
              <div className="font-medium text-sm">{f.name}</div>
              <div className="text-xs text-lavender-600">{f.id} · {f.status ?? '—'}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
