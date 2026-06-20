import React, { useEffect, useRef, useState } from 'react';
import { HelpCircle } from 'lucide-react';

interface Props {
    title: string;
    children: React.ReactNode;
}

export default function HelpPopover({ title, children }: Props) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLSpanElement>(null);

    useEffect(() => {
        if (!open) return;
        function handleClick(e: MouseEvent) {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        }
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [open]);

    return (
        <span ref={ref} style={{ position: 'relative', display: 'inline-flex', verticalAlign: 'middle' }}>
            <button
                type="button"
                className="btn btn-ghost btn-icon btn-sm"
                aria-label={title}
                aria-expanded={open}
                onClick={() => setOpen((o) => !o)}
                style={{ color: 'var(--accent)' }}
            >
                <HelpCircle size={14} />
            </button>
            {open && (
                <span
                    role="tooltip"
                    style={{
                        display: 'block',
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        zIndex: 50,
                        marginTop: 4,
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
