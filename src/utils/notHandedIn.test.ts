import { describe, it, expect } from 'vitest';
import type { StudentRubric } from '../types';
import {
    clearNotHandedIn,
    clearNotHandedInIfScored,
    hasAnyScore,
    isCannedNotHandedInComment,
    markNotHandedIn,
} from './notHandedIn';

const CANNED = 'Not handed in';
const sr = (over: Partial<StudentRubric> = {}): StudentRubric => ({
    id: 'sr',
    rubricId: 'r',
    studentId: 's',
    entries: [{ criterionId: 'c', levelId: null, comment: '', checkedSubItems: [] }],
    overallComment: '',
    isPeerReview: false,
    ...over,
});
const scored = (patch: Partial<StudentRubric['entries'][0]>) =>
    sr({ entries: [{ criterionId: 'c', levelId: null, comment: '', checkedSubItems: [], ...patch }] });

describe('hasAnyScore', () => {
    it('detects levels, overrides and sub-items', () => {
        expect(hasAnyScore(sr())).toBe(false);
        expect(hasAnyScore(scored({ levelId: 'l1' }))).toBe(true);
        expect(hasAnyScore(scored({ overridePoints: 0 }))).toBe(true);
        expect(hasAnyScore(scored({ subItemScores: { a: 1 } }))).toBe(true);
        expect(hasAnyScore(scored({ checkedSubItems: ['a'] }))).toBe(true);
    });
});

describe('markNotHandedIn / clearNotHandedIn', () => {
    it('fills only an empty comment with the canned text', () => {
        expect(markNotHandedIn(sr(), CANNED)).toMatchObject({ notHandedIn: true, overallComment: CANNED });
        expect(markNotHandedIn(sr({ overallComment: '<p></p>' }), CANNED).overallComment).toBe(CANNED);
        expect(markNotHandedIn(sr({ overallComment: 'Keep me' }), CANNED).overallComment).toBe('Keep me');
    });

    it('removes the canned comment (with or without markup) but keeps real feedback', () => {
        expect(clearNotHandedIn(sr({ notHandedIn: true, overallComment: `<p>${CANNED}</p>` }), CANNED)).toMatchObject({
            notHandedIn: false,
            overallComment: '',
        });
        expect(
            clearNotHandedIn(sr({ notHandedIn: true, overallComment: 'Late but good' }), CANNED).overallComment
        ).toBe('Late but good');
        expect(isCannedNotHandedInComment(' Not handed in ', CANNED)).toBe(true);
    });

    it('clears on save only when something was scored', () => {
        const nhi = sr({ notHandedIn: true, overallComment: CANNED });
        expect(clearNotHandedInIfScored(nhi, CANNED)).toBe(nhi);
        const graded = { ...nhi, entries: scored({ levelId: 'l1' }).entries };
        expect(clearNotHandedInIfScored(graded, CANNED)).toMatchObject({ notHandedIn: false, overallComment: '' });
        const plain = scored({ levelId: 'l1' });
        expect(clearNotHandedInIfScored(plain, CANNED)).toBe(plain);
    });
});
