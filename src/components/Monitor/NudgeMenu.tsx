import React, { useEffect, useRef, useState } from 'react';
import { Send } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/** Ordered as a teacher needs them: mid-question first, then the time warning, then saving. */
export const NUDGE_PRESETS = ['check', 'time', 'save'] as const;

export interface NudgeMenuProps {
    /** Receives the chosen preset's message, already translated. */
    onSend: (message: string) => void;
    /** Icon-only trigger for dense rows (the grid). */
    iconOnly?: boolean;
}

/**
 * A nudge that takes one click instead of typing mid-lesson. The presets are short, specific
 * instructions a teacher actually sends ("Check the question you're on", "5 minutes left"), and
 * picking one closes the menu so the next click is on the class, not on the popover.
 */
export default function NudgeMenu({ onSend, iconOnly = false }: NudgeMenuProps) {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!open) return;
        const onPointerDown = (event: PointerEvent) => {
            if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setOpen(false);
        };
        document.addEventListener('pointerdown', onPointerDown);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('pointerdown', onPointerDown);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [open]);

    return (
        <div ref={rootRef} style={{ position: 'relative', display: 'inline-block' }}>
            <button
                type="button"
                className={iconOnly ? 'btn btn-ghost btn-icon btn-sm' : 'btn btn-secondary btn-sm'}
                aria-haspopup="menu"
                aria-expanded={open}
                title={t('tests.monitor.nudge_button')}
                aria-label={t('tests.monitor.nudge_button')}
                onClick={() => setOpen((value) => !value)}
                style={
                    iconOnly
                        ? undefined
                        : { display: 'inline-flex', alignItems: 'center', gap: 5, justifyContent: 'center' }
                }
            >
                <Send size={13} aria-hidden="true" />
                {!iconOnly && t('tests.monitor.nudge_button')}
            </button>
            {open && (
                <div
                    role="menu"
                    data-testid="nudge-presets"
                    style={{
                        position: 'absolute',
                        right: 0,
                        top: 'calc(100% + 4px)',
                        zIndex: 20,
                        minWidth: 210,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 2,
                        padding: 4,
                        background: 'var(--bg-elevated)',
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                        boxShadow: '0 6px 20px rgba(0, 0, 0, 0.25)',
                    }}
                >
                    {NUDGE_PRESETS.map((preset) => {
                        const message = t(`tests.monitor.nudge.preset_${preset}`);
                        return (
                            <button
                                key={preset}
                                type="button"
                                role="menuitem"
                                className="btn btn-secondary btn-sm"
                                style={{ justifyContent: 'flex-start', textAlign: 'left' }}
                                onClick={() => {
                                    setOpen(false);
                                    onSend(message);
                                }}
                            >
                                {message}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
