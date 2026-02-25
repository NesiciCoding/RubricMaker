import React, { useState, useMemo } from 'react';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceArea
} from 'recharts';
import type { LearningGoalAggregate } from '../../utils/learningGoalsAggregator';

interface Props {
    goals: LearningGoalAggregate[];
    className?: string; // Optional className from caller
}

export default function LearningGoalChart({ goals, className }: Props) {
    const [selectedGoalId, setSelectedGoalId] = useState<string>(goals[0]?.guid || '');
    const [displayMode, setDisplayMode] = useState<'percentage' | 'cumulative'>('percentage');

    // Update selection if the goals change and selected isn't there
    React.useEffect(() => {
        if (goals.length > 0 && (!selectedGoalId || !goals.find(g => g.guid === selectedGoalId))) {
            setSelectedGoalId(goals[0].guid);
        }
    }, [goals, selectedGoalId]);

    const activeGoal = useMemo(() => goals.find(g => g.guid === selectedGoalId), [goals, selectedGoalId]);

    const chartData = useMemo(() => {
        if (!activeGoal) return [];
        return activeGoal.history.map((h, i) => {
            const dateStr = new Date(h.gradedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
            return {
                name: dateStr,
                rubricName: h.rubricName,
                percentage: Number(h.percentage.toFixed(1)),
                earned: h.earnedPoints,
                max: h.maxPoints,
            };
        });
    }, [activeGoal]);

    if (!goals || goals.length === 0) {
        return (
            <div className={`card ${className || ''}`} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 300 }}>
                <p className="text-secondary">No recorded learning goals.</p>
            </div>
        );
    }

    return (
        <div className={`card ${className || ''}`} style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16, marginBottom: 20 }}>
                <h3 style={{ margin: 0 }}>Learning Goals Progress</h3>

                <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                    <select
                        className="form-input"
                        value={selectedGoalId}
                        onChange={(e) => setSelectedGoalId(e.target.value)}
                        style={{ minWidth: 200, maxWidth: 350 }}
                    >
                        {goals.map(g => (
                            <option key={g.guid} value={g.guid}>
                                {g.title} ({g.totalEarned}/{g.totalMax} pts)
                            </option>
                        ))}
                    </select>

                    <div className="toggle-group">
                        <button
                            className={`btn ${displayMode === 'percentage' ? 'btn-primary' : 'btn-ghost'}`}
                            style={{ padding: '6px 12px', fontSize: '0.9em' }}
                            onClick={() => setDisplayMode('percentage')}
                        >
                            %
                        </button>
                        <button
                            className={`btn ${displayMode === 'cumulative' ? 'btn-primary' : 'btn-ghost'}`}
                            style={{ padding: '6px 12px', fontSize: '0.9em' }}
                            onClick={() => setDisplayMode('cumulative')}
                        >
                            Pts
                        </button>
                    </div>
                </div>
            </div>

            {activeGoal && (
                <div style={{ marginBottom: 16 }}>
                    <p style={{ margin: 0, fontSize: '0.9em' }} className="text-secondary">{activeGoal.description}</p>
                    <p style={{ margin: '4px 0 0 0', fontWeight: 600, color: 'var(--accent)' }}>
                        Average: {activeGoal.averagePercentage.toFixed(1)}% ({activeGoal.totalEarned} / {activeGoal.totalMax} Points)
                    </p>
                </div>
            )}

            <div style={{ width: '100%', height: 350 }}>
                <ResponsiveContainer>
                    <LineChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.4} vertical={false} />
                        <XAxis dataKey="name" tick={{ fill: 'var(--text-secondary)' }} strokeOpacity={0.2} tickMargin={10} />

                        <YAxis
                            yAxisId="left"
                            domain={displayMode === 'percentage' ? [0, 100] : [0, 'dataMax']}
                            tick={{ fill: 'var(--text-secondary)' }}
                            strokeOpacity={0.2}
                            tickFormatter={(val) => displayMode === 'percentage' ? `${val}%` : val}
                        />

                        <Tooltip
                            contentStyle={{
                                backgroundColor: 'var(--surface)',
                                borderColor: 'var(--border)',
                                color: 'var(--text-main)',
                                borderRadius: 8,
                                boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                            }}
                            formatter={(value: number, name: string) => {
                                if (name === 'Percentage') return [`${value}%`, name];
                                if (name === 'Points Earned') return [value, name];
                                if (name === 'Max Points') return [value, name];
                                return [value, name];
                            }}
                            labelFormatter={(label, payload) => {
                                if (payload && payload.length > 0) {
                                    return `${payload[0].payload.rubricName} (${label})`;
                                }
                                return label;
                            }}
                        />
                        <Legend wrapperStyle={{ paddingTop: 12 }} />

                        {displayMode === 'percentage' ? (
                            <Line
                                yAxisId="left"
                                type="monotone"
                                dataKey="percentage"
                                name="Percentage"
                                stroke="var(--accent)"
                                strokeWidth={3}
                                activeDot={{ r: 6 }}
                                animationDuration={400}
                            />
                        ) : (
                            <>
                                <Line
                                    yAxisId="left"
                                    type="stepAfter"
                                    dataKey="max"
                                    name="Max Points"
                                    stroke="#ec4899"
                                    strokeWidth={2}
                                    strokeDasharray="5 5"
                                    activeDot={false}
                                    animationDuration={400}
                                />
                                <Line
                                    yAxisId="left"
                                    type="monotone"
                                    dataKey="earned"
                                    name="Points Earned"
                                    stroke="var(--accent)"
                                    strokeWidth={3}
                                    activeDot={{ r: 6 }}
                                    animationDuration={400}
                                />
                            </>
                        )}
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
