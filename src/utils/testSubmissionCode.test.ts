import { describe, it, expect } from 'vitest';
import { encodeTestSubmission, decodeTestSubmission } from './testSubmissionCode';
import type { TestSubmissionPayload } from '../types';

const makeSubmission = (overrides: Partial<TestSubmissionPayload> = {}): TestSubmissionPayload => ({
    testId: 't1',
    studentId: 's1',
    teacherKey: 'tk1',
    answers: [
        { questionId: 'q1', response: 'opt-a' },
        { questionId: 'q2', response: 'Paris' },
    ],
    startedAt: '2026-01-01T09:00:00.000Z',
    submittedAt: '2026-01-01T09:45:00.000Z',
    events: [{ type: 'tab_switch', at: '2026-01-01T09:10:00.000Z' }],
    ...overrides,
});

describe('encodeTestSubmission', () => {
    it('returns a non-empty string', () => {
        const code = encodeTestSubmission(makeSubmission());
        expect(typeof code).toBe('string');
        expect(code.length).toBeGreaterThan(0);
    });

    it('returns empty string on circular reference', () => {
        const s = makeSubmission() as TestSubmissionPayload & { circular?: unknown };
        s.circular = s;
        expect(encodeTestSubmission(s)).toBe('');
    });
});

describe('decodeTestSubmission', () => {
    it('round-trips a submission including answers and events', () => {
        const submission = makeSubmission();
        const decoded = decodeTestSubmission(encodeTestSubmission(submission));
        expect(decoded).toEqual(submission);
    });

    it('tolerates surrounding whitespace', () => {
        const code = `\n${encodeTestSubmission(makeSubmission())} `;
        expect(decodeTestSubmission(code)).toEqual(makeSubmission());
    });

    it('returns null for garbage input', () => {
        expect(decodeTestSubmission('???')).toBeNull();
        expect(decodeTestSubmission('')).toBeNull();
    });

    it('returns null when required fields are missing', () => {
        const noAnswers = btoa(encodeURIComponent(JSON.stringify({ testId: 't1', studentId: 's1' })));
        expect(decodeTestSubmission(noAnswers)).toBeNull();
        const noTestId = btoa(encodeURIComponent(JSON.stringify({ studentId: 's1', answers: [] })));
        expect(decodeTestSubmission(noTestId)).toBeNull();
    });

    it('returns null when teacherKey, startedAt, or submittedAt are missing', () => {
        const base = { testId: 't1', studentId: 's1', answers: [] };
        expect(decodeTestSubmission(btoa(encodeURIComponent(JSON.stringify(base))))).toBeNull();
        expect(
            decodeTestSubmission(
                btoa(encodeURIComponent(JSON.stringify({ ...base, teacherKey: 'tk1', startedAt: '2026-01-01' })))
            )
        ).toBeNull();
    });

    it('returns null when an answer item is missing a string questionId', () => {
        const payload = {
            ...makeSubmission(),
            answers: [{ response: 'opt-a' }],
        };
        expect(decodeTestSubmission(btoa(encodeURIComponent(JSON.stringify(payload))))).toBeNull();
    });
});
