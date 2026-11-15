import { describe, expect, it, vi, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { ToastContext } from '../../context/ToastContext';
import { useCopyFeedback } from '../useCopyFeedback';

const showToast = vi.fn(() => 1);
const wrapper = ({ children }: { children: ReactNode }) => (
    <ToastContext.Provider value={{ showToast, dismissToast: vi.fn() }}>{children}</ToastContext.Provider>
);

function stubClipboard(writeText: unknown) {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: writeText ? { writeText } : undefined });
}

describe('useCopyFeedback', () => {
    afterEach(() => {
        showToast.mockClear();
        vi.restoreAllMocks();
    });

    it('confirms a successful copy', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined);
        stubClipboard(writeText);
        const { result } = renderHook(() => useCopyFeedback(), { wrapper });
        await result.current('hello');
        expect(writeText).toHaveBeenCalledWith('hello');
        expect(showToast).toHaveBeenCalledWith(expect.any(String), 'success');
    });

    it.each([
        ['rejects', vi.fn().mockRejectedValue(new Error('denied'))],
        ['is unavailable', undefined],
    ])('reports an error with a manual-copy action when the clipboard %s', async (_name, writeText) => {
        stubClipboard(writeText);
        const prompt = vi.spyOn(window, 'prompt').mockReturnValue(null);
        const { result } = renderHook(() => useCopyFeedback(), { wrapper });
        await result.current('hello');
        const [, type, options] = showToast.mock.calls[0] as unknown as [
            string,
            string,
            { action: { onClick: () => void } },
        ];
        expect(type).toBe('error');
        options.action.onClick();
        expect(prompt).toHaveBeenCalledWith(expect.any(String), 'hello');
    });
});
