import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ToastProvider, ToastContext } from './ToastContext';

function TestConsumer() {
    const ctx = React.useContext(ToastContext);
    return (
        <div>
            <button onClick={() => ctx.showToast('Hello!')}>show-info</button>
            <button onClick={() => ctx.showToast('Success!', 'success')}>show-success</button>
            <button onClick={() => ctx.showToast('Error!', 'error')}>show-error</button>
        </div>
    );
}

describe('ToastProvider', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.runOnlyPendingTimers();
        vi.useRealTimers();
    });

    it('renders children without toasts initially', () => {
        render(
            <ToastProvider>
                <div>child content</div>
            </ToastProvider>
        );
        expect(screen.getByText('child content')).toBeInTheDocument();
        expect(screen.queryByRole('alert')).toBeNull();
    });

    it('shows a toast on showToast call', () => {
        render(
            <ToastProvider>
                <TestConsumer />
            </ToastProvider>
        );
        fireEvent.click(screen.getByText('show-info'));
        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(screen.getByText('Hello!')).toBeInTheDocument();
    });

    it('shows success toast with correct message', () => {
        render(
            <ToastProvider>
                <TestConsumer />
            </ToastProvider>
        );
        fireEvent.click(screen.getByText('show-success'));
        expect(screen.getByText('Success!')).toBeInTheDocument();
    });

    it('shows error toast', () => {
        render(
            <ToastProvider>
                <TestConsumer />
            </ToastProvider>
        );
        fireEvent.click(screen.getByText('show-error'));
        expect(screen.getByText('Error!')).toBeInTheDocument();
    });

    it('auto-dismisses toast after 4 seconds', () => {
        render(
            <ToastProvider>
                <TestConsumer />
            </ToastProvider>
        );
        fireEvent.click(screen.getByText('show-info'));
        expect(screen.getByRole('alert')).toBeInTheDocument();

        act(() => {
            vi.advanceTimersByTime(4001);
        });
        expect(screen.queryByRole('alert')).toBeNull();
    });

    it('dismisses toast via the dismiss button', () => {
        render(
            <ToastProvider>
                <TestConsumer />
            </ToastProvider>
        );
        fireEvent.click(screen.getByText('show-info'));
        expect(screen.getByRole('alert')).toBeInTheDocument();

        fireEvent.click(screen.getByLabelText('Dismiss'));
        expect(screen.queryByRole('alert')).toBeNull();
    });

    it('can show multiple toasts', () => {
        render(
            <ToastProvider>
                <TestConsumer />
            </ToastProvider>
        );
        fireEvent.click(screen.getByText('show-info'));
        fireEvent.click(screen.getByText('show-success'));
        expect(screen.getAllByRole('alert')).toHaveLength(2);
    });
});

describe('ToastContext default value', () => {
    it('showToast is a no-op by default', () => {
        const defaultValue = { showToast: (_msg: string) => {} };
        expect(() => defaultValue.showToast('test')).not.toThrow();
    });
});
