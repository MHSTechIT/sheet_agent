'use client';
import { useState } from 'react';
import { Sheet, Check } from 'lucide-react';
import { toast } from 'sonner';
import { useApi } from '@/lib/api';
import type { FlowDTO } from '@sheet-agent/types';

export function SheetInput({
  flow,
  onUpdated,
}: { flow: FlowDTO; onUpdated: (f: FlowDTO) => void }) {
  const api = useApi();
  const [editing, setEditing] = useState(!flow.googleSheetId);
  const [value, setValue] = useState(flow.sheetUrl ?? '');
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!value) return;
    setSaving(true);
    try {
      const updated = await api.patch<FlowDTO>(`/flows/${flow.id}/sheet`, { url: value });
      onUpdated(updated);
      setEditing(false);
      toast.success(`Sheet connected (${updated.sheetHeaders?.length ?? 0} columns)`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  if (!editing && flow.googleSheetId) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="flow-pill"
        title={flow.sheetHeaders?.join(', ') ?? ''}
      >
        <span className="flex items-center gap-1.5 truncate">
          <Sheet className="size-3.5 shrink-0 text-green-600" />
          <span className="truncate max-w-[140px]">
            Sheet · {flow.sheetHeaders?.length ?? 0} cols
          </span>
        </span>
        <Check className="size-3.5 text-green-600" />
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <input
        type="text"
        placeholder="Paste Google Sheet link…"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && save()}
        className="rounded-pill bg-white border border-lavender-200 px-3 py-1.5 text-xs outline-none focus:border-lavender-400 min-w-[240px]"
      />
      <button onClick={save} disabled={saving || !value} className="pill-soft">
        {saving ? 'Saving…' : 'Connect'}
      </button>
    </div>
  );
}
