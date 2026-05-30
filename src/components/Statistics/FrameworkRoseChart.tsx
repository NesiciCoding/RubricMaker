import React, { useState, useMemo } from 'react';

interface Sector {
    id: string;
    label: string;
    value: number;
    color: string;
    count: number;
}

interface Props {
    sectors: Sector[];
    height?: number;
}

export default function FrameworkRoseChart({ sectors, height = 360 }: Props) {
    const [hovered, setHovered] = useState<string | null>(null);

    const cx = 160;
    const cy = 160;
    const maxRadius = 130;
    const innerRadius = 6;
    const labelOffset = 14;
    const n = sectors.length;

    const sectorPaths = useMemo(() => {
        return sectors.map((sector, i) => {
            const startAngle = (i / n) * 2 * Math.PI - Math.PI / 2;
            const endAngle = ((i + 1) / n) * 2 * Math.PI - Math.PI / 2;
            const midAngle = (startAngle + endAngle) / 2;

            const hasData = sector.count > 0 && !isNaN(sector.value);
            const r = hasData ? Math.max(innerRadius + 2, (sector.value / 100) * maxRadius) : innerRadius + 2;

            const x1 = cx + innerRadius * Math.cos(startAngle);
            const y1 = cy + innerRadius * Math.sin(startAngle);
            const x2 = cx + r * Math.cos(startAngle);
            const y2 = cy + r * Math.sin(startAngle);
            const x3 = cx + r * Math.cos(endAngle);
            const y3 = cy + r * Math.sin(endAngle);
            const x4 = cx + innerRadius * Math.cos(endAngle);
            const y4 = cy + innerRadius * Math.sin(endAngle);

            const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
            const path = [
                `M ${x1} ${y1}`,
                `L ${x2} ${y2}`,
                `A ${r} ${r} 0 ${largeArc} 1 ${x3} ${y3}`,
                `L ${x4} ${y4}`,
                `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${x1} ${y1}`,
                'Z',
            ].join(' ');

            const labelR = r + labelOffset;
            const lx = cx + labelR * Math.cos(midAngle);
            const ly = cy + labelR * Math.sin(midAngle);
            const textAnchor: 'end' | 'start' | 'middle' = lx < cx - 5 ? 'end' : lx > cx + 5 ? 'start' : 'middle';

            return { sector, path, lx, ly, textAnchor, r, hasData, midAngle };
        });
    }, [sectors, n, cx, cy, maxRadius, innerRadius, labelOffset]);

    const hoveredSector = hovered ? sectors.find((s) => s.id === hovered) : null;

    return (
        <div style={{ position: 'relative', display: 'inline-block' }}>
            <svg
                width={320}
                height={height}
                viewBox={`0 0 320 ${height}`}
                style={{ display: 'block', margin: '0 auto' }}
            >
                {/* Reference rings */}
                {[0.33, 0.66, 1].map((pct) => (
                    <circle
                        key={pct}
                        cx={cx}
                        cy={cy}
                        r={pct * maxRadius}
                        fill="none"
                        stroke="var(--border)"
                        strokeWidth={1}
                        strokeDasharray={pct < 1 ? '4 4' : undefined}
                        opacity={0.5}
                    />
                ))}
                {/* Ring labels */}
                {[33, 66, 100].map((pct) => (
                    <text
                        key={pct}
                        x={cx + 3}
                        y={cy - (pct / 100) * maxRadius + 4}
                        fontSize={9}
                        fill="var(--text-muted)"
                        opacity={0.7}
                    >
                        {pct}%
                    </text>
                ))}

                {/* Sector paths */}
                {sectorPaths.map(({ sector, path, hasData }) => (
                    <path
                        key={sector.id}
                        d={path}
                        fill={sector.color}
                        fillOpacity={hovered === sector.id ? 0.9 : hasData ? 0.65 : 0.15}
                        stroke={sector.color}
                        strokeWidth={hovered === sector.id ? 1.5 : 0.5}
                        strokeOpacity={0.8}
                        style={{ cursor: 'default', transition: 'fill-opacity 0.15s' }}
                        onMouseEnter={() => setHovered(sector.id)}
                        onMouseLeave={() => setHovered(null)}
                    />
                ))}

                {/* Labels */}
                {sectorPaths.map(({ sector, lx, ly, textAnchor }) => (
                    <text
                        key={sector.id + '-label'}
                        x={lx}
                        y={ly}
                        fontSize={10}
                        textAnchor={textAnchor}
                        fill="var(--text)"
                        dominantBaseline="middle"
                        style={{ pointerEvents: 'none', userSelect: 'none' }}
                    >
                        {sector.label}
                    </text>
                ))}
            </svg>

            {/* Tooltip */}
            {hoveredSector && (
                <div
                    style={{
                        position: 'absolute',
                        bottom: 8,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        background: 'var(--bg-elevated)',
                        border: '1px solid var(--border)',
                        borderRadius: 6,
                        padding: '4px 10px',
                        fontSize: 12,
                        pointerEvents: 'none',
                        whiteSpace: 'nowrap',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
                    }}
                >
                    <strong style={{ color: hoveredSector.color }}>{hoveredSector.label}</strong>
                    {' — '}
                    {hoveredSector.count > 0 && !isNaN(hoveredSector.value)
                        ? `${Math.round(hoveredSector.value)}%`
                        : '—'}
                </div>
            )}
        </div>
    );
}
