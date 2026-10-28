import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Layers, RotateCcw } from 'lucide-react';
import type { StudentRubric, TieredConfig } from '../../types';
import { DEFAULT_BAND_COLOR, tierLabel, type TieredVerdict } from '../../utils/tieredRubric';

export type TieredGradePatch = Partial<Pick<StudentRubric, 'tierId' | 'requirementsMet' | 'verdictOverride'>>;

interface Props {
    config: TieredConfig;
    /** The tier this grade is in: the one saved on it, else the student's class tier. */
    tierId: string | undefined;
    /** The tier the student's class resolves to, if any. */
    classTierId: string | undefined;
    requirementsMet: StudentRubric['requirementsMet'];
    verdictOverride: string | undefined;
    verdict: TieredVerdict | undefined;
    percentage: number;
    /** Every criterion is scored, so the points-based verdict is final. */
    complete: boolean;
    onChange: (patch: TieredGradePatch) => void;
}

const sectionLabel: React.CSSProperties = {
    fontSize: '0.72rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    color: 'var(--text-muted)',
};

// Dark text keeps the pressed state readable on both themes' green and red.
const pressed = (color: string): React.CSSProperties => ({
    background: color,
    borderColor: color,
    color: '#111827',
    fontWeight: 700,
});

/** The grade-level controls of a tiered rubric: which tier, which requirements hold, and the verdict. */
export default function TieredGradingBar({
    config,
    tierId,
    classTierId,
    requirementsMet,
    verdictOverride,
    verdict,
    percentage,
    complete,
    onChange,
}: Props) {
    const { t } = useTranslation();
    const uid = useId();
    const requirements = config.requirements ?? [];
    const tierKnown = config.tiers.some((tier) => tier.id === tierId);
    const showVerdict = !!verdict && (complete || verdict.reason !== 'score');

    const setRequirement = (id: string, met: boolean) => {
        const next = { ...requirementsMet };
        if (next[id] === met) delete next[id];
        else next[id] = met;
        onChange({ requirementsMet: next });
    };

    return (
        <section
            className="card no-print tiered-grading-bar"
            aria-label={t('gradeStudent.tiered_bar_label')}
            style={{ padding: '12px 16px', marginBottom: 12, display: 'flex', flexWrap: 'wrap', gap: '12px 28px' }}
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 200 }}>
                <label
                    htmlFor={`${uid}-tier`}
                    style={{ ...sectionLabel, display: 'flex', alignItems: 'center', gap: 4 }}
                >
                    <Layers size={12} aria-hidden />
                    {t('gradeStudent.tiered_tier')}
                </label>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <select
                        id={`${uid}-tier`}
                        value={tierKnown ? tierId : ''}
                        onChange={(e) => onChange({ tierId: e.target.value || undefined })}
                        style={{ minWidth: 160 }}
                    >
                        {!tierKnown && <option value="">{t('gradeStudent.tiered_choose_tier')}</option>}
                        {config.tiers.map((tier) => (
                            <option key={tier.id} value={tier.id}>
                                {tierLabel(tier)}
                            </option>
                        ))}
                    </select>
                    {classTierId && tierId !== classTierId && (
                        <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => onChange({ tierId: undefined })}
                            title={t('gradeStudent.tiered_use_class_tier')}
                            aria-label={t('gradeStudent.tiered_use_class_tier')}
                        >
                            <RotateCcw size={13} />
                        </button>
                    )}
                </div>
                <div className="text-xs text-muted" style={{ maxWidth: 260 }}>
                    {!tierKnown ? (
                        <span style={{ color: 'var(--text)' }}>
                            <AlertTriangle
                                size={12}
                                color="var(--yellow)"
                                style={{ verticalAlign: '-2px', marginRight: 4 }}
                                aria-hidden
                            />
                            {t('gradeStudent.tiered_no_tier')}
                        </span>
                    ) : tierId === classTierId ? (
                        t('gradeStudent.tiered_tier_from_class')
                    ) : (
                        t('gradeStudent.tiered_tier_changed')
                    )}
                </div>
            </div>

            {requirements.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: '1 1 260px' }}>
                    <div id={`${uid}-req`} style={sectionLabel}>
                        {t('gradeStudent.tiered_requirements')}
                    </div>
                    <ul
                        aria-labelledby={`${uid}-req`}
                        style={{
                            listStyle: 'none',
                            margin: 0,
                            padding: 0,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 4,
                        }}
                    >
                        {requirements.map((r) => {
                            const state = requirementsMet?.[r.id];
                            return (
                                <li
                                    key={r.id}
                                    style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem' }}
                                >
                                    <span style={{ flex: 1 }}>{r.text}</span>
                                    <span role="group" aria-label={r.text} style={{ display: 'flex', gap: 6 }}>
                                        <button
                                            type="button"
                                            className="btn btn-sm btn-secondary"
                                            style={state === true ? pressed('var(--green)') : undefined}
                                            aria-pressed={state === true}
                                            onClick={() => setRequirement(r.id, true)}
                                        >
                                            {t('gradeStudent.tiered_requirement_met')}
                                        </button>
                                        <button
                                            type="button"
                                            className="btn btn-sm btn-secondary"
                                            style={state === false ? pressed('var(--red)') : undefined}
                                            aria-pressed={state === false}
                                            onClick={() => setRequirement(r.id, false)}
                                        >
                                            {t('gradeStudent.tiered_requirement_not_met')}
                                        </button>
                                    </span>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 220 }}>
                <div style={sectionLabel}>{t('gradeStudent.tiered_verdict')}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }} aria-live="polite">
                    {showVerdict ? (
                        <>
                            <span
                                style={{
                                    padding: '4px 12px',
                                    borderRadius: 8,
                                    fontWeight: 800,
                                    background: verdict.band.color ?? DEFAULT_BAND_COLOR,
                                    color: '#1f2937',
                                }}
                            >
                                {verdict.band.code}
                                {verdict.band.label && (
                                    <span style={{ fontWeight: 500, marginLeft: 6 }}>{verdict.band.label}</span>
                                )}
                            </span>
                            <span className="text-xs text-muted">
                                {t(`gradeStudent.tiered_verdict_reason_${verdict.reason}`, {
                                    pct: Math.round(percentage),
                                })}
                            </span>
                        </>
                    ) : (
                        <span className="text-xs text-muted">{t('gradeStudent.tiered_verdict_pending')}</span>
                    )}
                </div>
                <label
                    className="text-xs"
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        textTransform: 'none',
                        letterSpacing: 'normal',
                        whiteSpace: 'nowrap',
                    }}
                >
                    {t('gradeStudent.tiered_verdict_override')}
                    <select
                        value={config.bands.some((b) => b.id === verdictOverride) ? verdictOverride : ''}
                        onChange={(e) => onChange({ verdictOverride: e.target.value || undefined })}
                    >
                        <option value="">{t('gradeStudent.tiered_verdict_auto')}</option>
                        {config.bands.map((b) => (
                            <option key={b.id} value={b.id}>
                                {b.label ? `${b.code} — ${b.label}` : b.code}
                            </option>
                        ))}
                    </select>
                </label>
            </div>
        </section>
    );
}
