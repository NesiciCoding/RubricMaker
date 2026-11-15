import { QUESTION_TYPES, QUESTION_TYPE_GROUPS } from './questionTypes';
import { describe, expect, it } from 'vitest';

describe('QUESTION_TYPE_GROUPS', () => {
    it('filters list every type', () => {
        expect(QUESTION_TYPES).toHaveLength(19);
        expect(new Set(QUESTION_TYPES).size).toBe(19);
    });

    it('places every type in exactly one group', () => {
        const grouped = QUESTION_TYPE_GROUPS.flatMap((group) => group.types);
        expect([...grouped].sort()).toEqual([...QUESTION_TYPES].sort());
        expect(new Set(grouped).size).toBe(grouped.length);
    });
});
