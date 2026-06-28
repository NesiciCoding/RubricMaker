import React from 'react';

interface Props {
    students: { id: string; name: string }[];
    criteria: { id: string; title: string }[];
    scores: Record<string, Record<string, number>>;
    /** Student id currently expanded inline. */
    expandedId?: string | null;
    /** Called when a student row's name is clicked, to toggle expansion. */
    onToggleExpand?: (studentId: string) => void;
    /** Renders the expanded detail row's content for a given student. */
    renderDetail?: (studentId: string) => React.ReactNode;
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

export default function CriterionHeatmap({
    students,
    criteria,
    scores,
    expandedId,
    onToggleExpand,
    renderDetail,
}: Props) {
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
                {criteria.map((c) => (
                    <div
                        key={c.id}
                        title={c.title}
                        style={{
                            fontSize: '0.68rem',
                            fontWeight: 600,
                            color: 'var(--text-muted)',
                            whiteSpace: 'nowrap',
                            height: 32,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            textAlign: 'center',
                        }}
                    >
                        {truncate(c.title)}
                    </div>
                ))}
                {/* Data rows */}
                {students.map((s) => {
                    const expanded = expandedId === s.id;
                    return (
                        <React.Fragment key={s.id}>
                            <div
                                role={onToggleExpand ? 'button' : undefined}
                                tabIndex={onToggleExpand ? 0 : undefined}
                                onClick={onToggleExpand ? () => onToggleExpand(s.id) : undefined}
                                style={{
                                    fontSize: '0.78rem',
                                    color: 'var(--text)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    paddingRight: 8,
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    cursor: onToggleExpand ? 'pointer' : undefined,
                                    fontWeight: expanded ? 700 : 400,
                                }}
                                title={s.name}
                            >
                                {s.name}
                            </div>
                            {criteria.map((c) => {
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
                            {expanded && renderDetail && (
                                <div
                                    style={{
                                        gridColumn: '1 / -1',
                                        padding: '8px 4px 12px',
                                        borderBottom: '1px solid var(--border)',
                                    }}
                                >
                                    {renderDetail(s.id)}
                                </div>
                            )}
                        </React.Fragment>
                    );
                })}
            </div>
        </div>
    );
}
