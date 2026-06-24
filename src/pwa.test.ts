import { describe, expect, it, vi } from 'vitest';

const registerSW = vi.fn();
vi.mock('virtual:pwa-register', () => ({ registerSW }));

describe('setupPwaUpdatePrompt', () => {
    it('reloads via updateSW when the user confirms the refresh prompt', async () => {
        const updateSW = vi.fn();
        registerSW.mockReturnValue(updateSW);
        vi.spyOn(window, 'confirm').mockReturnValue(true);

        const { setupPwaUpdatePrompt } = await import('./pwa');
        setupPwaUpdatePrompt();

        const { onNeedRefresh } = registerSW.mock.calls[0][0];
        onNeedRefresh();

        expect(updateSW).toHaveBeenCalled();
    });

    it('does not reload when the user declines', async () => {
        vi.resetModules();
        const updateSW = vi.fn();
        registerSW.mockReturnValue(updateSW);
        vi.spyOn(window, 'confirm').mockReturnValue(false);

        const { setupPwaUpdatePrompt } = await import('./pwa');
        setupPwaUpdatePrompt();

        const { onNeedRefresh } = registerSW.mock.calls.at(-1)![0];
        onNeedRefresh();

        expect(updateSW).not.toHaveBeenCalled();
    });
});
