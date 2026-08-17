import { describe, expect, it } from 'vitest';
import { keyOnlineEssaySubmissions } from '../utils/onlineEssaySubmissions';

describe('keyOnlineEssaySubmissions', () => {
    it('groups student ids by assignment', () => {
        const map = keyOnlineEssaySubmissions([
            { assignmentId: 'a1', studentId: 's1' },
            { assignmentId: 'a1', studentId: 's2' },
            { assignmentId: 'a2', studentId: 's3' },
        ]);
        expect(map.get('a1')).toEqual(new Set(['s1', 's2']));
        expect(map.get('a2')).toEqual(new Set(['s3']));
    });

    it('dedupes repeated submissions from the same student', () => {
        const map = keyOnlineEssaySubmissions([
            { assignmentId: 'a1', studentId: 's1' },
            { assignmentId: 'a1', studentId: 's1' },
        ]);
        expect(map.get('a1')).toEqual(new Set(['s1']));
    });

    it('ignores rows without a student id', () => {
        const map = keyOnlineEssaySubmissions([
            { assignmentId: 'a1', studentId: '' },
            { assignmentId: 'a1', studentId: 's1' },
        ]);
        expect(map.get('a1')).toEqual(new Set(['s1']));
    });

    it('returns an empty map for no rows and never for an existing key', () => {
        expect(keyOnlineEssaySubmissions([])).toEqual(new Map());
        const map = keyOnlineEssaySubmissions([{ assignmentId: 'a1', studentId: 's1' }]);
        expect(map.get('missing')).toBeUndefined();
    });
});
