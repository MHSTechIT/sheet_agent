'use client';
import { cn } from '@/lib/cn';
import type { FlowStatus } from '@sheet-agent/types';

const STYLES: Record<FlowStatus, { dot: string; label: string; bg: string }> = {
  draft:   { dot: 'bg-gray-400',   label: 'Draft',   bg: 'bg-gray-100 text-gray-700' },
  testing: { dot: 'bg-amber-400',  label: 'Testing', bg: 'bg-amber-100 text-amber-800' },
  active:  { dot: 'bg-green-500',  label: 'Active',  bg: 'bg-green-100 text-green-800' },
  failed:  { dot: 'bg-red-500',    label: 'Failed',  bg: 'bg-red-100 text-red-800' },
};

export function StatusBadge({ status }: { status: string }) {
  const s = STYLES[(status as FlowStatus) in STYLES ? (status as FlowStatus) : 'draft'];
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-pill px-2 py-0.5 text-[11px] font-medium', s.bg)}>
      <span className={cn('size-1.5 rounded-full', s.dot)} />
      {s.label}
    </span>
  );
}
