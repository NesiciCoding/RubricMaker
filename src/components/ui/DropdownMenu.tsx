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
    /**
     * Viewport point to open at instead of under the anchor — a right-click or Shift+F10, where there
     * is no toggle button. `anchorRef` still supplies the element that gets focus back.
     */
    point?: { x: number; y: number } | null;
}

interface MenuPosition {
    top: number;
    left?: number;
    right?: number;
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
    point,
}: DropdownMenuProps) {
    const menuRef = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState<MenuPosition | null>(null);

    const place = useCallback(() => {
        if (point) {
            setPos({ top: Math.max(8, point.y), left: Math.max(8, point.x) });
            return;
        }
        const rect = anchorRef.current?.getBoundingClientRect();
        if (!rect) return;
        setPos({ top: rect.bottom + 4, right: Math.max(8, window.innerWidth - rect.right) });
    }, [anchorRef, point]);

    useLayoutEffect(() => {
        if (open) place();
        else setPos(null);
    }, [open, place]);

    // A menu opened at a point can hang off the bottom/right edge; pull it back in before paint. An
    // anchored menu needs none of this: `right` keeps it on screen and its max-height already uses
    // the room below the anchor, so clamping would drag a long menu up over the trigger.
    useLayoutEffect(() => {
        const el = menuRef.current;
        if (!open || !pos || !el || !point) return;
        // scrollHeight, not offsetHeight: a max-height that depends on `top` collapses offsetHeight to
        // 0 near the bottom edge, which used to make the clamp oscillate and drop the menu entirely.
        const top = Math.min(pos.top, Math.max(8, window.innerHeight - el.scrollHeight - 8));
        const left =
            pos.left === undefined
                ? undefined
                : Math.min(pos.left, Math.max(8, window.innerWidth - el.offsetWidth - 8));
        if (top !== pos.top || left !== pos.left) setPos({ ...pos, top, left });
    }, [open, pos, point]);

    const onScroll = useCallback(
        (e: Event) => {
            // Capture phase also sees scroll events from the menu's own `overflowY: auto` content —
            // ignore those, or scrolling down a long menu to reach a lower item closes it instead.
            if (menuRef.current && e.target instanceof Node && menuRef.current.contains(e.target)) return;
            // An anchored menu follows its trigger; a point-opened one would drift away from what was clicked.
            if (point) onClose();
            else place();
        },
        [point, onClose, place]
    );

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
        window.addEventListener('scroll', onScroll, true);
        return () => {
            document.removeEventListener('mousedown', onPointerDown);
            document.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('resize', onClose);
            window.removeEventListener('scroll', onScroll, true);
        };
    }, [open, onClose, anchorRef, onScroll]);

    const placed = pos !== null;
    useEffect(() => {
        // preventScroll: focusing an item must not scroll an ancestor, or the point-menu's
        // close-on-scroll would fire the moment it opened.
        if (open && placed) menuItems(menuRef.current)[0]?.focus({ preventScroll: true });
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
        next.focus({ preventScroll: true });
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
                ...(pos.left === undefined ? { right: pos.right } : { left: pos.left }),
                minWidth,
                maxHeight: point ? 'calc(100vh - 16px)' : `calc(100vh - ${pos.top + 8}px)`,
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
