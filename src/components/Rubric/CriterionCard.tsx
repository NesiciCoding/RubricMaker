import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Plus,
    Trash2,
    GripVertical,
    GripHorizontal,
    ChevronUp,
    ChevronDown,
    ChevronRight,
    Link2,
    BookOpen,
    X,
    Copy,
    Files,
} from 'lucide-react';
import { Draggable, Droppable } from '@hello-pangea/dnd';
import type { RubricCriterion, RubricLevel, SubItem, ScoringMode, CefrLevel, CefrSkill } from '../../types';
import { CEFR_SKILLS, CEFR_SKILL_LABELS, CEFR_LEVEL_COLORS } from '../../data/cefrDescriptors';
import { saveCriterionClipboard } from '../../store/storage';
import { useToast } from '../../hooks/useToast';

export type CriterionStandardTarget =
    { type: 'criterion'; cid: string } | { type: 'subitem'; cid: string; lid: string; sid: string };

interface CriterionCardProps {
    criterion: RubricCriterion;
    cIdx: number;
    isFirst: boolean;
    isLast: boolean;
    collapsed: boolean;
    scoringMode: ScoringMode;
    onMoveCriterion: (idx: number, dir: -1 | 1) => void;
    onDuplicateCriterion: (idx: number) => void;
    onDeleteCriterion: (cid: string) => void;
    onUpdateCriterion: (cid: string, patch: Partial<RubricCriterion>) => void;
    onAddLevel: (cid: string) => void;
    onDeleteLevel: (cid: string, lid: string) => void;
    onUpdateLevel: (cid: string, lid: string, patch: Partial<RubricLevel>) => void;
    onAddSubItem: (cid: string, lid: string) => void;
    onUpdateSubItem: (cid: string, lid: string, sid: string, patch: Partial<SubItem>) => void;
    onDeleteSubItem: (cid: string, lid: string, sid: string) => void;
    onToggleCollapse: (cid: string) => void;
    onPickStandard: (target: CriterionStandardTarget) => void;
    onPickCefr: (cid: string) => void;
    onUnlinkStandard: (target: CriterionStandardTarget, stdIndex: number) => void;
    onUnlinkLegacyStandard: (cid: string) => void;
    onRemoveCefrDescriptor: (cid: string, descriptorId: string) => void;
    onRemoveFrameworkDescriptor: (cid: string, descriptorId: string) => void;
}

/** One editable criterion card. Memoized so editing one criterion re-renders only its own card,
 *  not every card in the builder. */
