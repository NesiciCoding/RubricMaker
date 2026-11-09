import React, { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface ConfirmDialogProps {
    open: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    danger?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
}

export function ConfirmDialog({
    open,
    title,
    message,
    confirmLabel,
    cancelLabel,
    danger = true,
    onConfirm,
    onCancel,
}: ConfirmDialogProps) {
    const { t } = useTranslation();
    const resolvedConfirmLabel = confirmLabel ?? t('common.confirm');
    const resolvedCancelLabel = cancelLabel ?? t('common.cancel');
    // Radix only restores focus to a Dialog.Trigger, which no consumer renders, so
    // remember whatever opened the dialog and hand focus back to it on close — the
    // same pattern as ui/Modal (F5.3).
    const [opener] = useState(() => (document.activeElement instanceof HTMLElement ? document.activeElement : null));
    return (
        <Dialog.Root open={open} onOpenChange={(v) => !v && onCancel()}>
            <Dialog.Portal>
                <Dialog.Overlay className="modal-overlay" />
                <Dialog.Content
                    className="modal"
                    style={{ maxWidth: '420px' }}
                    aria-describedby="confirm-dialog-message"
                    onCloseAutoFocus={(event) => {
                        event.preventDefault();
                        if (opener?.isConnected) opener.focus();
                    }}
                >
                    <div className="modal-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            {danger && (
                                <AlertTriangle
                                    size={18}
                                    style={{ color: 'var(--red-text)', flexShrink: 0 }}
                                    aria-hidden="true"
                                />
                            )}
                            <Dialog.Title style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>
                                {title}
                            </Dialog.Title>
                        </div>
                    </div>
                    <div className="modal-body">
                        <p id="confirm-dialog-message" style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                            {message}
                        </p>
                    </div>
                    <div
                        className="modal-footer"
                        style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}
                    >
                        <button className="btn btn-secondary" onClick={onCancel}>
                            {resolvedCancelLabel}
                        </button>
                        <button
                            className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}
                            onClick={onConfirm}
                            autoFocus
                        >
                            {resolvedConfirmLabel}
                        </button>
                    </div>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}
