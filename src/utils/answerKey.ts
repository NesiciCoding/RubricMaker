import type { StudentTest, Test, TestAnswer, TestQuestion } from '../types';
import { scoreStudentTest } from './studentTestScore';
import { addDropdownCorrectAnswer, addGapAlternative, parseClozeGaps, renderClozeSegments } from './clozeParse';
import { gapAccepts, gapCorrectAnswers } from '../../supabase/functions/_shared/testScoring';
import { parseClozeAnswers } from './answerResponseParsers';

/**
 * Types whose answer model can take another accepted answer. A dropdown gap holds its answer once the
 * prompt marks options with `=`/`~`; adoption upgrades a legacy `{{correct|wrong}}` gap to that form.
 */
const ADOPTABLE_TYPES: ReadonlySet<TestQuestion['type']> = new Set([
    'open',
    'short-answer',
    'key-word-transformation',
    'cloze',
    'cloze-bank',
    'cloze-dropdown',
]);

export function canAdoptAnswer(question: TestQuestion): boolean {
    return ADOPTABLE_TYPES.has(question.type);
}

/** Typed-gap types accept several correct answers per gap (`{{cat|kitten}}`), unlike the dropdown. */
export function isClozeAnswerKeyType(question: TestQuestion): boolean {
    return question.type === 'cloze' || question.type === 'cloze-bank' || question.type === 'cloze-dropdown';
}

/**
 * "100% matching" still ignores case and runs of whitespace: a student who typed the accepted answer with
 * different capitalisation or spacing gave the same answer, not a different one.
 */
