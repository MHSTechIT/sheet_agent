'use client';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Workflow, FileText, Send } from 'lucide-react';
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
      api
        .get<FlowDTO[]>('/flows')
        .then((rows) => {
          setFlows((prev) => {
            const byId = new Map(prev.map((p) => [p.id, p]));
            return rows.map((r) => ({ ...(byId.get(r.id) ?? {}), ...r }));
          });
        })
        .catch(() => {});
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

  // -------- Aggregate stats for the gradient tile row & sidebar --------
  const stats = useMemo(() => {
    const active = flows.filter((f) => f.status === 'active').length;
    const drafts = flows.filter((f) => f.status === 'draft').length;
    const totalLeads = flows.reduce((sum, f) => sum + (f.totalLeads ?? 0), 0);
    const todayLeads = flows.reduce((sum, f) => sum + (f.todayLeads ?? 0), 0);
    return { active, drafts, totalLeads, todayLeads, flows: flows.length };
  }, [flows]);

  return (
    <div className="space-y-7">
      {/* Title */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-lavender-700 mt-1">
            {stats.flows} {stats.flows === 1 ? 'automation' : 'automations'} ·{' '}
            <span className="font-medium text-lavender-900">{stats.totalLeads}</span> leads total
          </p>
        </div>
      </div>

      {/* Gradient tile row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Tile
          variant="coral"
          icon={<Workflow className="size-6 opacity-90" />}
          caption="Active automations"
          primary={String(stats.active)}
          secondary={`of ${stats.flows} total`}
        />
        <Tile
          variant="grape"
          icon={<Send className="size-6 opacity-90" />}
          caption="Leads today"
          primary={String(stats.todayLeads)}
          secondary={stats.todayLeads === 1 ? 'new lead' : 'new leads'}
        />
        <Tile
          variant="sky"
          icon={<FileText className="size-6 opacity-90" />}
          caption="Total leads synced"
          primary={String(stats.totalLeads)}
          secondary="all-time"
        />
      </div>

      {/* Flow list */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-lavender-900">Automations</h2>
          <span className="text-xs text-lavender-500">
            {stats.active} active · {stats.drafts} drafts
          </span>
        </div>

        {loading ? (
          <div className="card p-6 text-center text-sm text-lavender-700">Loading flows…</div>
        ) : flows.length === 0 ? (
          <div className="card p-8 text-center">
            <p className="text-sm text-lavender-700">
              No automations yet. Click <span className="font-medium text-coral-600">New automation</span> to start one.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {flows.map((f) => (
              <FlowRow key={f.id} flow={f} onUpdated={onUpdated} onDelete={() => onDelete(f.id)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Tile({
  variant, icon, caption, primary, secondary,
}: {
  variant: 'coral' | 'grape' | 'sky';
  icon: React.ReactNode;
  caption: string;
  primary: string;
  secondary: string;
}) {
  const cls = variant === 'coral' ? 'tile-coral' : variant === 'grape' ? 'tile-grape' : 'tile-sky';
  return (
    <div className={`tile tile-shine ${cls}`}>
      <div className="flex items-center justify-between mb-8">
        <div className="grid place-items-center size-9 rounded-full bg-white/20 backdrop-blur-sm">
          {icon}
        </div>
      </div>
      <div className="text-xs uppercase tracking-wide opacity-90">{caption}</div>
      <div className="mt-1 text-3xl font-semibold tabular-nums">{primary}</div>
      <div className="mt-0.5 text-xs opacity-80">{secondary}</div>
    </div>
  );
}
