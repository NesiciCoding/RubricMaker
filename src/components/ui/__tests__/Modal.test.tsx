import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import Modal from '../Modal';

describe('Modal', () => {
    it('renders its children and applies the grow class when growFrom is provided', () => {
        render(
            <Modal titleId="m-title" onClose={vi.fn()} growFrom={{ x: 100, y: 50 }}>
                <div>modal content</div>
            </Modal>
        );
        expect(screen.getByText('modal content')).toBeInTheDocument();
        expect(document.querySelector('.modal.modal-grow')).toBeInTheDocument();
    });

    it('applies custom maxWidth and className', () => {
        render(
            <Modal titleId="m-title" onClose={vi.fn()} maxWidth={420} className="extra-class">
                <div>content</div>
            </Modal>
        );
        const content = document.querySelector('.modal.extra-class') as HTMLElement;
        expect(content).toBeInTheDocument();
        expect(content.style.maxWidth).toBe('420px');
    });

    it('calls onClose exactly once when the escape key is pressed', () => {
        const onClose = vi.fn();
        render(
            <Modal titleId="m-title" onClose={onClose}>
                <div>content</div>
            </Modal>
        );
        fireEvent.keyDown(document.body, { key: 'Escape' });
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('returns focus to the element that opened it once it closes', async () => {
        function Harness() {
            const [open, setOpen] = React.useState(false);
            return (
                <>
                    <button onClick={() => setOpen(true)}>open dialog</button>
                    {open && (
                        <Modal titleId="m-title" onClose={() => setOpen(false)}>
                            <button>inside</button>
                        </Modal>
                    )}
                </>
            );
        }
        render(<Harness />);
        const opener = screen.getByRole('button', { name: 'open dialog' });
        opener.focus();
        fireEvent.click(opener);
        expect(screen.getByRole('button', { name: 'inside' })).toBeInTheDocument();
        fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
        await act(() => new Promise((r) => setTimeout(r, 0)));
        expect(screen.queryByRole('button', { name: 'inside' })).not.toBeInTheDocument();
        expect(opener).toHaveFocus();
    });

    it('returns focus to returnFocusTo when whatever opened it is gone', async () => {
        // A menu item opens the dialog and the menu unmounts in the same tick, so the captured
        // opener is detached and Radix would drop focus on the body. The trigger outlives it.
        function Harness() {
            const [open, setOpen] = React.useState(false);
            const [menuMounted, setMenuMounted] = React.useState(true);
            const triggerRef = React.useRef<HTMLButtonElement>(null);
            return (
                <>
                    <button ref={triggerRef}>class menu</button>
                    {menuMounted && (
                        <button
                            onClick={() => {
                                setOpen(true);
                                setMenuMounted(false);
                            }}
                        >
                            rename class
                        </button>
                    )}
                    {open && (
                        <Modal titleId="m-title" onClose={() => setOpen(false)} returnFocusTo={triggerRef.current}>
                            <button>inside</button>
                        </Modal>
                    )}
                </>
            );
        }
        render(<Harness />);
        const trigger = screen.getByRole('button', { name: 'class menu' });
        const menuItem = screen.getByRole('button', { name: 'rename class' });
        menuItem.focus();
        fireEvent.click(menuItem);
        expect(screen.queryByRole('button', { name: 'rename class' })).not.toBeInTheDocument();
        fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
        await act(() => new Promise((r) => setTimeout(r, 0)));
        expect(screen.queryByRole('button', { name: 'inside' })).not.toBeInTheDocument();
        expect(trigger).toHaveFocus();
    });
});
