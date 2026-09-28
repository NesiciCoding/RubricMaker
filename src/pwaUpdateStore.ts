// pwa.ts runs at module scope, before React renders, so an available update is
// handed to the React tree through this tiny external store rather than props/context.
type UpdateSW = () => Promise<void>;
type Listener = () => void;

let updateSW: UpdateSW | null = null;
// Bumped on every onNeedRefresh so the toast can tell "still the update the
// user dismissed" apart from "a newer one just landed" and re-show itself.
let version = 0;
const listeners = new Set<Listener>();

export function setUpdateAvailable(fn: UpdateSW) {
    updateSW = fn;
    version += 1;
    listeners.forEach((listener) => listener());
}

export function subscribe(listener: Listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function getUpdateSW() {
    return updateSW;
}

export function getUpdateVersion() {
    return version;
}
