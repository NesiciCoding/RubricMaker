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

    if (!open || !pos) return null;
    return createPortal(
        <div
            ref={menuRef}
            role="menu"
            aria-label={ariaLabel}
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
