import React, { useEffect, useRef, useState } from 'react';
import { Settings } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export interface GradingAction {
    key: string;
    icon: React.ReactNode;
    label: string;
    onClick: () => void;
    danger?: boolean;
    /** Renders as a checked state (e.g. an active toggle). */
    active?: boolean;
}

/**
 * Collapses the grading header's rarely-used icon buttons behind a single
 * settings-cog menu (Phase 40 directive 3). Frequent actions (Back / Save /
 * Save-&-Next) stay surfaced in the Topbar; everything else lives here.
 */
export default function GradingActionsMenu({ actions }: { actions: GradingAction[] }) {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const wrapRef = useRef<HTMLDivElement>(null);
    const btnRef = useRef<HTMLButtonElement>(null);
    // Fixed-position coords computed from the trigger — the Topbar's actions row has
    // `overflow: auto`, which would otherwise clip an absolutely-positioned dropdown.
    const [coords, setCoords] = useState<{ top: number; right: number } | null>(null);

    const openMenu = () => {
        const r = btnRef.current?.getBoundingClientRect();
        if (r) setCoords({ top: r.bottom + 4, right: window.innerWidth - r.right });
        setOpen(true);
    };

    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => {
            if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setOpen(false);
        };
        const onReflow = () => setOpen(false);
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        window.addEventListener('resize', onReflow);
        window.addEventListener('scroll', onReflow, true);
        return () => {
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('keydown', onKey);
            window.removeEventListener('resize', onReflow);
            window.removeEventListener('scroll', onReflow, true);
        };
    }, [open]);

    if (actions.length === 0) return null;

    return (
        <div ref={wrapRef} style={{ position: 'relative' }} className="no-print">
            <button
                ref={btnRef}
                type="button"
                className="btn btn-ghost btn-icon btn-sm"
                aria-haspopup="menu"
                aria-expanded={open}
                aria-label={t('gradeStudent.more_actions')}
                title={t('gradeStudent.more_actions')}
                onClick={() => (open ? setOpen(false) : openMenu())}
            >
                <Settings size={15} />
            </button>
            {open && coords && (
                <div
                    className="card"
                    role="menu"
                    style={{
                        position: 'fixed',
                        right: coords.right,
                        top: coords.top,
                        zIndex: 200,
                        padding: 4,
                        minWidth: 210,
                        boxShadow: 'var(--shadow-lg)',
                    }}
                >
                    {actions.map((a) => (
                        <button
                            key={a.key}
                            type="button"
                            role="menuitem"
                            className="btn btn-ghost btn-sm"
                            style={{
                                width: '100%',
                                justifyContent: 'flex-start',
                                gap: 8,
                                color: a.danger ? 'var(--red)' : a.active ? 'var(--accent)' : undefined,
                            }}
                            onClick={() => {
                                setOpen(false);
                                a.onClick();
                            }}
                        >
                            {a.icon}
                            {a.label}
                            {a.active && <span style={{ marginLeft: 'auto', color: 'var(--accent)' }}>✓</span>}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
