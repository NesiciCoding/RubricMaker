import React from 'react';
import {
    RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
    Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { useTranslation } from 'react-i18next';
import { CEFR_LEVELS, CEFR_SKILL_LABELS, CEFR_LEVEL_COLORS } from '../../data/cefrDescriptors';
import type { CefrLevel, CefrSkill } from '../../types';

export interface CefrEntry {
    level: CefrLevel;
    skill: CefrSkill;
    avgScore: number;
    achieved: boolean;
}

interface Props {
    entries: CefrEntry[];
}

export default function CefrProgressChart({ entries }: Props) {
    const { t, i18n } = useTranslation();
    const lang = i18n.language.startsWith('nl') ? 'nl' : 'en';

    if (entries.length < 3) {
        return (
            <p className="text-muted text-sm" style={{ textAlign: 'center', padding: '20px 0' }}>
                {t('cefr.no_chart_data')}
            </p>
        );
    }

    // Build unique skill list from entries
    const skills = Array.from(new Set(entries.map(e => e.skill)));

    // Build unique levels present in entries
    const levelsPresent = CEFR_LEVELS.filter(lvl => entries.some(e => e.level === lvl));

    // Each data point = one skill axis; each series = one CEFR level
    const data = skills.map(skill => {
        const point: Record<string, string | number> = {
            skill: CEFR_SKILL_LABELS[skill]?.[lang] ?? skill,
        };
        levelsPresent.forEach(lvl => {
            const entry = entries.find(e => e.skill === skill && e.level === lvl);
            point[lvl] = entry ? parseFloat(entry.avgScore.toFixed(1)) : 0;
        });
        return point;
    });

    return (
        <div>
            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}>
                {t('cefr.progress_chart_title')}
            </div>
            <ResponsiveContainer width="100%" height={300}>
                <RadarChart data={data} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
                    <PolarGrid strokeOpacity={0.3} />
                    <PolarAngleAxis
                        dataKey="skill"
                        tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                    />
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
                        formatter={(value: number) => `${value}%`}
                    />
                    {levelsPresent.map(lvl => {
                        const hasAchieved = entries.some(e => e.level === lvl && e.achieved);
                        return (
                            <Radar
                                key={lvl}
                                name={lvl}
                                dataKey={lvl}
                                stroke={CEFR_LEVEL_COLORS[lvl] ?? 'var(--accent)'}
                                fill={CEFR_LEVEL_COLORS[lvl] ?? 'var(--accent)'}
                                fillOpacity={hasAchieved ? 0.3 : 0.1}
                                strokeDasharray={hasAchieved ? undefined : '4 2'}
                            />
                        );
                    })}
                    {levelsPresent.length > 1 && <Legend />}
                </RadarChart>
            </ResponsiveContainer>
        </div>
    );
}
