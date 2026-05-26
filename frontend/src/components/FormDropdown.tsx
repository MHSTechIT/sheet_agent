'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, FileText, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { useApi } from '@/lib/api';
import { useExclusiveOpen } from '@/lib/useExclusiveOpen';
import type { FlowDTO, MetaLeadForm } from '@sheet-agent/types';

export function FormDropdown({
  flow,
  onUpdated,
}: { flow: FlowDTO; onUpdated: (f: FlowDTO) => void }) {
  const api = useApi();
  const [open, setOpen] = useExclusiveOpen();
  const [forms, setForms] = useState<MetaLeadForm[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

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
    setQuery('');
    try {
      const updated = await api.patch<FlowDTO>(`/flows/${flow.id}/form`, {
        formId: f.id, formName: f.name,
      });
      onUpdated(updated);
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  // Auto-focus search input when the dropdown opens.
  useEffect(() => {
    if (open) {
      const id = window.setTimeout(() => searchRef.current?.focus(), 30);
      return () => window.clearTimeout(id);
    } else {
      setQuery('');
    }
  }, [open]);

  // Close on click outside or Escape.
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

  const filtered = useMemo(() => {
    if (!forms) return [];
    const q = query.trim().toLowerCase();
    if (!q) return forms;
    return forms.filter(
      (f) => f.name.toLowerCase().includes(q) || f.id.toLowerCase().includes(q),
    );
  }, [forms, query]);

  return (
    <div className="relative" ref={wrapRef}>
      <button
        onClick={() => { setOpen(!open); load(); }}
        className="flow-pill"
      >
        <span className="flex items-center gap-1.5 truncate">
          <FileText className="size-3.5 shrink-0" />
          <span className="truncate max-w-[120px]">{flow.metaFormName ?? 'Select Form'}</span>
        </span>
        <ChevronDown className="size-3.5 shrink-0" />
      </button>
      {open && (
        <div
          ref={panelRef}
          className="absolute z-30 mt-2 w-80 dropdown-panel p-2 max-h-80 overflow-hidden flex flex-col"
        >
          {/* Search input */}
          <div className="relative px-1 pt-1 pb-1.5">
            <Search className="size-3.5 text-lavender-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search forms…"
              className="w-full rounded-pill bg-lavender-50 border border-lavender-100 pl-8 pr-8 py-2 text-sm outline-none focus:border-coral-300 placeholder:text-lavender-400"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-lavender-400 hover:text-lavender-700"
                aria-label="Clear search"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          {/* Result list */}
          <div className="flex-1 overflow-auto scrollbar-hide">
            {loading && <div className="p-3 text-sm text-lavender-700">Loading forms…</div>}
            {!loading && forms?.length === 0 && (
              <div className="p-3 text-sm text-lavender-700">No lead forms on this page.</div>
            )}
            {!loading && forms && forms.length > 0 && filtered.length === 0 && (
              <div className="p-3 text-sm text-lavender-700">No matches for “{query}”.</div>
            )}
            {filtered.map((f) => (
              <button
                key={f.id}
                onClick={() => pick(f)}
                title={f.name}
                className="w-full text-left px-3 py-2 rounded-xl hover:bg-lavender-100"
              >
                <div className="font-medium text-sm truncate">
                  {highlight(f.name, query)}
                </div>
                <div className="text-xs text-lavender-600 truncate">
                  {highlight(f.id, query)} · {f.status ?? '—'}
                </div>
              </button>
            ))}
          </div>

          {/* Footer hint */}
          {!loading && forms && forms.length > 0 && (
            <div className="px-3 pt-1.5 pb-0.5 text-[10px] text-lavender-500 border-t border-lavender-100 mt-1">
              {filtered.length} of {forms.length} forms
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Highlight matching substring in coral.
function highlight(text: string, query: string): React.ReactNode {
  const q = query.trim();
  if (!q) return text;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return text;
  return (
    <>
      {text.slice(0, i)}
      <mark className="bg-coral-100 text-coral-700 rounded px-0.5">
        {text.slice(i, i + q.length)}
      </mark>
      {text.slice(i + q.length)}
    </>
  );
}
