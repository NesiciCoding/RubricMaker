import { useState, useCallback } from 'react';

interface ConfirmOptions {
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    danger?: boolean;
}

interface ConfirmState extends ConfirmOptions {
    open: boolean;
    resolve: ((confirmed: boolean) => void) | null;
}

export function useConfirm() {
    const [state, setState] = useState<ConfirmState>({
        open: false,
        title: '',
        message: '',
        resolve: null,
    });

    const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
        return new Promise((resolve) => {
            setState({ ...options, open: true, resolve });
        });
    }, []);

    const handleConfirm = useCallback(() => {
        state.resolve?.(true);
        setState((s) => ({ ...s, open: false, resolve: null }));
    }, [state]);

    const handleCancel = useCallback(() => {
        state.resolve?.(false);
        setState((s) => ({ ...s, open: false, resolve: null }));
    }, [state]);

    return {
        confirm,
        dialogProps: {
            open: state.open,
            title: state.title,
            message: state.message,
            confirmLabel: state.confirmLabel,
            cancelLabel: state.cancelLabel,
            danger: state.danger ?? true,
            onConfirm: handleConfirm,
            onCancel: handleCancel,
        },
    };
}
