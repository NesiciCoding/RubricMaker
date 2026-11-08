/**
 * Yields back to the browser's event loop so a long synchronous loop (building a large batch
 * export, for example) doesn't freeze the UI tab for its entire duration. `setTimeout` rather
 * than `requestIdleCallback` — the latter isn't available in every browser this app targets.
 */
export function yieldToMain(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
}
