import { seededShuffle } from './seededShuffle';
import type { Test, TestQuestion } from '../types';

/** How many parallel paper versions a test may be split into. */
export const MAX_TEST_VERSIONS = 4;

/** Clamps a stored version count to the supported 1–4 range (1 = no versions). */
export function normalizeVersionCount(count: number | undefined): number {
    if (!count || !Number.isFinite(count)) return 1;
    return Math.min(MAX_TEST_VERSIONS, Math.max(1, Math.floor(count)));
}

export function versionLabel(index: number): string {
    return String.fromCharCode(65 + index);
}

/** Every version letter a count offers, e.g. 3 → ['A', 'B', 'C']. */
export function versionLabels(count: number | undefined): string[] {
    const n = normalizeVersionCount(count);
    return n <= 1 ? [] : Array.from({ length: n }, (_, i) => versionLabel(i));
}

/** Seed key for a question's order inside one version, so two versions never share a shuffle. */
export function versionSeed(version: string, questionId: string): string {
    return `v${version}:${questionId}`;
}

/**
 * Stable 32-bit hash (FNV-1a) of a student id, modulo the version count. Deliberately derived from
 * the student rather than stored: the runner, the results page and the paper export can all
 * recompute the same version with no extra persisted field. Not balanced by roster — a small class
 * may not split evenly, but a student's version never changes between viewings.
 */
export function versionIndexForStudent(studentId: string, count: number): number {
    let hash = 0x811c9dc5;
    for (let i = 0; i < studentId.length; i++) {
        hash ^= studentId.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash % normalizeVersionCount(count);
}

/** The version letter for a student, or null when the test has no parallel versions. */
export function versionForStudent(studentId: string, count: number | undefined): string | null {
    const n = normalizeVersionCount(count);
    if (n <= 1 || !studentId) return null;
    return versionLabel(versionIndexForStudent(studentId, n));
}

/**
 * One question as a given version shows it. Only choice options are reordered: answers are stored
 * and scored by option id, so the shuffle is display-only and no scorer changes. Ordering tiles are
 * the answer itself, and matching/matrix columns already have their own deterministic display
 * shuffles, so they stay untouched.
 */
export function versionQuestion(question: TestQuestion, version: string | null | undefined): TestQuestion {
    if (!version) return question;
    if (question.type !== 'multiple-choice' && question.type !== 'multiple-response') return question;
    if (!question.options || question.options.length < 2) return question;
    return {
        ...question,
        options: seededShuffle(question.options, versionSeed(version, question.id)),
    };
}

/**
 * The whole test as one version shows it — the single input the student runner, the printed booklet,
 * the answer sheet and the scan all run through, so option letters can never disagree between them.
 */
export function versionedTest(test: Test, version: string | null | undefined): Test {
    if (!version) return test;
    return { ...test, questions: test.questions.map((question) => versionQuestion(question, version)) };
}
