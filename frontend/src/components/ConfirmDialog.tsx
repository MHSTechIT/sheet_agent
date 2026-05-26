'use client';
import { useEffect } from 'react';
import { AlertTriangle, X } from 'lucide-react';

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  destructive = true,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  // ESC closes the dialog
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
      if (e.key === 'Enter') onConfirm();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel, onConfirm]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      role="dialog"
      aria-modal="true"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-lavender-900/40 backdrop-blur-sm"
        onClick={onCancel}
      />
      {/* Card */}
      <div className="relative z-10 w-full max-w-sm rounded-2xl bg-white border border-lavender-100 shadow-xl p-5">
        <button
          onClick={onCancel}
          className="absolute top-3 right-3 p-1 rounded-full hover:bg-lavender-100"
          aria-label="Close"
        >
          <X className="size-4 text-lavender-700" />
        </button>
        <div className="flex items-start gap-3">
          <div
            className={
              'size-9 shrink-0 rounded-full grid place-items-center ' +
              (destructive ? 'bg-red-100 text-red-600' : 'bg-lavender-100 text-lavender-700')
            }
          >
            <AlertTriangle className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-lavender-900">{title}</h3>
            <p className="text-sm text-lavender-700 mt-1">{message}</p>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onCancel} className="pill-ghost">
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={
              destructive
                ? 'pill bg-red-600 text-white px-4 py-1.5 hover:bg-red-700'
                : 'pill-primary'
            }
            autoFocus
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
