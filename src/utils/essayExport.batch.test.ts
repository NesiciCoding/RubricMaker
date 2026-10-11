import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('file-saver', () => ({ saveAs: vi.fn() }));

import { saveAs } from 'file-saver';
import { exportEssaysBatch } from './essayExport';
import type { EssaySubmission, Student } from '../types';

const submission = {
    id: 'sub',
    teacherKey: 'tk',
    assignmentStudentId: 's',
    assignmentRubricId: 'r',
    contentHtml: '<p>Text</p>',
    wordCount: 1,
    submittedAt: '2026-10-01T10:00:00Z',
} as EssaySubmission;
const assignment = { title: 'Mijn opstel' };
const student = (id: string, name: string): Student => ({ id, name, classId: 'c' });

describe('exportEssaysBatch separate files (#692)', () => {
    beforeEach(() => vi.mocked(saveAs).mockClear());

    it('keeps accented and non-Latin names and numbers colliding ones', async () => {
        await exportEssaysBatch(
            [
                { assignment, student: student('a', 'Zoë Müller'), submission },
                { assignment, student: student('b', '王小明'), submission },
                { assignment, student: student('c', '王小明'), submission },
            ] as Parameters<typeof exportEssaysBatch>[0],
            'markdown',
            'separate'
        );
        expect(vi.mocked(saveAs).mock.calls.map(([, name]) => name)).toEqual([
            'Zoë_Müller_Mijn_opstel.md',
            '王小明_Mijn_opstel.md',
            '王小明_Mijn_opstel_2.md',
        ]);
    });
});
