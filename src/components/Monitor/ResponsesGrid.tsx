import React, { useState } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { scoreShortAnswerExact, scoreNumeric, autoScoreResponse } from '../../utils/testCalc';
import { parseClozeGaps, parseHotTextFragments } from '../../utils/clozeParse';
import type { Test, TestAnswer, TestQuestion } from '../../types';

export interface ResponsesGridStudentRow {
    studentId: string;
    displayName: string;
    /** Persisted answers (submitted/graded) merged with any live in-progress snapshot answers. */
    answers: TestAnswer[];
}

export interface ResponsesGridProps {
    test: Test;
    rows: ResponsesGridStudentRow[];
}

type CellState = 'correct' | 'incorrect' | 'ungraded' | 'empty';

function cellState(question: TestQuestion, answer: TestAnswer | undefined): CellState {
    if (!answer || answer.response.trim() === '') return 'empty';
    if (answer.pointsEarned !== undefined) {
        return answer.pointsEarned >= question.points ? 'correct' : 'incorrect';
    }
    if (question.type === 'multiple-choice') {
        const selected = question.options?.find((o) => o.id === answer.response);
        return selected?.isCorrect ? 'correct' : 'incorrect';
    }
    if (question.type === 'multiple-response') {
        let selected: string[] = [];
        try {
            selected = JSON.parse(answer.response) as string[];
        } catch {
            /* ignore malformed response */
        }
        if (selected.length === 0) return 'empty';
        return autoScoreResponse(question, answer.response) >= question.points ? 'correct' : 'incorrect';
    }
    if (question.type === 'true-false') {
        return autoScoreResponse(question, answer.response) >= question.points ? 'correct' : 'incorrect';
    }
    if (question.type === 'short-answer') {
        const score = scoreShortAnswerExact(question, answer.response);
        if (score === null) return 'ungraded';
        return score > 0 ? 'correct' : 'incorrect';
    }
    if (question.type === 'numeric') {
        const score = scoreNumeric(question, answer.response);
        if (score === null) return 'ungraded';
        return score > 0 ? 'correct' : 'incorrect';
    }
    if (question.type === 'cloze' || question.type === 'cloze-dropdown') {
        let answers: Record<string, string> = {};
        try {
            answers = JSON.parse(answer.response) as Record<string, string>;
        } catch {
            /* ignore malformed response */
        }
        if (!Object.values(answers).some((v) => v.trim() !== '')) return 'empty';
        return autoScoreResponse(question, answer.response) >= question.points ? 'correct' : 'incorrect';
    }
    if (question.type === 'matching' || question.type === 'categorize') {
        let answers: Record<string, string> = {};
        try {
            answers = JSON.parse(answer.response) as Record<string, string>;
        } catch {
            /* ignore malformed response */
        }
        if (Object.keys(answers).length === 0) return 'empty';
        return autoScoreResponse(question, answer.response) >= question.points ? 'correct' : 'incorrect';
    }
    if (question.type === 'ordering') {
        let order: string[] = [];
        try {
            order = JSON.parse(answer.response) as string[];
        } catch {
            /* ignore malformed response */
        }
        if (order.length === 0) return 'empty';
        return autoScoreResponse(question, answer.response) >= question.points ? 'correct' : 'incorrect';
    }
    if (question.type === 'hot-text') {
        let selected: number[] = [];
        try {
            selected = JSON.parse(answer.response) as number[];
        } catch {
            /* ignore malformed response */
        }
        if (selected.length === 0) return 'empty';
        return autoScoreResponse(question, answer.response) >= question.points ? 'correct' : 'incorrect';
    }
    return 'ungraded';
}

const CELL_COLORS: Record<CellState, string> = {
    correct: 'var(--green)',
    incorrect: 'var(--red)',
    ungraded: 'var(--yellow)',
    empty: 'var(--bg)',
};

function answerDisplayText(question: TestQuestion, answer: TestAnswer | undefined, t: (key: string) => string): string {
    if (!answer || answer.response.trim() === '') return '';
    if (question.type === 'multiple-choice') {
        return question.options?.find((o) => o.id === answer.response)?.text ?? answer.response;
    }
    if (question.type === 'multiple-response') {
        try {
            const selected = JSON.parse(answer.response) as string[];
            return selected
                .map((id) => question.options?.find((o) => o.id === id)?.text)
                .filter((text): text is string => !!text)
                .join(', ');
        } catch {
            return '';
        }
    }
    if (question.type === 'true-false') {
        return t(`tests.true_false_${answer.response}`);
    }
    if (question.type === 'cloze' || question.type === 'cloze-dropdown') {
        try {
            const answers = JSON.parse(answer.response) as Record<string, string>;
            const gaps = parseClozeGaps(question.prompt);
            return gaps
                .map((gap) => answers[gap.index] ?? '')
                .filter((v) => v.trim() !== '')
                .join(', ');
        } catch {
            return '';
        }
    }
    if (question.type === 'hot-text') {
        try {
            const selected = new Set(JSON.parse(answer.response) as number[]);
            const fragments = parseHotTextFragments(question.hotTextPassage ?? '').filter(
                (s) => s.type === 'fragment' && selected.has(s.index)
            );
            return fragments.map((f) => f.text).join(', ');
        } catch {
            return '';
        }
    }
    return answer.response;
}

