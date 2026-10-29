import { memo, useState } from 'react';
import { flushSync } from 'react-dom';
import { useTranslation } from 'react-i18next';
import {
    Edit2,
    Trash2,
    Copy,
    Users,
    GitCompare,
    Share2,
    Check,
    Layers,
    Link2,
    Users2,
    GripVertical,
    ExternalLink,
    UsersRound,
} from 'lucide-react';
import { Draggable } from '@hello-pangea/dnd';
import type { Rubric, Student } from '../../types';
import CefrBadge from '../CEFR/CefrBadge';
import { encodeRubricShareCode } from '../../utils/rubricImport';

export interface RubricCardActions {
    onEdit: (id: string) => void;
    onDuplicate: (id: string) => void;
    onDelete: (rubric: Rubric) => void;
    onDifferentiate: (id: string) => void;
    onCopyShareCode: (id: string) => void;
    onSharePreview: (id: string) => void;
    onOpenShareModal: (id: string, name: string) => void;
    onGradeStudents: () => void;
    onCompare: (id: string) => void;
    onGroupGrade: (rubric: Rubric) => void;
    onSpeakingSelect: (rubricId: string, studentId: string) => void;
}

interface RubricCardProps {
    rubric: Rubric;
    index: number;
    reorderable: boolean;
    gradedCount: number;
    dbConnected: boolean;
    isCopied: boolean;
    isPreviewCopied: boolean;
    classStudents: Student[];
    hasActiveClass: boolean;
    actions: RubricCardActions;
    /**
     * The card's “Move to…” menu. A render prop rather than an element so the page can keep it a
     * stable callback — the card is memoised, and a fresh element per render would defeat that.
     */
    moveMenuFor?: (rubric: Rubric) => React.ReactNode;
}

// The per-card speaking-session picker used to map every student into an <option> for all 300+
// cards on first render, whether or not a teacher ever opened it. Options are built lazily, on
// the first time the control is actually interacted with — flushSync so a mousedown-triggered
// native dropdown open sees the options that same tick (#670).
function SpeakingSessionSelect({
    rubricId,
    classStudents,
    onSelect,
}: {
    rubricId: string;
    classStudents: Student[];
    onSelect: (rubricId: string, studentId: string) => void;
}) {
    const { t } = useTranslation();
    const [opened, setOpened] = useState(false);
    const reveal = () => {
        if (!opened) flushSync(() => setOpened(true));
    };
    return (
        <div style={{ position: 'relative', flex: '1 1 auto' }}>
            <select
                value=""
                aria-label={t('rubricList.speaking_select_student')}
                onMouseDown={reveal}
                onFocus={reveal}
                onChange={(e) => {
                    if (e.target.value) onSelect(rubricId, e.target.value);
                }}
                style={{
                    width: '100%',
                    padding: '5px 8px',
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                    background: 'var(--bg-elevated)',
                    color: 'var(--text)',
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                }}
            >
                <option value="" disabled>
                    {t('rubricList.speaking_select_student')}
                </option>
                {opened &&
                    classStudents.map((s) => (
                        <option key={s.id} value={s.id}>
                            {s.name}
                        </option>
                    ))}
            </select>
        </div>
    );
}

/** One rubric card in the grid view. Memoized so editing unrelated state on the page (search,
 *  copy-feedback on another card, modals) re-renders only the card whose own props actually
 *  changed, not every card in the list (#670). */
