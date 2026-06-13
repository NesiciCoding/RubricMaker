import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, XCircle, Award, Languages, ShieldAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Topbar from '../components/Layout/Topbar';
import { useApp } from '../context/AppContext';
import { calcTestMaxPoints, calcStudentTestRawPoints, calcTestPercentage } from '../utils/testCalc';
import { calcLetterGrade, calcGradeColor } from '../utils/gradeCalc';
import type { TestAnswer, TestQuestion, ProctorEventType } from '../types';

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function isAutoScored(question: TestQuestion, answer: TestAnswer | undefined): boolean {
    if (!answer) return false;
    if (answer.pointsEarned !== undefined) return false;
    return question.type === 'multiple-choice' || (question.type === 'short-answer' && !!question.expectedAnswer);
}

function autoScore(question: TestQuestion, answer: TestAnswer | undefined): number {
    if (!answer) return 0;
    if (question.type === 'multiple-choice') {
        const selected = question.options?.find((o) => o.id === answer.response);
        return selected?.isCorrect ? question.points : 0;
    }
    if (question.type === 'short-answer' && question.expectedAnswer) {
        return answer.response.trim().toLowerCase() === question.expectedAnswer.trim().toLowerCase()
            ? question.points
            : 0;
    }
    return 0;
}

const PROCTOR_EVENT_TYPES: ProctorEventType[] = [
    'tab_switch',
    'copy',
    'paste',
    'cut',
    'battery',
    'heartbeat',
    'seb_status',
];

