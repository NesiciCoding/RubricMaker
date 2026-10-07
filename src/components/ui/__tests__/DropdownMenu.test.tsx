import React, { useRef, useState } from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DropdownMenu from '../DropdownMenu';

function Harness() {
    const [open, setOpen] = useState(false);
    const anchorRef = useRef<HTMLButtonElement>(null);
    return (
        <div style={{ overflowX: 'auto' }} data-testid="clipping-parent">
            <button ref={anchorRef} onClick={() => setOpen((o) => !o)}>
                Toggle
            </button>
            <DropdownMenu open={open} onClose={() => setOpen(false)} anchorRef={anchorRef} ariaLabel="Actions">
                <button role="menuitem">First</button>
                <button role="menuitem" disabled>
                    Disabled
                </button>
                <button role="menuitem">Last</button>
            </DropdownMenu>
        </div>
    );
}

describe('DropdownMenu', () => {
    it('renders in a portal outside the clipping parent', () => {
        render(<Harness />);
        fireEvent.click(screen.getByText('Toggle'));
        const menu = screen.getByRole('menu', { name: 'Actions' });
        expect(screen.getByTestId('clipping-parent').contains(menu)).toBe(false);
        expect(menu.style.position).toBe('fixed');
    });

    it('stays open for clicks inside the menu and closes on an outside pointer-down', () => {
        render(<Harness />);
        fireEvent.click(screen.getByText('Toggle'));
        fireEvent.mouseDown(screen.getByText('First'));
        expect(screen.getByRole('menu')).toBeInTheDocument();
        fireEvent.mouseDown(document.body);
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });

    it('toggles closed from the anchor without the outside handler reopening it', () => {
        render(<Harness />);
        const toggle = screen.getByText('Toggle');
        fireEvent.click(toggle);
        fireEvent.mouseDown(toggle);
        fireEvent.click(toggle);
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });

    it('closes on Escape and returns focus to the anchor', () => {
        render(<Harness />);
        fireEvent.click(screen.getByText('Toggle'));
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
        expect(document.activeElement).toBe(screen.getByText('Toggle'));
    });

    it('closes on window resize and repositions on scroll', () => {
        render(<Harness />);
        fireEvent.click(screen.getByText('Toggle'));
        fireEvent.scroll(window);
        expect(screen.getByRole('menu')).toBeInTheDocument();
        fireEvent(window, new Event('resize'));
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });

    it('focuses the first item on open and moves between enabled items with the arrow keys', () => {
        render(<Harness />);
        fireEvent.click(screen.getByText('Toggle'));
        const menu = screen.getByRole('menu');
        expect(document.activeElement).toBe(screen.getByText('First'));
        fireEvent.keyDown(menu, { key: 'ArrowDown' });
        expect(document.activeElement).toBe(screen.getByText('Last'));
        fireEvent.keyDown(menu, { key: 'ArrowDown' });
        expect(document.activeElement).toBe(screen.getByText('First'));
        fireEvent.keyDown(menu, { key: 'ArrowUp' });
        expect(document.activeElement).toBe(screen.getByText('Last'));
        fireEvent.keyDown(menu, { key: 'Home' });
        expect(document.activeElement).toBe(screen.getByText('First'));
        fireEvent.keyDown(menu, { key: 'End' });
        expect(document.activeElement).toBe(screen.getByText('Last'));
    });

    it('closes on Tab and hands focus back to the anchor', () => {
        render(<Harness />);
        fireEvent.click(screen.getByText('Toggle'));
        fireEvent.keyDown(screen.getByRole('menu'), { key: 'Tab' });
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
        expect(document.activeElement).toBe(screen.getByText('Toggle'));
    });
});
