import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ColumnResizer from '../ColumnResizer';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

function setup(overrides: Partial<React.ComponentProps<typeof ColumnResizer>> = {}) {
    const onChange = vi.fn();
    render(
        <ColumnResizer
            testId="seam"
            label="tests.rail_resize"
            value={240}
            min={180}
            max={360}
            defaultValue={240}
            side="end"
            onChange={onChange}
            {...overrides}
        />
    );
    return { onChange, seam: screen.getByTestId('seam') };
}

describe('ColumnResizer', () => {
    it('is a vertical separator that reports the pane width', () => {
        const { seam } = setup();
        expect(seam).toHaveAttribute('role', 'separator');
        expect(seam).toHaveAttribute('aria-orientation', 'vertical');
        expect(seam).toHaveAttribute('aria-label', 'tests.rail_resize');
        expect(seam).toHaveAttribute('aria-valuenow', '240');
        expect(seam).toHaveAttribute('aria-valuemin', '180');
        expect(seam).toHaveAttribute('aria-valuemax', '360');
        expect(seam).toHaveAttribute('tabindex', '0');
    });

    it('grows a pane on its left with ArrowRight, and Shift takes a bigger step', () => {
        const { onChange, seam } = setup();
        fireEvent.keyDown(seam, { key: 'ArrowRight' });
        expect(onChange).toHaveBeenLastCalledWith(256);
        fireEvent.keyDown(seam, { key: 'ArrowRight', shiftKey: true });
        expect(onChange).toHaveBeenLastCalledWith(288);
        fireEvent.keyDown(seam, { key: 'ArrowLeft' });
        expect(onChange).toHaveBeenLastCalledWith(224);
    });

    it('moves a pane on its right the other way and clamps at the limits', () => {
        const { onChange, seam } = setup({ side: 'start', value: 400, min: 320, max: 760 });
        fireEvent.keyDown(seam, { key: 'ArrowRight' });
        expect(onChange).toHaveBeenLastCalledWith(384);
        fireEvent.keyDown(seam, { key: 'End' });
        expect(onChange).toHaveBeenLastCalledWith(760);
        fireEvent.keyDown(seam, { key: 'Home' });
        expect(onChange).toHaveBeenLastCalledWith(320);
    });

    it('ignores keys that are not its own', () => {
        const { onChange, seam } = setup();
        fireEvent.keyDown(seam, { key: 'Enter' });
        fireEvent.keyDown(seam, { key: 'Tab' });
        expect(onChange).not.toHaveBeenCalled();
    });

    it('drags the seam to grow a pane on its left', () => {
        const { onChange, seam } = setup();
        fireEvent.pointerDown(seam, { button: 0, clientX: 500, pointerId: 1 });
        fireEvent.pointerMove(seam, { clientX: 540, pointerId: 1 });
        expect(onChange).toHaveBeenLastCalledWith(280);
        fireEvent.pointerUp(seam, { pointerId: 1 });
    });

    it('drags the seam to shrink a pane on its right', () => {
        const { onChange, seam } = setup({ side: 'start', value: 400, min: 320, max: 760 });
        fireEvent.pointerDown(seam, { button: 0, clientX: 900, pointerId: 2 });
        fireEvent.pointerMove(seam, { clientX: 860, pointerId: 2 });
        expect(onChange).toHaveBeenLastCalledWith(440);
    });

    it('leaves the seam alone after the pointer is released', () => {
        const { onChange, seam } = setup();
        fireEvent.pointerDown(seam, { button: 0, clientX: 500, pointerId: 1 });
        fireEvent.pointerUp(seam, { pointerId: 1 });
        fireEvent.pointerMove(seam, { clientX: 620, pointerId: 1 });
        expect(onChange).not.toHaveBeenCalled();
    });

    it('resets to the default width on double-click', () => {
        const { onChange, seam } = setup({ value: 300 });
        fireEvent.doubleClick(seam);
        expect(onChange).toHaveBeenCalledWith(240);
    });
});
