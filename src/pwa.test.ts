import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const registerSW = vi.fn();
vi.mock('virtual:pwa-register', () => ({ registerSW }));

describe('setupPwaUpdatePrompt', () => {
    beforeEach(() => {
        vi.resetModules();
        registerSW.mockReset();
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('publishes updateSW to the update store when a new version is found', async () => {
        const updateSW = vi.fn();
        registerSW.mockReturnValue(updateSW);

        const { setupPwaUpdatePrompt } = await import('./pwa');
        const { getUpdateSW } = await import('./pwaUpdateStore');
        setupPwaUpdatePrompt();

        const { onNeedRefresh } = registerSW.mock.calls[0][0];
        onNeedRefresh();

        expect(getUpdateSW()).toBe(updateSW);
    });

    it('bumps the update version on each refresh notice, so a dismissed toast re-shows for a newer update', async () => {
        registerSW.mockReturnValue(vi.fn());

        const { setupPwaUpdatePrompt } = await import('./pwa');
        const { getUpdateVersion } = await import('./pwaUpdateStore');
        setupPwaUpdatePrompt();

        const { onNeedRefresh } = registerSW.mock.calls[0][0];
        const before = getUpdateVersion();
        onNeedRefresh();
        onNeedRefresh();

        expect(getUpdateVersion()).toBe(before + 2);
    });

    it('polls registration.update() periodically so a stale tab still notices new deploys', async () => {
        registerSW.mockReturnValue(vi.fn());
        const registration = { update: vi.fn() };

        const { setupPwaUpdatePrompt } = await import('./pwa');
        setupPwaUpdatePrompt();

        const { onRegisteredSW } = registerSW.mock.calls[0][0];
        onRegisteredSW(undefined, registration);

        expect(registration.update).not.toHaveBeenCalled();
        vi.advanceTimersByTime(60 * 60 * 1000);
        expect(registration.update).toHaveBeenCalledTimes(1);
    });
});
