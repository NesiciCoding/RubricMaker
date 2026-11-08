import { scoreShortAnswerExact, scoreNumeric, autoScoreResponse } from './testCalc';
import { parseErrorPicks, parsePlacedWords } from './answerResponseParsers';
import type { Test, TestAnswer, TestQuestion } from '../types';

export type CellState = 'correct' | 'incorrect' | 'ungraded' | 'empty';

export function cellState(question: TestQuestion, answer: TestAnswer | undefined): CellState {
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
    if (question.type === 'key-word-transformation' || question.type === 'dictation') {
        if (!answer.response.trim()) return 'empty';
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
    if (question.type === 'cloze' || question.type === 'cloze-dropdown' || question.type === 'cloze-bank') {
        let answers: Record<string, string> = {};
        try {
            answers = JSON.parse(answer.response) as Record<string, string>;
        } catch {
            /* ignore malformed response */
        }
        if (!Object.values(answers).some((v) => v.trim() !== '')) return 'empty';
        return autoScoreResponse(question, answer.response) >= question.points ? 'correct' : 'incorrect';
    }
    if (question.type === 'matching' || question.type === 'categorize' || question.type === 'matrix') {
        let answers: Record<string, string> = {};
        try {
            answers = JSON.parse(answer.response) as Record<string, string>;
        } catch {
            /* ignore malformed response */
        }
        if (Object.keys(answers).length === 0) return 'empty';
        return autoScoreResponse(question, answer.response) >= question.points ? 'correct' : 'incorrect';
    }
    if (question.type === 'error-correction') {
        if (Object.keys(parseErrorPicks(answer.response)).length === 0) return 'empty';
        return autoScoreResponse(question, answer.response) >= question.points ? 'correct' : 'incorrect';
    }
    if (question.type === 'sentence-builder') {
        if (parsePlacedWords(answer.response).length === 0) return 'empty';
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

/** Grading sets pointsEarned even on an untouched structured answer ("{}", "[]"), so judge emptiness without it. */
export function isAnswered(question: TestQuestion, answer: TestAnswer | undefined): boolean {
    return !!answer && cellState(question, { ...answer, pointsEarned: undefined }) !== 'empty';
}

/** Earned/max contribution of one cell. Ungraded and not-presented cells contribute nothing (excluded from averages). */
export function cellPoints(
    question: TestQuestion,
    answer: TestAnswer | undefined
): { earned: number; max: number } | null {
    const state = cellState(question, answer);
    if (state === 'ungraded') return null;
    if (state === 'empty') return { earned: 0, max: question.points };
    const earned = answer?.pointsEarned ?? autoScoreResponse(question, answer!.response);
    return { earned, max: question.points };
}

/** A question counts for a student only if it was presented — always for a standard test, gated by the routed section path on an mst placement test. */
export function isPresented(question: TestQuestion, sectionPath: string[] | undefined): boolean {
    return !sectionPath || !question.sectionId || sectionPath.includes(question.sectionId);
}

export interface StudentCompletion {
    answered: number;
    total: number;
    /** Share of scorable points earned on the questions answered so far; undefined while none of them is scorable. */
    correctPct?: number;
}

export function studentCompletion(
    test: Pick<Test, 'questions'>,
    answers: TestAnswer[],
    sectionPath?: string[]
): StudentCompletion {
    let answered = 0;
    let total = 0;
    let earned = 0;
    let max = 0;
    for (const q of test.questions) {
        if (!isPresented(q, sectionPath)) continue;
        total++;
        const answer = answers.find((a) => a.questionId === q.id);
        if (!isAnswered(q, answer)) continue;
        answered++;
        const cp = cellPoints(q, answer);
        if (!cp) continue;
        earned += cp.earned;
        max += cp.max;
    }
    return { answered, total, correctPct: max > 0 ? (earned / max) * 100 : undefined };
}
