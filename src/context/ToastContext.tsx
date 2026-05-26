import React, { createContext, useCallback, useState } from 'react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
    id: number;
    message: string;
    type: ToastType;
}

interface ToastContextValue {
    showToast: (message: string, type?: ToastType) => void;
}

export const ToastContext = createContext<ToastContextValue>({
    showToast: () => {},
});

let nextId = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const showToast = useCallback((message: string, type: ToastType = 'info') => {
        const id = ++nextId;
        setToasts((prev) => [...prev, { id, message, type }]);
        setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.id !== id));
        }, 4000);
    }, []);

    const dismiss = useCallback((id: number) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);

    return (
        <ToastContext.Provider value={{ showToast }}>
            {children}
            <ToastContainer toasts={toasts} onDismiss={dismiss} />
        </ToastContext.Provider>
    );
}

function ToastContainer({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
    if (toasts.length === 0) return null;
    return (
        <div
            style={{
                position: 'fixed',
                bottom: '1.5rem',
                right: '1.5rem',
                zIndex: 9999,
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem',
                maxWidth: '22rem',
            }}
        >
            {toasts.map((t) => (
                <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
            ))}
        </div>
    );
}

const TYPE_STYLES: Record<ToastType, { bg: string; border: string; icon: string }> = {
    success: { bg: 'color-mix(in srgb, var(--green) 18%, var(--bg-elevated))', border: 'var(--green)', icon: '✓' },
    error: { bg: 'color-mix(in srgb, var(--red) 18%, var(--bg-elevated))', border: 'var(--red)', icon: '✕' },
    info: { bg: 'color-mix(in srgb, var(--accent) 18%, var(--bg-elevated))', border: 'var(--accent)', icon: 'ℹ' },
    warning: {
        bg: 'color-mix(in srgb, var(--yellow) 18%, var(--bg-elevated))',
        border: 'var(--yellow)',
        icon: '⚠',
    },
};

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
    const s = TYPE_STYLES[toast.type];
    return (
        <div
            role="alert"
            style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.625rem',
                padding: '0.75rem 1rem',
                borderRadius: '0.5rem',
                background: s.bg,
                border: `1px solid ${s.border}`,
                color: 'var(--text)',
                fontSize: '0.875rem',
                lineHeight: '1.4',
                boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                animation: 'toast-in 0.2s ease',
            }}
        >
            <span style={{ fontWeight: 700, color: s.border, flexShrink: 0, lineHeight: '1.4' }}>{s.icon}</span>
            <span style={{ flex: 1 }}>{toast.message}</span>
            <button
                onClick={() => onDismiss(toast.id)}
                aria-label="Dismiss"
                style={{
                    background: 'none',
                    border: 'none',
                    color: '#94a3b8',
                    cursor: 'pointer',
                    padding: 0,
                    fontSize: '1rem',
                    lineHeight: 1,
                    flexShrink: 0,
                }}
            >
                ×
            </button>
        </div>
    );
}
