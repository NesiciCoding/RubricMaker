import React from 'react';
import { useTranslation } from 'react-i18next';
import {
    RadarChart,
    Radar,
    PolarGrid,
    PolarAngleAxis,
    PolarRadiusAxis,
    Tooltip,
    Legend,
    ResponsiveContainer,
    type BaseTickContentProps,
} from 'recharts';

export interface CriterionRadarDataPoint {
    name: string;
    avg: number;
    [studentId: string]: number | string;
}

export interface SelectedStudent {
    id: string;
    name: string;
    color: string;
}

interface Props {
    data: CriterionRadarDataPoint[];
    accentColor: string;
    selectedStudents?: SelectedStudent[];
    classAverageLabel?: string;
    height?: number;
}

/** Long criterion names (e.g. "Coherence & Cohesion") get clipped against the polar
 * axis edge at narrow viewports (#705) — split them onto two lines near their midpoint
 * so neither line runs as far past the label's anchor point. */
function wrapAxisLabel(label: string, maxLineChars = 12): [string] | [string, string] {
    if (label.length <= maxLineChars) return [label];
    const words = label.split(' ');
    if (words.length < 2) return [label];
    let line1 = '';
    for (const word of words) {
        const next = line1 ? `${line1} ${word}` : word;
        if (line1 && next.length > maxLineChars) break;
        line1 = next;
    }
    const line2 = label.slice(line1.length).trim();
    return line2 ? [line1, line2] : [label];
}

function renderAngleAxisTick({ x, y, payload, textAnchor }: BaseTickContentProps) {
    const lines = wrapAxisLabel(String(payload.value));
    return (
        <text x={x} y={y} textAnchor={textAnchor} fill="var(--text-muted)" fontSize={11}>
            {lines.map((line, i) => (
                <tspan key={i} x={x} dy={i === 0 ? (lines.length > 1 ? -5 : 0) : 13}>
                    {line}
                </tspan>
            ))}
        </text>
    );
}

export default function CriterionRadarChart({
    data,
    accentColor,
    selectedStudents,
    classAverageLabel,
    height = 420,
}: Props) {
    const { t, i18n } = useTranslation();
    const averageLabel = classAverageLabel ?? t('statistics.class_average_label');
    // nl/fr/de use a comma decimal separator — a raw `${value}%` always rendered a dot (#705).
    const percentFormat = new Intl.NumberFormat(i18n.language, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    if (data.length < 3) {
        return (
            <p className="text-muted text-sm" style={{ textAlign: 'center', padding: '40px 0' }}>
                {t('statistics.radar_min_criteria')}
            </p>
        );
    }

    const hasStudents = selectedStudents && selectedStudents.length > 0;

    return (
        <div>
            <div role="img" aria-label={t('statistics.criterion_radar_aria_label')}>
                <ResponsiveContainer width="100%" height={height}>
                    <RadarChart data={data} margin={{ top: 20, right: 40, bottom: 20, left: 40 }}>
                        <PolarGrid strokeOpacity={0.3} />
                        <PolarAngleAxis dataKey="name" tick={renderAngleAxisTick} />
                        <PolarRadiusAxis
                            domain={[0, 100]}
                            tick={{ fill: 'var(--text-dim)', fontSize: 10 }}
                            tickCount={5}
                            tickFormatter={(v: number) => `${v}%`}
                        />
                        <Tooltip
                            contentStyle={{
                                background: 'var(--bg-card)',
                                border: '1px solid var(--border)',
                                borderRadius: 8,
                            }}
                            formatter={(value: unknown) =>
                                value != null ? `${percentFormat.format(Number(value))}%` : ''
                            }
                        />
                        <Radar
                            name={averageLabel}
                            dataKey="avg"
                            stroke={accentColor}
                            fill={accentColor}
                            fillOpacity={0.25}
                        />
                        {hasStudents &&
                            selectedStudents!.map((s) => (
                                <Radar
                                    key={s.id}
                                    name={s.name}
                                    dataKey={s.id}
                                    stroke={s.color}
                                    fill={s.color}
                                    fillOpacity={0.18}
                                />
                            ))}
                        {hasStudents && <Legend />}
                    </RadarChart>
                </ResponsiveContainer>
            </div>
            <table className="sr-only">
                <caption>{t('statistics.criterion_radar_aria_label')}</caption>
                <thead>
                    <tr>
                        <th scope="col">{t('statistics.label_criterion_chart')}</th>
                        <th scope="col">{averageLabel}</th>
                        {hasStudents &&
                            selectedStudents!.map((s) => (
                                <th key={s.id} scope="col">
                                    {s.name}
                                </th>
                            ))}
                    </tr>
                </thead>
                <tbody>
                    {data.map((row) => (
                        <tr key={row.name}>
                            <td>{row.name}</td>
                            <td>{percentFormat.format(row.avg)}%</td>
                            {hasStudents &&
                                selectedStudents!.map((s) => (
                                    <td key={s.id}>
                                        {row[s.id] != null ? `${percentFormat.format(Number(row[s.id]))}%` : '—'}
                                    </td>
                                ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
