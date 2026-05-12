import { describe, it, expect } from 'vitest';
import { encodeFeedbackCode, decodeFeedbackCode } from './studentShareCode';
import type { SharedFeedback, Rubric, Student, StudentRubric, GradeScale } from '../types';
import { DEFAULT_FORMAT } from '../types';

const makeRubric = (id = 'r1'): Rubric => ({
    id,
    name: 'Test Rubric',
    subject: 'English',
    description: '',
    criteria: [],
    gradeScaleId: 'gs1',
    format: DEFAULT_FORMAT,
    attachmentIds: [],
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
    totalMaxPoints: 100,
    scoringMode: 'weighted-percentage',
});

const makeStudent = (id = 's1'): Student => ({
    id,
    name: 'Alice',
    classId: 'c1',
});

const makeSr = (rubricId = 'r1', studentId = 's1'): StudentRubric => ({
    id: 'sr1',
    rubricId,
    studentId,
    entries: [],
    overallComment: 'Good work',
    isPeerReview: false,
});

const makeScale = (): GradeScale => ({
    id: 'gs1',
    name: 'Letter',
    type: 'letter',
    ranges: [{ min: 90, max: 100, label: 'A', color: '#22c55e' }],
});

describe('encodeFeedbackCode', () => {
    it('returns a non-empty string', () => {
        const feedback: SharedFeedback = {
            sr: makeSr(),
            rubric: makeRubric(),
            student: makeStudent(),
            scale: makeScale(),
        };
        const code = encodeFeedbackCode(feedback);
        expect(typeof code).toBe('string');
        expect(code.length).toBeGreaterThan(0);
    });

    it('returns empty string on unencodable input', () => {
        const feedback = {
            sr: { circular: null as any },
            rubric: null as any,
            student: null as any,
            scale: null,
        };
        // Create a circular reference to force JSON.stringify to throw
        feedback.sr.circular = feedback.sr as any;
        const code = encodeFeedbackCode(feedback as any);
        expect(code).toBe('');
    });

    it('uses rubricSnapshot when present', () => {
        const rubric = makeRubric();
        const snapshot = makeRubric('snapshot-r');
        const sr = { ...makeSr(), rubricSnapshot: snapshot };
        const feedback: SharedFeedback = { sr, rubric, student: makeStudent(), scale: null };
        const code = encodeFeedbackCode(feedback);
        const decoded = decodeFeedbackCode(code);
        expect(decoded?.rubric.id).toBe('snapshot-r');
    });
});

describe('decodeFeedbackCode', () => {
    it('round-trips a valid feedback object', () => {
        const original: SharedFeedback = {
            sr: makeSr(),
            rubric: makeRubric(),
            student: makeStudent(),
            scale: makeScale(),
        };
        const code = encodeFeedbackCode(original);
        const decoded = decodeFeedbackCode(code);
        expect(decoded).not.toBeNull();
        expect(decoded!.student.name).toBe('Alice');
        expect(decoded!.rubric.name).toBe('Test Rubric');
        expect(decoded!.sr.overallComment).toBe('Good work');
    });

    it('returns null for empty string', () => {
        expect(decodeFeedbackCode('')).toBeNull();
    });

    it('returns null for invalid base64', () => {
        expect(decodeFeedbackCode('not-valid-base64!!!')).toBeNull();
    });

    it('returns null when required fields are missing', () => {
        // Encode an incomplete object
        const partial = { sr: null, rubric: makeRubric(), student: null };
        const code = btoa(encodeURIComponent(JSON.stringify(partial)));
        expect(decodeFeedbackCode(code)).toBeNull();
    });

    it('trims whitespace from the code', () => {
        const original: SharedFeedback = {
            sr: makeSr(),
            rubric: makeRubric(),
            student: makeStudent(),
            scale: null,
        };
        const code = '  ' + encodeFeedbackCode(original) + '  ';
        expect(decodeFeedbackCode(code)).not.toBeNull();
    });
});
