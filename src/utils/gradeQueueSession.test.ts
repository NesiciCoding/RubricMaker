import { afterEach, describe, expect, it } from 'vitest';
import {
    clearGradeQueueSession,
    gradeQueueSessionKey,
    hasSessionContent,
    loadGradeQueueSession,
    parseGradeQueueSession,
    saveGradeQueueSession,
    serialiseGradeQueueSession,
    type GradeQueueSessionState,
} from './gradeQueueSession';

const state: GradeQueueSessionState = {
    view: 'student',
    groupIndex: 1,
    stepIndex: 2,
    selectedIdx: 0,
    draftPoints: { 'st1:q1': '2' },
    feedbackDrafts: { 'st1:q1': 'Nearly there' },
    skipped: ['st2:q1'],
};

const pristine: GradeQueueSessionState = {
    view: 'question',
    groupIndex: 0,
    stepIndex: 0,
    selectedIdx: 0,
    draftPoints: {},
    feedbackDrafts: {},
    skipped: [],
};

const NOW = Date.parse('2026-11-15T10:00:00.000Z');

afterEach(() => {
    clearGradeQueueSession(gradeQueueSessionKey('test', 'user'));
});

describe('gradeQueueSessionKey', () => {
    it('scopes the key to the test and the signed-in account', () => {
        expect(gradeQueueSessionKey('test', 'user')).toBe('rm_grade_queue_session:test:user');
        expect(gradeQueueSessionKey('test', null)).toBe('rm_grade_queue_session:test:local');
        expect(gradeQueueSessionKey(undefined, undefined)).toBe('rm_grade_queue_session:none:local');
    });
});

describe('parseGradeQueueSession', () => {
    it('round-trips a serialised session', () => {
        const parsed = parseGradeQueueSession(serialiseGradeQueueSession(state, NOW), NOW);
        expect(parsed).toMatchObject(state);
        expect(parsed?.version).toBe(1);
        expect(parsed?.savedAt).toBe('2026-11-15T10:00:00.000Z');
    });

    it('rejects what it cannot trust', () => {
        expect(parseGradeQueueSession(null, NOW)).toBeNull();
        expect(parseGradeQueueSession('not json', NOW)).toBeNull();
        expect(parseGradeQueueSession('[]', NOW)).toBeNull();
        expect(parseGradeQueueSession(JSON.stringify({ ...state, version: 2 }), NOW)).toBeNull();
        expect(parseGradeQueueSession(JSON.stringify({ ...state, view: 'grid' }), NOW)).toBeNull();
        expect(parseGradeQueueSession(JSON.stringify({ ...state, stepIndex: -1 }), NOW)).toBeNull();
        expect(parseGradeQueueSession(JSON.stringify({ ...state, groupIndex: 1.5 }), NOW)).toBeNull();
        expect(parseGradeQueueSession(JSON.stringify({ ...state, draftPoints: { a: 2 } }), NOW)).toBeNull();
        expect(parseGradeQueueSession(JSON.stringify({ ...state, feedbackDrafts: [] }), NOW)).toBeNull();
        expect(parseGradeQueueSession(JSON.stringify({ ...state, skipped: [1] }), NOW)).toBeNull();
    });

    it('drops a session older than a week', () => {
        const storage = serialiseGradeQueueSession(state, NOW);
        expect(parseGradeQueueSession(storage, NOW + 6 * 24 * 60 * 60 * 1000)).not.toBeNull();
        expect(parseGradeQueueSession(storage, NOW + 8 * 24 * 60 * 60 * 1000)).toBeNull();
        expect(parseGradeQueueSession(JSON.stringify({ ...state, savedAt: 'nope' }), NOW)).toBeNull();
    });
});

describe('hasSessionContent', () => {
    it('is false for a pristine queue', () => {
        expect(hasSessionContent(pristine)).toBe(false);
    });

    it('is true for drafts, feedback, skips or a moved cursor', () => {
        expect(hasSessionContent({ ...pristine, draftPoints: { a: '1' } })).toBe(true);
        expect(hasSessionContent({ ...pristine, feedbackDrafts: { a: 'ok' } })).toBe(true);
        expect(hasSessionContent({ ...pristine, skipped: ['a'] })).toBe(true);
        expect(hasSessionContent({ ...pristine, groupIndex: 1 })).toBe(true);
        expect(hasSessionContent({ ...pristine, stepIndex: 3 })).toBe(true);
        expect(hasSessionContent({ ...pristine, selectedIdx: 2 })).toBe(true);
    });
});

describe('save / load / clear', () => {
    it('stores and reads back a session', () => {
        const key = gradeQueueSessionKey('test', 'user');
        expect(saveGradeQueueSession(key, state)).toBe(true);
        expect(loadGradeQueueSession(key)).toMatchObject(state);
        clearGradeQueueSession(key);
        expect(loadGradeQueueSession(key)).toBeNull();
    });

    it('refuses a session too large for the quota', () => {
        const huge: GradeQueueSessionState = {
            ...state,
            feedbackDrafts: { 'st1:q1': 'x'.repeat(200_001) },
        };
        expect(saveGradeQueueSession(gradeQueueSessionKey('test', 'user'), huge)).toBe(false);
    });
});
