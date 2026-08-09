import React from 'react';
import { useTranslation } from 'react-i18next';
import type {
    CommentBankItem,
    RubricCriterion,
    RubricFormat,
    RubricLevel,
    ScoreEntry,
    StudentRubric,
} from '../../types';
import type { TiptapEditorHandle } from '../Editor/TiptapEditor';
import CriterionDetailPanel from './CriterionDetailPanel';
import { storageSync } from '../../services/database';

/** Criterion index → chord letter (A, B, … Z, then A2, B2 … as a safe fallback). */
function letterFor(index: number): string {
    if (index < 26) return String.fromCharCode(65 + index);
    return `${String.fromCharCode(65 + (index % 26))}${Math.floor(index / 26) + 1}`;
}

interface Props {
    criteria: RubricCriterion[];
    sr: StudentRubric;
    fmt: RubricFormat;
    orderedLevels: (c: RubricCriterion) => RubricLevel[];
    focusedIdx: number | null;
    setFocusedIdx: (i: number | null) => void;
    updateEntry: (criterionId: string, patch: Partial<ScoreEntry>) => void;
    setSubItemScore: (entry: ScoreEntry, subItemId: string, score: number) => void;
    commentBank: CommentBankItem[];
    commentEditorRef: React.Ref<TiptapEditorHandle>;
    onInsertChip: (item: CommentBankItem) => void;
    onBrowseAll: (criterionId: string) => void;
    recordingKey: string | null;
    onStartAudio: (criterionId: string) => void;
    onStopAudio: (criterionId: string) => void;
}

/**
 * Phase 40 grid layout: criteria as rows, levels as columns. Hybrid cells show
 * label + points + a 2-line-clamped descriptor (full text on hover); the focused
 * criterion expands a full-width detail row (fine-tune, sub-items, override, comment).
 * Applies to multi-level rubrics only — single-point rubrics keep the card layout.
 */
