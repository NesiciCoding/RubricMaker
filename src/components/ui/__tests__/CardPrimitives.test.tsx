import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CardGrid from '../CardGrid';
import CardTile, { CARD_TILE_WIDTH } from '../CardTile';
import CardGrip from '../CardGrip';

describe('CardGrid', () => {
    it('is a wrapping flex row with the requested gap', () => {
        render(
            <CardGrid gap={12} data-testid="grid">
                <span>tile</span>
            </CardGrid>
        );
        const grid = screen.getByTestId('grid');
        expect(grid.style.display).toBe('flex');
        expect(grid.style.flexWrap).toBe('wrap');
        expect(grid.style.gap).toBe('12px');
    });

    it('forwards its ref and keeps caller styles', () => {
        const ref = React.createRef<HTMLDivElement>();
        render(<CardGrid ref={ref} style={{ marginBottom: 20 }} />);
        expect(ref.current).toBeInTheDocument();
        expect(ref.current?.style.marginBottom).toBe('20px');
    });
});

describe('CardTile', () => {
    it('pins the tile to a fixed basis that may shrink but never grow', () => {
        render(<CardTile data-testid="tile" />);
        const tile = screen.getByTestId('tile');
        // The whole point of the primitive: no grow, and a zero minimum so a nowrap
        // description cannot stretch the tile past its basis.
        expect(tile.style.flex).toBe(`0 1 ${CARD_TILE_WIDTH}px`);
        expect(tile.style.minWidth).toBe('0px');
        expect(tile.style.maxWidth).toBe('100%');
        expect(tile.className).toBe('card');
    });

    it('takes a narrower basis for compact tiles such as folders', () => {
        render(<CardTile data-testid="tile" width={220} />);
        expect(screen.getByTestId('tile').style.flex).toBe('0 1 220px');
    });

    it('lets dnd own the transform it passes in style, and tints the border on hover', () => {
        render(<CardTile data-testid="tile" hoverable style={{ transform: 'translate(4px, 8px)' }} />);
        const tile = screen.getByTestId('tile');
        expect(tile.style.transform).toBe('translate(4px, 8px)');

        fireEvent.mouseEnter(tile);
        expect(tile.style.borderColor).toBe('var(--accent)');
        fireEvent.mouseLeave(tile);
        expect(tile.style.borderColor).toBe('var(--border)');
    });

    it('composes the hover handlers a caller passes in', () => {
        const onMouseEnter = vi.fn();
        render(<CardTile data-testid="tile" hoverable onMouseEnter={onMouseEnter} />);
        fireEvent.mouseEnter(screen.getByTestId('tile'));
        expect(onMouseEnter).toHaveBeenCalledTimes(1);
    });
});

describe('CardGrip', () => {
    it('is a named grab target that forwards the drag handle props', () => {
        render(
            <CardGrip
                label="Drag to reorder"
                role="button"
                tabIndex={0}
                data-rfd-drag-handle-draggable-id="rubric-1"
                data-testid="grip"
            />
        );
        const grip = screen.getByTestId('grip');
        expect(screen.getByLabelText('Drag to reorder')).toBe(grip);
        expect(grip).toHaveAttribute('data-rfd-drag-handle-draggable-id', 'rubric-1');
        expect(grip).toHaveAttribute('tabindex', '0');
    });

    it('pads the glyph out to a 25px touch target around a 15px icon', () => {
        render(<CardGrip label="Drag to reorder" data-testid="grip" />);
        const grip = screen.getByTestId('grip');
        expect(grip.style.padding).toBe('5px');
        // The glyph is 15px; the padding doubles the reach in every direction.
        expect(grip.querySelector('svg')).toHaveAttribute('width', '15');
        expect(grip.style.touchAction).toBe('none');
    });

    it('accepts a smaller glyph for tight rows', () => {
        render(<CardGrip label="Drag to reorder" size={13} style={{ margin: '-5px 1px -5px -5px' }} />);
        const grip = screen.getByLabelText('Drag to reorder');
        expect(grip.querySelector('svg')).toHaveAttribute('width', '13');
        expect(grip.style.marginTop).toBe('-5px');
    });

    it('omits the name when there is no label, for grips that are not controls (#697)', () => {
        // A question edited in the bank modal has no `dragHandleProps`, so the span has no role;
        // a name on a role-less element is invalid, and the caller renders sr-only text instead.
        render(
            <CardGrip data-testid="grip">
                <span className="sr-only">Move question</span>
            </CardGrip>
        );
        const grip = screen.getByTestId('grip');
        expect(grip).not.toHaveAttribute('aria-label');
        expect(screen.getByText('Move question')).toBeInTheDocument();
        // The look (and the touch target) is independent of the name.
        expect(grip.style.padding).toBe('5px');
        expect(grip.style.touchAction).toBe('none');
    });
});
