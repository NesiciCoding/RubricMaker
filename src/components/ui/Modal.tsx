import React, { useLayoutEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';

interface Props {
    titleId: string;
    onClose: () => void;
    children: React.ReactNode;
    /** Max width of the modal box, e.g. 560 or '95vw'. Defaults to 640. */
    maxWidth?: string | number;
    /** Extra styles applied to the modal box (e.g. maxHeight, display) */
    style?: React.CSSProperties;
    className?: string;
    /** Viewport coords (e.g. a trigger button's center) to grow the modal open from. */
    growFrom?: { x: number; y: number };
    /**
     * Element to hand focus back to on close, when that is not whatever had focus as the dialog
     * mounted. Pass the trigger for dialogs opened from a menu: the menu item holds focus while it
     * opens the dialog and is then removed, so the captured element is gone by the time it closes
     * and Radix would leave focus on the body.
     */
    returnFocusTo?: HTMLElement | null;
}

/**
 * Accessible modal wrapper backed by Radix UI Dialog.
 * Provides: focus trap, focus restoration on close, Escape-to-close,
 * backdrop click-to-close, portal rendering, and correct ARIA attributes.
 *
 * Consumer API is identical to the previous hand-rolled version — no changes
 * needed in any of the 6+ consuming components.
 */
export default function Modal({
    titleId,
    onClose,
    children,
    maxWidth = 640,
    style,
    className,
    growFrom,
    returnFocusTo,
}: Props) {
    const contentRef = useRef<HTMLDivElement>(null);
    // Radix only restores focus to a Dialog.Trigger, which no consumer renders, so
    // remember whatever opened the modal and hand focus back to it on close.
    const [opener] = useState(() => (document.activeElement instanceof HTMLElement ? document.activeElement : null));

    // Anchor the scale-in animation's transform-origin to the trigger's screen
    // position so the modal visibly grows out of the button that opened it.
    /* v8 ignore start -- Radix Dialog.Content never attaches the ref in jsdom, so the body is unreachable under test */
    useLayoutEffect(() => {
        if (!growFrom || !contentRef.current) return;
        const rect = contentRef.current.getBoundingClientRect();
        const originX = ((growFrom.x - rect.left) / rect.width) * 100;
        const originY = ((growFrom.y - rect.top) / rect.height) * 100;
        contentRef.current.style.transformOrigin = `${originX}% ${originY}%`;
    }, [growFrom]);
    /* v8 ignore stop */

    return (
        <Dialog.Root open onOpenChange={onClose}>
            <Dialog.Portal>
                <Dialog.Overlay className="modal-overlay" />
                <Dialog.Content
                    ref={contentRef}
                    className={`modal${growFrom ? ' modal-grow' : ''}${className ? ` ${className}` : ''}`}
                    aria-labelledby={titleId}
                    style={{ maxWidth, ...style }}
                    onCloseAutoFocus={(event) => {
                        event.preventDefault();
                        const target = returnFocusTo ?? opener;
                        if (target?.isConnected) target.focus();
                    }}
                >
                    {children}
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}
