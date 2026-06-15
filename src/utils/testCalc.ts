import type { Test, TestQuestion, TestAnswer, StudentTest } from '../types';
import { parseClozeGaps, parseHotTextFragments } from './clozeParse';

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

export function calcTestMaxPoints(test: Test): number {
    return test.questions.reduce((sum, q) => sum + q.points, 0);
}

/**
 * Exact-match auto-score for a short-answer question: full points when the
 * trimmed, case-insensitive response equals expectedAnswer; 0 otherwise.
 * Returns null when the question has no expectedAnswer to match against.
 */
export function scoreShortAnswerExact(question: TestQuestion, response: string): number | null {
    if (question.type !== 'short-answer' || !question.expectedAnswer) return null;
    return response.trim().toLowerCase() === question.expectedAnswer.trim().toLowerCase() ? question.points : 0;
}

/** Auto-score for a multiple-response (checkbox) question, supporting partial credit. */
export function scoreMultipleResponse(question: TestQuestion, response: string): number {
    const options = question.options ?? [];
    let selected: string[];
    try {
        selected = response ? (JSON.parse(response) as string[]) : [];
    } catch {
        selected = [];
    }
    const selectedSet = new Set(selected);
    const correctSet = new Set(options.filter((o) => o.isCorrect).map((o) => o.id));

    if (question.partialCredit === false) {
        const exact = selectedSet.size === correctSet.size && [...selectedSet].every((id) => correctSet.has(id));
        return exact ? question.points : 0;
    }

    if (options.length === 0) return 0;
    const matches = options.filter((o) => selectedSet.has(o.id) === correctSet.has(o.id)).length;
    return question.points * (matches / options.length);
}

/**
 * Auto-score a cloze (fill-the-gap) or cloze-dropdown question. Each gap's
 * answer is matched independently — `cloze` accepts any pipe-separated
 * alternative (case-insensitive, trimmed); `cloze-dropdown` requires the
 * first alternative (the correct option). Supports partial credit.
 */
export function scoreCloze(question: TestQuestion, response: string): number {
    const gaps = parseClozeGaps(question.prompt);
    if (gaps.length === 0) return 0;

    let answers: Record<string, string> = {};
    try {
        answers = response ? (JSON.parse(response) as Record<string, string>) : {};
    } catch {
        answers = {};
    }

    const isDropdown = question.type === 'cloze-dropdown';
    const correctCount = gaps.filter((gap) => {
        const studentAnswer = (answers[gap.index] ?? '').trim();
        if (!studentAnswer) return false;
        if (isDropdown) return studentAnswer === gap.alternatives[0];
        return gap.alternatives.some((alt) => alt.toLowerCase() === studentAnswer.toLowerCase());
    }).length;

    if (question.partialCredit === false) {
        return correctCount === gaps.length ? question.points : 0;
    }
    return question.points * (correctCount / gaps.length);
}

/** Auto-score a matching question: each pair is correct when the student paired it with itself. Supports partial credit. */
export function scoreMatching(question: TestQuestion, response: string): number {
    const pairs = question.matchingPairs ?? [];
    if (pairs.length === 0) return 0;

    let answers: Record<string, string> = {};
    try {
        answers = response ? (JSON.parse(response) as Record<string, string>) : {};
    } catch {
        answers = {};
    }

    const correctCount = pairs.filter((pair) => answers[pair.id] === pair.id).length;

    if (question.partialCredit === false) {
        return correctCount === pairs.length ? question.points : 0;
    }
    return question.points * (correctCount / pairs.length);
}

/** Auto-score an ordering question: each position is correct when it matches orderItems' defined order. Supports partial credit. */
export function scoreOrdering(question: TestQuestion, response: string): number {
    const items = question.orderItems ?? [];
    if (items.length === 0) return 0;

    let order: string[] = [];
    try {
        order = response ? (JSON.parse(response) as string[]) : [];
    } catch {
        order = [];
    }

    const correctCount = items.filter((item, i) => order[i] === item.id).length;

    if (question.partialCredit === false) {
        return correctCount === items.length ? question.points : 0;
    }
    return question.points * (correctCount / items.length);
}

/** Auto-score a categorize question: each item is correct when assigned to its defined categoryId. Supports partial credit. */
export function scoreCategorize(question: TestQuestion, response: string): number {
    const items = question.categorizeItems ?? [];
    if (items.length === 0) return 0;

    let answers: Record<string, string> = {};
    try {
        answers = response ? (JSON.parse(response) as Record<string, string>) : {};
    } catch {
        answers = {};
    }

    const correctCount = items.filter((item) => answers[item.id] === item.categoryId).length;

    if (question.partialCredit === false) {
        return correctCount === items.length ? question.points : 0;
    }
    return question.points * (correctCount / items.length);
}

