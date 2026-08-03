import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CommentBankItem, RubricCriterion, RubricFormat, RubricLevel, ScoreEntry } from '../../types';
import type { TiptapEditorHandle } from '../Editor/TiptapEditor';
import { criterionMaxPoints } from '../../utils/gradeCalc';
import TouchStepper from './TouchStepper';
import CommentComposer from './CommentComposer';

interface Props {
    criterion: RubricCriterion;
    criterionLetter: string;
    entry: ScoreEntry;
    levels: RubricLevel[];
    fmt: RubricFormat;
    updateEntry: (patch: Partial<ScoreEntry>) => void;
    setSubItemScore: (subItemId: string, score: number) => void;
    commentBank: CommentBankItem[];
    editorRef: React.Ref<TiptapEditorHandle>;
    onInsertChip: (item: CommentBankItem) => void;
    onBrowseAll: () => void;
    audioRecording: boolean;
    audioDataUrl?: string;
    onStartAudio: () => void;
    onStopAudio: () => void;
    onRemoveAudio: () => void;
}

/**
 * The focused-criterion editor beneath the grid row (Phase 40): full descriptor of
 * the chosen level, a fine-tune points slider, sub-item chips (single → toggle,
 * range → expand to a scorer), an override control at the bottom, and the comment
 * composer. On wide screens it lays out as two side-by-side panels (mockup); it
 * stacks on narrow widths.
 */
