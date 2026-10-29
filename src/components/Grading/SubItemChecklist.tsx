import type React from 'react';
import { useTranslation } from 'react-i18next';
import { Target } from 'lucide-react';
import type { RubricCriterion, RubricLevel, ScoreEntry, SubItem } from '../../types';
import TouchStepper from './TouchStepper';
import {
    bestFitLevel,
    isTicked,
    subItemBreakdown,
    subItemMode,
    subItemRange,
    subItemScore,
} from '../../utils/subItems';

interface Props {
    criterion: RubricCriterion;
    level: RubricLevel;
    entry: ScoreEntry;
    accentColor: string;
    /** Points mode only scores the selected level; other levels list their sub-items read-only. */
    selected: boolean;
    onToggleTick: (subItemId: string) => void;
    onScore: (subItemId: string, score: number) => void;
    /** Shown above the list when several levels' checklists are listed together. */
    heading?: string;
    /** Lists each sub-item's linked standards beneath it, by notation or full description. */
    standardsDisplay?: 'notation' | 'description';
}

function LinkedStandards({ item, display }: { item: SubItem; display?: 'notation' | 'description' }) {
    if (!display || !item.linkedStandards?.length) return null;
    return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, fontSize: '0.72rem', color: 'var(--accent-text)' }}>
            {item.linkedStandards.map((std, idx) => (
                <span key={idx} title={display === 'description' ? (std.statementNotation ?? '') : std.description}>
                    {display === 'description' ? std.description : `[${std.statementNotation ?? std.guid}]`}
                </span>
            ))}
        </div>
    );
}

/**
 * A level's sub-items as a vertical list, the same in every grading layout. Checklist items are
 * checkboxes on every level; points items are scored on the selected level only, with the sum shown.
 */
export default function SubItemChecklist({
    criterion,
    level,
    entry,
    accentColor,
    selected,
    onToggleTick,
    onScore,
    heading,
    standardsDisplay,
}: Props) {
    const { t } = useTranslation();
    if (level.subItems.length === 0) return null;
    const mode = subItemMode(criterion);
    const readOnly = mode === 'points' && !selected;
    const breakdown = mode === 'points' && selected ? subItemBreakdown(entry, level) : null;

    return (
        <div
            className="sub-item-checklist"
            style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                opacity: readOnly ? 0.6 : 1,
            }}
        >
            {heading && (
                <div
                    style={{
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        color: selected ? accentColor : 'var(--text-muted)',
                    }}
                >
                    {heading}
                </div>
            )}
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {level.subItems.map((si) => {
                    if (mode === 'checklist') {
                        const ticked = isTicked(entry, si.id);
                        return (
                            <li key={si.id}>
                                <label
                                    className="sub-item-check"
                                    style={{
                                        display: 'flex',
                                        gap: 8,
                                        alignItems: 'flex-start',
                                        fontSize: '0.82rem',
                                        lineHeight: 1.35,
                                        cursor: 'pointer',
                                    }}
                                >
                                    <input
                                        type="checkbox"
                                        checked={ticked}
                                        onChange={() => onToggleTick(si.id)}
                                        style={{ marginTop: 2, accentColor, flexShrink: 0 }}
                                    />
                                    <span>{si.label}</span>
                                </label>
                                <LinkedStandards item={si} display={standardsDisplay} />
                            </li>
                        );
                    }
                    const { min, max } = subItemRange(si);
                    const score = subItemScore(entry, si);
                    const scoreText = `${score ?? '–'}/${max}${t('gradeStudent.table_points')}`;
                    if (readOnly) {
                        return (
                            <li key={si.id} style={{ display: 'flex', gap: 8, fontSize: '0.8rem', lineHeight: 1.35 }}>
                                <span style={{ flex: 1 }}>{si.label}</span>
                                <span className="text-muted">
                                    {max}
                                    {t('gradeStudent.table_points')}
                                </span>
                            </li>
                        );
                    }
                    // A one-point (or narrower) range is a yes/no; wider ranges get a slider.
                    if (max - min <= 1) {
                        const earned = score !== undefined && score >= max;
                        return (
                            <li key={si.id}>
                                <label
                                    className="sub-item-check"
                                    style={{
                                        display: 'flex',
                                        gap: 8,
                                        alignItems: 'flex-start',
                                        fontSize: '0.82rem',
                                        lineHeight: 1.35,
                                        cursor: 'pointer',
                                    }}
                                >
                                    <input
                                        type="checkbox"
                                        checked={earned}
                                        onChange={() => onScore(si.id, earned ? min : max)}
                                        style={{ marginTop: 2, accentColor, flexShrink: 0 }}
                                    />
                                    <span style={{ flex: 1 }}>{si.label}</span>
                                    <span className="text-muted" style={{ whiteSpace: 'nowrap' }}>
                                        {scoreText}
                                    </span>
                                </label>
                                <LinkedStandards item={si} display={standardsDisplay} />
                            </li>
                        );
                    }
                    const value = score ?? min;
                    return (
                        <li key={si.id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <div style={{ display: 'flex', gap: 8, fontSize: '0.82rem', lineHeight: 1.35 }}>
                                <span style={{ flex: 1 }}>{si.label}</span>
                                <span className="text-muted" style={{ whiteSpace: 'nowrap' }}>
                                    {scoreText}
                                </span>
                            </div>
                            <input
                                type="range"
                                min={min}
                                max={max}
                                step={0.5}
                                value={value}
                                onChange={(e) => onScore(si.id, Number(e.target.value))}
                                style={{ accentColor }}
                                aria-label={si.label}
                            />
                            <TouchStepper
                                value={value}
                                min={min}
                                max={max}
                                step={0.5}
                                accentColor={accentColor}
                                label={si.label}
                                onChange={(v) => onScore(si.id, v)}
                            />
                            <LinkedStandards item={si} display={standardsDisplay} />
                        </li>
                    );
                })}
            </ul>
            {readOnly && (
                <div className="text-xs text-muted" style={{ fontStyle: 'italic' }}>
                    {t('gradeStudent.sub_items_select_level_to_score')}
                </div>
            )}
            {breakdown && (
                <div className="text-xs text-muted" data-testid="sub-item-breakdown">
                    {t('gradeStudent.sub_items_breakdown', {
                        base: breakdown.base,
                        items: breakdown.items,
                        total: breakdown.total,
                    })}
                    {breakdown.clamped &&
                        ` · ${t('gradeStudent.sub_items_clamped', { min: level.minPoints, max: level.maxPoints })}`}
                </div>
            )}
        </div>
    );
}

interface BestFitProps {
    criterion: RubricCriterion;
    entry: ScoreEntry;
    accentColor: string;
    onApply: (levelId: string) => void;
    style?: React.CSSProperties;
}

/** Suggests the checklist level that best matches the ticked statements; the teacher still decides. */
export function BestFitHint({ criterion, entry, accentColor, onApply, style }: BestFitProps) {
    const { t } = useTranslation();
    if (subItemMode(criterion) !== 'checklist') return null;
    const fit = bestFitLevel(criterion, entry);
    if (!fit || fit.id === entry.levelId) return null;
    return (
        <div
            role="status"
            style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: '0.8rem', ...style }}
        >
            <Target size={13} aria-hidden="true" style={{ color: accentColor }} />
            <span>{t('gradeStudent.best_fit', { level: fit.label })}</span>
            <button
                type="button"
                className="btn btn-sm btn-secondary"
                onClick={() => onApply(fit.id)}
                aria-label={t('gradeStudent.best_fit_apply_label', { level: fit.label })}
            >
                {t('gradeStudent.best_fit_apply')}
            </button>
        </div>
    );
}