export function normaliseAnswer(value: string): string {
    return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function acceptedAnswersOf(question: TestQuestion): string[] {
    return question.expectedAnswers ?? (question.expectedAnswer ? [question.expectedAnswer] : []);
}

/** Adds `answer` to the question's accepted answers; returns the input test unchanged when it is already there. */
export function withAcceptedAnswer(test: Test, questionId: string, answer: string): Test {
    const text = answer.trim();
    const question = test.questions.find((q) => q.id === questionId);
    if (!text || !question) return test;
    const accepted = acceptedAnswersOf(question);
    if (accepted.some((existing) => normaliseAnswer(existing) === normaliseAnswer(text))) return test;
    return {
        ...test,
        questions: test.questions.map((q) =>
            q.id === questionId ? { ...q, expectedAnswers: [...accepted, text] } : q
        ),
        updatedAt: new Date().toISOString(),
    };
}

/**
 * Cloze equivalent of withAcceptedAnswer: each gap the student answered gains that answer as one more
 * accepted answer — a dropdown gap gets it as another `=option`, a typed gap as another `|alternative`.
 */
export function withClozeAlternatives(test: Test, questionId: string, response: string): Test {
    const question = test.questions.find((q) => q.id === questionId);
    if (!question) return test;
    const dropdown = question.type === 'cloze-dropdown';
    const answers = parseClozeAnswers(response);
    let prompt = question.prompt;
    for (const segment of renderClozeSegments(question.prompt)) {
        if (segment.type !== 'gap') continue;
        const given = (answers[segment.gap.index] ?? '').trim();
        if (!given) continue;
        const accepted = gapCorrectAnswers(segment.gap, dropdown).some(
            (alt) => normaliseAnswer(alt) === normaliseAnswer(given)
        );
        if (accepted) continue;
        prompt = dropdown
            ? addDropdownCorrectAnswer(prompt, segment.gap.index, given)
            : addGapAlternative(prompt, segment.gap.index, given);
    }
    if (prompt === question.prompt) return test;
    return {
        ...test,
        questions: test.questions.map((q) => (q.id === questionId ? { ...q, prompt } : q)),
        updatedAt: new Date().toISOString(),
    };
}

/** Adopts a response into the answer model appropriate to the question's type. */
export function withAdoptedAnswer(test: Test, questionId: string, response: string): Test {
    const question = test.questions.find((q) => q.id === questionId);
    if (!question) return test;
    return isClozeAnswerKeyType(question)
        ? withClozeAlternatives(test, questionId, response)
        : withAcceptedAnswer(test, questionId, response);
}

export interface AdoptedAnswersResult {
    /** Attempts that gained a decided answer, ready to save. */
    attempts: StudentTest[];
    matched: number;
}

/**
 * Marks other students' matching answers for this question as correct. Only the latest answer per attempt
 * is considered, answers a teacher already decided are left alone, and `excludeStudentTestId` skips the
 * submission the answer was adopted from (that one is saved with its feedback separately).
 */
function markMatchingAttempts(
    test: Test,
    question: TestQuestion,
    attempts: StudentTest[],
    excludeStudentTestId: string | undefined,
    matches: (answer: TestAnswer) => boolean
): AdoptedAnswersResult {
    if (question.points <= 0) return { attempts: [], matched: 0 };
    const updated: StudentTest[] = [];
    for (const attempt of attempts) {
        if (attempt.id === excludeStudentTestId) continue;
        const lastIndex = attempt.answers.reduce((found, a, i) => (a.questionId === question.id ? i : found), -1);
        if (lastIndex < 0) continue;
        const given = attempt.answers[lastIndex];
        if (given.pointsEarned !== undefined || !matches(given)) continue;

        const answers = attempt.answers.map((a, i) => (i === lastIndex ? { ...a, pointsEarned: question.points } : a));
        updated.push({
            ...attempt,
            answers,
            rawTotalPoints: scoreStudentTest(test, { ...attempt, rawTotalPoints: undefined, answers }).rawPoints,
            status: attempt.status === 'submitted' ? 'graded' : attempt.status,
            gradedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        });
    }
    return { attempts: updated, matched: updated.length };
}

/** Marks 100%-matching whole-text answers (short answer, key word, open) as correct. */
export function markMatchingAnswersCorrect(
    test: Test,
    questionId: string,
    answer: string,
    attempts: StudentTest[],
    excludeStudentTestId?: string
): AdoptedAnswersResult {
    const question = test.questions.find((q) => q.id === questionId);
    const target = normaliseAnswer(answer);
    if (!question || !target) return { attempts: [], matched: 0 };
    return markMatchingAttempts(
        test,
        question,
        attempts,
        excludeStudentTestId,
        (given) => normaliseAnswer(given.response) === target
    );
}

/**
 * Marks cloze answers whose gaps all match the adopted gaps — each gap compared on its own against the
 * updated answer model, so an answer that was already accepted for that gap also counts.
 */
export function markClozeAnswersCorrect(
    test: Test,
    questionId: string,
    response: string,
    attempts: StudentTest[],
    excludeStudentTestId?: string
): AdoptedAnswersResult {
    const question = test.questions.find((q) => q.id === questionId);
    if (!question) return { attempts: [], matched: 0 };
    const dropdown = question.type === 'cloze-dropdown';
    const gaps = parseClozeGaps(question.prompt);
    // The whole question has to match, not just the gaps the adopted answer happened to fill: a blank
    // source gap would otherwise let a wrong answer elsewhere earn full marks.
    const adopted = Object.values(parseClozeAnswers(response)).some((text) => text.trim() !== '');
    if (gaps.length === 0 || !adopted) return { attempts: [], matched: 0 };
    return markMatchingAttempts(test, question, attempts, excludeStudentTestId, (given) => {
        const typed = parseClozeAnswers(given.response);
        return gaps.every((gap) => gapAccepts(gap, typed[String(gap.index)] ?? '', dropdown));
    });
}

/** Adopts a response's marks for other students using the comparison that fits the question type. */
export function markAdoptedAnswersCorrect(
    test: Test,
    questionId: string,
    response: string,
    attempts: StudentTest[],
    excludeStudentTestId?: string
): AdoptedAnswersResult {
    const question = test.questions.find((q) => q.id === questionId);
    if (!question) return { attempts: [], matched: 0 };
    return isClozeAnswerKeyType(question)
        ? markClozeAnswersCorrect(test, questionId, response, attempts, excludeStudentTestId)
        : markMatchingAnswersCorrect(test, questionId, response, attempts, excludeStudentTestId);
}