export default function CriterionDetailPanel({
    criterion,
    criterionLetter,
    entry,
    levels,
    fmt,
    updateEntry,
    setSubItemScore,
    commentBank,
    editorRef,
    onInsertChip,
    onBrowseAll,
    audioRecording,
    audioDataUrl,
    onStartAudio,
    onStopAudio,
    onRemoveAudio,
}: Props) {
    const { t } = useTranslation();
    const [expandedSubItems, setExpandedSubItems] = useState<Set<string>>(new Set());

    const selectedLevel = entry.levelId ? levels.find((l) => l.id === entry.levelId) : undefined;
    const hasAnySubItems = criterion.levels.some((l) => l.subItems.length > 0);
    const maxOverride = criterionMaxPoints(criterion);
    const showBasePoints =
        !!selectedLevel && (selectedLevel.minPoints !== selectedLevel.maxPoints || selectedLevel.subItems.length === 0);

    const toggleExpanded = (id: string) =>
        setExpandedSubItems((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });

    return (
        <div
            className="grading-detail"
            style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: 16,
                padding: 14,
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
            }}
        >
            {/* Left panel — descriptor + fine-tune points + sub-items + override */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span className="badge badge-blue" aria-hidden="true">
                        {criterionLetter}
                    </span>
                    <span style={{ fontWeight: 700 }}>{criterion.title}</span>
                </div>

                {selectedLevel ? (
                    <div style={{ fontSize: '0.85rem', color: 'var(--text)', lineHeight: 1.45 }}>
                        <span style={{ fontWeight: 700, color: fmt.accentColor }}>{selectedLevel.label}</span>
                        {selectedLevel.description && (
                            <span style={{ color: 'var(--text-muted)' }}> — {selectedLevel.description}</span>
                        )}
                    </div>
                ) : (
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-dim)', fontStyle: 'italic' }}>
                        {t('gradeStudent.grid_pick_level')}
                    </div>
                )}

                {/* Fine-tune base points */}
                {showBasePoints && selectedLevel && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <span
                            style={{
                                fontSize: '0.7rem',
                                color: 'var(--text-muted)',
                                textTransform: 'uppercase',
                                fontWeight: 600,
                            }}
                        >
                            {hasAnySubItems ? t('gradeStudent.label_base_points') : t('gradeStudent.label_points')}
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <input
                                type="range"
                                min={selectedLevel.minPoints}
                                max={selectedLevel.maxPoints}
                                step={0.5}
                                value={entry.selectedPoints ?? selectedLevel.minPoints}
                                onChange={(e) => updateEntry({ selectedPoints: Number(e.target.value) })}
                                style={{ flex: 1, accentColor: fmt.accentColor }}
                                aria-label={
                                    hasAnySubItems
                                        ? t('gradeStudent.label_base_points')
                                        : t('gradeStudent.label_points')
                                }
                            />
                            <div style={{ fontSize: '0.8rem', fontWeight: 600, minWidth: 24, textAlign: 'right' }}>
                                {entry.selectedPoints ?? selectedLevel.minPoints}
                            </div>
                        </div>
                        <TouchStepper
                            value={entry.selectedPoints ?? selectedLevel.minPoints}
                            min={selectedLevel.minPoints}
                            max={selectedLevel.maxPoints}
                            step={0.5}
                            accentColor={fmt.accentColor}
                            label={
                                hasAnySubItems ? t('gradeStudent.label_base_points') : t('gradeStudent.label_points')
                            }
                            onChange={(v) => updateEntry({ selectedPoints: v })}
                        />
                    </div>
                )}

                {/* Sub-item chips (of the selected level) */}
                {selectedLevel && selectedLevel.subItems.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <span
                            style={{
                                fontSize: '0.7rem',
                                color: 'var(--text-muted)',
                                textTransform: 'uppercase',
                                fontWeight: 600,
                            }}
                        >
                            {t('gradeStudent.sub_items_label')}
                        </span>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                            {selectedLevel.subItems.map((si) => {
                                const min = si.minPoints ?? 0;
                                const max = si.maxPoints ?? si.points ?? 1;
                                const isRange = max > min;
                                const legacyChecked = (entry.checkedSubItems ?? []).includes(si.id);
                                const currentScore = entry.subItemScores?.[si.id] ?? (legacyChecked ? max : min);
                                const isExpanded = expandedSubItems.has(si.id);
                                const singleSelected = !isRange && currentScore >= max;

                                if (!isRange) {
                                    return (
                                        <button
                                            key={si.id}
                                            type="button"
                                            className="btn btn-sm"
                                            aria-pressed={singleSelected}
                                            onClick={() => setSubItemScore(si.id, singleSelected ? min : max)}
                                            style={{
                                                borderRadius: 999,
                                                fontSize: '0.78rem',
                                                border: `1.5px solid ${singleSelected ? fmt.accentColor : 'var(--border)'}`,
                                                background: singleSelected ? `${fmt.accentColor}1a` : 'var(--bg-card)',
                                                color: singleSelected ? fmt.accentColor : 'var(--text)',
                                            }}
                                        >
                                            {si.label} · {max}
                                            {t('gradeStudent.table_points')}
                                        </button>
                                    );
                                }

                                return (
                                    <div key={si.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                        <button
                                            type="button"
                                            className="btn btn-sm"
                                            aria-expanded={isExpanded}
                                            onClick={() => toggleExpanded(si.id)}
                                            style={{
                                                borderRadius: 999,
                                                fontSize: '0.78rem',
                                                border: `1.5px solid ${currentScore > min ? fmt.accentColor : 'var(--border)'}`,
                                                background:
                                                    currentScore > min ? `${fmt.accentColor}1a` : 'var(--bg-card)',
                                                color: currentScore > min ? fmt.accentColor : 'var(--text)',
                                            }}
                                        >
                                            {si.label} · {currentScore}/{max} {isExpanded ? '▴' : '▾'}
                                        </button>
                                        {isExpanded && (
                                            <div
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: 8,
                                                    padding: '4px 8px',
                                                    background: 'var(--bg-card)',
                                                    border: '1px solid var(--border)',
                                                    borderRadius: 'var(--radius)',
                                                }}
                                            >
                                                <input
                                                    type="range"
                                                    min={min}
                                                    max={max}
                                                    step={0.5}
                                                    value={currentScore}
                                                    onChange={(e) => setSubItemScore(si.id, Number(e.target.value))}
                                                    style={{ flex: 1, accentColor: fmt.accentColor }}
                                                    aria-label={si.label}
                                                />
                                                <TouchStepper
                                                    value={currentScore}
                                                    min={min}
                                                    max={max}
                                                    step={0.5}
                                                    accentColor={fmt.accentColor}
                                                    label={si.label}
                                                    onChange={(v) => setSubItemScore(si.id, v)}
                                                />
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Override — at the bottom of the cell (directive 5) */}
                <div
                    style={{
                        marginTop: 'auto',
                        paddingTop: 10,
                        borderTop: '1px solid var(--border)',
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        gap: 8,
                    }}
                >
                    <label
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            fontSize: '0.75rem',
                            color: entry.overridePoints !== undefined ? 'var(--yellow)' : 'var(--text-muted)',
                            cursor: 'pointer',
                            userSelect: 'none',
                        }}
                    >
                        <input
                            type="checkbox"
                            checked={entry.overridePoints !== undefined}
                            onChange={(e) =>
                                updateEntry({
                                    overridePoints: e.target.checked
                                        ? Math.min(maxOverride, entry.selectedPoints ?? selectedLevel?.minPoints ?? 0)
                                        : undefined,
                                })
                            }
                            style={{ accentColor: 'var(--yellow)' }}
                        />
                        {t('gradeStudent.override_label')}
                    </label>
                    {entry.overridePoints !== undefined && (
                        <>
                            <TouchStepper
                                value={entry.overridePoints}
                                min={0}
                                max={maxOverride}
                                step={0.5}
                                accentColor="var(--yellow)"
                                label={t('gradeStudent.override_label')}
                                onChange={(v) => updateEntry({ overridePoints: v })}
                            />
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                / {maxOverride}
                                {t('gradeStudent.table_points')}
                            </span>
                        </>
                    )}
                </div>
            </div>

            {/* Right panel — comment composer */}
            <div style={{ minWidth: 0 }}>
                <CommentComposer
                    value={entry.comment || ''}
                    onChange={(html) => updateEntry({ comment: html })}
                    editorRef={editorRef}
                    commentBank={commentBank}
                    onInsertChip={onInsertChip}
                    onBrowseAll={onBrowseAll}
                    audioRecording={audioRecording}
                    audioDataUrl={audioDataUrl}
                    onStartAudio={onStartAudio}
                    onStopAudio={onStopAudio}
                    onRemoveAudio={onRemoveAudio}
                />
            </div>
        </div>
    );
}
