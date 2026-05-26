'use client';
import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { useApi } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import type { AutomationLogDTO } from '@sheet-agent/types';
import { cn } from '@/lib/cn';

export function LogsDrawer({
  flowId,
  open,
  onClose,
}: { flowId: string; open: boolean; onClose: () => void }) {
  const api = useApi();
  const [logs, setLogs] = useState<AutomationLogDTO[]>([]);

  useEffect(() => {
    if (!open) return;
    api.get<AutomationLogDTO[]>(`/flows/${flowId}/logs`)
      .then(setLogs)
      .catch((e) => toast.error(e.message));
    const s = getSocket();
    const onLog = (l: AutomationLogDTO) => {
      if (l.flowId !== flowId) return;
      setLogs((prev) => [l, ...prev].slice(0, 200));
    };
    s.on('flow:log', onLog);
    return () => { s.off('flow:log', onLog); };
  }, [open, flowId]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <aside className="absolute right-0 top-0 h-full w-full max-w-md bg-lavender-50 border-l border-lavender-200 shadow-xl flex flex-col">
        <header className="flex items-center justify-between px-5 py-4 border-b border-lavender-200">
          <h3 className="font-semibold">Automation Logs</h3>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-lavender-100">
            <X className="size-4" />
          </button>
        </header>
        <div className="flex-1 overflow-auto p-4 space-y-2">
          {logs.length === 0 && <div className="text-sm text-lavender-700">No logs yet.</div>}
          {logs.map((l) => (
            <div key={l.id} className="card p-3">
              <div className="flex items-center justify-between text-xs">
                <span className={cn(
                  'px-2 py-0.5 rounded-pill font-medium',
                  l.status === 'success' && 'bg-green-100 text-green-800',
                  l.status === 'failed' && 'bg-red-100 text-red-800',
                  l.status === 'info' && 'bg-lavender-100 text-lavender-800',
                )}>{l.status}</span>
                <span className="text-lavender-600">{new Date(l.createdAt).toLocaleString()}</span>
              </div>
              <div className="mt-1 text-sm">{l.message}</div>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}
