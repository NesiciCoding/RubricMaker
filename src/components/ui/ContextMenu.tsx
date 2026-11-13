import React, { useCallback, useMemo, useState } from 'react';
import DropdownMenu from './DropdownMenu';

export interface ContextMenuItem {
    key: string;
    label: string;
    icon?: React.ReactNode;
    onSelect: () => void;
    disabled?: boolean;
    danger?: boolean;
}

interface MenuState {
    open: boolean;
    point: { x: number; y: number } | null;
    items: ContextMenuItem[];
    label?: string;
    invoker: HTMLElement | null;
}

const TEXT_ENTRY = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])';

/**
 * Text-entry controls keep the browser's own menu — paste, spellcheck, Look up, dictation. A surface
 * whose editable control has no native menu to lose opts back in with `data-context-menu` on an
 * ancestor (the score sheet's cell inputs).
 */
export function keepsNativeMenu(target: EventTarget | null): boolean {
    const el = target instanceof Element ? target : null;
    const entry = el?.closest(TEXT_ENTRY) ?? null;
    return entry !== null && entry.closest('[data-context-menu]') === null;
}

/** Shift+F10 and the Menu key report 0,0 — anchor those to the element that had focus. */
export function contextMenuPoint(event: React.MouseEvent): { x: number; y: number } {
    if (event.clientX !== 0 || event.clientY !== 0) return { x: event.clientX, y: event.clientY };
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    return { x: rect.left, y: rect.bottom };
}

/**
 * Right-click state for one surface: `open` is an `onContextMenu` handler, `menuProps` renders the
 * menu once. Listening for `contextmenu` (never `mousedown`) is what makes Shift+F10 and the
 * keyboard Menu key work for free.
 */
export function useContextMenu() {
    const [state, setState] = useState<MenuState>({
        open: false,
        point: null,
        items: [],
        invoker: null,
    });

    const open = useCallback((event: React.MouseEvent, items: ContextMenuItem[], label?: string) => {
        if (!items.length || keepsNativeMenu(event.target)) return;
        event.preventDefault();
        const target = event.target instanceof Element ? event.target : null;
        const invoker =
            target?.closest<HTMLElement>('input, button, [tabindex]') ?? (event.currentTarget as HTMLElement | null);
        setState({ open: true, point: contextMenuPoint(event), items, label, invoker });
    }, []);

    const close = useCallback(() => setState((s) => (s.open ? { ...s, open: false } : s)), []);

    const anchorRef = useMemo<React.RefObject<HTMLElement | null>>(() => ({ current: state.invoker }), [state.invoker]);

    return {
        open,
        close,
        menuProps: {
            open: state.open,
            point: state.point,
            items: state.items,
            ariaLabel: state.label,
            onClose: close,
            anchorRef,
        },
    };
}

export interface ContextMenuProps {
    open: boolean;
    point: { x: number; y: number } | null;
    items: ContextMenuItem[];
    onClose: () => void;
    anchorRef: React.RefObject<HTMLElement | null>;
    ariaLabel?: string;
}

export default function ContextMenu({ open, point, items, onClose, anchorRef, ariaLabel }: ContextMenuProps) {
    return (
        <DropdownMenu
            open={open}
            onClose={onClose}
            anchorRef={anchorRef}
            point={point}
            ariaLabel={ariaLabel}
            minWidth={200}
        >
            {items.map((item) => (
                <button
                    key={item.key}
                    type="button"
                    role="menuitem"
                    className="btn btn-ghost btn-sm"
                    disabled={item.disabled}
                    style={{
                        width: '100%',
                        justifyContent: 'flex-start',
                        gap: 8,
                        color: item.danger ? 'var(--red-text)' : undefined,
                    }}
                    onClick={() => {
                        onClose();
                        // Focus goes back to whatever was invoked before the action runs: a keyboard user
                        // choosing an item would otherwise lose their place to <body>. An action that opens
                        // something focusable still wins, because it takes focus afterwards.
                        anchorRef.current?.focus({ preventScroll: true });
                        item.onSelect();
                    }}
                >
                    {item.icon}
                    {item.label}
                </button>
            ))}
        </DropdownMenu>
    );
}
