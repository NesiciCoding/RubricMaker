import type { Test, TestQuestion, TestAnswer, StudentTest } from '../types';

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

function scoreAnswer(question: TestQuestion, answer: TestAnswer): number {
    if (answer.pointsEarned !== undefined) return clamp(answer.pointsEarned, 0, question.points);
    if (question.type === 'multiple-choice') {
        const selected = question.options?.find((o) => o.id === answer.response);
        return selected?.isCorrect ? question.points : 0;
    }
    if (question.type === 'short-answer') {
        return scoreShortAnswerExact(question, answer.response) ?? 0;
    }
    // Open questions need manual points
    return 0;
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
