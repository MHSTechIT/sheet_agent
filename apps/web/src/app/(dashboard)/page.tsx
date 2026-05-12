'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useApi } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { FlowRow } from '@/components/FlowRow';
import type { FlowDTO } from '@sheet-agent/types';

export default function DashboardPage() {
  const api = useApi();
  const [flows, setFlows] = useState<FlowDTO[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!api.token) return;
    let cancelled = false;

    const fetchOnce = (silent = false) =>
      api
        .get<FlowDTO[]>('/flows')
        .then((rows) => {
          if (cancelled) return;
          // Merge so we don't clobber any optimistic state already in memory
          setFlows((prev) => {
            const byId = new Map(prev.map((p) => [p.id, p]));
            return rows.map((r) => ({ ...(byId.get(r.id) ?? {}), ...r }));
          });
          setLoading(false);
        })
        .catch((e) => {
          if (!silent) toast.error(e.message);
          else console.warn('[flows] silent fetch failed:', e.message);
          setLoading(false);
        });

    fetchOnce();
    // HTTP fallback in case Socket.IO drops — every 15s so even broken sockets
    // give snappy "polled Xs ago" updates.
    const id = setInterval(() => fetchOnce(true), 15_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [api.token]);

  useEffect(() => {
    const s = getSocket();
    const onStatus = (p: { flowId: string; status: FlowDTO['status'] }) =>
      setFlows((rows) => rows.map((r) => (r.id === p.flowId ? { ...r, status: p.status } : r)));
    const onLead = (p: { flowId: string; totalLeads: number; todayLeads: number; lastSyncAt: string }) =>
      setFlows((rows) =>
        rows.map((r) =>
          r.id === p.flowId
            ? { ...r, totalLeads: p.totalLeads, todayLeads: p.todayLeads, lastSyncAt: p.lastSyncAt }
            : r,
        ),
      );
    const onPoll = (p: { flowId: string; lastPolledAt: string }) =>
      setFlows((rows) => rows.map((r) => (r.id === p.flowId ? { ...r, lastPolledAt: p.lastPolledAt } : r)));
    const onConnect = () => {
      // When the socket (re)connects, do an immediate HTTP sync so we catch up
      // on any events that fired while we were disconnected.
      api.get<FlowDTO[]>('/flows').then((rows) => {
        setFlows((prev) => {
          const byId = new Map(prev.map((p) => [p.id, p]));
          return rows.map((r) => ({ ...(byId.get(r.id) ?? {}), ...r }));
        });
      }).catch(() => {});
    };
    s.on('flow:status', onStatus);
    s.on('flow:lead', onLead);
    s.on('flow:poll', onPoll);
    s.on('connect', onConnect);
    return () => {
      s.off('flow:status', onStatus);
      s.off('flow:lead', onLead);
      s.off('flow:poll', onPoll);
      s.off('connect', onConnect);
    };
  }, [api.token]);

  async function onCreate() {
    // optimistic
    const temp: FlowDTO = {
      id: `temp-${Date.now()}`,
      metaFormId: null, metaFormName: null,
      sheetUrl: null, googleSheetId: null, sheetHeaders: null,
      templateId: null, templateName: null,
      status: 'draft', totalLeads: 0, todayLeads: 0, lastSyncAt: null,
      lastPolledAt: null,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    setFlows((rows) => [...rows, temp]);
    try {
      const created = await api.post<FlowDTO>('/flows');
      setFlows((rows) => rows.map((r) => (r.id === temp.id ? created : r)));
    } catch (e: any) {
      setFlows((rows) => rows.filter((r) => r.id !== temp.id));
      toast.error(e.message);
    }
  }

  // The header's Create button lives in the layout; it dispatches this event.
  useEffect(() => {
    const handler = () => onCreate();
    window.addEventListener('flow:create', handler);
    return () => window.removeEventListener('flow:create', handler);
  }, [api.token]);

  async function onDelete(id: string) {
    setFlows((rows) => rows.filter((r) => r.id !== id));
    try {
      await api.del(`/flows/${id}`);
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  function onUpdated(updated: FlowDTO) {
    setFlows((rows) => rows.map((r) => (r.id === updated.id ? updated : r)));
  }

  return (
    <div className="space-y-4">
      {loading ? (
        <div className="card p-6 text-center text-sm text-lavender-700">Loading flows…</div>
      ) : flows.length === 0 ? (
        <div className="card p-6 text-center">
          <p className="text-sm text-lavender-700">No automations yet. Click <span className="font-medium">Create</span> to start one.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {flows.map((f) => (
            <FlowRow key={f.id} flow={f} onUpdated={onUpdated} onDelete={() => onDelete(f.id)} />
          ))}
        </div>
      )}
    </div>
  );
}
