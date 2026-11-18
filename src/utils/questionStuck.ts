import type { TestAnswer, TestQuestion } from '../types';
import { isAnswered } from './responseCells';

export interface StuckQuestion {
    questionId: string;
    /** 1-based position in the test's authored order. */
    index: number;
    /** Students who answered a later question but left this one blank. */
    reached: number;
    /** Students who answered at least one question at all. */
    asked: number;
}

export interface StuckOptions {
    minReached?: number;
    minShare?: number;
    minAsked?: number;
}

const DEFAULT_MIN_REACHED = 3;
const DEFAULT_MIN_SHARE = 0.2;
const DEFAULT_MIN_ASKED = 3;

/**
 * The questions the class walked past. A student who answered a later question but left this one
 * blank read it and moved on — the clearest live sign that a question is confusing, or that the
 * class is stuck on it. A per-student proctoring view cannot show that; the shape of the answer
 * set can, without storing anything new.
 */
export function stuckQuestions(
    questionIds: readonly string[],
    answersByStudent: ReadonlyMap<string, ReadonlySet<string>>,
    options: StuckOptions = {}
): StuckQuestion[] {
    const minReached = options.minReached ?? DEFAULT_MIN_REACHED;
    const minShare = options.minShare ?? DEFAULT_MIN_SHARE;
    const minAsked = options.minAsked ?? DEFAULT_MIN_ASKED;
    const position = new Map(questionIds.map((id, index) => [id, index] as const));
    const reachedCounts = new Map<string, number>();
    let asked = 0;

    for (const answered of answersByStudent.values()) {
        if (answered.size === 0) continue;
        asked += 1;
        let furthest = -1;
        for (const questionId of answered) {
            const index = position.get(questionId);
            if (index !== undefined && index > furthest) furthest = index;
        }
        // Everything before the furthest answered question, still blank, was reached and skipped.
        for (let index = 0; index < furthest; index += 1) {
            const questionId = questionIds[index];
            if (answered.has(questionId)) continue;
            reachedCounts.set(questionId, (reachedCounts.get(questionId) ?? 0) + 1);
        }
    }

    if (asked < minAsked) return [];
    return [...reachedCounts.entries()]
        .filter(([, count]) => count >= minReached && count / asked >= minShare)
        .map(([questionId, count]) => ({
            questionId,
            index: (position.get(questionId) ?? 0) + 1,
            reached: count,
            asked,
        }))
        .sort((a, b) => b.reached - a.reached || a.index - b.index);
}

/**
 * The question ids a student has really answered. A snapshot keeps the key of a question that was
 * cleared again, so a key alone is not an answer; the question-aware check decides what is blank.
 */
export function answeredQuestionIds(questions: readonly TestQuestion[], answers: readonly TestAnswer[]): Set<string> {
    const byId = new Map(questions.map((question) => [question.id, question]));
    const answered = new Set<string>();
    for (const answer of answers) {
        const question = byId.get(answer.questionId);
        if (question && isAnswered(question, answer)) answered.add(answer.questionId);
    }
    return answered;
}
