import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const dir = resolve(__dirname, '../../supabase/migrations');
const migrations = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((file) => ({ file, sql: readFileSync(resolve(dir, file), 'utf8') }));

function latestBody(fn: string): string {
    for (const { sql } of [...migrations].reverse()) {
        const start = sql.lastIndexOf(`CREATE OR REPLACE FUNCTION public.${fn}(`);
        if (start !== -1) return sql.slice(start, sql.indexOf('$$;', start));
    }
    throw new Error(`${fn} not found`);
}

/** Tables that get a student_id column in some migration (CREATE TABLE body or ADD COLUMN). */
function tablesWithStudentIdColumn(): Set<string> {
    const tables = new Set<string>();
    for (const { sql } of migrations) {
        for (const m of sql.matchAll(
            /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?(\w+)\s*\(([\s\S]*?)\n\);/gi
        )) {
            if (/^\s*student_id\s+\w+/im.test(m[2])) tables.add(m[1].toLowerCase());
        }
        for (const m of sql.matchAll(
            /alter\s+table\s+(?:if\s+exists\s+)?(?:public\.)?(\w+)\s+add\s+column\s+(?:if\s+not\s+exists\s+)?student_id\b/gi
        )) {
            tables.add(m[1].toLowerCase());
        }
    }
    return tables;
}

const registered = new Set([...latestBody('student_data_tables').matchAll(/\('(\w+)',\s*'(\w+)',/g)].map((m) => m[2]));

// #644: erasing a student must reach every table that links rows to them.
describe('student data registry (student_data_tables)', () => {
    it('covers every table with a student_id column', () => {
        const withColumn = tablesWithStudentIdColumn();
        for (const t of ['student_rubrics', 'messages', 'scan_metadata', 'flashcard_decks']) {
            expect(withColumn, 'migration parser lost a known table').toContain(t);
        }
        const missing = [...tablesWithStudentIdColumn()].filter((t) => !registered.has(t));
        expect(missing, 'register these in student_data_tables() (erase_student)').toEqual([]);
    });

    it('covers the tables that link to a student through jsonb or a parent row', () => {
        for (const t of [
            'students',
            'attachments',
            'document_comments',
            'recording_metadata',
            'essay_submissions',
            'essay_batch_assignments',
            'essay_offline_submissions',
            'placement_sessions',
            'student_tests',
            'grading_tasks',
            'comparative_matchups',
        ]) {
            expect(registered).toContain(t);
        }
    });

    it('erases children before the parents their filters look up', () => {
        const order = [...latestBody('student_data_tables').matchAll(/\('(\w+)',/g)].map((m) => m[1]);
        const before = (a: string, b: string) => expect(order.indexOf(a)).toBeLessThan(order.indexOf(b));
        before('document_comments', 'attachments');
        before('recording_metadata', 'speaking_sessions');
        before('essay_submissions', 'essay_assignments');
        before('placement_sessions', 'test_assignments');
        before('student_tests', 'test_assignments');
        expect(order[order.length - 1]).toBe('students');
    });

    it('erase_student and student_storage_objects check who may erase', () => {
        expect(latestBody('erase_student')).toContain('public.student_erasure_scope(p_student_id)');
        expect(latestBody('erase_student')).toContain('public.student_data_tables()');
        expect(latestBody('student_storage_objects')).toContain('public.student_erasure_scope(p_student_id)');
    });
});