export default function ResponsesGrid({ test, rows }: ResponsesGridProps) {
    const { t } = useTranslation();
    const [galleryQuestion, setGalleryQuestion] = useState<TestQuestion | null>(null);

    return (
        <>
            <div style={{ overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.85rem' }}>
                    <thead>
                        <tr>
                            <th
                                style={{
                                    textAlign: 'left',
                                    padding: '6px 10px',
                                    borderBottom: '1px solid var(--border)',
                                    color: 'var(--text-muted)',
                                    position: 'sticky',
                                    left: 0,
                                    background: 'var(--bg-elevated)',
                                }}
                            >
                                {t('tests.monitor.grid.student')}
                            </th>
                            {test.questions.map((q, i) => (
                                <th
                                    key={q.id}
                                    style={{
                                        padding: '6px 10px',
                                        borderBottom: '1px solid var(--border)',
                                        color: 'var(--accent)',
                                        whiteSpace: 'nowrap',
                                    }}
                                    title={q.prompt}
                                >
                                    <button
                                        type="button"
                                        className="btn btn-ghost btn-sm"
                                        onClick={() => setGalleryQuestion(q)}
                                        title={q.prompt}
                                        aria-label={q.prompt}
                                    >
                                        {t('tests.monitor.grid.question_short', { index: i + 1 })}
                                    </button>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row) => (
                            <tr key={row.studentId}>
                                <td
                                    style={{
                                        padding: '6px 10px',
                                        borderBottom: '1px solid var(--border)',
                                        whiteSpace: 'nowrap',
                                        position: 'sticky',
                                        left: 0,
                                        background: 'var(--bg-elevated)',
                                        color: 'var(--text)',
                                    }}
                                >
                                    {row.displayName}
                                </td>
                                {test.questions.map((q) => {
                                    const answer = row.answers.find((a) => a.questionId === q.id);
                                    const state = cellState(q, answer);
                                    return (
                                        <td
                                            key={q.id}
                                            style={{
                                                padding: '6px 10px',
                                                borderBottom: '1px solid var(--border)',
                                                textAlign: 'center',
                                            }}
                                        >
                                            <span
                                                aria-label={t(`tests.monitor.grid.state.${state}`)}
                                                title={t(`tests.monitor.grid.state.${state}`)}
                                                style={{
                                                    display: 'inline-block',
                                                    width: 16,
                                                    height: 16,
                                                    borderRadius: 4,
                                                    background: CELL_COLORS[state],
                                                    border: state === 'empty' ? '1px solid var(--border)' : 'none',
                                                }}
                                            />
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {galleryQuestion && (
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-label={t('tests.monitor.grid.gallery_title', {
                        index: test.questions.findIndex((q) => q.id === galleryQuestion.id) + 1,
                    })}
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(0,0,0,0.4)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 1000,
                    }}
                    onClick={() => setGalleryQuestion(null)}
                >
                    <div
                        style={{
                            background: 'var(--bg-elevated)',
                            borderRadius: 12,
                            padding: 20,
                            maxWidth: 560,
                            width: '90%',
                            maxHeight: '80vh',
                            overflowY: 'auto',
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'flex-start',
                                gap: 12,
                            }}
                        >
                            <div>
                                <div
                                    style={{
                                        fontSize: '0.75rem',
                                        fontWeight: 700,
                                        color: 'var(--accent)',
                                        textTransform: 'uppercase',
                                    }}
                                >
                                    {t('tests.monitor.grid.gallery_title', {
                                        index: test.questions.findIndex((q) => q.id === galleryQuestion.id) + 1,
                                    })}
                                </div>
                                <p style={{ margin: '6px 0 0', color: 'var(--text)' }}>{galleryQuestion.prompt}</p>
                            </div>
                            <button
                                className="btn btn-ghost btn-icon btn-sm"
                                onClick={() => setGalleryQuestion(null)}
                                aria-label={t('common.close')}
                            >
                                <X size={16} />
                            </button>
                        </div>
                        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {rows.map((row) => {
                                const answer = row.answers.find((a) => a.questionId === galleryQuestion.id);
                                const text = answerDisplayText(galleryQuestion, answer, t);
                                return (
                                    <div
                                        key={row.studentId}
                                        style={{ borderBottom: '1px solid var(--border)', paddingBottom: 8 }}
                                    >
                                        <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text)' }}>
                                            {row.displayName}
                                        </div>
                                        <div
                                            style={{
                                                fontSize: '0.85rem',
                                                color: text ? 'var(--text)' : 'var(--text-dim)',
                                            }}
                                        >
                                            {text || t('tests.monitor.grid.no_answer')}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
