import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CommentBankItem, RubricCriterion, RubricFormat, RubricLevel, ScoreEntry } from '../../types';
import type { TiptapEditorHandle } from '../Editor/TiptapEditor';
import { criterionMaxPoints } from '../../utils/gradeCalc';
import TouchStepper from './TouchStepper';
import SubItemChecklist, { BestFitHint } from './SubItemChecklist';
import { scoresSubItems, subItemMode, toggleTick } from '../../utils/subItems';
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
 * the chosen level, a fine-tune points slider, the sub-items (a checklist across every
 * level, or the chosen level's scored items), an override control at the bottom, and the comment
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
    // Raw text of the override field while it is being edited, so a half-typed entry like "9." is not
    // rewritten by the controlled rerender before the next keystroke lands.
    const [overrideDraft, setOverrideDraft] = useState<string | null>(null);

    const selectedLevel = entry.levelId ? levels.find((l) => l.id === entry.levelId) : undefined;
    const hasAnySubItems = scoresSubItems(criterion);
    const mode = subItemMode(criterion);
    const maxOverride = criterionMaxPoints(criterion);
    // A zero maximum means "uncapped" for total-points rubrics (calcEntryPoints reads it the same way),
    // so only clamp when the criterion actually declares a maximum.
    const clampOverride = (value: number) => Math.max(0, maxOverride > 0 ? Math.min(maxOverride, value) : value);
    const showBasePoints =
        !!selectedLevel && (selectedLevel.minPoints !== selectedLevel.maxPoints || selectedLevel.subItems.length === 0);

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

                {mode === 'checklist'
                    ? levels.some((l) => l.subItems.length > 0) && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                              <span
                                  style={{
                                      fontSize: '0.7rem',
                                      color: 'var(--text-muted)',
                                      textTransform: 'uppercase',
                                      fontWeight: 600,
                                  }}
                              >
                                  {t('gradeStudent.sub_items_checklist_label')}
                              </span>
                              <BestFitHint
                                  criterion={criterion}
                                  entry={entry}
                                  accentColor={fmt.accentColor}
                                  onApply={(levelId) => updateEntry({ levelId, overridePoints: undefined })}
                              />
                              {levels.map((l) => (
                                  <SubItemChecklist
                                      key={l.id}
                                      criterion={criterion}
                                      level={l}
                                      entry={entry}
                                      accentColor={fmt.accentColor}
                                      selected={l.id === entry.levelId}
                                      heading={l.label}
                                      onToggleTick={(id) => updateEntry({ checkedSubItems: toggleTick(entry, id) })}
                                      onScore={setSubItemScore}
                                  />
                              ))}
                          </div>
                      )
                    : selectedLevel &&
                      selectedLevel.subItems.length > 0 && (
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
                              <SubItemChecklist
                                  criterion={criterion}
                                  level={selectedLevel}
                                  entry={entry}
                                  accentColor={fmt.accentColor}
                                  selected
                                  onToggleTick={(id) => updateEntry({ checkedSubItems: toggleTick(entry, id) })}
                                  onScore={setSubItemScore}
                              />
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
                            onChange={(e) => {
                                setOverrideDraft(null);
                                updateEntry({
                                    overridePoints: e.target.checked
                                        ? clampOverride(entry.selectedPoints ?? selectedLevel?.minPoints ?? 0)
                                        : undefined,
                                });
                            }}
                            style={{ accentColor: 'var(--yellow)' }}
                        />
                        {t('gradeStudent.override_label')}
                    </label>
                    {entry.overridePoints !== undefined && (
                        <>
                            {/* Typing the exact mark beats tapping a 0.5 stepper up to 100 times. */}
                            <input
                                type="number"
                                inputMode="decimal"
                                min={0}
                                max={maxOverride > 0 ? maxOverride : undefined}
                                step={0.5}
                                value={overrideDraft ?? String(entry.overridePoints)}
                                aria-label={t('gradeStudent.override_label')}
                                onChange={(e) => {
                                    const raw = e.target.value;
                                    setOverrideDraft(raw);
                                    if (raw.trim() === '') return;
                                    const typed = Number(raw);
                                    if (Number.isNaN(typed)) return;
                                    updateEntry({ overridePoints: clampOverride(typed) });
                                }}
                                onBlur={() => setOverrideDraft(null)}
                                style={{
                                    width: 64,
                                    padding: '2px 4px',
                                    fontSize: '0.8rem',
                                    textAlign: 'center',
                                    accentColor: 'var(--yellow)',
                                }}
                            />
                            <TouchStepper
                                value={entry.overridePoints}
                                min={0}
                                max={maxOverride}
                                step={0.5}
                                accentColor="var(--yellow)"
                                label={t('gradeStudent.override_label')}
                                onChange={(v) => updateEntry({ overridePoints: v })}
                            />
                            {maxOverride > 0 && (
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                    / {maxOverride}
                                    {t('gradeStudent.table_points')}
                                </span>
                            )}
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
                    audioStoragePath={entry.audioStoragePath}
                    onStartAudio={onStartAudio}
                    onStopAudio={onStopAudio}
                    onRemoveAudio={onRemoveAudio}
                />
            </div>
        </div>
    );
}
