import { describe, it, expect, vi } from 'vitest';
import { yieldToMain } from './yieldToMain';

describe('yieldToMain', () => {
    it('resolves after a macrotask tick, not synchronously', async () => {
        vi.useFakeTimers();
        let resolved = false;
        const promise = yieldToMain().then(() => {
            resolved = true;
        });
        expect(resolved).toBe(false);
        await vi.advanceTimersByTimeAsync(0);
        await promise;
        expect(resolved).toBe(true);
        vi.useRealTimers();
    });
});
