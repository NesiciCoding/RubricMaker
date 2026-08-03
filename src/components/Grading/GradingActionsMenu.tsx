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
    const menuRef = useRef<HTMLDivElement>(null);
    // Fixed-position coords computed from the trigger — the Topbar's actions row has
    // `overflow: auto`, which would otherwise clip an absolutely-positioned dropdown.
    const [coords, setCoords] = useState<{ top: number; right: number } | null>(null);

    const openMenu = () => {
        const r = btnRef.current?.getBoundingClientRect();
        if (r) setCoords({ top: r.bottom + 4, right: window.innerWidth - r.right });
        setOpen(true);
    };
    const closeMenu = (returnFocus = true) => {
        setOpen(false);
        if (returnFocus) btnRef.current?.focus();
    };

    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => {
            if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') closeMenu();
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

    // Move focus into the menu on open (ARIA menu-button pattern).
    useEffect(() => {
        if (!open) return;
        menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    }, [open]);

    const onMenuKeyDown = (e: React.KeyboardEvent) => {
        const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);
        if (items.length === 0) return;
        const idx = items.indexOf(document.activeElement as HTMLButtonElement);
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            items[(idx + 1) % items.length]?.focus();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            items[(idx - 1 + items.length) % items.length]?.focus();
        } else if (e.key === 'Home') {
            e.preventDefault();
            items[0]?.focus();
        } else if (e.key === 'End') {
            e.preventDefault();
            items[items.length - 1]?.focus();
        }
    };

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
                    ref={menuRef}
                    className="card"
                    role="menu"
                    onKeyDown={onMenuKeyDown}
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
                                closeMenu(false);
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
