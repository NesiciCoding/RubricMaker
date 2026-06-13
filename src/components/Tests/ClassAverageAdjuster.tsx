import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sliders, RotateCcw, Check } from 'lucide-react';
import {
    calcTestMaxPoints,
    calcStudentTestRawPoints,
    calcClassAveragePercentage,
    calcTestPercentage,
    suggestAdjustmentToTarget,
    applyAdjustment,
} from '../../utils/testCalc';
import type { Test, StudentTest, Student } from '../../types';

interface Props {
    test: Test;
    studentTests: StudentTest[];
    students: Student[];
    onSaveStudentTest: (st: StudentTest) => void;
}

export default function ClassAverageAdjuster({ test, studentTests, students, onSaveStudentTest }: Props) {
    const { t } = useTranslation();
    const maxPoints = calcTestMaxPoints(test);
    const currentAvg = calcClassAveragePercentage(studentTests, test);

    const [targetPct, setTargetPct] = useState<number>(Math.round(currentAvg));

    const suggested = useMemo(
        () => suggestAdjustmentToTarget(currentAvg, targetPct, maxPoints),
        [currentAvg, targetPct, maxPoints]
    );

    const [delta, setDelta] = useState<number>(() => Math.round(suggested * 100) / 100);

    function handleTargetChange(value: number) {
        setTargetPct(value);
        const next = suggestAdjustmentToTarget(currentAvg, value, maxPoints);
        setDelta(Math.round(next * 100) / 100);
    }

    const preview = useMemo(
        () =>
            studentTests.map((st) => {
                const student = students.find((s) => s.id === st.studentId);
                const raw = st.rawTotalPoints ?? calcStudentTestRawPoints(test, st.answers);
                const beforePct = calcTestPercentage(raw, maxPoints);
                const after = applyAdjustment({ ...st, rawTotalPoints: raw }, delta, maxPoints);
                const afterPoints = raw + (after.adjustmentPoints ?? 0);
                const afterPct = calcTestPercentage(afterPoints, maxPoints);
                return {
                    studentTest: st,
                    studentName: student?.name ?? st.studentId,
                    rawPoints: raw,
                    beforePct,
                    afterPoints,
                    afterPct,
                    adjustmentPoints: after.adjustmentPoints ?? 0,
                };
            }),
        [studentTests, students, test, maxPoints, delta]
    );

    const hasAdjustments = studentTests.some((st) => st.adjustment !== undefined);

    function handleApply() {
        const now = new Date().toISOString();
        for (const row of preview) {
            const raw = row.rawPoints;
            onSaveStudentTest({
                ...row.studentTest,
                rawTotalPoints: raw,
                adjustmentPoints: row.adjustmentPoints,
                adjustment: {
                    points: row.adjustmentPoints,
                    appliedAt: now,
                },
                updatedAt: now,
            });
        }
    }

    function handleRevert() {
        const now = new Date().toISOString();
        for (const st of studentTests) {
            if (st.adjustment === undefined && st.adjustmentPoints === undefined) continue;
            const { adjustment, adjustmentPoints, ...rest } = st;
            void adjustment;
            void adjustmentPoints;
            onSaveStudentTest({ ...rest, updatedAt: now });
        }
    }

    if (studentTests.length === 0) {
        return (
            <div className="card">
                <h3 style={{ margin: '0 0 8px' }}>
                    <Sliders size={16} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                    {t('tests.results.adjuster_title')}
                </h3>
                <p className="text-muted text-sm">{t('tests.results.adjuster_no_submissions')}</p>
            </div>
        );
    }

    return (
        <div className="card">
            <h3 style={{ margin: '0 0 8px' }}>
                <Sliders size={16} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                {t('tests.results.adjuster_title')}
            </h3>
            <p className="text-muted text-sm" style={{ marginBottom: 14 }}>
                {t('tests.results.adjuster_description')}
            </p>

            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
                <div>
                    <div className="text-muted text-xs">{t('tests.results.current_average')}</div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>{currentAvg.toFixed(1)}%</div>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                    <label htmlFor="adjuster-target-pct">{t('tests.results.target_average')}</label>
                    <input
                        id="adjuster-target-pct"
                        type="number"
                        min={0}
                        max={100}
                        value={targetPct}
                        onChange={(e) => handleTargetChange(Number(e.target.value) || 0)}
                        style={{ width: 100 }}
                    />
                </div>
                <div>
                    <div className="text-muted text-xs">{t('tests.results.suggested_adjustment')}</div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>
                        {suggested > 0 ? '+' : ''}
                        {suggested.toFixed(2)} {t('tests.results.points_unit')}
                    </div>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                    <label htmlFor="adjuster-delta">{t('tests.results.applied_adjustment')}</label>
                    <input
                        id="adjuster-delta"
                        type="number"
                        step={0.5}
                        value={delta}
                        onChange={(e) => setDelta(Number(e.target.value) || 0)}
                        style={{ width: 100 }}
                    />
                </div>
            </div>

            <div style={{ overflowX: 'auto', marginBottom: 14 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid var(--border)' }}>
                            <th style={{ textAlign: 'left', padding: '6px 8px' }}>
                                {t('tests.results.preview_student')}
                            </th>
                            <th style={{ textAlign: 'right', padding: '6px 8px' }}>
                                {t('tests.results.preview_before_points')}
                            </th>
                            <th style={{ textAlign: 'right', padding: '6px 8px' }}>
                                {t('tests.results.preview_before_pct')}
                            </th>
                            <th style={{ textAlign: 'right', padding: '6px 8px' }}>
                                {t('tests.results.preview_after_points')}
                            </th>
                            <th style={{ textAlign: 'right', padding: '6px 8px' }}>
                                {t('tests.results.preview_after_pct')}
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {preview.map((row) => (
                            <tr key={row.studentTest.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                <td style={{ padding: '6px 8px' }}>{row.studentName}</td>
                                <td style={{ textAlign: 'right', padding: '6px 8px' }}>{row.rawPoints.toFixed(2)}</td>
                                <td style={{ textAlign: 'right', padding: '6px 8px' }}>{row.beforePct.toFixed(1)}%</td>
                                <td style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 700 }}>
                                    {row.afterPoints.toFixed(2)}
                                </td>
                                <td style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 700 }}>
                                    {row.afterPct.toFixed(1)}%
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn btn-primary btn-sm" onClick={handleApply}>
                    <Check size={14} /> {t('tests.results.apply_adjustment')}
                </button>
                {hasAdjustments && (
                    <button className="btn btn-secondary btn-sm" onClick={handleRevert}>
                        <RotateCcw size={14} /> {t('tests.results.revert_adjustment')}
                    </button>
                )}
            </div>
            {hasAdjustments && (
                <p className="text-muted text-xs" style={{ marginTop: 10 }}>
                    {t('tests.results.adjustment_audited_note')}
                </p>
            )}
        </div>
    );
}
