import React from 'react';
import { useTranslation } from 'react-i18next';

interface PyramidLevel {
    id: string;
    order: number;
    labelEn: string;
    labelNl: string;
    color: string;
    value: number | null;
}

interface Props {
    levels: PyramidLevel[];
    lang: 'en' | 'nl';
}

export default function BloomsPyramidChart({ levels, lang }: Props) {
    const { t } = useTranslation();
    const sorted = [...levels].sort((a, b) => b.order - a.order);
    const maxOrder = Math.max(...levels.map((l) => l.order));

    return (
        <figure aria-label={t('statistics.blooms_chart_summary')} style={{ margin: 0 }}>
            <ul className="sr-only">
                {sorted.map((level) => {
                    const label = lang === 'nl' ? level.labelNl : level.labelEn;
                    const hasData = level.value !== null && !isNaN(level.value);
                    return (
                        <li key={level.id}>
                            {label}: {hasData ? `${Math.round(level.value!)}%` : t('statistics.no_data')}
                        </li>
                    );
                })}
            </ul>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 0' }}>
                {sorted.map((level) => {
                    const widthPct = 100 - (level.order - 1) * (60 / maxOrder);
                    const label = lang === 'nl' ? level.labelNl : level.labelEn;
                    const hasData = level.value !== null && !isNaN(level.value);
                    const fillPct = hasData ? Math.max(0, Math.min(100, level.value!)) : 0;

                    return (
                        <div
                            key={level.id}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 10,
                                margin: '0 auto',
                                width: '100%',
                            }}
                        >
                            <div
                                style={{
                                    width: 88,
                                    fontSize: 12,
                                    color: 'var(--text-muted)',
                                    textAlign: 'right',
                                    flexShrink: 0,
                                }}
                            >
                                {label}
                            </div>
                            <div
                                style={{
                                    flex: 1,
                                    display: 'flex',
                                    justifyContent: 'center',
                                }}
                            >
                                <div
                                    style={{
                                        width: `${widthPct}%`,
                                        height: 28,
                                        borderRadius: 4,
                                        background: `color-mix(in srgb, ${level.color} 18%, transparent)`,
                                        border: `1px solid color-mix(in srgb, ${level.color} 40%, transparent)`,
                                        overflow: 'hidden',
                                        position: 'relative',
                                    }}
                                >
                                    <div
                                        style={{
                                            width: `${fillPct}%`,
                                            height: '100%',
                                            background: level.color,
                                            opacity: 0.75,
                                            transition: 'width 0.4s ease',
                                        }}
                                    />
                                    <span
                                        style={{
                                            position: 'absolute',
                                            inset: 0,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            fontSize: 11,
                                            fontWeight: 600,
                                            color: hasData ? '#fff' : 'var(--text-muted)',
                                            mixBlendMode: 'difference',
                                            pointerEvents: 'none',
                                        }}
                                    >
                                        {hasData ? `${Math.round(level.value!)}%` : '—'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </figure>
    );
}
