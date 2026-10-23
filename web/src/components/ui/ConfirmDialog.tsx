import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from './Button';
import { Modal } from './Modal';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'primary';
  loading?: boolean;
  requireReason?: boolean;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'primary',
  loading,
  requireReason,
  reasonLabel = 'Reason',
  reasonPlaceholder = 'Provide a reason for the reviewer record…',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const [reason, setReason] = useState('');
  useEffect(() => {
    if (open) setReason('');
  }, [open]);

  const reasonMissing = Boolean(requireReason) && reason.trim().length < 5;

  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            variant={tone === 'danger' ? 'danger' : 'primary'}
            loading={loading}
            disabled={reasonMissing}
            onClick={() => onConfirm(reason.trim())}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex gap-3">
          {tone === 'danger' ? (
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" aria-hidden />
          ) : null}
          <div className="text-sm leading-relaxed text-ink-700">{message}</div>
        </div>
        {requireReason ? (
          <div>
            <label className="label-base" htmlFor="confirm-reason">
              {reasonLabel} <span className="text-rose-500">*</span>
            </label>
            <textarea
              id="confirm-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder={reasonPlaceholder}
              className="input-base resize-y"
            />
            {reasonMissing ? (
              <p className="mt-1 text-xs font-medium text-rose-600">
                Please provide at least a short reason (5+ characters).
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
