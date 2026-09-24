import type { Test, TestQuestion, TestAnswer, StudentTest } from '../types';
import { autoScoreResponse } from '../../supabase/functions/_shared/testScoring.ts';
import { clamp } from './clamp';

export {
    autoScoreResponse,
    scoreShortAnswerExact,
    scoreNumeric,
    scoreMultipleResponse,
    scoreCloze,
    scoreMatching,
    scoreOrdering,
    scoreCategorize,
    scoreHotText,
} from '../../supabase/functions/_shared/testScoring.ts';

export function calcTestMaxPoints(test: Test): number {
    return test.questions.reduce((sum, q) => sum + q.points, 0);
}

function scoreAnswer(question: TestQuestion, answer: TestAnswer): number {
    if (answer.pointsEarned !== undefined) return clamp(answer.pointsEarned, 0, question.points);
    return autoScoreResponse(question, answer.response);
}

/**
 * A generator-engine (roadmap 27.1) placement run's questions are pulled live from the question
 * bank at runtime and never authored into `test.questions` — the submission carries its own
 * snapshot of them instead (`StudentTest.askedQuestionSnapshots`). Callers that need to score or
 * display a generator submission's answers should score against this merged list rather than
 * `test.questions` alone, which would otherwise show no points at all for such a run. A no-op
 * (returns `test` unchanged) for every other engine/mode.
 */
export function withAskedQuestionSnapshots(test: Test, studentTest: Pick<StudentTest, 'askedQuestionSnapshots'>): Test {
    if (!studentTest.askedQuestionSnapshots?.length) return test;
    return { ...test, questions: [...test.questions, ...studentTest.askedQuestionSnapshots] };
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
