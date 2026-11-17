import React from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight } from 'lucide-react';
import type { CefrLevel } from '../../types';
import type { GrammarCategoryClassRow } from '../../utils/grammarStandardAggregator';
import { GrammarScoreBadge } from './GrammarScoreBadge';

export interface GrammarMatrixStudent {
    studentId: string;
    name: string;
    meta?: string;
    categoryPct: Map<string, number | null>;
}

const LEVEL_BADGE_CLASS: Partial<Record<CefrLevel, string>> = {
    B1: 'levelbadge b1',
    B2: 'levelbadge b2plus',
    C1: 'levelbadge b2plus',
};

function headerLevel(category: GrammarCategoryClassRow): CefrLevel | undefined {
    return category.levels[0];
}

export default function GrammarOverviewMatrix({
    categories,
    students,
    lang,
    onOpenStudent,
}: {
    categories: GrammarCategoryClassRow[];
    students: GrammarMatrixStudent[];
    lang: 'en' | 'nl';
    onOpenStudent?: (studentId: string) => void;
}) {
    const { t } = useTranslation();

    return (
        <div style={{ overflowX: 'auto' }}>
            <table style={{ minWidth: 900, width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                <caption
                    style={{
                        position: 'absolute',
                        width: 1,
                        height: 1,
                        overflow: 'hidden',
                        clip: 'rect(0 0 0 0)',
                        whiteSpace: 'nowrap',
                    }}
                >
                    {t('grammarOverview.matrix_title')}
                </caption>
                <thead>
                    <tr style={{ borderBottom: '2px solid var(--border)' }}>
                        <th
                            scope="col"
                            style={{
                                padding: '10px 14px',
                                textAlign: 'left',
                                color: 'var(--text-muted)',
                                whiteSpace: 'nowrap',
                                position: 'sticky',
                                left: 0,
                                background: 'var(--bg-card)',
                                zIndex: 2,
                            }}
                        >
                            {t('cefr.table_header_student')}
                        </th>
                        {categories.map((category) => {
                            const level = headerLevel(category);
                            return (
                                <th
                                    key={category.categoryId}
                                    scope="col"
                                    title={`${lang === 'nl' ? category.labelNl : category.labelEn} (${category.levels.join(', ')})`}
                                    style={{
                                        padding: '8px 6px',
                                        textAlign: 'center',
                                        borderLeft: '2px solid var(--border)',
                                        verticalAlign: 'bottom',
                                    }}
                                >
                                    <div
                                        style={{
                                            display: 'flex',
                                            flexDirection: 'column',
                                            alignItems: 'center',
                                            gap: 4,
                                            minWidth: 64,
                                        }}
                                    >
                                        <span
                                            style={{
                                                width: 8,
                                                height: 8,
                                                borderRadius: 3,
                                                background: category.color,
                                            }}
                                            aria-hidden="true"
                                        />
                                        <span
                                            style={{
                                                fontSize: '0.62rem',
                                                fontWeight: 700,
                                                lineHeight: 1.2,
                                                color: 'var(--text-muted)',
                                            }}
                                        >
                                            {lang === 'nl' ? category.labelNl : category.labelEn}
                                        </span>
                                        {level && (
                                            <span
                                                className={LEVEL_BADGE_CLASS[level] ?? 'levelbadge'}
                                                style={{
                                                    fontSize: '0.58rem',
                                                    fontWeight: 800,
                                                    padding: '1px 4px',
                                                    borderRadius: 4,
                                                    border: '1px solid var(--border-light)',
                                                    color: 'var(--text-muted)',
                                                }}
                                            >
                                                {category.levels.length > 1
                                                    ? `${category.levels[0]}–${category.levels[category.levels.length - 1]}`
                                                    : level}
                                            </span>
                                        )}
                                    </div>
                                </th>
                            );
                        })}
                    </tr>
                </thead>
                <tbody>
                    {students.map((student, index) => (
                        <tr
                            key={student.studentId}
                            style={{
                                borderBottom: '1px solid var(--border)',
                                background: index % 2 === 0 ? 'var(--bg-card)' : 'var(--bg-elevated)',
                            }}
                        >
                            <th
                                scope="row"
                                style={{
                                    padding: '8px 14px',
                                    textAlign: 'left',
                                    fontWeight: 600,
                                    whiteSpace: 'nowrap',
                                    position: 'sticky',
                                    left: 0,
                                    background: index % 2 === 0 ? 'var(--bg-card)' : 'var(--bg-elevated)',
                                    zIndex: 1,
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={{ flex: 1, minWidth: 0 }}>
                                        <span style={{ display: 'block', fontSize: '0.85rem' }}>{student.name}</span>
                                        {student.meta && (
                                            <span
                                                style={{
                                                    display: 'block',
                                                    fontSize: '0.7rem',
                                                    color: 'var(--text-dim)',
                                                }}
                                            >
                                                {student.meta}
                                            </span>
                                        )}
                                    </span>
                                    {onOpenStudent && (
                                        <button
                                            type="button"
                                            className="btn btn-ghost btn-sm"
                                            style={{ padding: '3px 8px' }}
                                            aria-label={t('grammarOverview.open_detail', { name: student.name })}
                                            title={t('grammarOverview.open_detail', { name: student.name })}
                                            onClick={() => onOpenStudent(student.studentId)}
                                        >
                                            <ChevronRight size={13} />
                                        </button>
                                    )}
                                </div>
                            </th>
                            {categories.map((category) => {
                                const pct = student.categoryPct.get(category.categoryId) ?? null;
                                return (
                                    <td
                                        key={category.categoryId}
                                        style={{
                                            padding: '6px 6px',
                                            textAlign: 'center',
                                            borderLeft: '2px solid var(--border)',
                                        }}
                                        aria-label={`${student.name} — ${
                                            lang === 'nl' ? category.labelNl : category.labelEn
                                        } — ${pct === null ? t('grammarOverview.no_evidence_short') : `${Math.round(pct)}%`}`}
                                    >
                                        <GrammarScoreBadge pct={pct} suffix={false} />
                                    </td>
                                );
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
