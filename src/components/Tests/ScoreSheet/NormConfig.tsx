import React from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2 } from 'lucide-react';
import type { GradeScale, SchoolYear, Test, TestGradingNorm, TestNormTier, VoTrack } from '../../../types';
import { SCHOOL_YEARS, SCHOOL_YEAR_LABELS } from '../../../data/schoolYears';
import { VO_TRACKS, VO_TRACK_LABELS } from '../../../data/voTracks';
import {
    DEFAULT_GRADE_DECIMALS,
    DEFAULT_PASS_GRADE,
    defaultNorm,
    parseGradeCell,
    testNorm,
    tierLabels,
    withLabelPassDefaults,
} from '../../../utils/testGradingNorm';
import { parsePastedGrid, parsePoints } from '../../../utils/scoreSheet';
import { nanoid } from '../../../utils/nanoid';
import HelpPopover from '../HelpPopover';

export type NormSettings = Pick<Test, 'gradingNorm' | 'gradeDecimals' | 'passGrade' | 'gradeScaleId'>;

interface Props {
    value: NormSettings;
    maxPoints: number;
    gradeScales: GradeScale[];
    onChange: (patch: Partial<NormSettings>) => void;
    idPrefix?: string;
    /** The host page already has its own grade-scale picker. */
    hideScaleSelect?: boolean;
}

const NORM_TYPES: TestGradingNorm['type'][] = ['scale', 'nterm', 'caesura', 'table'];

function numberOr(raw: string, fallback: number): number {
    const v = parsePoints(raw);
    return v === null || Number.isNaN(v) ? fallback : v;
}

