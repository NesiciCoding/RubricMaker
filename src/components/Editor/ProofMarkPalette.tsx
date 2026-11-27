import React, { useCallback, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    familyForShortcut,
    familyLabelKey,
    getSymbol,
    shortcutFor,
    symbolsByFamily,
    type ProofMarkId,
} from '../../data/proofMarks';
import { resolveMarkCode } from '../../utils/proofMarkCode';
import MarkGlyph from './MarkGlyph';

/** Palette previews run at 20 px: below 14 the two hooked glyphs stop reading as marks. */
const GLYPH_SIZE = 20;

const VISUALLY_HIDDEN: React.CSSProperties = {
    position: 'absolute',
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: 'hidden',
    clip: 'rect(0 0 0 0)',
    whiteSpace: 'nowrap',
    border: 0,
};

export interface ProofMarkPaletteProps {
    /** Applies a symbol to the current selection. The caller owns the record write and the rail. */
    onPlaceMark: (symbolId: ProofMarkId) => void;
    /** False while the surface cannot take marks — an empty selection, or a student's own view. */
    enabled?: boolean;
    /** Explains an inert palette; defaults to asking for a selection. */
    disabledReason?: string | null;
    dir?: 'ltr' | 'rtl';
}

/**
 * The mark palette: one button per registry symbol, grouped by family, plus a typed-code field.
 *
 * Keyboard contract, because placement must never need the mouse: one tab stop in the whole grid
 * (roving `tabIndex`), arrows move between symbols, up and down jump between families, Home and End
 * reach the ends, Alt + the family's digit jumps straight to that family, and a code typed into the
 * field applies with Enter.
 */
