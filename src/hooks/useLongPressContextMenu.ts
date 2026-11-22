import { useEffect } from 'react';
import { keepsNativeMenu } from '../components/ui/ContextMenu';

const DELAY_MS = 450;
const MOVE_TOLERANCE_PX = 10;
/** A native `contextmenu` right after a long-press (Android fires one) must not re-open the menu. */
const NATIVE_ECHO_MS = 1000;

interface Press {
    x: number;
    y: number;
    target: Element;
    startedAt: number;
    timer: number;
    fired: boolean;
}

/**
 * iOS and iPadOS Safari never fire `contextmenu` on a long-press, and Android Chrome cancels it on
 * jitter, so touch users would get no menu at all. This turns a still ~450 ms press on a surface
 * marked `data-longpress` into the same `contextmenu` event a right-click produces, so every surface
 * keeps its single `onContextMenu` handler and nothing is hand-rolled per component.
 *
 * Mount once, near the app root. It only reacts to single-finger touches that stay put: dragging,
 * a second finger, a lift or a cancel all end the press, so scrolling a list never opens a menu.
 * Text entry keeps its native menu, exactly as it does for a right-click.
 */
export function useLongPressContextMenu(): void {
    useEffect(() => {
        let press: Press | null = null;
        let lastFiredAt = 0;

        const cancel = () => {
            if (press) window.clearTimeout(press.timer);
            press = null;
        };

        const fire = () => {
            if (!press || press.fired) return;
            press.fired = true;
            lastFiredAt = Date.now();
            press.target.dispatchEvent(
                new MouseEvent('contextmenu', {
                    bubbles: true,
                    cancelable: true,
                    clientX: press.x,
                    clientY: press.y,
                    button: 2,
                })
            );
        };

        const onStart = (event: TouchEvent) => {
            cancel();
            if (event.touches.length !== 1) return;
            const target = event.target instanceof Element ? event.target : null;
            if (!target || !target.closest('[data-longpress]') || keepsNativeMenu(target)) return;
            if (target.closest('[data-rfd-drag-handle-draggable-id]')) return;
            const touch = event.touches[0];
            press = {
                x: touch.clientX,
                y: touch.clientY,
                target,
                startedAt: event.timeStamp,
                timer: window.setTimeout(fire, DELAY_MS),
                fired: false,
            };
        };

        const onMove = (event: TouchEvent) => {
            if (!press) return;
            const touch = event.touches[0];
            if (!touch || Math.hypot(touch.clientX - press.x, touch.clientY - press.y) > MOVE_TOLERANCE_PX) cancel();
        };

        const onEnd = (event: TouchEvent) => {
            if (!press) return;
            // A lift handled late still reports the press: judge it on the event timestamps.
            if (!press.fired && event.timeStamp - press.startedAt >= DELAY_MS) fire();
            const fired = press.fired;
            cancel();
            // The press already opened a menu; the lift must not also click what is under the finger.
            if (fired && event.cancelable) event.preventDefault();
        };

        const onNativeContextMenu = (event: Event) => {
            if (event.isTrusted && Date.now() - lastFiredAt < NATIVE_ECHO_MS) {
                event.preventDefault();
                event.stopPropagation();
            }
        };

        document.addEventListener('touchstart', onStart, { passive: true });
        document.addEventListener('touchmove', onMove, { passive: true });
        document.addEventListener('touchend', onEnd, { passive: false });
        document.addEventListener('touchcancel', cancel, { passive: true });
        document.addEventListener('contextmenu', onNativeContextMenu, true);
        return () => {
            cancel();
            document.removeEventListener('touchstart', onStart);
            document.removeEventListener('touchmove', onMove);
            document.removeEventListener('touchend', onEnd);
            document.removeEventListener('touchcancel', cancel);
            document.removeEventListener('contextmenu', onNativeContextMenu, true);
        };
    }, []);
}
