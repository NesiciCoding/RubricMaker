import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLongPressContextMenu } from './useLongPressContextMenu';

function Harness({ onMenu }: { onMenu: (e: MouseEvent) => void }) {
    useLongPressContextMenu();
    return (
        <div>
            <div data-longpress data-testid="surface" ref={(el) => el?.addEventListener('contextmenu', onMenu)}>
                <button>row action</button>
                <input aria-label="note" />
            </div>
            <div data-testid="plain" ref={(el) => el?.addEventListener('contextmenu', onMenu)} />
        </div>
    );
}

const touch = (x: number, y: number) => ({
    touches: [{ clientX: x, clientY: y }],
    changedTouches: [{ clientX: x, clientY: y }],
});

describe('useLongPressContextMenu', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    function setup() {
        const onMenu = vi.fn();
        const view = render(<Harness onMenu={onMenu} />);
        return { onMenu, ...view };
    }

    it('turns a still press on an opted-in surface into a contextmenu at the touch point', () => {
        const { onMenu, getByText } = setup();
        fireEvent.touchStart(getByText('row action'), touch(40, 60));
        expect(onMenu).not.toHaveBeenCalled();
        act(() => void vi.advanceTimersByTime(460));
        expect(onMenu).toHaveBeenCalledOnce();
        const event = onMenu.mock.calls[0][0] as MouseEvent;
        expect([event.clientX, event.clientY]).toEqual([40, 60]);
    });

    it('does nothing for a short tap', () => {
        const { onMenu, getByText } = setup();
        fireEvent.touchStart(getByText('row action'), touch(10, 10));
        act(() => void vi.advanceTimersByTime(200));
        fireEvent.touchEnd(getByText('row action'), touch(10, 10));
        act(() => void vi.advanceTimersByTime(600));
        expect(onMenu).not.toHaveBeenCalled();
    });

    it('never opens a menu while dragging to scroll', () => {
        const { onMenu, getByText } = setup();
        fireEvent.touchStart(getByText('row action'), touch(10, 10));
        fireEvent.touchMove(getByText('row action'), touch(10, 60));
        act(() => void vi.advanceTimersByTime(800));
        expect(onMenu).not.toHaveBeenCalled();
    });

    it('allows a few pixels of finger jitter', () => {
        const { onMenu, getByText } = setup();
        fireEvent.touchStart(getByText('row action'), touch(10, 10));
        fireEvent.touchMove(getByText('row action'), touch(14, 12));
        act(() => void vi.advanceTimersByTime(500));
        expect(onMenu).toHaveBeenCalledOnce();
    });

    it('cancels on a second finger', () => {
        const { onMenu, getByText } = setup();
        fireEvent.touchStart(getByText('row action'), touch(10, 10));
        fireEvent.touchStart(getByText('row action'), {
            touches: [
                { clientX: 10, clientY: 10 },
                { clientX: 80, clientY: 80 },
            ],
        });
        act(() => void vi.advanceTimersByTime(800));
        expect(onMenu).not.toHaveBeenCalled();
    });

    it('ignores surfaces that did not opt in and text entry inside one', () => {
        const { onMenu, getByTestId, getByLabelText } = setup();
        fireEvent.touchStart(getByTestId('plain'), touch(1, 1));
        fireEvent.touchStart(getByLabelText('note'), touch(2, 2));
        act(() => void vi.advanceTimersByTime(800));
        expect(onMenu).not.toHaveBeenCalled();
    });

    it('stops listening once unmounted', () => {
        const { onMenu, getByText, unmount } = setup();
        const target = getByText('row action');
        fireEvent.touchStart(target, touch(10, 10));
        unmount();
        act(() => void vi.advanceTimersByTime(800));
        expect(onMenu).not.toHaveBeenCalled();
    });
});