export default function NormConfig({
    value,
    maxPoints,
    gradeScales,
    onChange,
    idPrefix = 'norm',
    hideScaleSelect = false,
}: Props) {
    const { t } = useTranslation();
    const norm = testNorm(value);

    function setNorm(next: TestGradingNorm) {
        onChange({ gradingNorm: next });
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div className="form-group" style={{ marginBottom: 0, minWidth: 200 }}>
                    <label htmlFor={`${idPrefix}-type`}>
                        {t('tests.norm.type_label')}
                        <HelpPopover title={t('tests.norm.type_label')}>{t('tests.norm.type_help')}</HelpPopover>
                    </label>
                    <select
                        id={`${idPrefix}-type`}
                        value={norm.type}
                        onChange={(e) => setNorm(defaultNorm(e.target.value as TestGradingNorm['type'], maxPoints))}
                    >
                        {NORM_TYPES.map((type) => (
                            <option key={type} value={type}>
                                {t(`tests.norm.type_${type}`)}
                            </option>
                        ))}
                    </select>
                </div>

                {norm.type === 'scale' && !hideScaleSelect && (
                    <div className="form-group" style={{ marginBottom: 0, minWidth: 180 }}>
                        <label htmlFor={`${idPrefix}-scale`}>{t('tests.norm.scale_label')}</label>
                        <select
                            id={`${idPrefix}-scale`}
                            value={value.gradeScaleId ?? ''}
                            onChange={(e) => onChange({ gradeScaleId: e.target.value || undefined })}
                        >
                            <option value="">{t('tests.norm.scale_default')}</option>
                            <option value="none">{t('tests.norm.scale_none')}</option>
                            {gradeScales.map((g) => (
                                <option key={g.id} value={g.id}>
                                    {g.name}
                                </option>
                            ))}
                        </select>
                    </div>
                )}

                {norm.type === 'nterm' && (
                    <div className="form-group" style={{ marginBottom: 0, width: 110 }}>
                        <label htmlFor={`${idPrefix}-n`}>{t('tests.norm.n_label')}</label>
                        <input
                            id={`${idPrefix}-n`}
                            type="number"
                            step={0.1}
                            min={0}
                            max={3}
                            value={norm.n}
                            onChange={(e) => setNorm({ type: 'nterm', n: numberOr(e.target.value, 1) })}
                        />
                    </div>
                )}

                {norm.type === 'caesura' && (
                    <div className="form-group" style={{ marginBottom: 0, width: 150 }}>
                        <label htmlFor={`${idPrefix}-pass-points`}>{t('tests.norm.pass_points_label')}</label>
                        <input
                            id={`${idPrefix}-pass-points`}
                            type="number"
                            step={0.5}
                            min={0}
                            max={maxPoints}
                            value={norm.passPoints}
                            onChange={(e) =>
                                setNorm({ type: 'caesura', passPoints: numberOr(e.target.value, norm.passPoints) })
                            }
                        />
                    </div>
                )}

                {norm.type !== 'scale' && (
                    <>
                        <div className="form-group" style={{ marginBottom: 0, width: 110 }}>
                            <label htmlFor={`${idPrefix}-pass-grade`}>{t('tests.norm.pass_grade_label')}</label>
                            <input
                                id={`${idPrefix}-pass-grade`}
                                type="number"
                                step={0.1}
                                min={1}
                                max={10}
                                value={value.passGrade ?? DEFAULT_PASS_GRADE}
                                onChange={(e) => onChange({ passGrade: numberOr(e.target.value, DEFAULT_PASS_GRADE) })}
                            />
                        </div>
                        <div className="form-group" style={{ marginBottom: 0, width: 110 }}>
                            <label htmlFor={`${idPrefix}-decimals`}>{t('tests.norm.decimals_label')}</label>
                            <select
                                id={`${idPrefix}-decimals`}
                                value={value.gradeDecimals ?? DEFAULT_GRADE_DECIMALS}
                                onChange={(e) => onChange({ gradeDecimals: Number(e.target.value) as 0 | 1 | 2 })}
                            >
                                {[0, 1, 2].map((d) => (
                                    <option key={d} value={d}>
                                        {d}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </>
                )}
            </div>

            {norm.type === 'table' && <NormTableEditor norm={norm} onChange={setNorm} idPrefix={idPrefix} />}
        </div>
    );
}

type TableNorm = Extract<TestGradingNorm, { type: 'table' }>;

function NormTableEditor({
    norm,
    onChange,
    idPrefix,
}: {
    norm: TableNorm;
    onChange: (n: TableNorm) => void;
    idPrefix: string;
}) {
    const { t } = useTranslation();
    const allLabel = t('tests.norm.tier_all');

    function updateTier(id: string, patch: Partial<TestNormTier>) {
        onChange({ ...norm, tiers: norm.tiers.map((tier) => (tier.id === id ? { ...tier, ...patch } : tier)) });
    }

    function addTier() {
        const tier: TestNormTier = { id: nanoid(), year: 'jaar-1', track: 'havo' };
        onChange({ ...norm, tiers: [...norm.tiers, tier] });
    }

    function removeTier(id: string) {
        onChange({
            ...norm,
            tiers: norm.tiers.filter((tier) => tier.id !== id),
            rows: norm.rows.map((row) => {
                const grades = { ...row.grades };
                delete grades[id];
                return { ...row, grades };
            }),
        });
    }

    function setRows(rows: TableNorm['rows']) {
        onChange({ ...norm, rows, tiers: withLabelPassDefaults(norm.tiers, rows) });
    }

    function setRow(index: number, patch: Partial<TableNorm['rows'][number]>) {
        setRows(norm.rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
    }

    function setGrade(index: number, tierId: string, raw: string) {
        const grades = { ...norm.rows[index].grades };
        const value = parseGradeCell(raw);
        if (value === null) delete grades[tierId];
        else grades[tierId] = value;
        setRow(index, { grades });
    }

    function addRow() {
        const last = norm.rows[norm.rows.length - 1];
        onChange({ ...norm, rows: [...norm.rows, { minPoints: last ? last.minPoints + 1 : 0, grades: {} }] });
    }

    /** Pasting "points<TAB>grade<TAB>grade…" lines replaces the rows, one grade per column in order. */
    function handlePaste(e: React.ClipboardEvent) {
        const grid = parsePastedGrid(e.clipboardData.getData('text'));
        if (grid.length < 2 && (grid[0]?.length ?? 0) < 2) return;
        e.preventDefault();
        const rows = grid
            .map((cells) => {
                const minPoints = parsePoints(cells[0] ?? '');
                if (minPoints === null || Number.isNaN(minPoints)) return null;
                const grades: Record<string, number | string> = {};
                norm.tiers.forEach((tier, i) => {
                    const g = parseGradeCell(cells[i + 1] ?? '');
                    if (g !== null) grades[tier.id] = g;
                });
                return { minPoints, grades };
            })
            .filter((r): r is TableNorm['rows'][number] => r !== null);
        if (rows.length) setRows(rows);
    }

    const sortedIndexes = norm.rows.map((_, i) => i).sort((a, b) => norm.rows[a].minPoints - norm.rows[b].minPoints);

    return (
        <div onPaste={handlePaste}>
            <p className="text-muted text-xs" style={{ margin: '0 0 8px' }}>
                {t('tests.norm.table_help')}
            </p>
            <div style={{ overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                    <thead>
                        <tr>
                            <th style={{ textAlign: 'left', padding: 4 }}>{t('tests.norm.min_points')}</th>
                            {norm.tiers.map((tier, ti) => (
                                <th key={tier.id} style={{ padding: 4, verticalAlign: 'top' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 130 }}>
                                        <select
                                            aria-label={t('tests.norm.tier_year', { n: ti + 1 })}
                                            value={tier.year ?? ''}
                                            onChange={(e) =>
                                                updateTier(tier.id, {
                                                    year: (e.target.value || undefined) as SchoolYear | undefined,
                                                })
                                            }
                                        >
                                            <option value="">{t('tests.norm.any_year')}</option>
                                            {SCHOOL_YEARS.map((y) => (
                                                <option key={y} value={y}>
                                                    {SCHOOL_YEAR_LABELS[y]}
                                                </option>
                                            ))}
                                        </select>
                                        <select
                                            aria-label={t('tests.norm.tier_track', { n: ti + 1 })}
                                            value={tier.track ?? ''}
                                            onChange={(e) =>
                                                updateTier(tier.id, {
                                                    track: (e.target.value || undefined) as VoTrack | undefined,
                                                })
                                            }
                                        >
                                            <option value="">{t('tests.norm.any_track')}</option>
                                            {VO_TRACKS.map((v) => (
                                                <option key={v} value={v}>
                                                    {VO_TRACK_LABELS[v]}
                                                </option>
                                            ))}
                                        </select>
                                        <div style={{ display: 'flex', gap: 4 }}>
                                            <input
                                                aria-label={t('tests.norm.tier_label', { n: ti + 1 })}
                                                placeholder={allLabel}
                                                value={tier.label ?? ''}
                                                onChange={(e) =>
                                                    updateTier(tier.id, { label: e.target.value || undefined })
                                                }
                                                style={{ flex: 1, minWidth: 0 }}
                                            />
                                            {norm.tiers.length > 1 && (
                                                <button
                                                    type="button"
                                                    className="btn btn-ghost btn-icon btn-sm"
                                                    aria-label={t('tests.norm.remove_tier', { n: ti + 1 })}
                                                    onClick={() => removeTier(tier.id)}
                                                >
                                                    <Trash2 size={13} />
                                                </button>
                                            )}
                                        </div>
                                        {tierLabels(norm.rows, tier.id).length > 0 && (
                                            <label
                                                className="text-xs text-muted"
                                                style={{ display: 'flex', flexDirection: 'column', gap: 2, margin: 0 }}
                                            >
                                                {t('tests.norm.pass_from')}
                                                <select
                                                    aria-label={t('tests.norm.pass_from_aria', { n: ti + 1 })}
                                                    value={tier.passFrom ?? ''}
                                                    onChange={(e) => updateTier(tier.id, { passFrom: e.target.value })}
                                                >
                                                    <option value="">{t('tests.norm.pass_from_none')}</option>
                                                    {tierLabels(norm.rows, tier.id).map((label) => (
                                                        <option key={label} value={label}>
                                                            {label}
                                                        </option>
                                                    ))}
                                                </select>
                                            </label>
                                        )}
                                    </div>
                                </th>
                            ))}
                            <th />
                        </tr>
                    </thead>
                    <tbody>
                        {sortedIndexes.map((index) => {
                            const row = norm.rows[index];
                            return (
                                <tr key={index}>
                                    <td style={{ padding: 4 }}>
                                        <input
                                            id={`${idPrefix}-row-${index}`}
                                            aria-label={t('tests.norm.min_points')}
                                            type="number"
                                            step={0.5}
                                            min={0}
                                            value={row.minPoints}
                                            onChange={(e) =>
                                                setRow(index, { minPoints: numberOr(e.target.value, row.minPoints) })
                                            }
                                            style={{ width: 80 }}
                                        />
                                    </td>
                                    {norm.tiers.map((tier, ti) => (
                                        <td key={tier.id} style={{ padding: 4 }}>
                                            <input
                                                aria-label={t('tests.norm.grade_cell', {
                                                    points: row.minPoints,
                                                    n: ti + 1,
                                                })}
                                                defaultValue={row.grades[tier.id] ?? ''}
                                                key={`${tier.id}-${row.grades[tier.id] ?? ''}`}
                                                onBlur={(e) => setGrade(index, tier.id, e.target.value)}
                                                style={{ width: 80 }}
                                            />
                                        </td>
                                    ))}
                                    <td style={{ padding: 4 }}>
                                        <button
                                            type="button"
                                            className="btn btn-ghost btn-icon btn-sm"
                                            aria-label={t('tests.norm.remove_row', { points: row.minPoints })}
                                            onClick={() => setRows(norm.rows.filter((_, i) => i !== index))}
                                        >
                                            <Trash2 size={13} />
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={addRow}>
                    <Plus size={13} /> {t('tests.norm.add_row')}
                </button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={addTier}>
                    <Plus size={13} /> {t('tests.norm.add_tier')}
                </button>
            </div>
        </div>
    );
}
