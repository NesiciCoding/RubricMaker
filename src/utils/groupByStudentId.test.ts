import { describe, it, expect } from 'vitest';
import { groupByStudentId } from './groupByStudentId';

describe('groupByStudentId', () => {
    it('groups items under their student id, preserving order within each group', () => {
        const items = [
            { studentId: 'a', v: 1 },
            { studentId: 'b', v: 2 },
            { studentId: 'a', v: 3 },
        ];
        const grouped = groupByStudentId(items, (i) => i.studentId);
        expect(grouped.get('a')).toEqual([items[0], items[2]]);
        expect(grouped.get('b')).toEqual([items[1]]);
        expect(grouped.get('c')).toBeUndefined();
    });

    it('returns an empty map for an empty input', () => {
        expect(groupByStudentId([], (i: { studentId: string }) => i.studentId).size).toBe(0);
    });
});
