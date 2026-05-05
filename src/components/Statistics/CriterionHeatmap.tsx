import React from 'react';

interface Props {
    students: { id: string; name: string }[];
    criteria: { id: string; title: string }[];
    scores: Record<string, Record<string, number>>;
}

/** Interpolates red→yellow→green based on 0–100 percentage. */
export function pctToColor(pct: number): string {
    const clamped = Math.max(0, Math.min(100, pct));
    if (clamped <= 50) {
        // red (#ef4444) → yellow (#eab308)
        const t = clamped / 50;
        const r = Math.round(239 + (234 - 239) * t);
        const g = Math.round(68 + (179 - 68) * t);
        const b = Math.round(68 + (8 - 68) * t);
        return `rgb(${r},${g},${b})`;
    } else {
        // yellow (#eab308) → green (#22c55e)
        const t = (clamped - 50) / 50;
        const r = Math.round(234 + (34 - 234) * t);
        const g = Math.round(179 + (197 - 179) * t);
        const b = Math.round(8 + (94 - 8) * t);
        return `rgb(${r},${g},${b})`;
    }
}

/** Returns 'white' for dark backgrounds, '#1e293b' for light ones. */
function textColor(pct: number): string {
    return pct < 30 || pct > 70 ? 'white' : '#1e293b';
}

function truncate(str: string, max = 13): string {
    return str.length > max ? str.slice(0, max) + '…' : str;
}

export default function CriterionHeatmap({ students, criteria, scores }: Props) {
    if (students.length === 0 || criteria.length === 0) {
        return (
            <p className="text-muted text-sm" style={{ textAlign: 'center', padding: '24px 0' }}>
                No data to display.
            </p>
        );
    }

    const colCount = criteria.length + 1; // +1 for student name column

    return (
        <div style={{ overflowX: 'auto' }}>
            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: `160px repeat(${criteria.length}, minmax(52px, 1fr))`,
                    gap: 2,
                    minWidth: colCount * 54,
                }}
            >
                {/* Header row */}
                <div /> {/* empty corner */}
                {criteria.map(c => (
                    <div
                        key={c.id}
                        title={c.title}
                        style={{
                            fontSize: '0.68rem',
                            fontWeight: 600,
                            color: 'var(--text-muted)',
                            transform: 'rotate(-40deg)',
                            transformOrigin: 'bottom left',
                            whiteSpace: 'nowrap',
                            height: 56,
                            display: 'flex',
                            alignItems: 'flex-end',
                            paddingBottom: 4,
                        }}
                    >
                        {truncate(c.title)}
                    </div>
                ))}

                {/* Data rows */}
                {students.map(s => (
                    <React.Fragment key={s.id}>
                        <div
                            style={{
                                fontSize: '0.78rem',
                                color: 'var(--text)',
                                display: 'flex',
                                alignItems: 'center',
                                paddingRight: 8,
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                            }}
                            title={s.name}
                        >
                            {s.name}
                        </div>
                        {criteria.map(c => {
                            const pct = scores[s.id]?.[c.id] ?? 0;
                            return (
                                <div
                                    key={c.id}
                                    title={`${s.name} — ${c.title}: ${pct}%`}
                                    style={{
                                        background: pctToColor(pct),
                                        color: textColor(pct),
                                        fontSize: '0.7rem',
                                        fontWeight: 600,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        borderRadius: 4,
                                        height: 28,
                                    }}
                                >
                                    {pct}%
                                </div>
                            );
                        })}
                    </React.Fragment>
                ))}
            </div>
        </div>
    );
}