/** Auto-score a hot-text question: each fragment is correct when its selection state matches hotTextCorrectIndices. Supports partial credit. */
export function scoreHotText(question: TestQuestion, response: string): number {
    const fragments = parseHotTextFragments(question.hotTextPassage ?? '').filter((s) => s.type === 'fragment');
    if (fragments.length === 0) return 0;

    let selected: number[];
    try {
        selected = response ? (JSON.parse(response) as number[]) : [];
    } catch {
        selected = [];
    }

    const selectedSet = new Set(selected);
    const correctSet = new Set(question.hotTextCorrectIndices ?? []);

    if (question.partialCredit === false) {
        const exact = selectedSet.size === correctSet.size && [...selectedSet].every((i) => correctSet.has(i));
        return exact ? question.points : 0;
    }

    const matches = fragments.filter((f) => selectedSet.has(f.index) === correctSet.has(f.index)).length;
    return question.points * (matches / fragments.length);
}

/** Auto-score a raw response string against the question's correct-answer data, ignoring manual overrides. */
export function autoScoreResponse(question: TestQuestion, response: string): number {
    if (question.type === 'multiple-choice') {
        const selected = question.options?.find((o) => o.id === response);
        return selected?.isCorrect ? question.points : 0;
    }
    if (question.type === 'multiple-response') {
        return scoreMultipleResponse(question, response);
    }
    if (question.type === 'true-false') {
        return response === String(question.correctBoolean ?? true) ? question.points : 0;
    }
    if (question.type === 'short-answer') {
        return scoreShortAnswerExact(question, response) ?? 0;
    }
    if (question.type === 'cloze' || question.type === 'cloze-dropdown') {
        return scoreCloze(question, response);
    }
    if (question.type === 'matching') {
        return scoreMatching(question, response);
    }
    if (question.type === 'ordering') {
        return scoreOrdering(question, response);
    }
    if (question.type === 'categorize') {
        return scoreCategorize(question, response);
    }
    if (question.type === 'hot-text') {
        return scoreHotText(question, response);
    }
    // Open questions need manual points
    return 0;
}

function scoreAnswer(question: TestQuestion, answer: TestAnswer): number {
    if (answer.pointsEarned !== undefined) return clamp(answer.pointsEarned, 0, question.points);
    return autoScoreResponse(question, answer.response);
}

export function calcStudentTestRawPoints(test: Test, answers: TestAnswer[]): number {
    const questionsById = new Map(test.questions.map((q) => [q.id, q]));
    const latestByQuestionId = new Map<string, TestAnswer>();
    for (const answer of answers) {
        latestByQuestionId.set(answer.questionId, answer);
    }
    return Array.from(latestByQuestionId.values()).reduce((sum, a) => {
        const question = questionsById.get(a.questionId);
        return question ? sum + scoreAnswer(question, a) : sum;
    }, 0);
}

export function calcTestPercentage(points: number, maxPoints: number): number {
    if (maxPoints <= 0) return 0;
    return clamp((points / maxPoints) * 100, 0, 100);
}

export function calcClassAveragePercentage(studentTests: StudentTest[], test: Test): number {
    if (studentTests.length === 0) return 0;
    const maxPoints = calcTestMaxPoints(test);
    const total = studentTests.reduce((sum, st) => {
        const raw = st.rawTotalPoints ?? calcStudentTestRawPoints(test, st.answers);
        return sum + calcTestPercentage(raw, maxPoints);
    }, 0);
    return total / studentTests.length;
}

/** Uniform point delta that would move the class average to the target percentage. */
export function suggestAdjustmentToTarget(classAvgPct: number, targetPct: number, maxPoints: number): number {
    return ((targetPct - classAvgPct) / 100) * maxPoints;
}

/** Applies a uniform adjustment, clamping each student's effective total to [0, maxPoints]. */
export function applyAdjustment(studentTest: StudentTest, adjustmentPoints: number, maxPoints: number): StudentTest {
    const raw = studentTest.rawTotalPoints ?? 0;
    const effective = clamp(raw + adjustmentPoints, 0, maxPoints);
    return { ...studentTest, adjustmentPoints: effective - raw };
}
