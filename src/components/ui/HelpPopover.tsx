import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { HelpCircle } from 'lucide-react';

interface Props {
    title: string;
    children: React.ReactNode;
}

/** Bottom edge of the nearest ancestor that clips its overflow (the scrolling modal, usually). */
function visibleBottom(el: HTMLElement | null): number {
    let node = el?.parentElement ?? null;
    while (node) {
        if (getComputedStyle(node).overflowY !== 'visible') {
            return Math.min(window.innerHeight, node.getBoundingClientRect().bottom);
        }
        node = node.parentElement;
    }
    return window.innerHeight;
}

export default function HelpPopover({ title, children }: Props) {
    const [open, setOpen] = useState(false);
    const [placement, setPlacement] = useState<'below' | 'above'>('below');
    const [alignRight, setAlignRight] = useState(false);
    const ref = useRef<HTMLSpanElement>(null);
    const tooltipRef = useRef<HTMLSpanElement>(null);

    useEffect(() => {
        if (!open) return;
        function handleClick(e: MouseEvent) {
            /* v8 ignore next -- ref is attached before the listener, so it is never null here */
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        }
        function handleKey(e: KeyboardEvent) {
            if (e.key === 'Escape') setOpen(false);
        }
        document.addEventListener('mousedown', handleClick);
        document.addEventListener('keydown', handleKey);
        return () => {
            document.removeEventListener('mousedown', handleClick);
            document.removeEventListener('keydown', handleKey);
        };
    }, [open]);

    useLayoutEffect(() => {
        if (!open) return;
        const button = ref.current;
        const tooltip = tooltipRef.current;
        if (!button || !tooltip) return;
        const b = button.getBoundingClientRect();
        const t = tooltip.getBoundingClientRect();
        setPlacement(b.bottom + 4 + t.height <= visibleBottom(button) ? 'below' : 'above');
        setAlignRight(b.left + t.width > window.innerWidth - 8);
    }, [open]);

    return (
        <span ref={ref} style={{ position: 'relative', display: 'inline-flex', verticalAlign: 'middle' }}>
            <button
                type="button"
                className="btn btn-ghost btn-icon btn-sm"
                aria-label={title}
                aria-expanded={open}
                onClick={() => setOpen((o) => !o)}
                style={{ color: 'var(--accent-text)' }}
            >
                <HelpCircle size={14} />
            </button>
            {open && (
                <span
                    ref={tooltipRef}
                    role="tooltip"
                    style={{
                        display: 'block',
                        position: 'absolute',
                        ...(placement === 'below'
                            ? { top: '100%', marginTop: 4 }
                            : { bottom: '100%', marginBottom: 4 }),
                        ...(alignRight ? { right: 0 } : { left: 0 }),
                        zIndex: 50,
                        width: 280,
                        background: 'var(--bg-elevated)',
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                        padding: '10px 12px',
                        boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
                        fontSize: '0.8rem',
                        color: 'var(--text)',
                        lineHeight: 1.5,
                    }}
                >
                    <span style={{ display: 'block', fontWeight: 700, marginBottom: 4 }}>{title}</span>
                    {children}
                </span>
            )}
        </span>
    );
}