function RubricCard({
    rubric,
    index,
    reorderable,
    gradedCount,
    dbConnected,
    isCopied,
    isPreviewCopied,
    classStudents,
    hasActiveClass,
    actions,
    moveMenuFor,
}: RubricCardProps) {
    const { t } = useTranslation();

    return (
        <Draggable draggableId={rubric.id} index={index} isDragDisabled={!reorderable}>
            {(dragProvided) => (
                <div
                    ref={dragProvided.innerRef}
                    {...dragProvided.draggableProps}
                    className="card"
                    style={{
                        cursor: 'pointer',
                        transition: 'border-color var(--transition)',
                        // Fixed basis, no grow: tiles stay the same width on every row (a growing
                        // basis made the last row's cards wider than the full ones above it).
                        // minWidth 0 keeps that basis honest — a flex item's automatic minimum is
                        // its min-content width, so the nowrap (`.truncate`) description used to
                        // stretch its card to the width of the whole sentence.
                        flex: '0 1 400px',
                        minWidth: 0,
                        maxWidth: '100%',
                        ...dragProvided.draggableProps.style,
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')}
                    onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
                >
                    {/* The title gets its own full-width line so a long name wraps instead of
                        squeezing the action row off the card. */}
                    <div
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 8,
                            marginBottom: 12,
                        }}
                    >
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: 6,
                                minWidth: 0,
                            }}
                        >
                            {reorderable && (
                                <span
                                    {...dragProvided.dragHandleProps}
                                    aria-label={t('rubricList.drag_to_reorder')}
                                    style={{
                                        cursor: 'grab',
                                        color: 'var(--text-dim)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        flexShrink: 0,
                                        // Padding (cancelled by the negative margin) grows the grab
                                        // area around the corner glyph to a 25px touch target.
                                        padding: 5,
                                        margin: '-1px 0 0 -5px',
                                        touchAction: 'none',
                                    }}
                                >
                                    <GripVertical size={15} />
                                </span>
                            )}
                            <div style={{ minWidth: 0 }}>
                                <h3
                                    title={rubric.name}
                                    style={{
                                        overflowWrap: 'anywhere',
                                        display: '-webkit-box',
                                        WebkitLineClamp: 2,
                                        WebkitBoxOrient: 'vertical',
                                        overflow: 'hidden',
                                    }}
                                >
                                    {rubric.name}
                                </h3>
                                {rubric.subject && (
                                    <div className="text-muted text-xs" style={{ marginTop: 2 }}>
                                        {rubric.subject}
                                    </div>
                                )}
                            </div>
                        </div>
                        <div
                            style={{
                                display: 'flex',
                                gap: 4,
                                justifyContent: 'flex-end',
                                flexWrap: 'nowrap',
                            }}
                        >
                            {dbConnected && (
                                <button
                                    className="btn btn-ghost btn-icon btn-sm"
                                    title={t('rubricList.action_share_colleague')}
                                    aria-label={t('rubricList.action_share_colleague')}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        actions.onOpenShareModal(rubric.id, rubric.name);
                                    }}
                                >
                                    <Users2 size={14} />
                                </button>
                            )}
                            <button
                                className="btn btn-ghost btn-icon btn-sm"
                                title={t('tooltips.copy_share_code')}
                                aria-label={t('tooltips.copy_share_code')}
                                style={{
                                    color: isCopied ? 'var(--green, #22c55e)' : undefined,
                                }}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    actions.onCopyShareCode(rubric.id);
                                }}
                            >
                                {isCopied ? <Check size={14} /> : <Share2 size={14} />}
                            </button>
                            <button
                                className="btn btn-ghost btn-icon btn-sm"
                                title={t('tooltips.share_preview')}
                                aria-label={t('tooltips.share_preview')}
                                style={{
                                    color: isPreviewCopied ? 'var(--green, #22c55e)' : undefined,
                                }}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    actions.onSharePreview(rubric.id);
                                }}
                            >
                                {isPreviewCopied ? <Check size={14} /> : <Link2 size={14} />}
                            </button>
                            {import.meta.env.DEV && (
                                <a
                                    className="btn btn-ghost btn-icon btn-sm"
                                    title={t('rubricList.dev_open_preview')}
                                    aria-label={t('rubricList.dev_open_preview')}
                                    href={`${window.location.origin}${window.location.pathname}#/preview/${encodeRubricShareCode(rubric)}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <ExternalLink size={14} />
                                </a>
                            )}
                            {/* A tiered rubric already holds every tier, so a per-track copy has no use. */}
                            {!rubric.tiered && (
                                <button
                                    className="btn btn-ghost btn-icon btn-sm"
                                    title={t('voTrack.differentiate_title')}
                                    aria-label={t('voTrack.differentiate_title')}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        actions.onDifferentiate(rubric.id);
                                    }}
                                >
                                    <Layers size={14} />
                                </button>
                            )}
                            {moveMenuFor?.(rubric)}
                            <button
                                className="btn btn-ghost btn-icon btn-sm"
                                title={t('rubricList.action_duplicate')}
                                aria-label={t('rubricList.action_duplicate')}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    actions.onDuplicate(rubric.id);
                                }}
                            >
                                <Copy size={14} />
                            </button>
                            <button
                                className="btn btn-ghost btn-icon btn-sm"
                                title={t('rubricList.action_edit')}
                                aria-label={t('rubricList.action_edit')}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    actions.onEdit(rubric.id);
                                }}
                            >
                                <Edit2 size={14} />
                            </button>
                            <button
                                className="btn btn-ghost btn-icon btn-sm"
                                title={t('rubricList.action_delete')}
                                aria-label={t('rubricList.action_delete')}
                                style={{ color: 'var(--red)' }}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    actions.onDelete(rubric);
                                }}
                            >
                                <Trash2 size={14} />
                            </button>
                        </div>
                    </div>

                    <div
                        style={{
                            display: 'flex',
                            gap: 8,
                            flexWrap: 'wrap',
                            marginBottom: 14,
                        }}
                    >
                        <span className="badge badge-blue">
                            {t('rubricList.criteria_badge', { count: rubric.criteria.length })}
                        </span>
                        <span className="badge badge-purple">
                            {t('rubricList.levels_badge', { count: rubric.criteria[0]?.levels.length ?? 0 })}
                        </span>
                        <span className="badge badge-green">
                            {t('rubricList.students_graded_badge', { count: gradedCount })}
                        </span>
                        {rubric.cefrTargetLevel && <CefrBadge level={rubric.cefrTargetLevel} size="sm" />}
                    </div>

                    {rubric.description && (
                        <p className="text-muted text-sm truncate" style={{ marginBottom: 14 }}>
                            {rubric.description}
                        </p>
                    )}

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <button className="btn btn-primary btn-sm" onClick={() => actions.onEdit(rubric.id)}>
                            <Edit2 size={14} /> {t('rubricList.edit_rubric')}
                        </button>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <button
                                className="btn btn-secondary btn-sm"
                                style={{ flex: '1 1 auto' }}
                                onClick={() => actions.onGradeStudents()}
                            >
                                <Users size={14} /> {t('rubricList.grade_students')}
                            </button>
                            <button
                                className="btn btn-secondary btn-sm compare-btn-tutorial"
                                style={{ flex: '1 1 auto' }}
                                title={
                                    hasActiveClass
                                        ? 'Start Comparative Grading'
                                        : "You'll choose a class on the next screen"
                                }
                                onClick={() => actions.onCompare(rubric.id)}
                            >
                                <GitCompare size={14} /> {t('rubricList.action_compare')}
                            </button>
                            <button
                                className="btn btn-secondary btn-sm"
                                style={{ flex: '1 1 auto' }}
                                onClick={() => actions.onGroupGrade(rubric)}
                            >
                                <UsersRound size={14} /> {t('rubricList.action_group_grade')}
                            </button>
                            {/* Speaking session launcher */}
                            {classStudents.length > 0 && (
                                <SpeakingSessionSelect
                                    rubricId={rubric.id}
                                    classStudents={classStudents}
                                    onSelect={actions.onSpeakingSelect}
                                />
                            )}
                        </div>
                    </div>
                </div>
            )}
        </Draggable>
    );
}

export default memo(RubricCard);