export default function ProofMarkPalette({
    onPlaceMark,
    enabled = true,
    disabledReason = null,
    dir = 'ltr',
}: ProofMarkPaletteProps) {
    const { t } = useTranslation();
    const fieldId = useId();
    const hintId = `${fieldId}-hint`;

    const groups = useMemo(() => symbolsByFamily(), []);
    const symbols = useMemo(() => groups.flatMap((group) => group.symbols), [groups]);
    const familyStarts = useMemo(() => {
        const starts: number[] = [];
        let at = 0;
        for (const group of groups) {
            starts.push(at);
            at += group.symbols.length;
        }
        return starts;
    }, [groups]);

    const [code, setCode] = useState('');
    const [announcement, setAnnouncement] = useState('');
    const [focusIndex, setFocusIndex] = useState(0);
    const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);

    const disabled = !enabled;
    const resolution = useMemo(() => resolveMarkCode(code), [code]);
    const labelFor = useCallback((symbolId: ProofMarkId) => t(getSymbol(symbolId).labelKey), [t]);

    const focusSymbol = useCallback(
        (index: number) => {
            const next = Math.min(Math.max(index, 0), Math.max(symbols.length - 1, 0));
            setFocusIndex(next);
            buttonRefs.current[next]?.focus();
        },
        [symbols.length]
    );

    const place = useCallback(
        (symbolId: ProofMarkId) => {
            if (disabled) return;
            onPlaceMark(symbolId);
            setAnnouncement(t('proofMarks.palette.codeApplied', { symbol: labelFor(symbolId) }));
        },
        [disabled, labelFor, onPlaceMark, t]
    );

    const applyCode = useCallback(() => {
        if (disabled || !resolution.symbolId) return;
        place(resolution.symbolId);
        setCode('');
    }, [disabled, place, resolution.symbolId]);

    const onFieldKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            applyCode();
            return;
        }
        if (event.key === 'ArrowDown' && resolution.symbolId) {
            event.preventDefault();
            const index = symbols.findIndex((symbol) => symbol.id === resolution.symbolId);
            if (index >= 0) focusSymbol(index);
        }
    };

    const onGridKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
        if (!event.altKey) return;
        const family = familyForShortcut(event.key);
        if (!family) return;
        const familyIndex = groups.findIndex((group) => group.family === family);
        if (familyIndex < 0) return;
        event.preventDefault();
        focusSymbol(familyStarts[familyIndex] ?? 0);
    };

    const onSymbolKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
        const starts = familyStarts;
        const nextFamily = starts.find((start) => start > index);
        const previousFamily = [...starts].reverse().find((start) => start < index);

        switch (event.key) {
            case 'ArrowRight':
                event.preventDefault();
                focusSymbol(index + 1);
                return;
            case 'ArrowLeft':
                event.preventDefault();
                focusSymbol(index - 1);
                return;
            case 'ArrowDown':
                event.preventDefault();
                focusSymbol(nextFamily ?? starts[0] ?? 0);
                return;
            case 'ArrowUp':
                event.preventDefault();
                focusSymbol(previousFamily ?? starts[starts.length - 1] ?? 0);
                return;
            case 'Home':
                event.preventDefault();
                focusSymbol(0);
                return;
            case 'End':
                event.preventDefault();
                focusSymbol(symbols.length - 1);
                return;
            default:
        }
    };

    let hint = t('proofMarks.palette.codeHint');
    if (disabled) {
        hint = disabledReason ?? t('proofMarks.palette.needSelection');
    } else if (resolution.symbolId) {
        hint = t('proofMarks.palette.codeResolved', { symbol: labelFor(resolution.symbolId) });
    } else if (resolution.status === 'ambiguous') {
        hint = t('proofMarks.palette.codeAmbiguous', {
            code: code.trim(),
            symbols: resolution.candidates.map((id) => labelFor(id)).join('; '),
        });
    } else if (resolution.status === 'none') {
        hint = t('proofMarks.palette.codeNoMatch', { code: code.trim() });
    }

    return (
        <section
            role="group"
            aria-label={t('proofMarks.palette.label')}
            dir={dir}
            onKeyDown={onGridKeyDown}
            style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 360 }}
        >
            <div>
                <label htmlFor={fieldId} style={VISUALLY_HIDDEN}>
                    {t('proofMarks.palette.codeField')}
                </label>
                <input
                    id={fieldId}
                    type="text"
                    value={code}
                    disabled={disabled}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder={t('proofMarks.palette.codePlaceholder')}
                    aria-describedby={hintId}
                    onChange={(event) => setCode(event.target.value)}
                    onKeyDown={onFieldKeyDown}
                    style={{
                        width: '100%',
                        boxSizing: 'border-box',
                        padding: '3px 6px',
                        border: '1px solid rgba(153, 27, 27, 0.3)',
                        borderRadius: 4,
                        background: disabled ? 'transparent' : '#fef2f2',
                        color: 'var(--page-mark-ink, #991b1b)',
                        font: 'inherit',
                        fontSize: 12,
                    }}
                />
                <p id={hintId} aria-live="polite" style={{ margin: '2px 0 0', fontSize: 11 }}>
                    {hint}
                </p>
                <span aria-live="polite" style={VISUALLY_HIDDEN}>
                    {announcement}
                </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {groups.map((group) => (
                    <div
                        key={group.family}
                        role="group"
                        aria-labelledby={`${fieldId}-${group.family}`}
                        style={{ display: 'flex', flexDirection: 'column', gap: 2 }}
                    >
                        <p
                            id={`${fieldId}-${group.family}`}
                            style={{ margin: 0, fontSize: 10, fontWeight: 600, letterSpacing: '0.02em' }}
                        >
                            {t('proofMarks.palette.shortcut', {
                                family: t(familyLabelKey(group.family)),
                                key: shortcutFor(group.family),
                            })}
                        </p>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                            {group.symbols.map((symbol) => {
                                const index = symbols.findIndex((entry) => entry.id === symbol.id);
                                const label = labelFor(symbol.id);
                                return (
                                    <button
                                        key={symbol.id}
                                        type="button"
                                        ref={(node) => {
                                            buttonRefs.current[index] = node;
                                        }}
                                        tabIndex={index === focusIndex ? 0 : -1}
                                        disabled={disabled}
                                        aria-label={label}
                                        title={`${label} — ${t('proofMarks.palette.shortcut', {
                                            family: t(familyLabelKey(group.family)),
                                            key: shortcutFor(group.family),
                                        })}`}
                                        onFocus={() => setFocusIndex(index)}
                                        onKeyDown={(event) => onSymbolKeyDown(event, index)}
                                        onClick={() => place(symbol.id)}
                                        style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: 4,
                                            padding: '2px 6px',
                                            border: '1px solid rgba(153, 27, 27, 0.25)',
                                            borderRadius: 4,
                                            background: disabled ? 'transparent' : '#fef2f2',
                                            color: 'var(--page-mark-ink, #991b1b)',
                                            font: 'inherit',
                                            fontSize: 11,
                                            lineHeight: 1.2,
                                            cursor: disabled ? 'not-allowed' : 'pointer',
                                        }}
                                    >
                                        <MarkGlyph id={symbol.glyph} dir={dir} size={GLYPH_SIZE} />
                                        <span>{label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>
        </section>
    );
}
