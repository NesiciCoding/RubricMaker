import React, { useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts';
import { Download, Save, Trash2, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Papa from 'papaparse';
import type { Class, SavedStatsQuery, StatsQuery, StatsQueryGroupBy, StatsQueryMetric } from '../../types';
import {
    DEFAULT_PASS_THRESHOLD,
    DEFAULT_STATS_QUERY,
    EXAMPLE_QUERIES,
    QUERY_GROUP_BYS,
    QUERY_METRICS,
    runStatsQuery,
    type AssessmentRecord,
    type QueryRow,
} from '../../utils/statsQuery';
import { CSV_UNPARSE_OPTIONS } from '../../utils/csvOptions';
import { downloadCsv } from '../../utils/csvDownload';
import { nanoid } from '../../utils/nanoid';
import ToggleChipGroup from '../ui/ToggleChipGroup';
import { EmptyState } from '../ui/EmptyState';

interface Props {
    records: AssessmentRecord[];
    classes: Class[];
    savedQueries: SavedStatsQuery[];
    onSavedQueriesChange: (queries: SavedStatsQuery[]) => void;
}

const CHART_ROW_LIMIT = 30;

function parseOptionalNumber(value: string): number | undefined {
    if (value.trim() === '') return undefined;
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
}

/** Filter → group → aggregate over every rubric grade and graded test result, with saved and example queries. */
export default function StatsQueryPanel({ records, classes, savedQueries, onSavedQueriesChange }: Props) {
    const { t, i18n } = useTranslation();
    const [query, setQuery] = useState<StatsQuery>(DEFAULT_STATS_QUERY);
    const [saveName, setSaveName] = useState('');

    const update = (patch: Partial<StatsQuery>) => setQuery((q) => ({ ...q, ...patch }));

    const assessmentOptions = useMemo(() => {
        const seen = new Map<string, { key: string; name: string; kind: AssessmentRecord['kind'] }>();
        for (const r of records) {
            if (query.source !== 'all' && r.kind !== query.source) continue;
            if (!seen.has(r.assessmentKey))
                seen.set(r.assessmentKey, { key: r.assessmentKey, name: r.assessmentName, kind: r.kind });
        }
        return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
    }, [records, query.source]);

    const subjects = useMemo(
        () => [...new Set(records.map((r) => r.subject).filter((s) => s))].sort((a, b) => a.localeCompare(b)),
        [records]
    );

    const result = useMemo(() => runStatsQuery(records, query), [records, query]);

    const monthFormat = useMemo(
        () => new Intl.DateTimeFormat(i18n.language, { year: 'numeric', month: 'long' }),
        [i18n.language]
    );

    function rowLabel(row: QueryRow): string {
        switch (query.groupBy) {
            case 'kind':
                return t(row.key === 'test' ? 'statistics.query.kind_test' : 'statistics.query.kind_rubric');
            case 'month':
                return monthFormat.format(new Date(`${row.key}-01T00:00:00`));
            case 'subject':
                return row.label || t('statistics.query.no_subject');
            case 'class':
                return row.label || t('statistics.query.no_class');
            case 'assessment':
                return row.kind === 'test' ? t('statistics.trend_test_label', { name: row.label }) : row.label;
            default:
                return row.label;
        }
    }

    function formatValue(value: number): string {
        if (query.metric === 'count') return String(value);
        const fixed = value.toFixed(1);
        return query.metric === 'change' && value > 0 ? `+${fixed}%` : `${fixed}%`;
    }

    const groupLabel = (g: StatsQueryGroupBy) => t(`statistics.query.group_${g}`);
    const metricLabel = (m: StatsQueryMetric) => t(`statistics.query.metric_${m}`);

    function handleSave() {
        const name = saveName.trim();
        if (!name) return;
        onSavedQueriesChange([...savedQueries, { id: nanoid(), name, query }]);
        setSaveName('');
    }

    function handleDownload() {
        const rows = result.rows.map((row) => ({
            [groupLabel(query.groupBy)]: rowLabel(row),
            [metricLabel(query.metric)]: row.value,
            [t('statistics.query.col_count')]: row.count,
        }));
        downloadCsv(Papa.unparse(rows, CSV_UNPARSE_OPTIONS), `${t('statistics.csv_filename')}_query.csv`);
    }

    const chartRows = result.rows.slice(0, CHART_ROW_LIMIT).map((row) => ({ name: rowLabel(row), value: row.value }));
    const hasNegative = chartRows.some((r) => r.value < 0);

    return (
        <>
            <div className="card" style={{ marginBottom: 20 }}>
                <h3 style={{ marginBottom: 4 }}>{t('statistics.query.examples_title')}</h3>
                <p className="text-muted text-sm" style={{ marginBottom: 12 }}>
                    {t('statistics.query.examples_desc')}
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {EXAMPLE_QUERIES.map((ex) => (
                        <button
                            key={ex.id}
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => setQuery({ ...ex.query, classIds: query.classIds })}
                        >
                            {t(`statistics.query.example_${ex.id}`)}
                        </button>
                    ))}
                </div>
                {savedQueries.length > 0 && (
                    <>
                        <h4 style={{ margin: '16px 0 8px' }}>{t('statistics.query.saved_title')}</h4>
                        <ul
                            style={{
                                listStyle: 'none',
                                padding: 0,
                                margin: 0,
                                display: 'flex',
                                flexWrap: 'wrap',
                                gap: 8,
                            }}
                        >
                            {savedQueries.map((saved) => (
                                <li key={saved.id} style={{ display: 'inline-flex', gap: 2 }}>
                                    <button
                                        type="button"
                                        className="btn btn-ghost btn-sm"
                                        onClick={() => setQuery({ ...DEFAULT_STATS_QUERY, ...saved.query })}
                                    >
                                        {saved.name}
                                    </button>
                                    <button
                                        type="button"
                                        className="btn btn-ghost btn-sm btn-icon"
                                        aria-label={t('statistics.query.delete_saved', { name: saved.name })}
                                        onClick={() =>
                                            onSavedQueriesChange(savedQueries.filter((q) => q.id !== saved.id))
                                        }
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </>
                )}
            </div>

            <div className="card" style={{ marginBottom: 20 }}>
                <h3 style={{ marginBottom: 14 }}>{t('statistics.query.builder_title')}</h3>
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                        gap: 12,
                        alignItems: 'end',
                    }}
                >
                    <div className="form-group" style={{ marginBottom: 0 }}>
                        <label htmlFor="sq-source">{t('statistics.query.source')}</label>
                        <select
                            id="sq-source"
                            value={query.source}
                            onChange={(e) =>
                                update({ source: e.target.value as StatsQuery['source'], assessmentKeys: [] })
                            }
                        >
                            <option value="all">{t('statistics.query.source_all')}</option>
                            <option value="rubric">{t('statistics.query.source_rubric')}</option>
                            <option value="test">{t('statistics.query.source_test')}</option>
                        </select>
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                        <label htmlFor="sq-group">{t('statistics.query.group_by')}</label>
                        <select
                            id="sq-group"
                            value={query.groupBy}
                            onChange={(e) => update({ groupBy: e.target.value as StatsQueryGroupBy })}
                        >
                            {QUERY_GROUP_BYS.map((g) => (
                                <option key={g} value={g}>
                                    {groupLabel(g)}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                        <label htmlFor="sq-metric">{t('statistics.query.metric')}</label>
                        <select
                            id="sq-metric"
                            value={query.metric}
                            onChange={(e) => update({ metric: e.target.value as StatsQueryMetric })}
                        >
                            {QUERY_METRICS.map((m) => (
                                <option key={m} value={m}>
                                    {metricLabel(m)}
                                </option>
                            ))}
                        </select>
                    </div>
                    {query.metric === 'passRate' && (
                        <div className="form-group" style={{ marginBottom: 0 }}>
                            <label htmlFor="sq-pass">{t('statistics.query.pass_threshold')}</label>
                            <input
                                id="sq-pass"
                                type="number"
                                min={0}
                                max={100}
                                value={query.passThreshold ?? DEFAULT_PASS_THRESHOLD}
                                onChange={(e) => update({ passThreshold: parseOptionalNumber(e.target.value) })}
                            />
                        </div>
                    )}
                    <div className="form-group" style={{ marginBottom: 0 }}>
                        <label htmlFor="sq-subject">{t('statistics.query.subject')}</label>
                        <select
                            id="sq-subject"
                            value={query.subject ?? ''}
                            onChange={(e) => update({ subject: e.target.value || undefined })}
                        >
                            <option value="">{t('statistics.query.any')}</option>
                            {subjects.map((s) => (
                                <option key={s} value={s}>
                                    {s}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                        <label htmlFor="sq-from">{t('statistics.query.date_from')}</label>
                        <input
                            id="sq-from"
                            type="date"
                            className="input"
                            value={query.dateFrom ?? ''}
                            onChange={(e) => update({ dateFrom: e.target.value || undefined })}
                        />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                        <label htmlFor="sq-to">{t('statistics.query.date_to')}</label>
                        <input
                            id="sq-to"
                            type="date"
                            className="input"
                            value={query.dateTo ?? ''}
                            onChange={(e) => update({ dateTo: e.target.value || undefined })}
                        />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                        <label htmlFor="sq-min">{t('statistics.query.min_score')}</label>
                        <input
                            id="sq-min"
                            type="number"
                            min={0}
                            max={100}
                            value={query.minScore ?? ''}
                            onChange={(e) => update({ minScore: parseOptionalNumber(e.target.value) })}
                        />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                        <label htmlFor="sq-max">{t('statistics.query.max_score')}</label>
                        <input
                            id="sq-max"
                            type="number"
                            min={0}
                            max={100}
                            value={query.maxScore ?? ''}
                            onChange={(e) => update({ maxScore: parseOptionalNumber(e.target.value) })}
                        />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                        <label htmlFor="sq-cond">{t('statistics.query.condition')}</label>
                        <select
                            id="sq-cond"
                            value={query.condition?.op ?? ''}
                            onChange={(e) =>
                                update({
                                    condition: e.target.value
                                        ? {
                                              op: e.target.value as 'lt' | 'gt',
                                              value: query.condition?.value ?? DEFAULT_PASS_THRESHOLD,
                                          }
                                        : undefined,
                                })
                            }
                        >
                            <option value="">{t('statistics.query.condition_none')}</option>
                            <option value="lt">{t('statistics.query.condition_lt')}</option>
                            <option value="gt">{t('statistics.query.condition_gt')}</option>
                        </select>
                    </div>
                    {query.condition && (
                        <div className="form-group" style={{ marginBottom: 0 }}>
                            <label htmlFor="sq-cond-value">{t('statistics.query.condition_value')}</label>
                            <input
                                id="sq-cond-value"
                                type="number"
                                value={query.condition.value}
                                onChange={(e) =>
                                    update({
                                        condition: {
                                            op: query.condition!.op,
                                            value: parseOptionalNumber(e.target.value) ?? 0,
                                        },
                                    })
                                }
                            />
                        </div>
                    )}
                    <div className="form-group" style={{ marginBottom: 0 }}>
                        <label htmlFor="sq-min-count">{t('statistics.query.min_count')}</label>
                        <input
                            id="sq-min-count"
                            type="number"
                            min={0}
                            value={query.minCount ?? ''}
                            onChange={(e) => update({ minCount: parseOptionalNumber(e.target.value) })}
                        />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                        <label htmlFor="sq-sort">{t('statistics.query.sort')}</label>
                        <select
                            id="sq-sort"
                            value={query.sort}
                            onChange={(e) => update({ sort: e.target.value as StatsQuery['sort'] })}
                        >
                            <option value="value_desc">{t('statistics.query.sort_value_desc')}</option>
                            <option value="value_asc">{t('statistics.query.sort_value_asc')}</option>
                            <option value="label">{t('statistics.query.sort_label')}</option>
                        </select>
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                        <label htmlFor="sq-limit">{t('statistics.query.limit')}</label>
                        <input
                            id="sq-limit"
                            type="number"
                            min={0}
                            value={query.limit ?? ''}
                            onChange={(e) => update({ limit: parseOptionalNumber(e.target.value) })}
                        />
                    </div>
                </div>

                {classes.length > 1 && (
                    <div style={{ marginTop: 14 }}>
                        <ToggleChipGroup
                            label={t('statistics.query.classes')}
                            options={classes.map((c) => ({ value: c.id, label: c.name }))}
                            values={query.classIds}
                            onToggle={(id) =>
                                update({
                                    classIds: query.classIds.includes(id)
                                        ? query.classIds.filter((c) => c !== id)
                                        : [...query.classIds, id],
                                })
                            }
                            hint={t('statistics.query.classes_hint')}
                        />
                    </div>
                )}

                {assessmentOptions.length > 0 && (
                    <fieldset style={{ border: 'none', padding: 0, margin: '14px 0 0' }}>
                        <legend className="text-sm" style={{ fontWeight: 600, marginBottom: 6 }}>
                            {t('statistics.query.assessments')}
                        </legend>
                        <p className="text-muted text-xs" style={{ margin: '0 0 6px' }}>
                            {t('statistics.query.assessments_hint')}
                        </p>
                        <div
                            style={{
                                maxHeight: 160,
                                overflowY: 'auto',
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                                gap: 4,
                                border: '1px solid var(--border)',
                                borderRadius: 8,
                                padding: 8,
                            }}
                        >
                            {assessmentOptions.map((a) => (
                                <label
                                    key={a.key}
                                    style={{
                                        display: 'flex',
                                        gap: 6,
                                        fontSize: '0.85rem',
                                        textTransform: 'none',
                                        letterSpacing: 'normal',
                                        color: 'var(--text)',
                                        fontWeight: 400,
                                    }}
                                >
                                    <input
                                        type="checkbox"
                                        checked={query.assessmentKeys.includes(a.key)}
                                        onChange={() =>
                                            update({
                                                assessmentKeys: query.assessmentKeys.includes(a.key)
                                                    ? query.assessmentKeys.filter((k) => k !== a.key)
                                                    : [...query.assessmentKeys, a.key],
                                            })
                                        }
                                    />
                                    {a.kind === 'test' ? t('statistics.trend_test_label', { name: a.name }) : a.name}
                                </label>
                            ))}
                        </div>
                    </fieldset>
                )}

                <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <div className="form-group" style={{ marginBottom: 0, flex: '1 1 200px', maxWidth: 320 }}>
                        <label htmlFor="sq-save-name">{t('statistics.query.save_name')}</label>
                        <input
                            id="sq-save-name"
                            type="text"
                            value={saveName}
                            onChange={(e) => setSaveName(e.target.value)}
                            placeholder={t('statistics.query.save_placeholder')}
                        />
                    </div>
                    <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        disabled={!saveName.trim()}
                        onClick={handleSave}
                    >
                        <Save size={14} /> {t('statistics.query.save')}
                    </button>
                    <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => setQuery(DEFAULT_STATS_QUERY)}
                    >
                        {t('statistics.query.reset')}
                    </button>
                </div>
            </div>

            <div className="card" style={{ marginBottom: 20 }} aria-live="polite">
                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 12,
                        flexWrap: 'wrap',
                        marginBottom: 12,
                    }}
                >
                    <div>
                        <h3 style={{ margin: 0 }}>{t('statistics.query.results_title')}</h3>
                        <p className="text-muted text-sm" style={{ margin: '4px 0 0' }}>
                            {t('statistics.query.results_summary', {
                                records: result.matchedRecords,
                                groups: result.rows.length,
                            })}
                        </p>
                    </div>
                    {result.rows.length > 0 && (
                        <button type="button" className="btn btn-secondary btn-sm" onClick={handleDownload}>
                            <Download size={14} /> {t('statistics.download_csv')}
                        </button>
                    )}
                </div>

                {result.rows.length === 0 ? (
                    <EmptyState icon={Search} description={t('statistics.query.no_results')} />
                ) : (
                    <>
                        <ResponsiveContainer width="100%" height={Math.max(160, chartRows.length * 28 + 30)}>
                            <BarChart
                                data={chartRows}
                                layout="vertical"
                                margin={{ top: 0, right: 24, bottom: 0, left: 8 }}
                            >
                                <XAxis
                                    type="number"
                                    domain={query.metric === 'count' || hasNegative ? ['auto', 'auto'] : [0, 100]}
                                    tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                                />
                                <YAxis
                                    type="category"
                                    dataKey="name"
                                    width={140}
                                    tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                                />
                                <Tooltip
                                    /* v8 ignore next -- recharts tooltips never trigger in jsdom */
                                    formatter={(v: unknown) => [formatValue(Number(v)), metricLabel(query.metric)]}
                                    contentStyle={{
                                        background: 'var(--bg-card)',
                                        border: '1px solid var(--border)',
                                        borderRadius: 8,
                                    }}
                                />
                                {hasNegative && <ReferenceLine x={0} stroke="var(--border)" />}
                                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                                    {chartRows.map((r) => (
                                        <Cell key={r.name} fill={r.value < 0 ? 'var(--red)' : 'var(--accent)'} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                        {result.rows.length > CHART_ROW_LIMIT && (
                            <p className="text-muted text-xs">
                                {t('statistics.query.chart_truncated', { count: CHART_ROW_LIMIT })}
                            </p>
                        )}
                        <table className="data-table" style={{ marginTop: 12 }}>
                            <thead>
                                <tr>
                                    <th>{groupLabel(query.groupBy)}</th>
                                    <th>{metricLabel(query.metric)}</th>
                                    <th>{t('statistics.query.col_count')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {result.rows.map((row) => (
                                    <tr key={row.key}>
                                        <td style={{ fontWeight: 500 }}>{rowLabel(row)}</td>
                                        <td>{formatValue(row.value)}</td>
                                        <td className="text-muted">{row.count}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </>
                )}
            </div>
        </>
    );
}
