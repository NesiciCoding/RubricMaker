import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { createEvent, fireEvent, render, screen } from '@testing-library/react';
import ContextMenu, { contextMenuPoint, keepsNativeMenu, useContextMenu } from '../ContextMenu';
import type { ContextMenuItem } from '../ContextMenu';

function Harness({ onSelect }: { onSelect: () => void }) {
    const ctx = useContextMenu();
    const items: ContextMenuItem[] = [
        { key: 'alpha', label: 'Alpha', onSelect },
        { key: 'beta', label: 'Beta', onSelect: () => {}, disabled: true },
        { key: 'gamma', label: 'Gamma', onSelect: () => {} },
    ];
    return (
        <div>
            <div data-context-menu="cell" onContextMenu={(e) => ctx.open(e, items, 'Cell actions')}>
                <input aria-label="cell" />
            </div>
            <input aria-label="plain input" onContextMenu={(e) => ctx.open(e, items)} />
            <div data-testid="plain" onContextMenu={(e) => ctx.open(e, items)}>
                Plain
            </div>
            <div data-testid="empty" onContextMenu={(e) => ctx.open(e, [])}>
                Empty
            </div>
            <ContextMenu {...ctx.menuProps} />
        </div>
    );
}

describe('ContextMenu', () => {
    it('opens on contextmenu and suppresses the browser menu', () => {
        render(<Harness onSelect={vi.fn()} />);
        const plain = screen.getByTestId('plain');
        const event = createEvent.contextMenu(plain, { clientX: 120, clientY: 90 });
        fireEvent(plain, event);

        expect(event.defaultPrevented).toBe(true);
        expect(screen.getByRole('menu')).toBeInTheDocument();
    });

    it('never opens from mousedown alone', () => {
        render(<Harness onSelect={vi.fn()} />);
        fireEvent.mouseDown(screen.getByTestId('plain'), { button: 2 });
        fireEvent.mouseDown(screen.getByLabelText('cell'), { button: 2 });
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });

    it('leaves the browser menu to a text input and contenteditable', () => {
        render(<Harness onSelect={vi.fn()} />);
        const input = screen.getByLabelText('plain input');
        const event = createEvent.contextMenu(input);
        fireEvent(input, event);

        expect(event.defaultPrevented).toBe(false);
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });

    it('takes over an input that opts in with data-context-menu', () => {
        render(<Harness onSelect={vi.fn()} />);
        const input = screen.getByLabelText('cell');
        const event = createEvent.contextMenu(input);
        fireEvent(input, event);

        expect(event.defaultPrevented).toBe(true);
        expect(screen.getByRole('menu', { name: 'Cell actions' })).toBeInTheDocument();
    });

    it('returns focus to the invoking control on Escape', () => {
        render(<Harness onSelect={vi.fn()} />);
        const input = screen.getByLabelText('cell');
        fireEvent(input, createEvent.contextMenu(input));
        expect(screen.getByRole('menu')).toBeInTheDocument();

        fireEvent.keyDown(document, { key: 'Escape' });
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
        expect(document.activeElement).toBe(input);
    });

    it('runs the item action and closes', () => {
        const onSelect = vi.fn();
        render(<Harness onSelect={onSelect} />);
        fireEvent(screen.getByTestId('plain'), createEvent.contextMenu(screen.getByTestId('plain')));

        fireEvent.click(screen.getByRole('menuitem', { name: 'Alpha' }));
        expect(onSelect).toHaveBeenCalledTimes(1);
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });

    it('returns focus to the invoking control after choosing an item', () => {
        const onSelect = vi.fn();
        render(<Harness onSelect={onSelect} />);
        const input = screen.getByLabelText('cell');
        fireEvent(input, createEvent.contextMenu(input));

        fireEvent.click(screen.getByRole('menuitem', { name: 'Alpha' }));
        expect(onSelect).toHaveBeenCalledTimes(1);
        expect(document.activeElement).toBe(input);
    });

    it('leaves the native menu alone when a surface offers no items', () => {
        render(<Harness onSelect={vi.fn()} />);
        const empty = screen.getByTestId('empty');
        const event = createEvent.contextMenu(empty);
        fireEvent(empty, event);

        expect(event.defaultPrevented).toBe(false);
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });

    it('skips disabled items when arrowing and focuses the first enabled one', () => {
        render(<Harness onSelect={vi.fn()} />);
        fireEvent(screen.getByTestId('plain'), createEvent.contextMenu(screen.getByTestId('plain')));
        const menu = screen.getByRole('menu');

        expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Alpha' }));
        fireEvent.keyDown(menu, { key: 'ArrowDown' });
        expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Gamma' }));
    });
});

describe('keepsNativeMenu', () => {
    it('is false for elements outside a text-entry control', () => {
        const div = document.createElement('div');
        expect(keepsNativeMenu(div)).toBe(false);
        expect(keepsNativeMenu(null)).toBe(false);
    });

    it('is true for a plain input and false once a surface opts in', () => {
        const plain = document.createElement('input');
        const opted = document.createElement('div');
        opted.setAttribute('data-context-menu', 'cell');
        const child = document.createElement('input');
        opted.appendChild(child);

        expect(keepsNativeMenu(plain)).toBe(true);
        expect(keepsNativeMenu(child)).toBe(false);
    });

    it('treats contenteditable false as non-editable', () => {
        const div = document.createElement('div');
        div.setAttribute('contenteditable', 'false');
        expect(keepsNativeMenu(div)).toBe(false);
    });
});

describe('contextMenuPoint', () => {
    it('uses the pointer position for a mouse invocation', () => {
        const el = document.createElement('div');
        expect(
            contextMenuPoint({ clientX: 12, clientY: 34, currentTarget: el } as unknown as React.MouseEvent)
        ).toEqual({ x: 12, y: 34 });
    });

    it('anchors a keyboard invocation (0,0) to the focused element', () => {
        const el = document.createElement('div');
        el.getBoundingClientRect = () => ({ left: 40, bottom: 90 }) as DOMRect;
        expect(contextMenuPoint({ clientX: 0, clientY: 0, currentTarget: el } as unknown as React.MouseEvent)).toEqual({
            x: 40,
            y: 90,
        });
    });
});
