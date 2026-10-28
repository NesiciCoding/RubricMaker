import { useTranslation } from 'react-i18next';
import type { TieredSheet } from '../../utils/tieredSheet';

interface Props {
    sheet: TieredSheet;
    headerColor: string;
    headerTextColor: string;
    /** Heading level of each criterion title; tier headings sit one level below. */
    headingLevel?: 2 | 3;
}

const INK = '#1f2937';

/** On-screen version of the printed tiered sheet: per criterion, a column per tier with its bands' statements. */
export default function TieredSheetView({ sheet, headerColor, headerTextColor, headingLevel = 3 }: Props) {
    const { t } = useTranslation();
    const CriterionHeading = `h${headingLevel}` as const;
    const TierHeading = `h${headingLevel + 1}` as 'h3' | 'h4';
    return (
        <div className="tiered-sheet-view" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {sheet.requirements.length > 0 && (
                <section
                    aria-label={t('exportDoc.tiered_requirements')}
                    style={{ background: 'var(--bg-elevated)', borderRadius: 10, padding: '10px 14px' }}
                >
                    <div style={{ fontWeight: 700, marginBottom: 4 }}>{t('exportDoc.tiered_requirements')}</div>
                    <ol style={{ margin: 0, paddingInlineStart: 20, fontSize: '0.88rem', lineHeight: 1.5 }}>
                        {sheet.requirements.map((r) => (
                            <li key={r.id}>{r.text}</li>
                        ))}
                    </ol>
                </section>
            )}
            {sheet.criteria.map((c, ci) => (
                <section
                    key={c.id}
                    aria-labelledby={`tiered-sheet-criterion-${ci}`}
                    style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}
                >
                    <div style={{ background: headerColor, color: headerTextColor, padding: '10px 16px' }}>
                        <CriterionHeading
                            id={`tiered-sheet-criterion-${ci}`}
                            style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}
                        >
                            {c.title}
                        </CriterionHeading>
                        {c.description && <div style={{ fontSize: '0.85rem', marginTop: 2 }}>{c.description}</div>}
                    </div>
                    <div
                        style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                            gap: 1,
                            background: 'var(--border)',
                        }}
                    >
                        {sheet.tiers.map((tier, ti) => (
                            <div
                                key={tier.id}
                                style={{ background: 'var(--bg-card)', padding: '10px 12px', minWidth: 0 }}
                            >
                                <TierHeading style={{ margin: '0 0 8px', fontSize: '0.9rem', fontWeight: 700 }}>
                                    {tier.label}
                                </TierHeading>
                                {c.columns[ti].map((band) => (
                                    <div key={band.id} style={{ marginBottom: 10 }}>
                                        <div
                                            style={{
                                                background: band.color,
                                                color: INK,
                                                borderRadius: 4,
                                                padding: '1px 6px',
                                                fontWeight: 700,
                                                fontSize: '0.8rem',
                                                marginBottom: 4,
                                            }}
                                        >
                                            {band.code}
                                            {band.label && <span style={{ fontWeight: 500 }}> · {band.label}</span>}
                                        </div>
                                        <ul
                                            aria-label={t('rubricBuilder.tiered_cell_label', {
                                                band: band.code,
                                                tier: tier.label,
                                            })}
                                            style={{
                                                listStyle: 'none',
                                                margin: 0,
                                                padding: 0,
                                                fontSize: '0.83rem',
                                                lineHeight: 1.35,
                                            }}
                                        >
                                            {band.statements.map((s, si) => (
                                                <li key={si} style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
                                                    <span aria-hidden="true">☐</span>
                                                    <span>{s.label}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                ))}
                            </div>
                        ))}
                    </div>
                </section>
            ))}
        </div>
    );
}
