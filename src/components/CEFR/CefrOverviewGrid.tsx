import React, { useMemo, useState } from 'react';
import { CheckCircle, Circle, ChevronDown, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import CefrBadge from './CefrBadge';
import { CEFR_LEVELS, CEFR_SKILLS, CEFR_SKILL_LABELS, CEFR_LEVEL_COLORS } from '../../data/cefrDescriptors';
import type { CefrLevel } from '../../types';
import type { CefrCellData } from '../../utils/cefrStudentAggregator';

interface Props {
    cells: CefrCellData[];
    targetLevel?: CefrLevel;
    lang: 'en' | 'nl';
}

export default function CefrOverviewGrid({ cells, targetLevel, lang }: Props) {
    const { t } = useTranslation();
    const [expandedKey, setExpandedKey] = useState<string | null>(null);

    const cellMap = useMemo(() => new Map(cells.map((c) => [`${c.skill}__${c.level}`, c])), [cells]);

    function cellBg(state: CefrCellData['state'], level: CefrLevel) {
        const color = CEFR_LEVEL_COLORS[level];
        if (state === 'achieved') return `${color}22`;
        if (state === 'developing') return '#f59e0b18';
        return 'var(--bg-elevated)';
    }

    function cellBorder(state: CefrCellData['state'], level: CefrLevel) {
        if (state === 'achieved') return `2px solid ${CEFR_LEVEL_COLORS[level]}`;
        if (state === 'developing') return '2px solid #f59e0b';
        return '2px solid transparent';
    }

    function toggleCell(key: string) {
        setExpandedKey((prev) => (prev === key ? null : key));
    }

    const colTemplate = '130px repeat(6, 1fr)';

    return (
        <div style={{ overflowX: 'auto' }}>
            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: colTemplate,
                    gap: 4,
                    minWidth: 560,
                }}
            >
                {/* Header row */}
                <div />
                {CEFR_LEVELS.map((level) => (
                    <div
                        key={level}
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: 2,
                            padding: '6px 4px',
                            outline: level === targetLevel ? '2px solid var(--accent)' : undefined,
                            outlineOffset: level === targetLevel ? -2 : undefined,
                            borderRadius: 6,
                        }}
                    >
                        <CefrBadge level={level} size="sm" />
                        {level === targetLevel && (
                            <span style={{ fontSize: 9, color: 'var(--accent)', fontWeight: 600 }}>
                                {t('cefrOverview.target_level_label')}
                            </span>
                        )}
                    </div>
                ))}

                {/* Skill rows */}
                {CEFR_SKILLS.map((skill) => (
                    <React.Fragment key={skill}>
                        {/* Skill label */}
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                padding: '6px 8px',
                                fontSize: '0.8rem',
                                fontWeight: 600,
                                color: 'var(--text-muted)',
                                overflow: 'hidden',
                            }}
                        >
                            <span className="truncate">{CEFR_SKILL_LABELS[skill][lang]}</span>
                        </div>

                        {/* Level cells */}
                        {CEFR_LEVELS.map((level) => {
                            const key = `${skill}__${level}`;
                            const cell = cellMap.get(key);
                            const state = cell?.state ?? 'not-started';
                            const isExpanded = expandedKey === key;
                            const hasDescriptors = (cell?.descriptors.length ?? 0) > 0;
                            const isTarget = level === targetLevel;

                            return (
                                <button
                                    key={key}
                                    onClick={() => toggleCell(key)}
                                    aria-expanded={isExpanded}
                                    title={
                                        state === 'achieved'
                                            ? t('cefrOverview.cell_achieved')
                                            : state === 'developing'
                                              ? t('cefrOverview.cell_developing')
                                              : t('cefrOverview.cell_not_started')
                                    }
                                    style={{
                                        background: cellBg(state, level),
                                        border: cellBorder(state, level),
                                        outline: isTarget ? '2px solid var(--accent)' : undefined,
                                        outlineOffset: isTarget ? -2 : undefined,
                                        borderRadius: 6,
                                        padding: '6px 4px',
                                        cursor: 'pointer',
                                        textAlign: 'left',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: 3,
                                        minHeight: 56,
                                        position: 'relative',
                                        transition: 'opacity 0.15s',
                                    }}
                                >
                                    {/* Rubric score line */}
                                    {cell && cell.rubricCount > 0 && (
                                        <div
                                            style={{
                                                fontSize: '0.7rem',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 3,
                                                color:
                                                    state === 'achieved'
                                                        ? CEFR_LEVEL_COLORS[level]
                                                        : state === 'developing'
                                                          ? '#f59e0b'
                                                          : 'var(--text-muted)',
                                                fontWeight: 600,
                                            }}
                                        >
                                            {state === 'achieved' ? (
                                                <CheckCircle size={11} />
                                            ) : (
                                                <Circle size={11} style={{ opacity: 0.6 }} />
                                            )}
                                            {Math.round(cell.avgScore)}%
                                        </div>
                                    )}

                                    {/* Self-assessment line */}
                                    {cell && cell.totalDescriptors > 0 && (
                                        <div
                                            style={{
                                                fontSize: '0.68rem',
                                                color: 'var(--text-muted)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 2,
                                            }}
                                        >
                                            <span
                                                style={{
                                                    color:
                                                        cell.confidentCount > 0
                                                            ? 'var(--green, #22c55e)'
                                                            : 'var(--text-muted)',
                                                    fontWeight: 600,
                                                }}
                                            >
                                                {cell.confidentCount}
                                            </span>
                                            <span style={{ opacity: 0.7 }}>/{cell.totalDescriptors}</span>
                                        </div>
                                    )}

                                    {/* No data placeholder */}
                                    {(!cell || (cell.rubricCount === 0 && cell.totalDescriptors === 0)) && (
                                        <span
                                            style={{
                                                fontSize: '0.65rem',
                                                color: 'var(--text-dim, var(--text-muted))',
                                                opacity: 0.5,
                                            }}
                                        >
                                            —
                                        </span>
                                    )}

                                    {/* Expand chevron */}
                                    {hasDescriptors && (
                                        <ChevronDown
                                            size={10}
                                            style={{
                                                position: 'absolute',
                                                bottom: 3,
                                                right: 3,
                                                color: 'var(--text-muted)',
                                                transform: isExpanded ? 'rotate(180deg)' : undefined,
                                                transition: 'transform 0.15s',
                                                opacity: 0.6,
                                            }}
                                        />
                                    )}
                                </button>
                            );
                        })}

                        {/* Expanded descriptor panel — spans full row */}
                        {CEFR_LEVELS.some((level) => expandedKey === `${skill}__${level}`) && (() => {
                            const activeLevel = CEFR_LEVELS.find((l) => expandedKey === `${skill}__${l}`)!;
                            const cell = cellMap.get(`${skill}__${activeLevel}`)!;
                            return (
                                <div
                                    style={{
                                        gridColumn: '1 / -1',
                                        background: 'var(--bg-card)',
                                        border: '1px solid var(--border)',
                                        borderRadius: 8,
                                        padding: '12px 16px',
                                        marginTop: 2,
                                        marginBottom: 4,
                                    }}
                                >
                                    <div
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            marginBottom: 10,
                                        }}
                                    >
                                        <div
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 8,
                                                fontWeight: 600,
                                                fontSize: '0.85rem',
                                            }}
                                        >
                                            <CefrBadge level={activeLevel} size="sm" />
                                            <span>{CEFR_SKILL_LABELS[skill][lang]}</span>
                                            <span
                                                style={{
                                                    fontSize: '0.75rem',
                                                    color: 'var(--text-muted)',
                                                    fontWeight: 400,
                                                }}
                                            >
                                                {t('cefrOverview.descriptors_title')}
                                            </span>
                                        </div>
                                        <button
                                            className="btn btn-ghost btn-sm btn-icon"
                                            onClick={() => setExpandedKey(null)}
                                            aria-label="Close"
                                        >
                                            <X size={14} />
                                        </button>
                                    </div>

                                    {cell.descriptors.length === 0 ? (
                                        <p
                                            className="text-muted text-sm"
                                            style={{ textAlign: 'center', padding: '8px 0' }}
                                        >
                                            {t('cefrOverview.cell_no_data')}
                                        </p>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                            {cell.descriptors.map((d) => (
                                                <div
                                                    key={d.descriptorId}
                                                    style={{
                                                        display: 'flex',
                                                        alignItems: 'flex-start',
                                                        gap: 8,
                                                        padding: '6px 8px',
                                                        borderRadius: 6,
                                                        background: d.confidentInSelfAssess
                                                            ? `${CEFR_LEVEL_COLORS[activeLevel]}15`
                                                            : 'var(--bg-elevated)',
                                                    }}
                                                >
                                                    {d.confidentInSelfAssess ? (
                                                        <CheckCircle
                                                            size={14}
                                                            style={{
                                                                color: CEFR_LEVEL_COLORS[activeLevel],
                                                                flexShrink: 0,
                                                                marginTop: 1,
                                                            }}
                                                        />
                                                    ) : (
                                                        <Circle
                                                            size={14}
                                                            style={{
                                                                color: 'var(--text-muted)',
                                                                flexShrink: 0,
                                                                marginTop: 1,
                                                                opacity: 0.5,
                                                            }}
                                                        />
                                                    )}
                                                    <div style={{ flex: 1 }}>
                                                        <p
                                                            style={{
                                                                fontSize: '0.82rem',
                                                                margin: 0,
                                                                color: 'var(--text)',
                                                                lineHeight: 1.5,
                                                            }}
                                                        >
                                                            {lang === 'nl' ? d.descriptionNl : d.descriptionEn}
                                                        </p>
                                                        <span
                                                            style={{
                                                                fontSize: '0.72rem',
                                                                color: d.confidentInSelfAssess
                                                                    ? CEFR_LEVEL_COLORS[activeLevel]
                                                                    : 'var(--text-muted)',
                                                                fontWeight: 600,
                                                            }}
                                                        >
                                                            {d.confidentInSelfAssess
                                                                ? t('cefrOverview.descriptor_confident')
                                                                : t('cefrOverview.descriptor_not_confident')}
                                                        </span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })()}
                    </React.Fragment>
                ))}
            </div>

            {/* Legend */}
            <div
                style={{
                    display: 'flex',
                    gap: 16,
                    marginTop: 12,
                    flexWrap: 'wrap',
                    fontSize: '0.75rem',
                    color: 'var(--text-muted)',
                    alignItems: 'center',
                }}
            >
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span
                        style={{
                            width: 12,
                            height: 12,
                            borderRadius: 3,
                            background: `${CEFR_LEVEL_COLORS['B1']}22`,
                            border: `2px solid ${CEFR_LEVEL_COLORS['B1']}`,
                            display: 'inline-block',
                        }}
                    />
                    {t('cefrOverview.cell_achieved')}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span
                        style={{
                            width: 12,
                            height: 12,
                            borderRadius: 3,
                            background: '#f59e0b18',
                            border: '2px solid #f59e0b',
                            display: 'inline-block',
                        }}
                    />
                    {t('cefrOverview.cell_developing')}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span
                        style={{
                            width: 12,
                            height: 12,
                            borderRadius: 3,
                            background: 'var(--bg-elevated)',
                            border: '2px solid transparent',
                            outline: '1px solid var(--border)',
                            display: 'inline-block',
                        }}
                    />
                    {t('cefrOverview.cell_not_started')}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: '0.7rem' }}>✦</span>
                    {t('cefrOverview.target_level_label')}:{' '}
                    <span style={{ outline: '2px solid var(--accent)', outlineOffset: 1, borderRadius: 3, padding: '0 3px' }}>
                        B1
                    </span>
                </span>
            </div>
        </div>
    );
}