export default function TestResultsPage() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { testId, studentTestId } = useParams<{ testId: string; studentTestId: string }>();
    const { tests, studentTests, students, gradeScales, settings, saveStudentTest } = useApp();

    const test = tests.find((tst) => tst.id === testId);
    const studentTest = studentTests.find((st) => st.id === studentTestId);
    const student = students.find((s) => s.id === studentTest?.studentId);

    const [drafts, setDrafts] = useState<Record<string, { pointsEarned: string; feedback: string }>>({});

    const maxPoints = test ? calcTestMaxPoints(test) : 0;

    const answersById = new Map((studentTest?.answers ?? []).map((a) => [a.questionId, a]));
    const effectiveAnswers = (test?.questions ?? []).map((question) => ({
        question,
        answer: answersById.get(question.id),
    }));

    const rawPoints =
        test && studentTest ? (studentTest.rawTotalPoints ?? calcStudentTestRawPoints(test, studentTest.answers)) : 0;

    const adjustmentPoints = studentTest?.adjustmentPoints ?? 0;
    const totalPoints = clamp(rawPoints + adjustmentPoints, 0, maxPoints);
    const percentage = calcTestPercentage(totalPoints, maxPoints);

    const scaleId = test?.gradeScaleId ?? settings.defaultGradeScaleId;
    const scale = scaleId === 'none' ? null : (gradeScales.find((g) => g.id === scaleId) ?? gradeScales[0] ?? null);
    const gradeLabel = scale ? calcLetterGrade(percentage, scale) : null;
    const gradeColor = scale ? calcGradeColor(percentage, scale) : '#6b7280';

    const standardsMap = new Map<
        string,
        { guid: string; description: string; statementNotation?: string; earned: number; max: number }
    >();
    for (const { question, answer } of effectiveAnswers) {
        const earned = answer?.pointsEarned ?? autoScore(question, answer);
        for (const std of question.linkedStandards ?? []) {
            const entry = standardsMap.get(std.guid) ?? {
                guid: std.guid,
                description: std.description,
                statementNotation: std.statementNotation,
                earned: 0,
                max: 0,
            };
            entry.earned += earned;
            entry.max += question.points;
            standardsMap.set(std.guid, entry);
        }
    }
    const standardsRollup = Array.from(standardsMap.values());

    const cefrMap = new Map<
        string,
        { descriptorId: string; level: string; skill: string; description: string; earned: number; max: number }
    >();
    for (const { question, answer } of effectiveAnswers) {
        const earned = answer?.pointsEarned ?? autoScore(question, answer);
        for (const desc of question.linkedCefrDescriptors ?? []) {
            const key = `${desc.descriptorId}-${desc.skill}`;
            const entry = cefrMap.get(key) ?? {
                descriptorId: desc.descriptorId,
                level: desc.level,
                skill: desc.skill,
                description: desc.descriptionEn,
                earned: 0,
                max: 0,
            };
            entry.earned += earned;
            entry.max += question.points;
            cefrMap.set(key, entry);
        }
    }
    const cefrRollup = Array.from(cefrMap.values());

    const eventCounts = new Map<ProctorEventType, number>();
    for (const ev of studentTest?.events ?? []) {
        eventCounts.set(ev.type, (eventCounts.get(ev.type) ?? 0) + 1);
    }

    function getDraft(questionId: string, answer: TestAnswer | undefined) {
        return (
            drafts[questionId] ?? {
                pointsEarned: answer?.pointsEarned !== undefined ? String(answer.pointsEarned) : '',
                feedback: answer?.feedback ?? '',
            }
        );
    }

    function updateDraft(
        questionId: string,
        answer: TestAnswer | undefined,
        patch: Partial<{ pointsEarned: string; feedback: string }>
    ) {
        setDrafts((prev) => ({ ...prev, [questionId]: { ...getDraft(questionId, answer), ...patch } }));
    }

    function handleSaveManualScore(question: TestQuestion) {
        if (!studentTest) return;
        const draft = getDraft(
            question.id,
            studentTest.answers.find((a) => a.questionId === question.id)
        );
        const pointsEarned = clamp(Number(draft.pointsEarned) || 0, 0, question.points);
        const existingAnswers = studentTest.answers;
        const idx = existingAnswers.findIndex((a) => a.questionId === question.id);
        const updatedAnswer: TestAnswer =
            idx >= 0
                ? { ...existingAnswers[idx], pointsEarned, feedback: draft.feedback }
                : { questionId: question.id, response: '', pointsEarned, feedback: draft.feedback };
        const nextAnswers =
            idx >= 0
                ? existingAnswers.map((a, i) => (i === idx ? updatedAnswer : a))
                : [...existingAnswers, updatedAnswer];
        const nextRaw = test ? calcStudentTestRawPoints(test, nextAnswers) : 0;
        saveStudentTest({
            ...studentTest,
            answers: nextAnswers,
            rawTotalPoints: nextRaw,
            status: studentTest.status === 'submitted' ? 'graded' : studentTest.status,
            gradedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        });
    }

    if (!test || !studentTest) {
        return (
            <>
                <Topbar title={t('tests.results.title')} />
                <div className="page-content fade-in">
                    <p className="text-muted">{t('tests.results.not_found')}</p>
                    <button className="btn btn-secondary btn-sm" onClick={() => navigate('/tests')}>
                        <ArrowLeft size={14} /> {t('tests.back_to_list')}
                    </button>
                </div>
            </>
        );
    }

    return (
        <>
            <Topbar
                title={t('tests.results.title')}
                actions={
                    <button className="btn btn-secondary btn-sm" onClick={() => navigate('/tests')}>
                        <ArrowLeft size={14} /> {t('tests.back_to_list')}
                    </button>
                }
            />
            <div className="page-content fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div className="card">
                    <h2 style={{ margin: '0 0 4px' }}>{test.name}</h2>
                    <p className="text-muted text-sm" style={{ margin: '0 0 14px' }}>
                        {t('tests.results.student_label')}: {student?.name ?? studentTest.studentId}
                    </p>
                    <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                        <div>
                            <div className="text-muted text-xs">{t('tests.results.total_points')}</div>
                            <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>
                                {totalPoints.toFixed(2)} / {maxPoints}
                            </div>
                            {adjustmentPoints !== 0 && (
                                <div className="text-muted text-xs">
                                    {t('tests.results.raw_points')}: {rawPoints.toFixed(2)} (
                                    {adjustmentPoints > 0 ? '+' : ''}
                                    {adjustmentPoints.toFixed(2)} {t('tests.results.adjustment_label')})
                                </div>
                            )}
                        </div>
                        <div>
                            <div className="text-muted text-xs">{t('tests.results.percentage')}</div>
                            <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{percentage.toFixed(1)}%</div>
                        </div>
                        {gradeLabel && (
                            <div>
                                <div className="text-muted text-xs">{t('tests.results.grade')}</div>
                                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: gradeColor }}>
                                    {gradeLabel}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="card">
                    <h3 style={{ margin: '0 0 12px' }}>
                        <ShieldAlert size={16} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                        {t('tests.results.integrity_title')}
                    </h3>
                    {(studentTest.events ?? []).length === 0 ? (
                        <p className="text-muted text-sm" style={{ margin: 0 }}>
                            {t('tests.results.integrity_no_events')}
                        </p>
                    ) : (
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            {PROCTOR_EVENT_TYPES.filter((evType) => (eventCounts.get(evType) ?? 0) > 0).map(
                                (evType) => (
                                    <span key={evType} className="badge badge-yellow">
                                        {t(`tests.results.event_type_${evType}`)}: {eventCounts.get(evType)}
                                    </span>
                                )
                            )}
                        </div>
                    )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {effectiveAnswers.map(({ question, answer }, index) => {
                        const autoScored = isAutoScored(question, answer);
                        const earned = answer?.pointsEarned ?? autoScore(question, answer);
                        const isCorrect = autoScored && earned === question.points;
                        const draft = getDraft(question.id, answer);
                        const allowManual =
                            question.type === 'open' ||
                            question.type === 'short-answer' ||
                            question.type === 'multiple-choice';

                        return (
                            <div className="card" key={question.id}>
                                <div
                                    style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        gap: 12,
                                        marginBottom: 8,
                                    }}
                                >
                                    <div style={{ flex: 1 }}>
                                        <div className="text-muted text-xs">
                                            {t('tests.question_number', { number: index + 1 })} ·{' '}
                                            {t(`tests.question_type_${question.type.replace('-', '_')}`)} ·{' '}
                                            {t('tests.total_points', { points: question.points })}
                                        </div>
                                        <div style={{ fontWeight: 600, marginTop: 4 }}>{question.prompt}</div>
                                    </div>
                                    {autoScored &&
                                        (isCorrect ? (
                                            <CheckCircle2 size={20} style={{ color: 'var(--green)', flexShrink: 0 }} />
                                        ) : (
                                            <XCircle size={20} style={{ color: 'var(--red)', flexShrink: 0 }} />
                                        ))}
                                </div>

                                <div style={{ marginBottom: 8 }}>
                                    <div className="text-muted text-xs">{t('tests.results.student_response')}</div>
                                    <div
                                        style={{
                                            background: 'var(--bg-elevated)',
                                            borderRadius: 6,
                                            padding: '8px 10px',
                                            fontSize: '0.9rem',
                                            whiteSpace: 'pre-wrap',
                                        }}
                                    >
                                        {question.type === 'multiple-choice'
                                            ? (question.options?.find((o) => o.id === answer?.response)?.text ??
                                              t('tests.results.no_response'))
                                            : answer?.response || t('tests.results.no_response')}
                                    </div>
                                </div>

                                {autoScored && (
                                    <div className="text-sm" style={{ marginBottom: 8 }}>
                                        {t('tests.results.auto_scored', { earned, points: question.points })}
                                    </div>
                                )}

                                {allowManual && (
                                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                                        <div className="form-group" style={{ marginBottom: 0 }}>
                                            <label htmlFor={`points-${question.id}`}>
                                                {t('tests.results.manual_points_label')}
                                            </label>
                                            <input
                                                id={`points-${question.id}`}
                                                type="number"
                                                min={0}
                                                max={question.points}
                                                value={draft.pointsEarned}
                                                onChange={(e) =>
                                                    updateDraft(question.id, answer, { pointsEarned: e.target.value })
                                                }
                                                style={{ width: 90 }}
                                            />
                                        </div>
                                        <div className="form-group" style={{ marginBottom: 0, flex: '1 1 240px' }}>
                                            <label htmlFor={`feedback-${question.id}`}>
                                                {t('tests.results.feedback_label')}
                                            </label>
                                            <textarea
                                                id={`feedback-${question.id}`}
                                                rows={2}
                                                value={draft.feedback}
                                                onChange={(e) =>
                                                    updateDraft(question.id, answer, { feedback: e.target.value })
                                                }
                                                placeholder={t('tests.results.feedback_placeholder')}
                                            />
                                        </div>
                                        <button
                                            className="btn btn-primary btn-sm"
                                            onClick={() => handleSaveManualScore(question)}
                                        >
                                            {t('tests.results.save_score')}
                                        </button>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {standardsRollup.length > 0 && (
                    <div className="card">
                        <h3 style={{ margin: '0 0 12px' }}>
                            <Award size={16} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                            {t('tests.results.standards_rollup_title')}
                        </h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {standardsRollup.map((row) => (
                                <div
                                    key={row.guid}
                                    style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        gap: 12,
                                        fontSize: '0.85rem',
                                    }}
                                >
                                    <span>{row.statementNotation ?? row.description}</span>
                                    <span style={{ fontWeight: 700 }}>
                                        {row.earned.toFixed(2)} / {row.max} (
                                        {calcTestPercentage(row.earned, row.max).toFixed(0)}%)
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {cefrRollup.length > 0 && (
                    <div className="card">
                        <h3 style={{ margin: '0 0 12px' }}>
                            <Languages size={16} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                            {t('tests.results.cefr_rollup_title')}
                        </h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {cefrRollup.map((row) => (
                                <div
                                    key={`${row.descriptorId}-${row.skill}`}
                                    style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        gap: 12,
                                        fontSize: '0.85rem',
                                    }}
                                >
                                    <span>
                                        <span className="badge badge-blue" style={{ marginRight: 6 }}>
                                            {row.level}
                                        </span>
                                        {row.description}
                                    </span>
                                    <span style={{ fontWeight: 700 }}>
                                        {row.earned.toFixed(2)} / {row.max} (
                                        {calcTestPercentage(row.earned, row.max).toFixed(0)}%)
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </>
    );
}
