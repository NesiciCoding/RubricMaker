import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { shortcutAction, useMonitorShortcuts } from '../useMonitorShortcuts';

function press(init: Partial<KeyboardEvent> & { target?: EventTarget }): KeyboardEvent {
    const event = new KeyboardEvent('keydown', {
        key: init.key,
        ctrlKey: init.ctrlKey ?? false,
        metaKey: init.metaKey ?? false,
        altKey: init.altKey ?? false,
        bubbles: true,
        cancelable: true,
    });
    if (init.target) Object.defineProperty(event, 'target', { value: init.target });
    return event;
}

describe('shortcutAction', () => {
    it('maps the proctoring keys', () => {
        expect(shortcutAction(press({ key: 'j' }))).toBe('next');
        expect(shortcutAction(press({ key: 'k' }))).toBe('previous');
        expect(shortcutAction(press({ key: ' ' }))).toBe('spotlight');
        expect(shortcutAction(press({ key: 'n' }))).toBe('nudge');
        expect(shortcutAction(press({ key: 'f' }))).toBe('flag');
        expect(shortcutAction(press({ key: 'J' }))).toBe('next');
    });

    it('leaves other keys and modified keys to the browser', () => {
        expect(shortcutAction(press({ key: 'x' }))).toBeNull();
        expect(shortcutAction(press({ key: 'j', ctrlKey: true }))).toBeNull();
        expect(shortcutAction(press({ key: 'n', metaKey: true }))).toBeNull();
        expect(shortcutAction(press({ key: 'f', altKey: true }))).toBeNull();
    });

    it('ignores keys typed into a field', () => {
        const input = document.createElement('input');
        const textarea = document.createElement('textarea');
        expect(shortcutAction(press({ key: 'n', target: input }))).toBeNull();
        expect(shortcutAction(press({ key: 'f', target: textarea }))).toBeNull();
    });
});

describe('useMonitorShortcuts', () => {
    it('runs the handler and stops the page scrolling on space', () => {
        const spotlight = vi.fn();
        renderHook(() => useMonitorShortcuts({ spotlight }, true));

        const event = press({ key: ' ' });
        window.dispatchEvent(event);

        expect(spotlight).toHaveBeenCalledTimes(1);
        expect(event.defaultPrevented).toBe(true);
    });

    it('does nothing while disabled or when the action has no handler', () => {
        const next = vi.fn();
        const { rerender } = renderHook(({ enabled }) => useMonitorShortcuts({ next }, enabled), {
            initialProps: { enabled: false },
        });

        window.dispatchEvent(press({ key: 'j' }));
        expect(next).not.toHaveBeenCalled();

        rerender({ enabled: true });
        window.dispatchEvent(press({ key: 'f' }));
        expect(next).not.toHaveBeenCalled();
        window.dispatchEvent(press({ key: 'j' }));
        expect(next).toHaveBeenCalledTimes(1);
    });
});
