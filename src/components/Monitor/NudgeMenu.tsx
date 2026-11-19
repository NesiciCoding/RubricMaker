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
    const triggerRef = useRef<HTMLButtonElement | null>(null);
    const menuRef = useRef<HTMLDivElement | null>(null);
    // Where focus goes once the menu is open: set by a keyboard open, never by a pointer one.
    const [entryFocus, setEntryFocus] = useState<'first' | 'last' | null>(null);

    const items = () => Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    const close = (restoreFocus: boolean) => {
        setOpen(false);
        setEntryFocus(null);
        if (restoreFocus) triggerRef.current?.focus();
    };

    useEffect(() => {
        if (!open || entryFocus === null) return;
        const entries = items();
        (entryFocus === 'first' ? entries[0] : entries[entries.length - 1])?.focus();
    }, [open, entryFocus]);

    useEffect(() => {
        if (!open) return;
        const onPointerDown = (event: PointerEvent) => {
            // An outside click may be aimed at another control, so it must not pull focus back here.
            if (!rootRef.current?.contains(event.target as Node)) close(false);
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') close(true);
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
                ref={triggerRef}
                aria-haspopup="menu"
                aria-expanded={open}
                title={t('tests.monitor.nudge_button')}
                aria-label={t('tests.monitor.nudge_button')}
                onClick={(event) => {
                    // detail 0 is a keyboard activation (Enter/Space): move into the menu like a native one.
                    if (!open && event.detail === 0) setEntryFocus('first');
                    setOpen((value) => !value);
                }}
                onKeyDown={(event) => {
                    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                        event.preventDefault();
                        setEntryFocus(event.key === 'ArrowDown' ? 'first' : 'last');
                        setOpen(true);
                    }
                }}
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
                    ref={menuRef}
                    role="menu"
                    aria-label={t('tests.monitor.nudge_button')}
                    onKeyDown={(event) => {
                        const entries = items();
                        const index = entries.indexOf(document.activeElement as HTMLElement);
                        const move = (target: HTMLElement | undefined) => {
                            event.preventDefault();
                            target?.focus();
                        };
                        if (event.key === 'ArrowDown') move(entries[(index + 1) % entries.length]);
                        else if (event.key === 'ArrowUp') move(entries[(index - 1 + entries.length) % entries.length]);
                        else if (event.key === 'Home') move(entries[0]);
                        else if (event.key === 'End') move(entries[entries.length - 1]);
                        else if (event.key === 'Tab') close(false);
                    }}
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
                                tabIndex={-1}
                                className="btn btn-secondary btn-sm"
                                style={{ justifyContent: 'flex-start', textAlign: 'left' }}
                                onClick={() => {
                                    close(true);
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
