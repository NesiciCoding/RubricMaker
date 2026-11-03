import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

type Listener = () => void;

function fakeWorker(state: ServiceWorkerState = 'installed') {
    const listeners = new Set<Listener>();
    const worker = {
        state,
        postMessage: vi.fn(),
        addEventListener: (_: string, fn: Listener) => listeners.add(fn),
        removeEventListener: (_: string, fn: Listener) => listeners.delete(fn),
        finishInstall() {
            worker.state = 'installed';
            listeners.forEach((fn) => fn());
        },
    };
    return worker;
}

function fakeContainer(registration: unknown) {
    const listeners = new Set<Listener>();
    return {
        getRegistration: vi.fn(async () => registration),
        addEventListener: (_: string, fn: Listener) => listeners.add(fn),
        fireControllerChange: () => listeners.forEach((fn) => fn()),
    };
}

let reload: ReturnType<typeof vi.fn>;
const originalLocation = window.location;

async function loadForceReload() {
    vi.resetModules();
    return (await import('./forceReload')).forceReload;
}

function installContainer(container: unknown) {
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: container });
}

beforeEach(() => {
    reload = vi.fn();
    Object.defineProperty(window, 'location', { configurable: true, value: { ...originalLocation, reload } });
});

afterEach(() => {
    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
    delete (navigator as unknown as Record<string, unknown>).serviceWorker;
    vi.useRealTimers();
});

describe('forceReload', () => {
    it('reloads straight away without a service worker', async () => {
        const forceReload = await loadForceReload();
        await forceReload();
        expect(reload).toHaveBeenCalledTimes(1);
    });

    it('activates a waiting worker before reloading', async () => {
        const waiting = fakeWorker();
        const container = fakeContainer({ waiting, update: vi.fn() });
        waiting.postMessage.mockImplementation(() => container.fireControllerChange());
        installContainer(container);

        const forceReload = await loadForceReload();
        await forceReload();

        expect(waiting.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
        expect(reload).toHaveBeenCalledTimes(1);
    });

    it('checks the server for a newer worker when none is waiting', async () => {
        const installing = fakeWorker('installing');
        const registration: Record<string, unknown> = { waiting: null, installing: null };
        registration.update = vi.fn(async () => {
            registration.installing = installing;
            setTimeout(() => {
                installing.finishInstall();
                registration.waiting = installing;
            }, 0);
        });
        const container = fakeContainer(registration);
        installing.postMessage.mockImplementation(() => container.fireControllerChange());
        installContainer(container);

        const forceReload = await loadForceReload();
        await forceReload();

        expect(registration.update).toHaveBeenCalled();
        expect(installing.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
        expect(reload).toHaveBeenCalledTimes(1);
    });

    it('still reloads when the new worker never takes control', async () => {
        vi.useFakeTimers();
        const waiting = fakeWorker();
        installContainer(fakeContainer({ waiting, update: vi.fn() }));

        const forceReload = await loadForceReload();
        const done = forceReload();
        await vi.advanceTimersByTimeAsync(5000);
        await done;

        expect(reload).toHaveBeenCalledTimes(1);
    });

    it('still reloads when the update check fails', async () => {
        installContainer(
            fakeContainer({
                waiting: null,
                installing: null,
                update: vi.fn(async () => Promise.reject(new Error('x'))),
            })
        );
        const forceReload = await loadForceReload();
        await forceReload();
        expect(reload).toHaveBeenCalledTimes(1);
    });

    it('ignores repeat clicks while a reload is under way', async () => {
        const forceReload = await loadForceReload();
        await Promise.all([forceReload(), forceReload()]);
        expect(reload).toHaveBeenCalledTimes(1);
    });
});
