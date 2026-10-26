import React, { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { decodeRubricShareCode } from '../utils/rubricImport';
import TieredSheetView from '../components/Rubric/TieredSheetView';
import { buildTieredSheet } from '../utils/tieredSheet';
import { SharedPageInvalid, SharedPageShell, sharedCardStyle } from '../components/ui/SharedPageShell';

export default function RubricPreviewPage() {
    const { code } = useParams<{ code: string }>();
    const { t } = useTranslation();

    let rubric: ReturnType<typeof decodeRubricShareCode> | null;
    try {
        rubric = code ? decodeRubricShareCode(code) : null;
    } catch {
        rubric = null;
    }

    useEffect(() => {
        if (!rubric) return;
        const previous = document.title;
        document.title = rubric.name;
        return () => {
            document.title = previous;
        };
    }, [rubric?.name]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!rubric) {
        return <SharedPageInvalid title={t('rubricPreview.invalid_title')} body={t('rubricPreview.invalid_body')} />;
    }

    const fmt = rubric.format as
        | {
              accentColor?: string;
              fontFamily?: string;
              headerColor?: string;
              headerTextColor?: string;
              showPoints?: boolean;
          }
        | undefined;
    const accentColor = fmt?.accentColor ?? '#6366f1';
    const headerColor = fmt?.headerColor ?? '#1e293b';
    const headerTextColor = fmt?.headerTextColor ?? '#ffffff';
    const fontFamily = fmt?.fontFamily ?? 'Inter, system-ui, sans-serif';
    const showPoints = fmt?.showPoints ?? false;

    return (
        <SharedPageShell fontFamily={fontFamily} maxWidth={900} footer={t('rubricPreview.footer')}>
            <header style={{ ...sharedCardStyle, marginBottom: 20 }}>
                <div
                    style={{
                        display: 'inline-block',
                        background: `color-mix(in srgb, ${accentColor} 14%, var(--bg-card))`,
                        border: `1px solid ${accentColor}`,
                        color: 'var(--text)',
                        borderRadius: 20,
                        padding: '3px 12px',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        marginBottom: 10,
                    }}
                >
                    {t('rubricPreview.badge')}
                </div>
                <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: 'var(--text)' }}>{rubric.name}</h1>
                {rubric.subject && <div style={{ color: 'var(--text-muted)', marginTop: 4 }}>{rubric.subject}</div>}
                {rubric.description && (
                    <p style={{ margin: '10px 0 0', color: 'var(--text)', fontSize: '0.9rem', lineHeight: 1.6 }}>
                        {rubric.description}
                    </p>
                )}
            </header>

            {rubric.tiered && (
                <TieredSheetView
                    sheet={buildTieredSheet(rubric)!}
                    headerColor={headerColor}
                    headerTextColor={headerTextColor}
                    headingLevel={2}
                />
            )}
            {!rubric.tiered &&
                rubric.criteria.map((criterion, ci) => (
                    <section
                        key={criterion.id ?? ci}
                        aria-labelledby={`preview-criterion-${ci}`}
                        style={{ ...sharedCardStyle, padding: 0, marginBottom: 14, overflow: 'hidden' }}
                    >
                        <div
                            style={{
                                background: headerColor,
                                color: headerTextColor,
                                padding: '12px 20px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                            }}
                        >
                            <div>
                                <h2
                                    id={`preview-criterion-${ci}`}
                                    style={{ margin: 0, fontWeight: 700, fontSize: '1rem' }}
                                >
                                    {criterion.title}
                                </h2>
                                {criterion.description && (
                                    <div style={{ fontSize: '0.85rem', marginTop: 2 }}>{criterion.description}</div>
                                )}
                            </div>
                            {criterion.weight !== undefined && (
                                <div style={{ fontSize: '0.85rem', marginInlineStart: 16, whiteSpace: 'nowrap' }}>
                                    {t('rubricPreview.weight', { weight: criterion.weight })}
                                </div>
                            )}
                        </div>

                        {/* Levels wrap onto extra rows on narrow screens instead of being clipped; the 1px
                        gap over the tinted background draws the cell borders for any wrap. */}
                        <ul
                            style={{
                                listStyle: 'none',
                                margin: 0,
                                padding: 0,
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                                gap: 1,
                                background: 'var(--border)',
                                borderTop: '1px solid var(--border)',
                            }}
                        >
                            {(criterion.levels ?? []).map((level, li) => (
                                <li
                                    key={level.id ?? li}
                                    style={{
                                        padding: '14px 16px',
                                        background: 'var(--bg-card)',
                                        minWidth: 0,
                                    }}
                                >
                                    <div
                                        style={{
                                            fontWeight: 700,
                                            fontSize: '0.9rem',
                                            color: 'var(--text)',
                                            marginBottom: 6,
                                        }}
                                    >
                                        {level.label}
                                        {showPoints && (
                                            <span
                                                style={{
                                                    fontWeight: 400,
                                                    color: 'var(--text-muted)',
                                                    fontSize: '0.8rem',
                                                    marginInlineStart: 6,
                                                    display: 'inline-block',
                                                    maxWidth: '100%',
                                                    overflowWrap: 'anywhere',
                                                }}
                                            >
                                                {level.minPoints === level.maxPoints
                                                    ? t('rubricPreview.points_single', { points: level.maxPoints })
                                                    : t('rubricPreview.points_range', {
                                                          min: level.minPoints,
                                                          max: level.maxPoints,
                                                      })}
                                            </span>
                                        )}
                                    </div>
                                    {level.description && (
                                        <div style={{ fontSize: '0.85rem', color: 'var(--text)', lineHeight: 1.5 }}>
                                            {level.description}
                                        </div>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </section>
                ))}
        </SharedPageShell>
    );
}
