import { describe, it, expect } from 'vitest';
import { groupPagesByStudent, pageCountMismatches, unassignedPages } from './examScanBatch';

const page = (id: string, studentId: string, qrPageCount?: number) => ({ id, studentId, qrPageCount });

describe('groupPagesByStudent', () => {
    it('groups pages in scan order and skips unassigned pages', () => {
        const groups = groupPagesByStudent([page('p1', 'a'), page('p2', ''), page('p3', 'b'), page('p4', 'a')]);
        expect(groups.map((g) => g.studentId)).toEqual(['a', 'b']);
        expect(groups[0].pages.map((p) => p.id)).toEqual(['p1', 'p4']);
        expect(groups[1].pages.map((p) => p.id)).toEqual(['p3']);
    });

    it('returns no groups when nothing is assigned', () => {
        expect(groupPagesByStudent([page('p1', ''), page('p2', '')])).toEqual([]);
    });
});

describe('unassignedPages', () => {
    it('returns only pages without a student', () => {
        expect(unassignedPages([page('p1', ''), page('p2', 'a'), page('p3', '')]).map((p) => p.id)).toEqual([
            'p1',
            'p3',
        ]);
    });
});

describe('pageCountMismatches', () => {
    it('flags a student whose scanned page count differs from the QR page count', () => {
        const groups = groupPagesByStudent([page('p1', 'a', 2), page('p2', 'a', 2), page('p3', 'b', 3)]);
        expect(pageCountMismatches(groups)).toEqual([{ studentId: 'b', expected: 3, actual: 1 }]);
    });

    it('does not flag groups without a QR page count', () => {
        const groups = groupPagesByStudent([page('p1', 'a'), page('p2', 'a')]);
        expect(pageCountMismatches(groups)).toEqual([]);
    });
});