export default memo(function CriterionCard({
    criterion,
    cIdx,
    isFirst,
    isLast,
    collapsed,
    scoringMode,
    onMoveCriterion,
    onDuplicateCriterion,
    onDeleteCriterion,
    onUpdateCriterion,
    onAddLevel,
    onDeleteLevel,
    onUpdateLevel,
    onAddSubItem,
    onUpdateSubItem,
    onDeleteSubItem,
    onToggleCollapse,
    onPickStandard,
    onPickCefr,
    onUnlinkStandard,
    onUnlinkLegacyStandard,
    onRemoveCefrDescriptor,
    onRemoveFrameworkDescriptor,
}: CriterionCardProps) {
    const { t, i18n } = useTranslation();
    const { showToast } = useToast();
    const [expandedSubItems, setExpandedSubItems] = useState<Set<string>>(new Set());

    function toggleSubItems(levelKey: string) {
        setExpandedSubItems((prev) => {
            const next = new Set(prev);
            if (next.has(levelKey)) {
                next.delete(levelKey);
            } else {
                next.add(levelKey);
            }
            return next;
        });
    }

    function copyToClipboard(criterion: RubricCriterion) {
        try {
            saveCriterionClipboard(criterion);
        } catch (e) {
            console.error('[rubric] copy criterion failed', e);
            showToast(t('toast.copy_paste_failed'), 'warning');
        }
    }

    return (
        <Draggable draggableId={criterion.id} index={cIdx}>
            {(provided) => (
                <div
                    ref={provided.innerRef}
                    {...provided.draggableProps}
                    className="card print-criterion"
                    style={{
                        marginBottom: 16,
                        ...provided.draggableProps.style,
                    }}
                >
                    {/* Criterion header */}
                    <div
                        style={{
                            display: 'flex',
                            gap: 10,
                            alignItems: 'flex-start',
                            marginBottom: 14,
                        }}
                    >
                        <div
                            {...provided.dragHandleProps}
                            aria-label={t('rubricBuilder.drag_reorder_criterion', {
                                name: criterion.title || t('rubricBuilder.untitled'),
                            })}
                            style={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 2,
                                paddingTop: 4,
                                cursor: 'grab',
                            }}
                        >
                            <button
                                className="btn btn-ghost btn-icon btn-sm"
                                aria-label={t('rubricBuilder.action_move_criterion_up')}
                                onClick={() => onMoveCriterion(cIdx, -1)}
                                disabled={isFirst}
                            >
                                <ChevronUp size={14} />
                            </button>
                            <GripVertical
                                size={16}
                                style={{
                                    color: 'var(--text-dim)',
                                    alignSelf: 'center',
                                }}
                                aria-hidden="true"
                            />
                            <button
                                className="btn btn-ghost btn-icon btn-sm"
                                aria-label={t('rubricBuilder.action_move_criterion_down')}
                                onClick={() => onMoveCriterion(cIdx, 1)}
                                disabled={isLast}
                            >
                                <ChevronDown size={14} />
                            </button>
                        </div>
                        <div style={{ flex: 1 }}>
                            <div
                                className="grid-2"
                                style={{
                                    gap: 10,
                                    gridTemplateColumns: '1fr 1fr auto',
                                }}
                            >
                                <div className="form-group">
                                    <label>{t('rubricBuilder.label_criterion')}</label>
                                    <input
                                        type="text"
                                        value={criterion.title}
                                        onChange={(e) =>
                                            onUpdateCriterion(criterion.id, {
                                                title: e.target.value,
                                            })
                                        }
                                        placeholder={t('rubricBuilder.placeholder_criterion_name')}
                                    />
                                </div>
                                <div className="form-group">
                                    <label>{t('rubricBuilder.placeholder_criterion_description')}</label>
                                    <input
                                        type="text"
                                        value={criterion.description}
                                        onChange={(e) =>
                                            onUpdateCriterion(criterion.id, {
                                                description: e.target.value,
                                            })
                                        }
                                        placeholder={t('rubricBuilder.placeholder_description')}
                                    />
                                </div>
                                <div className="form-group">
                                    <label>{t('rubricBuilder.label_weight')}</label>
                                    <input
                                        type="number"
                                        value={criterion.weight}
                                        min={0}
                                        max={100}
                                        onChange={(e) =>
                                            onUpdateCriterion(criterion.id, {
                                                weight: Number(e.target.value),
                                            })
                                        }
                                        style={{ width: 70 }}
                                    />
                                </div>
                            </div>

                            {/* Standard link */}
                            <div style={{ marginTop: 8 }}>
                                {(criterion.linkedStandards || []).map((std, idx) => (
                                    <div
                                        key={std.guid + idx}
                                        style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: 8,
                                            background: 'var(--accent-soft)',
                                            border: '1px solid var(--accent)',
                                            borderRadius: 8,
                                            padding: '6px 12px',
                                            fontSize: '0.8rem',
                                            marginRight: 8,
                                            marginBottom: 8,
                                        }}
                                    >
                                        <BookOpen size={13} style={{ color: 'var(--accent)' }} />
                                        <span
                                            style={{
                                                color: 'var(--accent)',
                                                fontWeight: 600,
                                            }}
                                        >
                                            {std.statementNotation ?? std.guid}
                                        </span>
                                        <span
                                            style={{
                                                color: 'var(--text)',
                                                maxWidth: 320,
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap',
                                            }}
                                        >
                                            {std.description}
                                        </span>
                                        <button
                                            className="btn btn-ghost btn-icon btn-sm"
                                            aria-label={t('rubricBuilder.action_unlink_standard')}
                                            style={{
                                                color: 'var(--text-muted)',
                                                padding: 2,
                                            }}
                                            onClick={() =>
                                                onUnlinkStandard(
                                                    {
                                                        type: 'criterion',
                                                        cid: criterion.id,
                                                    },
                                                    idx
                                                )
                                            }
                                        >
                                            <X size={12} />
                                        </button>
                                    </div>
                                ))}
                                {criterion.linkedStandard && (
                                    <div
                                        style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: 8,
                                            background: 'var(--accent-soft)',
                                            border: '1px solid var(--accent)',
                                            borderRadius: 8,
                                            padding: '6px 12px',
                                            fontSize: '0.8rem',
                                            marginRight: 8,
                                            marginBottom: 8,
                                        }}
                                    >
                                        <BookOpen size={13} style={{ color: 'var(--accent)' }} />
                                        <span
                                            style={{
                                                color: 'var(--accent)',
                                                fontWeight: 600,
                                            }}
                                        >
                                            {criterion.linkedStandard.statementNotation ??
                                                criterion.linkedStandard.guid}
                                        </span>
                                        <span
                                            style={{
                                                color: 'var(--text)',
                                                maxWidth: 320,
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap',
                                            }}
                                        >
                                            {criterion.linkedStandard.description}
                                        </span>
                                        <button
                                            className="btn btn-ghost btn-icon btn-sm"
                                            aria-label={t('rubricBuilder.action_unlink_standard')}
                                            style={{
                                                color: 'var(--text-muted)',
                                                padding: 2,
                                            }}
                                            onClick={() => onUnlinkLegacyStandard(criterion.id)}
                                        >
                                            <X size={12} />
                                        </button>
                                    </div>
                                )}
                                <button
                                    className="btn btn-ghost btn-sm"
                                    style={{ color: 'var(--accent)', marginTop: 4 }}
                                    onClick={() =>
                                        onPickStandard({
                                            type: 'criterion',
                                            cid: criterion.id,
                                        })
                                    }
                                >
                                    <Link2 size={13} /> {t('rubricBuilder.action_link_standard')}
                                </button>
                                <button
                                    className="btn btn-ghost btn-sm"
                                    style={{ color: 'var(--accent)', marginTop: 4 }}
                                    onClick={() => onPickCefr(criterion.id)}
                                >
                                    <BookOpen size={13} /> {t('framework.action_link_descriptor')}
                                    {(criterion.cefrDescriptors || []).length +
                                        (criterion.frameworkDescriptors || []).length >
                                        0 && (
                                        <span
                                            style={{
                                                background: 'var(--accent)',
                                                color: '#fff',
                                                borderRadius: 8,
                                                padding: '0px 6px',
                                                fontSize: 10,
                                                fontWeight: 700,
                                                marginLeft: 4,
                                            }}
                                        >
                                            {(criterion.cefrDescriptors || []).length +
                                                (criterion.frameworkDescriptors || []).length}
                                        </span>
                                    )}
                                </button>
                            </div>

                            {/* Per-criterion CEFR skill override */}
                            <div
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 8,
                                    marginTop: 8,
                                }}
                            >
                                <span className="text-xs text-muted" style={{ whiteSpace: 'nowrap' }}>
                                    CEFR skill:
                                </span>
                                <select
                                    value={criterion.cefrSkill ?? ''}
                                    onChange={(e) =>
                                        onUpdateCriterion(criterion.id, {
                                            cefrSkill: (e.target.value as CefrSkill) || undefined,
                                        })
                                    }
                                    style={{
                                        fontSize: '0.78rem',
                                        padding: '2px 6px',
                                        borderRadius: 5,
                                        border: '1px solid var(--border)',
                                        background: 'var(--bg-elevated)',
                                        color: 'var(--text)',
                                        maxWidth: 180,
                                    }}
                                >
                                    <option value="">{t('rubricBuilder.cefr_skill_inherit')}</option>
                                    {CEFR_SKILLS.map((sk) => (
                                        <option key={sk} value={sk}>
                                            {i18n.language.startsWith('nl')
                                                ? CEFR_SKILL_LABELS[sk].nl
                                                : CEFR_SKILL_LABELS[sk].en}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Per-criterion group-grading scope */}
                            <div
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    marginTop: 8,
                                }}
                            >
                                <label
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 6,
                                        fontSize: '0.78rem',
                                        color: 'var(--text-muted)',
                                        cursor: 'pointer',
                                    }}
                                >
                                    <input
                                        type="checkbox"
                                        checked={criterion.collaborative !== false}
                                        onChange={(e) =>
                                            onUpdateCriterion(criterion.id, {
                                                collaborative: e.target.checked ? undefined : false,
                                            })
                                        }
                                    />
                                    {t('rubricBuilder.label_group_grading')}
                                </label>
                            </div>

                            {/* CEFR descriptors display */}
                            {(criterion.cefrDescriptors || []).length > 0 && (
                                <div
                                    style={{
                                        marginTop: 8,
                                        display: 'flex',
                                        flexWrap: 'wrap',
                                        gap: 6,
                                    }}
                                >
                                    {criterion.cefrDescriptors!.map((d) => (
                                        <div
                                            key={d.descriptorId}
                                            style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: 6,
                                                background: 'color-mix(in srgb, var(--accent) 8%, transparent)',
                                                border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)',
                                                borderRadius: 8,
                                                padding: '4px 10px',
                                                fontSize: '0.78rem',
                                            }}
                                        >
                                            <span
                                                style={{
                                                    background: CEFR_LEVEL_COLORS[d.level],
                                                    color: '#fff',
                                                    borderRadius: 4,
                                                    padding: '1px 5px',
                                                    fontSize: 10,
                                                    fontWeight: 700,
                                                }}
                                            >
                                                {d.level}
                                            </span>
                                            <span
                                                style={{
                                                    color: 'var(--text)',
                                                    maxWidth: 280,
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                    whiteSpace: 'nowrap',
                                                }}
                                            >
                                                {i18n.language.startsWith('nl') ? d.descriptionNl : d.descriptionEn}
                                            </span>
                                            <button
                                                className="btn btn-ghost btn-icon btn-sm"
                                                aria-label={t('rubricBuilder.action_remove_descriptor')}
                                                style={{
                                                    color: 'var(--text-muted)',
                                                    padding: 2,
                                                }}
                                                onClick={() => onRemoveCefrDescriptor(criterion.id, d.descriptorId)}
                                            >
                                                <X size={11} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* IB / Bloom's descriptors display */}
                            {(criterion.frameworkDescriptors || []).length > 0 && (
                                <div
                                    style={{
                                        marginTop: 8,
                                        display: 'flex',
                                        flexWrap: 'wrap',
                                        gap: 6,
                                    }}
                                >
                                    {criterion.frameworkDescriptors!.map((d) => (
                                        <div
                                            key={d.descriptorId}
                                            style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: 6,
                                                background: `color-mix(in srgb, ${d.categoryColor} 8%, transparent)`,
                                                border: `1px solid color-mix(in srgb, ${d.categoryColor} 25%, transparent)`,
                                                borderRadius: 8,
                                                padding: '4px 10px',
                                                fontSize: '0.78rem',
                                            }}
                                        >
                                            <span
                                                style={{
                                                    background: d.categoryColor,
                                                    color: '#fff',
                                                    borderRadius: 4,
                                                    padding: '1px 5px',
                                                    fontSize: 10,
                                                    fontWeight: 700,
                                                    whiteSpace: 'nowrap',
                                                }}
                                            >
                                                {i18n.language.startsWith('nl') ? d.categoryLabelNl : d.categoryLabelEn}
                                            </span>
                                            <span
                                                style={{
                                                    color: 'var(--text)',
                                                    maxWidth: 280,
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                    whiteSpace: 'nowrap',
                                                }}
                                            >
                                                {i18n.language.startsWith('nl') ? d.descriptionNl : d.descriptionEn}
                                            </span>
                                            <button
                                                className="btn btn-ghost btn-icon btn-sm"
                                                aria-label={t('rubricBuilder.action_remove_descriptor')}
                                                style={{
                                                    color: 'var(--text-muted)',
                                                    padding: 2,
                                                }}
                                                onClick={() =>
                                                    onRemoveFrameworkDescriptor(criterion.id, d.descriptorId)
                                                }
                                            >
                                                <X size={11} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div style={{ display: 'flex', gap: 4, marginTop: 20 }}>
                            <button
                                className="btn btn-ghost btn-icon btn-sm"
                                style={{ color: 'var(--text-dim)' }}
                                onClick={() => onToggleCollapse(criterion.id)}
                                title={
                                    collapsed
                                        ? t('rubricBuilder.action_expand_criterion')
                                        : t('rubricBuilder.action_collapse_criterion')
                                }
                                aria-label={
                                    collapsed
                                        ? t('rubricBuilder.action_expand_criterion')
                                        : t('rubricBuilder.action_collapse_criterion')
                                }
                            >
                                {collapsed ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
                            </button>
                            <button
                                className="btn btn-ghost btn-icon btn-sm"
                                style={{ color: 'var(--accent)' }}
                                onClick={() => copyToClipboard(criterion)}
                                title={t('rubricBuilder.action_copy_criterion')}
                                aria-label={t('rubricBuilder.action_copy_criterion')}
                            >
                                <Copy size={15} />
                            </button>
                            <button
                                className="btn btn-ghost btn-icon btn-sm"
                                style={{ color: 'var(--text-muted)' }}
                                onClick={() => onDuplicateCriterion(cIdx)}
                                title={t('rubricBuilder.action_duplicate_criterion')}
                                aria-label={t('rubricBuilder.action_duplicate_criterion')}
                            >
                                <Files size={15} />
                            </button>
                            <button
                                className="btn btn-ghost btn-icon btn-sm"
                                style={{ color: 'var(--red)' }}
                                onClick={() => onDeleteCriterion(criterion.id)}
                                title={t('rubricBuilder.action_delete_criterion')}
                                aria-label={t('rubricBuilder.action_delete_criterion')}
                            >
                                <Trash2 size={15} />
                            </button>
                        </div>
                    </div>

                    {/* Collapsed: level pills summary */}
                    {collapsed && (
                        <div
                            style={{
                                display: 'flex',
                                gap: 6,
                                flexWrap: 'wrap',
                                paddingLeft: 4,
                            }}
                        >
                            {criterion.levels.map((l) => (
                                <span key={l.id} className="badge" style={{ fontSize: '0.75rem' }}>
                                    {l.label}
                                </span>
                            ))}
                        </div>
                    )}

                    {/* Single-point: simplified proficiency descriptor */}
                    {!collapsed && scoringMode === 'single-point' && (
                        <div
                            style={{
                                display: 'flex',
                                gap: 16,
                                marginTop: 4,
                                alignItems: 'flex-start',
                            }}
                        >
                            <div style={{ flex: 1 }}>
                                <div
                                    className="text-xs text-muted"
                                    style={{
                                        marginBottom: 4,
                                        textTransform: 'uppercase',
                                        fontWeight: 600,
                                    }}
                                >
                                    {t('rubricBuilder.single_point_descriptor_label')}
                                </div>
                                <textarea
                                    value={criterion.levels[0]?.description ?? ''}
                                    onChange={(e) => {
                                        if (!criterion.levels[0]) {
                                            onAddLevel(criterion.id);
                                        }
                                        onUpdateLevel(criterion.id, criterion.levels[0]?.id ?? '', {
                                            description: e.target.value,
                                        });
                                    }}
                                    placeholder={t('rubricBuilder.single_point_descriptor_placeholder')}
                                    rows={4}
                                    style={{
                                        width: '100%',
                                        fontSize: '0.85rem',
                                    }}
                                />
                            </div>
                            <div style={{ width: 120, flexShrink: 0 }}>
                                <div
                                    className="text-xs text-muted"
                                    style={{
                                        marginBottom: 4,
                                        textTransform: 'uppercase',
                                        fontWeight: 600,
                                    }}
                                >
                                    {t('rubricBuilder.single_point_meets_points')}
                                </div>
                                <input
                                    type="number"
                                    min={0}
                                    value={criterion.levels[0]?.maxPoints ?? 1}
                                    onChange={(e) =>
                                        onUpdateLevel(criterion.id, criterion.levels[0]?.id ?? '', {
                                            maxPoints: Number(e.target.value),
                                            minPoints: 0,
                                        })
                                    }
                                />
                            </div>
                        </div>
                    )}

                    {/* Levels (hidden when collapsed or single-point) */}
                    {!collapsed && scoringMode !== 'single-point' && (
                        <div style={{ overflowX: 'auto' }}>
                            <Droppable droppableId={`levels-${criterion.id}`} direction="horizontal">
                                {(levelProvided) => (
                                    <div
                                        {...levelProvided.droppableProps}
                                        ref={levelProvided.innerRef}
                                        style={{
                                            display: 'flex',
                                            flexWrap: 'wrap',
                                            gap: 10,
                                            paddingBottom: 4,
                                        }}
                                    >
                                        {criterion.levels.map((level, lvlIdx) => (
                                            <Draggable key={level.id} draggableId={`level-${level.id}`} index={lvlIdx}>
                                                {(lvlDraggable) => (
                                                    <div
                                                        ref={lvlDraggable.innerRef}
                                                        {...lvlDraggable.draggableProps}
                                                        style={{
                                                            ...lvlDraggable.draggableProps.style,
                                                        }}
                                                    >
                                                        {/* Inner level content — use a closure-wrapper to avoid shadowing */}
                                                        {(() => {
                                                            const levelKey = `${criterion.id}_${level.id}`;
                                                            const subExpanded = expandedSubItems.has(levelKey);
                                                            return (
                                                                <div
                                                                    key={level.id}
                                                                    style={{
                                                                        flex: '1 1 190px',
                                                                        minWidth: 190,
                                                                        background: 'var(--bg-elevated)',
                                                                        border: '1px solid var(--border)',
                                                                        borderRadius: 8,
                                                                        padding: 12,
                                                                    }}
                                                                >
                                                                    {/* Level label + drag handle + delete */}
                                                                    <div
                                                                        style={{
                                                                            display: 'flex',
                                                                            gap: 6,
                                                                            marginBottom: 8,
                                                                            alignItems: 'center',
                                                                        }}
                                                                    >
                                                                        <div
                                                                            {...lvlDraggable.dragHandleProps}
                                                                            aria-label={t(
                                                                                'rubricBuilder.drag_reorder_level',
                                                                                {
                                                                                    name:
                                                                                        level.label ||
                                                                                        t('rubricBuilder.untitled'),
                                                                                }
                                                                            )}
                                                                            style={{
                                                                                cursor: 'grab',
                                                                                color: 'var(--text-dim)',
                                                                                flexShrink: 0,
                                                                                display: 'flex',
                                                                            }}
                                                                        >
                                                                            <GripHorizontal size={13} />
                                                                        </div>
                                                                        <input
                                                                            type="text"
                                                                            value={level.label}
                                                                            onChange={(e) =>
                                                                                onUpdateLevel(criterion.id, level.id, {
                                                                                    label: e.target.value,
                                                                                })
                                                                            }
                                                                            style={{
                                                                                flex: 1,
                                                                                fontWeight: 600,
                                                                            }}
                                                                            placeholder={t(
                                                                                'rubricBuilder.placeholder_level_name'
                                                                            )}
                                                                        />
                                                                        {criterion.levels.length > 1 && (
                                                                            <button
                                                                                className="btn btn-ghost btn-icon btn-sm"
                                                                                aria-label={t(
                                                                                    'rubricBuilder.action_delete_level'
                                                                                )}
                                                                                style={{
                                                                                    color: 'var(--red)',
                                                                                }}
                                                                                onClick={() =>
                                                                                    onDeleteLevel(
                                                                                        criterion.id,
                                                                                        level.id
                                                                                    )
                                                                                }
                                                                            >
                                                                                <Trash2 size={13} />
                                                                            </button>
                                                                        )}
                                                                    </div>

                                                                    {/* Min/Max points */}
                                                                    <div
                                                                        style={{
                                                                            display: 'flex',
                                                                            gap: 6,
                                                                            marginBottom: 8,
                                                                            alignItems: 'center',
                                                                        }}
                                                                    >
                                                                        <div
                                                                            style={{
                                                                                flex: 1,
                                                                            }}
                                                                        >
                                                                            <div
                                                                                className="text-xs text-muted"
                                                                                style={{
                                                                                    marginBottom: 2,
                                                                                }}
                                                                            >
                                                                                {t('rubricBuilder.label_min_pts')}
                                                                            </div>
                                                                            <input
                                                                                type="number"
                                                                                value={level.minPoints}
                                                                                min={0}
                                                                                onChange={(e) =>
                                                                                    onUpdateLevel(
                                                                                        criterion.id,
                                                                                        level.id,
                                                                                        {
                                                                                            minPoints: Number(
                                                                                                e.target.value
                                                                                            ),
                                                                                        }
                                                                                    )
                                                                                }
                                                                            />
                                                                        </div>
                                                                        <span
                                                                            style={{
                                                                                color: 'var(--text-muted)',
                                                                                paddingTop: 16,
                                                                            }}
                                                                        >
                                                                            –
                                                                        </span>
                                                                        <div
                                                                            style={{
                                                                                flex: 1,
                                                                            }}
                                                                        >
                                                                            <div
                                                                                className="text-xs text-muted"
                                                                                style={{
                                                                                    marginBottom: 2,
                                                                                }}
                                                                            >
                                                                                {t('rubricBuilder.label_max_pts')}
                                                                            </div>
                                                                            <input
                                                                                type="number"
                                                                                value={level.maxPoints}
                                                                                min={0}
                                                                                onChange={(e) =>
                                                                                    onUpdateLevel(
                                                                                        criterion.id,
                                                                                        level.id,
                                                                                        {
                                                                                            maxPoints: Number(
                                                                                                e.target.value
                                                                                            ),
                                                                                        }
                                                                                    )
                                                                                }
                                                                            />
                                                                        </div>
                                                                    </div>

                                                                    {/* Description */}
                                                                    <textarea
                                                                        value={level.description}
                                                                        onChange={(e) =>
                                                                            onUpdateLevel(criterion.id, level.id, {
                                                                                description: e.target.value,
                                                                            })
                                                                        }
                                                                        placeholder={t(
                                                                            'rubricBuilder.placeholder_level_description'
                                                                        )}
                                                                        rows={3}
                                                                        style={{
                                                                            fontSize: '0.8rem',
                                                                            width: '100%',
                                                                            marginBottom:
                                                                                level.description &&
                                                                                /\b(good|adequate|poor|excellent|satisfactory|bad|fair|very good|great|wonderful)\b/i.test(
                                                                                    level.description
                                                                                ) &&
                                                                                !/\b(student|demonstrates|shows|uses|writes|includes|provides|explains|applies|describes|identifies|analyzes|creates)\b/i.test(
                                                                                    level.description
                                                                                )
                                                                                    ? 2
                                                                                    : 8,
                                                                        }}
                                                                    />
                                                                    {level.description &&
                                                                        /\b(good|adequate|poor|excellent|satisfactory|bad|fair|very good|great|wonderful)\b/i.test(
                                                                            level.description
                                                                        ) &&
                                                                        !/\b(student|demonstrates|shows|uses|writes|includes|provides|explains|applies|describes|identifies|analyzes|creates)\b/i.test(
                                                                            level.description
                                                                        ) && (
                                                                            <div
                                                                                style={{
                                                                                    fontSize: '0.7rem',
                                                                                    color: 'var(--yellow, #b45309)',
                                                                                    background: 'rgba(251,191,36,0.12)',
                                                                                    borderRadius: 4,
                                                                                    padding: '3px 7px',
                                                                                    marginBottom: 6,
                                                                                }}
                                                                            >
                                                                                {t('rubricBuilder.level_quality_tip')}
                                                                            </div>
                                                                        )}

                                                                    {/* CEFR level tag */}
                                                                    <div
                                                                        style={{
                                                                            marginBottom: 8,
                                                                        }}
                                                                    >
                                                                        <div
                                                                            className="text-xs text-muted"
                                                                            style={{
                                                                                marginBottom: 4,
                                                                            }}
                                                                        >
                                                                            CEFR level
                                                                        </div>
                                                                        <select
                                                                            aria-label="CEFR level"
                                                                            value={level.cefrLevel ?? ''}
                                                                            onChange={(e) =>
                                                                                onUpdateLevel(criterion.id, level.id, {
                                                                                    cefrLevel:
                                                                                        (e.target.value as
                                                                                            CefrLevel | '') ||
                                                                                        undefined,
                                                                                })
                                                                            }
                                                                            style={{
                                                                                fontSize: '0.78rem',
                                                                                padding: '3px 6px',
                                                                            }}
                                                                        >
                                                                            <option value="">—</option>
                                                                            {(
                                                                                [
                                                                                    'A1',
                                                                                    'A2',
                                                                                    'B1',
                                                                                    'B2',
                                                                                    'C1',
                                                                                    'C2',
                                                                                ] as const
                                                                            ).map((lvl) => (
                                                                                <option key={lvl} value={lvl}>
                                                                                    {lvl}
                                                                                </option>
                                                                            ))}
                                                                        </select>
                                                                    </div>

                                                                    {/* Sub-items toggle */}
                                                                    <button
                                                                        className="btn btn-ghost btn-sm"
                                                                        style={{
                                                                            width: '100%',
                                                                            justifyContent: 'space-between',
                                                                        }}
                                                                        onClick={() => toggleSubItems(levelKey)}
                                                                    >
                                                                        <span
                                                                            style={{
                                                                                fontSize: '0.78rem',
                                                                            }}
                                                                        >
                                                                            {t('rubricBuilder.label_sub_items')} (
                                                                            {level.subItems.length})
                                                                        </span>
                                                                        <ChevronRight
                                                                            size={13}
                                                                            style={{
                                                                                transform: subExpanded
                                                                                    ? 'rotate(90deg)'
                                                                                    : 'none',
                                                                                transition: 'transform 0.2s',
                                                                            }}
                                                                        />
                                                                    </button>

                                                                    {subExpanded && (
                                                                        <div
                                                                            style={{
                                                                                marginTop: 8,
                                                                                display: 'flex',
                                                                                flexDirection: 'column',
                                                                                gap: 6,
                                                                            }}
                                                                        >
                                                                            {level.subItems.map((si) => (
                                                                                <div
                                                                                    key={si.id}
                                                                                    style={{
                                                                                        display: 'flex',
                                                                                        flexDirection: 'column',
                                                                                        gap: 4,
                                                                                        paddingBottom: 6,
                                                                                        borderBottom:
                                                                                            '1px solid var(--border)',
                                                                                    }}
                                                                                >
                                                                                    <div
                                                                                        style={{
                                                                                            display: 'flex',
                                                                                            flexDirection: 'column',
                                                                                            gap: 6,
                                                                                        }}
                                                                                    >
                                                                                        <textarea
                                                                                            value={si.label}
                                                                                            onChange={(e) =>
                                                                                                onUpdateSubItem(
                                                                                                    criterion.id,
                                                                                                    level.id,
                                                                                                    si.id,
                                                                                                    {
                                                                                                        label: e.target
                                                                                                            .value,
                                                                                                    }
                                                                                                )
                                                                                            }
                                                                                            placeholder={t(
                                                                                                'rubricBuilder.placeholder_sub_item_label'
                                                                                            )}
                                                                                            rows={2}
                                                                                            style={{
                                                                                                width: '100%',
                                                                                                fontSize: '0.78rem',
                                                                                                resize: 'vertical',
                                                                                                minHeight: 40,
                                                                                                fontFamily: 'inherit',
                                                                                                padding: '6px 8px',
                                                                                                borderRadius: 4,
                                                                                                border: '1px solid var(--border)',
                                                                                            }}
                                                                                        />
                                                                                        <div
                                                                                            style={{
                                                                                                display: 'flex',
                                                                                                gap: 6,
                                                                                                alignItems: 'flex-end',
                                                                                                justifyContent:
                                                                                                    'flex-start',
                                                                                            }}
                                                                                        >
                                                                                            <div
                                                                                                style={{
                                                                                                    display: 'flex',
                                                                                                    flexDirection:
                                                                                                        'column',
                                                                                                    gap: 2,
                                                                                                }}
                                                                                            >
                                                                                                <span
                                                                                                    style={{
                                                                                                        fontSize: '9px',
                                                                                                        color: 'var(--text-muted)',
                                                                                                    }}
                                                                                                >
                                                                                                    {t(
                                                                                                        'rubricBuilder.label_sub_item_min'
                                                                                                    )}
                                                                                                </span>
                                                                                                <input
                                                                                                    type="number"
                                                                                                    value={
                                                                                                        si.minPoints ??
                                                                                                        0
                                                                                                    }
                                                                                                    min={0}
                                                                                                    onChange={(e) =>
                                                                                                        onUpdateSubItem(
                                                                                                            criterion.id,
                                                                                                            level.id,
                                                                                                            si.id,
                                                                                                            {
                                                                                                                minPoints:
                                                                                                                    Number(
                                                                                                                        e
                                                                                                                            .target
                                                                                                                            .value
                                                                                                                    ),
                                                                                                            }
                                                                                                        )
                                                                                                    }
                                                                                                    style={{
                                                                                                        width: 45,
                                                                                                        fontSize:
                                                                                                            '0.78rem',
                                                                                                        height: 26,
                                                                                                        padding:
                                                                                                            '2px 4px',
                                                                                                    }}
                                                                                                    title={t(
                                                                                                        'rubricBuilder.sub_item_min_title'
                                                                                                    )}
                                                                                                />
                                                                                            </div>
                                                                                            <div
                                                                                                style={{
                                                                                                    display: 'flex',
                                                                                                    flexDirection:
                                                                                                        'column',
                                                                                                    gap: 2,
                                                                                                }}
                                                                                            >
                                                                                                <span
                                                                                                    style={{
                                                                                                        fontSize: '9px',
                                                                                                        color: 'var(--text-muted)',
                                                                                                    }}
                                                                                                >
                                                                                                    {t(
                                                                                                        'rubricBuilder.label_sub_item_max'
                                                                                                    )}
                                                                                                </span>
                                                                                                <input
                                                                                                    type="number"
                                                                                                    value={
                                                                                                        si.maxPoints ??
                                                                                                        si.points ??
                                                                                                        1
                                                                                                    }
                                                                                                    min={
                                                                                                        si.minPoints ??
                                                                                                        0
                                                                                                    }
                                                                                                    onChange={(e) =>
                                                                                                        onUpdateSubItem(
                                                                                                            criterion.id,
                                                                                                            level.id,
                                                                                                            si.id,
                                                                                                            {
                                                                                                                maxPoints:
                                                                                                                    Number(
                                                                                                                        e
                                                                                                                            .target
                                                                                                                            .value
                                                                                                                    ),
                                                                                                            }
                                                                                                        )
                                                                                                    }
                                                                                                    style={{
                                                                                                        width: 45,
                                                                                                        fontSize:
                                                                                                            '0.78rem',
                                                                                                        height: 26,
                                                                                                        padding:
                                                                                                            '2px 4px',
                                                                                                    }}
                                                                                                    title={t(
                                                                                                        'rubricBuilder.sub_item_max_title'
                                                                                                    )}
                                                                                                />
                                                                                            </div>
                                                                                            <div
                                                                                                style={{
                                                                                                    flex: 1,
                                                                                                }}
                                                                                            />
                                                                                            <button
                                                                                                className="btn btn-ghost btn-icon btn-sm"
                                                                                                style={{
                                                                                                    color: 'var(--accent)',
                                                                                                    height: 26,
                                                                                                    width: 26,
                                                                                                }}
                                                                                                onClick={() =>
                                                                                                    onPickStandard({
                                                                                                        type: 'subitem',
                                                                                                        cid: criterion.id,
                                                                                                        lid: level.id,
                                                                                                        sid: si.id,
                                                                                                    })
                                                                                                }
                                                                                                title={t(
                                                                                                    'rubricBuilder.sub_item_link_standard_title'
                                                                                                )}
                                                                                                aria-label={t(
                                                                                                    'rubricBuilder.sub_item_link_standard_title'
                                                                                                )}
                                                                                            >
                                                                                                <Link2 size={11} />
                                                                                            </button>
                                                                                            <button
                                                                                                className="btn btn-ghost btn-icon btn-sm"
                                                                                                style={{
                                                                                                    color: 'var(--red)',
                                                                                                    height: 26,
                                                                                                    width: 26,
                                                                                                }}
                                                                                                onClick={() =>
                                                                                                    onDeleteSubItem(
                                                                                                        criterion.id,
                                                                                                        level.id,
                                                                                                        si.id
                                                                                                    )
                                                                                                }
                                                                                                title={t(
                                                                                                    'rubricBuilder.sub_item_delete_title'
                                                                                                )}
                                                                                                aria-label={t(
                                                                                                    'rubricBuilder.sub_item_delete_title'
                                                                                                )}
                                                                                            >
                                                                                                <Trash2 size={11} />
                                                                                            </button>
                                                                                        </div>
                                                                                    </div>
                                                                                    {si.linkedStandards &&
                                                                                        si.linkedStandards.length >
                                                                                            0 && (
                                                                                            <div
                                                                                                style={{
                                                                                                    display: 'flex',
                                                                                                    flexWrap: 'wrap',
                                                                                                    gap: 4,
                                                                                                }}
                                                                                            >
                                                                                                {si.linkedStandards.map(
                                                                                                    (std, idx) => (
                                                                                                        <div
                                                                                                            key={
                                                                                                                std.guid +
                                                                                                                idx
                                                                                                            }
                                                                                                            style={{
                                                                                                                display:
                                                                                                                    'inline-flex',
                                                                                                                alignItems:
                                                                                                                    'center',
                                                                                                                gap: 4,
                                                                                                                background:
                                                                                                                    'var(--accent-soft)',
                                                                                                                borderRadius: 4,
                                                                                                                padding:
                                                                                                                    '2px 6px',
                                                                                                                fontSize:
                                                                                                                    '0.65rem',
                                                                                                            }}
                                                                                                        >
                                                                                                            <span
                                                                                                                style={{
                                                                                                                    color: 'var(--accent)',
                                                                                                                    fontWeight: 600,
                                                                                                                }}
                                                                                                            >
                                                                                                                {std.statementNotation ??
                                                                                                                    std.guid}
                                                                                                            </span>
                                                                                                            <button
                                                                                                                className="btn btn-ghost btn-icon"
                                                                                                                aria-label={t(
                                                                                                                    'rubricBuilder.action_unlink_standard'
                                                                                                                )}
                                                                                                                style={{
                                                                                                                    padding: 0,
                                                                                                                    height: 'auto',
                                                                                                                    minHeight: 0,
                                                                                                                    color: 'var(--text-muted)',
                                                                                                                }}
                                                                                                                onClick={() =>
                                                                                                                    onUnlinkStandard(
                                                                                                                        {
                                                                                                                            type: 'subitem',
                                                                                                                            cid: criterion.id,
                                                                                                                            lid: level.id,
                                                                                                                            sid: si.id,
                                                                                                                        },
                                                                                                                        idx
                                                                                                                    )
                                                                                                                }
                                                                                                            >
                                                                                                                <X
                                                                                                                    size={
                                                                                                                        10
                                                                                                                    }
                                                                                                                />
                                                                                                            </button>
                                                                                                        </div>
                                                                                                    )
                                                                                                )}
                                                                                            </div>
                                                                                        )}
                                                                                </div>
                                                                            ))}
                                                                            <button
                                                                                className="btn btn-ghost btn-sm"
                                                                                style={{
                                                                                    fontSize: '0.78rem',
                                                                                }}
                                                                                onClick={() =>
                                                                                    onAddSubItem(criterion.id, level.id)
                                                                                }
                                                                            >
                                                                                <Plus size={12} />{' '}
                                                                                {t('rubricBuilder.action_add_sub_item')}
                                                                            </button>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            );
                                                        })()}
                                                    </div>
                                                )}
                                            </Draggable>
                                        ))}
                                        {levelProvided.placeholder}
                                        <div
                                            style={{
                                                width: 210,
                                                flexShrink: 0,
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                            }}
                                        >
                                            <button
                                                className="btn btn-ghost btn-sm"
                                                onClick={() => onAddLevel(criterion.id)}
                                            >
                                                <Plus size={14} /> {t('rubricBuilder.action_add_level')}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </Droppable>
                        </div>
                    )}
                </div>
            )}
        </Draggable>
    );
});
