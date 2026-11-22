import React from 'react';
import { MoreHorizontal } from 'lucide-react';

interface Props {
    label: string;
    /**
     * Wired to the surface's `useContextMenu().open`, so the button and a right-click share one item
     * list. Without it the button raises a `contextmenu` event on itself, which the enclosing
     * surface's own `onContextMenu` handles exactly as a right-click would.
     */
    onOpen?: (event: React.MouseEvent) => void;
    style?: React.CSSProperties;
    className?: string;
}

/**
 * The visible route to a context menu. Right-click is invisible until someone tries it and touch
 * browsers may never fire it, so every surface with a menu also carries this button.
 */
export default function MenuButton({ label, onOpen, style, className }: Props) {
    return (
        <button
            type="button"
            className={`btn btn-ghost btn-icon btn-sm${className ? ` ${className}` : ''}`}
            style={{ color: 'var(--text-muted)', ...style }}
            aria-haspopup="menu"
            aria-label={label}
            title={label}
            onClick={
                onOpen ??
                ((event) => {
                    const rect = event.currentTarget.getBoundingClientRect();
                    event.currentTarget.dispatchEvent(
                        new MouseEvent('contextmenu', {
                            bubbles: true,
                            cancelable: true,
                            clientX: event.clientX || rect.left,
                            clientY: event.clientY || rect.bottom,
                            button: 2,
                        })
                    );
                })
            }
        >
            <MoreHorizontal size={15} />
        </button>
    );
}
