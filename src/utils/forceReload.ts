// A plain location.reload() is answered by the active service worker from its precache, so a
// page stuck on an old build (or a broken one) comes straight back. Activate any newer worker
// first — checking the server for one if none is waiting — then reload against the new one.
const STEP_TIMEOUT_MS = 4000;

function withTimeout<T>(promise: Promise<T>, ms = STEP_TIMEOUT_MS): Promise<T | undefined> {
    return Promise.race([promise, new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), ms))]);
}

function waitForInstalled(worker: ServiceWorker): Promise<void> {
    if (worker.state !== 'installing') return Promise.resolve();
    return new Promise((resolve) => {
        const onChange = () => {
            if (worker.state === 'installing') return;
            worker.removeEventListener('statechange', onChange);
            resolve();
        };
        worker.addEventListener('statechange', onChange);
    });
}

async function activateWaitingWorker(sw: ServiceWorkerContainer): Promise<void> {
    const registration = await withTimeout(sw.getRegistration());
    if (!registration) return;

    if (!registration.waiting) {
        await withTimeout(registration.update().catch(() => undefined));
        if (registration.installing) await withTimeout(waitForInstalled(registration.installing));
    }

    const waiting = registration.waiting;
    if (!waiting) return;

    const controllerChanged = new Promise<void>((resolve) =>
        sw.addEventListener('controllerchange', () => resolve(), { once: true })
    );
    waiting.postMessage({ type: 'SKIP_WAITING' });
    await withTimeout(controllerChanged);
}

let reloading = false;

export async function forceReload(): Promise<void> {
    if (reloading) return;
    reloading = true;
    try {
        if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
            await activateWaitingWorker(navigator.serviceWorker);
        }
    } catch {
        // A failed update check must never stop the reload itself.
    } finally {
        window.location.reload();
    }
}