export default function GradingGrid({
    criteria,
    sr,
    fmt,
    orderedLevels,
    focusedIdx,
    setFocusedIdx,
    updateEntry,
    setSubItemScore,
    commentBank,
    commentEditorRef,
    onInsertChip,
    onBrowseAll,
    recordingKey,
    onStartAudio,
    onStopAudio,
}: Props) {
    const { t } = useTranslation();
    const maxLevels = criteria.reduce((m, c) => Math.max(m, orderedLevels(c).length), 0);

    return (
        <div
            className="grading-grid-scroll"
            data-tour="grading-criteria"
            style={{ overflowX: 'auto', marginBottom: 20 }}
        >
            <table className="grading-grid-table" style={{ fontFamily: fmt.fontFamily, fontSize: fmt.fontSize }}>
                <thead>
                    <tr>
                        <th className="grid-corner" scope="col">
                            {t('gradeStudent.table_criterion')}
                        </th>
                        {Array.from({ length: maxLevels }).map((_, i) => (
                            <th key={i} scope="col" className="grid-col-head">
                                {i + 1}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {criteria.map((c, ci) => {
                        const entry = sr.entries.find((e) => e.criterionId === c.id)!;
                        const levels = orderedLevels(c);
                        const letter = letterFor(ci);
                        const focused = focusedIdx === ci;
                        return (
                            <React.Fragment key={c.id}>
                                <tr className={focused ? 'grid-row-focused' : undefined}>
                                    <th scope="row" className="grid-row-head">
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <span className="grid-letter" aria-hidden="true">
                                                {letter}
                                            </span>
                                            <div style={{ minWidth: 0 }}>
                                                <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{c.title}</div>
                                                {fmt.showWeights && (
                                                    <span
                                                        className="badge badge-blue"
                                                        style={{ marginTop: 2, fontSize: '0.65rem' }}
                                                    >
                                                        {c.weight}%
                                                    </span>
                                                )}
                                                {entry.overridePoints !== undefined && (
                                                    <div
                                                        style={{
                                                            fontSize: '0.68rem',
                                                            color: 'var(--yellow)',
                                                            marginTop: 2,
                                                        }}
                                                    >
                                                        {t('gradeStudent.label_override')} {entry.overridePoints}
                                                        {t('gradeStudent.table_points')}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </th>
                                    {levels.map((level, li) => {
                                        const isSelected = entry.levelId === level.id;
                                        const pointsLabel =
                                            level.minPoints === level.maxPoints
                                                ? `${level.minPoints}${t('gradeStudent.table_points')}`
                                                : `${level.minPoints}–${level.maxPoints}${t('gradeStudent.table_points')}`;
                                        return (
                                            <td key={level.id} className="grid-cell">
                                                <button
                                                    type="button"
                                                    className={`grid-cell-btn${isSelected ? ' selected' : ''}`}
                                                    aria-pressed={isSelected}
                                                    title={level.description || level.label}
                                                    style={
                                                        isSelected
                                                            ? {
                                                                  borderColor: fmt.accentColor,
                                                                  background: `${fmt.accentColor}1a`,
                                                              }
                                                            : undefined
                                                    }
                                                    onClick={() => {
                                                        setFocusedIdx(ci);
                                                        updateEntry(c.id, {
                                                            levelId: isSelected ? null : level.id,
                                                            overridePoints: undefined,
                                                        });
                                                    }}
                                                >
                                                    <div className="grid-cell-top">
                                                        <span
                                                            className="grid-cell-label"
                                                            style={{
                                                                color: isSelected ? fmt.accentColor : 'var(--text)',
                                                            }}
                                                        >
                                                            {focused && (
                                                                <span className="grid-cell-chord" aria-hidden="true">
                                                                    {li + 1}
                                                                </span>
                                                            )}
                                                            {level.label}
                                                        </span>
                                                        {level.cefrLevel && (
                                                            <span className="grid-cell-cefr">{level.cefrLevel}</span>
                                                        )}
                                                    </div>
                                                    {fmt.showPoints && (
                                                        <div className="grid-cell-points">{pointsLabel}</div>
                                                    )}
                                                    {level.description ? (
                                                        <div className="grid-cell-desc">{level.description}</div>
                                                    ) : (
                                                        <div className="grid-cell-desc grid-cell-desc-empty">
                                                            {t('gradeStudent.level_select')}
                                                        </div>
                                                    )}
                                                </button>
                                            </td>
                                        );
                                    })}
                                    {Array.from({ length: maxLevels - levels.length }).map((_, i) => (
                                        <td
                                            key={`filler-${i}`}
                                            className="grid-cell grid-cell-filler"
                                            aria-hidden="true"
                                        />
                                    ))}
                                </tr>
                                {focused && (
                                    <tr>
                                        <td colSpan={maxLevels + 1} style={{ padding: 0 }}>
                                            <CriterionDetailPanel
                                                criterion={c}
                                                criterionLetter={letter}
                                                entry={entry}
                                                levels={levels}
                                                fmt={fmt}
                                                updateEntry={(patch) => updateEntry(c.id, patch)}
                                                setSubItemScore={(subItemId, score) =>
                                                    setSubItemScore(entry, subItemId, score)
                                                }
                                                commentBank={commentBank}
                                                editorRef={commentEditorRef}
                                                onInsertChip={onInsertChip}
                                                onBrowseAll={() => onBrowseAll(c.id)}
                                                audioRecording={recordingKey === c.id}
                                                audioDataUrl={entry.audioDataUrl}
                                                onStartAudio={() => onStartAudio(c.id)}
                                                onStopAudio={() => onStopAudio(c.id)}
                                                onRemoveAudio={() => {
                                                    if (entry.audioStoragePath)
                                                        void storageSync.feedbackAudioSync.deleteByPath(
                                                            entry.audioStoragePath
                                                        );
                                                    updateEntry(c.id, {
                                                        audioDataUrl: undefined,
                                                        audioStoragePath: undefined,
                                                    });
                                                }}
                                            />
                                        </td>
                                    </tr>
                                )}
                            </React.Fragment>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
