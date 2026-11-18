import { useEffect, useRef } from 'react';

export type MonitorShortcutAction = 'next' | 'previous' | 'spotlight' | 'nudge' | 'flag';

// A teacher proctoring standing up has one hand on the laptop: these are the five things done
// most often, on keys that need no looking (j/k is the editor convention they already know).
const KEY_ACTIONS: Record<string, MonitorShortcutAction> = {
    j: 'next',
    k: 'previous',
    ' ': 'spotlight',
    n: 'nudge',
    f: 'flag',
};

function isTypingTarget(target: EventTarget | null): boolean {
    const element = target as HTMLElement | null;
    if (!element) return false;
    if (element.isContentEditable) return true;
    return element.tagName === 'INPUT' || element.tagName === 'TEXTAREA' || element.tagName === 'SELECT';
}

/** The action a key press means, or null when it belongs to the field the teacher is typing in. */
export function shortcutAction(
    event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'target'>
): MonitorShortcutAction | null {
    if (event.ctrlKey || event.metaKey || event.altKey) return null;
    if (isTypingTarget(event.target ?? null)) return null;
    return KEY_ACTIONS[event.key.toLowerCase()] ?? null;
}

/**
 * Window-level proctoring keys. Missing handlers simply swallow nothing: a key without a handler
 * falls through to the browser, so only the actions the current view supports are intercepted.
 */
export function useMonitorShortcuts(
    handlers: Partial<Record<MonitorShortcutAction, () => void>>,
    enabled = true
): void {
    const handlersRef = useRef(handlers);
    useEffect(() => {
        handlersRef.current = handlers;
    }, [handlers]);

    useEffect(() => {
        if (!enabled) return;
        const onKeyDown = (event: KeyboardEvent) => {
            const action = shortcutAction(event);
            if (!action) return;
            const handler = handlersRef.current[action];
            if (!handler) return;
            // Space would otherwise scroll the roster away from the row the teacher is watching.
            event.preventDefault();
            handler();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [enabled]);
}
