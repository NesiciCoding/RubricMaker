import { describe, expect, it } from 'vitest';
import { boundLogRow, type LogRow } from './clientLogger';

const row = (patch: Partial<LogRow> = {}): LogRow => ({
    session_id: 'sess',
    role: 'teacher',
    school_id: 'school-1',
    user_id: null,
    category: 'action',
    name: 'grade_saved',
    level: 'info',
    path: '/rubrics',
    meta: { count: 3 },
    ...patch,
});

describe('boundLogRow (#638)', () => {
    it('leaves a normal row untouched', () => {
        expect(boundLogRow(row())).toEqual(row());
    });

    it('clamps long strings and replaces oversized meta with its size', () => {
        const big = { blob: 'x'.repeat(5000) };
        const bounded = boundLogRow(
            row({
                name: 'n'.repeat(500),
                path: '/p'.repeat(600),
                role: 'r'.repeat(100),
                school_id: 's'.repeat(100),
                meta: big,
            })
        );
        expect(bounded.name).toHaveLength(128);
        expect(bounded.path).toHaveLength(512);
        expect(bounded.role).toHaveLength(32);
        expect(bounded.school_id).toHaveLength(64);
        expect(bounded.meta).toEqual({ truncated: true, size: JSON.stringify(big).length });
    });

    it('keeps null fields null', () => {
        expect(boundLogRow(row({ role: null, school_id: null, path: null, meta: null }))).toMatchObject({
            role: null,
            school_id: null,
            path: null,
            meta: null,
        });
    });
});
