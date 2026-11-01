import { useTranslation } from 'react-i18next';
import { Plus, RotateCcw, Trash2 } from 'lucide-react';
import type { RubricBand, RubricTier, SchoolYear, TieredConfig, VoTrack } from '../../types';
import { SCHOOL_YEARS, SCHOOL_YEAR_HAS_TRACK, SCHOOL_YEAR_LABELS } from '../../data/schoolYears';
import { VO_TRACKS, VO_TRACK_LABELS } from '../../data/voTracks';
import { nanoid } from '../../utils/nanoid';
import { DEFAULT_BAND_COLOR, defaultCutoffs, tierLabel, validateTiered } from '../../utils/tieredRubric';

interface Props {
    config: TieredConfig;
    onChange: (next: TieredConfig) => void;
}

const sectionTitle = { fontSize: '0.85rem', fontWeight: 700, margin: '14px 0 6px' } as const;
const cell = { padding: '3px 4px', verticalAlign: 'middle' } as const;

/** Rubric-level setup of a tiered rubric: its tier columns, shared bands with verdict cutoffs, and requirements. */
export default function TieredConfigPanel({ config, onChange }: Props) {
    const { t } = useTranslation();
    const { tiers, bands } = config;
    const requirements = config.requirements ?? [];
    const cutoffDefaults = defaultCutoffs(bands);
    const issues = validateTiered(config);

    const setTiers = (next: RubricTier[]) => onChange({ ...config, tiers: next });
    const setBands = (next: RubricBand[]) => onChange({ ...config, bands: next });
    const updateTier = (id: string, patch: Partial<RubricTier>) =>
        setTiers(tiers.map((tier) => (tier.id === id ? { ...tier, ...patch } : tier)));
    const updateBand = (id: string, patch: Partial<RubricBand>) =>
        setBands(bands.map((band) => (band.id === id ? { ...band, ...patch } : band)));

    function addTier() {
        const year: SchoolYear = tiers[tiers.length - 1]?.year ?? 'jaar-1';
        const used = new Set(tiers.filter((tier) => tier.year === year).map((tier) => tier.track));
        const track = SCHOOL_YEAR_HAS_TRACK[year] ? VO_TRACKS.find((v) => !used.has(v)) : undefined;
        setTiers([...tiers, { id: nanoid(), year, ...(track && { track }) }]);
    }

    function addBand() {
        const top = bands[bands.length - 1];
        setBands([...bands, { id: nanoid(), code: '', label: '', points: top ? top.points + 1 : 1 }]);
    }

    return (
        <div className="tiered-config" style={{ marginTop: 12 }}>
            <div style={sectionTitle}>{t('rubricBuilder.tiered_tiers_title')}</div>
            <p className="text-xs text-muted" style={{ margin: '0 0 6px' }}>
                {t('rubricBuilder.tiered_tiers_help')}
            </p>
            <table style={{ borderCollapse: 'collapse' }}>
                <thead>
                    <tr className="text-xs text-muted">
                        <th style={cell}>{t('rubricBuilder.tiered_year')}</th>
                        <th style={cell}>{t('rubricBuilder.tiered_track')}</th>
                        <th style={cell}>{t('rubricBuilder.tiered_column_label')}</th>
                        <th style={cell}>
                            <span className="sr-only">{t('common.actions')}</span>
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {tiers.map((tier, i) => {
                        const name = tierLabel(tier);
                        return (
                            <tr key={tier.id}>
                                <td style={cell}>
                                    <select
                                        value={tier.year}
                                        aria-label={t('rubricBuilder.tiered_year_of', { n: i + 1 })}
                                        onChange={(e) => {
                                            const year = e.target.value as SchoolYear;
                                            updateTier(tier.id, {
                                                year,
                                                track: SCHOOL_YEAR_HAS_TRACK[year] ? tier.track : undefined,
                                            });
                                        }}
                                    >
                                        {SCHOOL_YEARS.map((y) => (
                                            <option key={y} value={y}>
                                                {SCHOOL_YEAR_LABELS[y]}
                                            </option>
                                        ))}
                                    </select>
                                </td>
                                <td style={cell}>
                                    <select
                                        value={tier.track ?? ''}
                                        disabled={!SCHOOL_YEAR_HAS_TRACK[tier.year]}
                                        aria-label={t('rubricBuilder.tiered_track_of', { n: i + 1 })}
                                        onChange={(e) =>
                                            updateTier(tier.id, { track: (e.target.value as VoTrack) || undefined })
                                        }
                                    >
                                        <option value="">{t('rubricBuilder.tiered_any_track')}</option>
                                        {VO_TRACKS.map((v) => (
                                            <option key={v} value={v}>
                                                {VO_TRACK_LABELS[v]}
                                            </option>
                                        ))}
                                    </select>
                                </td>
                                <td style={cell}>
                                    <input
                                        type="text"
                                        value={tier.label ?? ''}
                                        placeholder={tierLabel({ ...tier, label: undefined })}
                                        aria-label={t('rubricBuilder.tiered_column_label_of', { n: i + 1 })}
                                        onChange={(e) => updateTier(tier.id, { label: e.target.value || undefined })}
                                        style={{ width: 150 }}
                                    />
                                </td>
                                <td style={cell}>
                                    <button
                                        type="button"
                                        className="btn btn-ghost btn-icon btn-sm"
                                        disabled={tiers.length === 1}
                                        onClick={() => setTiers(tiers.filter((x) => x.id !== tier.id))}
                                        title={t('rubricBuilder.tiered_remove_tier', { name })}
                                        aria-label={t('rubricBuilder.tiered_remove_tier', { name })}
                                        style={{ color: 'var(--red-text)' }}
                                    >
                                        <Trash2 size={13} />
                                    </button>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
            <button type="button" className="btn btn-ghost btn-sm" onClick={addTier} style={{ marginTop: 4 }}>
                <Plus size={13} /> {t('rubricBuilder.tiered_add_tier')}
            </button>

            <div style={sectionTitle}>{t('rubricBuilder.tiered_bands_title')}</div>
            <p className="text-xs text-muted" style={{ margin: '0 0 6px' }}>
                {t('rubricBuilder.tiered_bands_help')}
            </p>
            <table style={{ borderCollapse: 'collapse' }}>
                <thead>
                    <tr className="text-xs text-muted">
                        <th style={cell}>{t('rubricBuilder.tiered_band_code')}</th>
                        <th style={cell}>{t('rubricBuilder.tiered_band_label')}</th>
                        <th style={cell}>{t('rubricBuilder.tiered_band_points')}</th>
                        <th style={cell}>{t('rubricBuilder.tiered_band_colour')}</th>
                        <th style={cell}>{t('rubricBuilder.tiered_band_cutoff')}</th>
                        <th style={cell}>
                            <span className="sr-only">{t('common.actions')}</span>
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {bands.map((band, k) => {
                        const name = band.code || String(k + 1);
                        return (
                            <tr key={band.id}>
                                <td style={cell}>
                                    <input
                                        type="text"
                                        value={band.code}
                                        maxLength={6}
                                        aria-label={t('rubricBuilder.tiered_band_code_of', { n: k + 1 })}
                                        onChange={(e) => updateBand(band.id, { code: e.target.value })}
                                        style={{ width: 64 }}
                                    />
                                </td>
                                <td style={cell}>
                                    <input
                                        type="text"
                                        value={band.label}
                                        aria-label={t('rubricBuilder.tiered_band_label_of', { n: k + 1 })}
                                        onChange={(e) => updateBand(band.id, { label: e.target.value })}
                                        style={{ width: 160 }}
                                    />
                                </td>
                                <td style={cell}>
                                    <input
                                        type="number"
                                        min={0}
                                        value={band.points}
                                        aria-label={t('rubricBuilder.tiered_band_points_of', { name })}
                                        onChange={(e) => updateBand(band.id, { points: Number(e.target.value) })}
                                        style={{ width: 64 }}
                                    />
                                </td>
                                <td style={cell}>
                                    <input
                                        type="color"
                                        value={band.color ?? DEFAULT_BAND_COLOR}
                                        aria-label={t('rubricBuilder.tiered_band_colour_of', { name })}
                                        onChange={(e) => updateBand(band.id, { color: e.target.value })}
                                        style={{ width: 40, height: 28, padding: 0 }}
                                    />
                                </td>
                                <td style={cell}>
                                    <input
                                        type="number"
                                        min={0}
                                        max={100}
                                        disabled={k === 0}
                                        value={k === 0 ? 0 : (band.minPercentage ?? '')}
                                        placeholder={String(Math.round(cutoffDefaults[k] * 10) / 10)}
                                        aria-label={t('rubricBuilder.tiered_band_cutoff_of', { name })}
                                        onChange={(e) =>
                                            updateBand(band.id, {
                                                minPercentage:
                                                    e.target.value === '' ? undefined : Number(e.target.value),
                                            })
                                        }
                                        style={{ width: 70 }}
                                    />{' '}
                                    <span className="text-xs text-muted">%</span>
                                </td>
                                <td style={cell}>
                                    <button
                                        type="button"
                                        className="btn btn-ghost btn-icon btn-sm"
                                        disabled={bands.length === 1}
                                        onClick={() => setBands(bands.filter((x) => x.id !== band.id))}
                                        title={t('rubricBuilder.tiered_remove_band', { name })}
                                        aria-label={t('rubricBuilder.tiered_remove_band', { name })}
                                        style={{ color: 'var(--red-text)' }}
                                    >
                                        <Trash2 size={13} />
                                    </button>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                <button type="button" className="btn btn-ghost btn-sm" onClick={addBand}>
                    <Plus size={13} /> {t('rubricBuilder.tiered_add_band')}
                </button>
                <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={bands.every((b) => b.minPercentage === undefined)}
                    onClick={() => setBands(bands.map(({ minPercentage: _m, ...band }) => band))}
                >
                    <RotateCcw size={13} /> {t('rubricBuilder.tiered_reset_cutoffs')}
                </button>
            </div>

            <div style={sectionTitle}>{t('rubricBuilder.tiered_requirements_title')}</div>
            <p className="text-xs text-muted" style={{ margin: '0 0 6px' }}>
                {t('rubricBuilder.tiered_requirements_help', { band: bands[0]?.code ?? '' })}
            </p>
            {requirements.map((req, i) => (
                <div key={req.id} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
                    <span className="text-xs text-muted">{i + 1}.</span>
                    <input
                        type="text"
                        value={req.text}
                        aria-label={t('rubricBuilder.tiered_requirement_of', { n: i + 1 })}
                        onChange={(e) =>
                            onChange({
                                ...config,
                                requirements: requirements.map((r) =>
                                    r.id === req.id ? { ...r, text: e.target.value } : r
                                ),
                            })
                        }
                        style={{ flex: 1 }}
                    />
                    <button
                        type="button"
                        className="btn btn-ghost btn-icon btn-sm"
                        onClick={() =>
                            onChange({ ...config, requirements: requirements.filter((r) => r.id !== req.id) })
                        }
                        title={t('rubricBuilder.tiered_remove_requirement', { n: i + 1 })}
                        aria-label={t('rubricBuilder.tiered_remove_requirement', { n: i + 1 })}
                        style={{ color: 'var(--red-text)' }}
                    >
                        <Trash2 size={13} />
                    </button>
                </div>
            ))}
            <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => onChange({ ...config, requirements: [...requirements, { id: nanoid(), text: '' }] })}
            >
                <Plus size={13} /> {t('rubricBuilder.tiered_add_requirement')}
            </button>

            <div id="tiered-pairing-title" style={sectionTitle}>
                {t('rubricBuilder.tiered_pairing_title')}
            </div>
            <div
                role="radiogroup"
                aria-labelledby="tiered-pairing-title"
                style={{ display: 'flex', flexDirection: 'column', gap: 4 }}
            >
                {(['tier', 'all'] as const).map((mode) => (
                    <label
                        key={mode}
                        className="sub-item-check"
                        style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}
                    >
                        <input
                            type="radio"
                            name="tiered-pairing"
                            checked={(config.comparativePairing ?? 'tier') === mode}
                            onChange={() => onChange({ ...config, comparativePairing: mode })}
                        />
                        <span>
                            {t(`rubricBuilder.tiered_pairing_${mode}`)}
                            <span className="text-xs text-muted" style={{ display: 'block' }}>
                                {t(`rubricBuilder.tiered_pairing_${mode}_help`)}
                            </span>
                        </span>
                    </label>
                ))}
            </div>

            {issues.length > 0 && (
                <ul
                    role="alert"
                    style={{ margin: '10px 0 0', paddingLeft: 18, color: 'var(--red-text)', fontSize: '0.8rem' }}
                >
                    {issues.map((issue) => (
                        <li key={issue}>{t(`rubricBuilder.tiered_issue_${issue}`)}</li>
                    ))}
                </ul>
            )}
        </div>
    );
}
