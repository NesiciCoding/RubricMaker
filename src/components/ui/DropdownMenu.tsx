import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface DropdownMenuProps {
    open: boolean;
    onClose: () => void;
    /** The toggle button; the menu is positioned under its right edge and focus returns to it on Escape. */
    anchorRef: React.RefObject<HTMLElement | null>;
    children: React.ReactNode;
    minWidth?: number;
    ariaLabel?: string;
}

/**
 * Menu rendered in a portal with fixed positioning, so it isn't clipped by an `overflow` ancestor
 * such as `.topbar-actions` (overflow-x: auto). Closes on outside pointer-down, Escape or resize.
 */
export default function DropdownMenu({
    open,
    onClose,
    anchorRef,
    children,
    minWidth = 160,
    ariaLabel,
}: DropdownMenuProps) {
    const menuRef = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState<{ top: number; right: number } | null>(null);

    const place = useCallback(() => {
        const rect = anchorRef.current?.getBoundingClientRect();
        if (!rect) return;
        setPos({ top: rect.bottom + 4, right: Math.max(8, window.innerWidth - rect.right) });
    }, [anchorRef]);

    useLayoutEffect(() => {
        if (open) place();
        else setPos(null);
    }, [open, place]);

    useEffect(() => {
        if (!open) return;
        const onPointerDown = (e: PointerEvent | MouseEvent) => {
            const target = e.target as Node;
            if (menuRef.current?.contains(target) || anchorRef.current?.contains(target)) return;
            onClose();
        };
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            e.stopPropagation();
            onClose();
            anchorRef.current?.focus();
        };
        document.addEventListener('mousedown', onPointerDown);
        document.addEventListener('keydown', onKeyDown);
        window.addEventListener('resize', onClose);
        window.addEventListener('scroll', place, true);
        return () => {
            document.removeEventListener('mousedown', onPointerDown);
            document.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('resize', onClose);
            window.removeEventListener('scroll', place, true);
        };
    }, [open, onClose, anchorRef, place]);

    const placed = pos !== null;
    useEffect(() => {
        if (open && placed) menuItems(menuRef.current)[0]?.focus();
    }, [open, placed]);

    // The portal sits at the end of <body>, so the menu manages its own keyboard order: arrows move
    // between items and Tab hands focus back to the anchor, letting the browser continue from there.
    const onMenuKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        const items = menuItems(menuRef.current);
        const index = items.indexOf(document.activeElement as HTMLElement);
        let next: HTMLElement | undefined;
        if (e.key === 'ArrowDown') next = items[(index + 1) % items.length];
        else if (e.key === 'ArrowUp') next = items[(index - 1 + items.length) % items.length];
        else if (e.key === 'Home') next = items[0];
        else if (e.key === 'End') next = items[items.length - 1];
        else if (e.key === 'Tab') {
            onClose();
            anchorRef.current?.focus();
            return;
        }
        if (!next) return;
        e.preventDefault();
        next.focus();
    };

    if (!open || !pos) return null;
    return createPortal(
        <div
            ref={menuRef}
            role="menu"
            aria-label={ariaLabel}
            onKeyDown={onMenuKeyDown}
            className="card"
            style={{
                position: 'fixed',
                top: pos.top,
                right: pos.right,
                minWidth,
                maxHeight: `calc(100vh - ${pos.top + 8}px)`,
                overflowY: 'auto',
                padding: 4,
                zIndex: 200,
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
            }}
        >
            {children}
        </div>,
        document.body
    );
}

function menuItems(menu: HTMLElement | null): HTMLElement[] {
    return Array.from(menu?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? []);
}
