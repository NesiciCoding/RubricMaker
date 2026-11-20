import type React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import MenuButton from '../MenuButton';

describe('MenuButton', () => {
    it('calls onOpen with the click so the surface opens its own menu', () => {
        const onOpen = vi.fn();
        render(<MenuButton label="Actions" onOpen={onOpen} />);
        fireEvent.click(screen.getByRole('button', { name: 'Actions' }));
        expect(onOpen).toHaveBeenCalledOnce();
    });

    it('announces itself as a menu trigger', () => {
        render(<MenuButton label="Actions" onOpen={vi.fn()} />);
        expect(screen.getByRole('button', { name: 'Actions' })).toHaveAttribute('aria-haspopup', 'menu');
    });

    it('raises a contextmenu event for the enclosing surface when no handler is given', () => {
        const onContextMenu = vi.fn((e: React.MouseEvent) => e.preventDefault());
        render(
            <div onContextMenu={onContextMenu}>
                <MenuButton label="Actions" />
            </div>
        );
        fireEvent.click(screen.getByRole('button', { name: 'Actions' }));
        expect(onContextMenu).toHaveBeenCalledOnce();
    });
});
