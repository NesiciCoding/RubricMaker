// pwa.ts runs at module scope, before React renders, so an available update is
// handed to the React tree through this tiny external store rather than props/context.
type UpdateSW = () => Promise<void>;
type Listener = () => void;

let updateSW: UpdateSW | null = null;
const listeners = new Set<Listener>();

export function setUpdateAvailable(fn: UpdateSW) {
    updateSW = fn;
    listeners.forEach((listener) => listener());
}

export function subscribe(listener: Listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function getUpdateSW() {
    return updateSW;
}
