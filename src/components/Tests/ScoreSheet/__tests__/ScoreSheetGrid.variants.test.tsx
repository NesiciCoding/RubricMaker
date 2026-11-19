import { render } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { Student, Test } from '../../../../types';
import { isQuestionDelivered } from '../../../../utils/variantDelivery';
import ScoreSheetGrid from '../ScoreSheetGrid';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key),
        i18n: { language: 'en', changeLanguage: vi.fn() },
    }),
}));

vi.mock('../../../../hooks/useToast', () => ({ useToast: () => ({ showToast: vi.fn() }) }));

const test: Test = {
    id: 't1',
    name: 'Paper test',
    questions: [
        { id: 'q1', prompt: '1', type: 'open', points: 2 },
        { id: 'q1v', prompt: '1 (easier)', type: 'open', points: 2, variantOfQuestionId: 'q1' },
    ],
    requireSEB: false,
    shuffleQuestions: false,
    createdAt: '2026-01-01',
    scoreOnly: true,
};

const students: Student[] = Array.from({ length: 8 }, (_, i) => ({ id: `s${i}`, name: `Student ${i}`, classId: 'c1' }));

describe('ScoreSheetGrid with an easier-cloze family', () => {
    it('only lets each student be scored on the member they were given', () => {
        const onSave = vi.fn();
        render(
            <ScoreSheetGrid
                test={test}
                students={students}
                classes={[]}
                sheetByStudent={new Map()}
                scale={null}
                items={[]}
                onSave={onSave}
            />
        );
        students.forEach((student, row) => {
            const original = document.querySelector<HTMLInputElement>(`[data-cell="${row}-0"]`)!;
            const copy = document.querySelector<HTMLInputElement>(`[data-cell="${row}-1"]`)!;
            expect(original.disabled).toBe(!isQuestionDelivered(test, student.id, 'q1'));
            expect(copy.disabled).toBe(!isQuestionDelivered(test, student.id, 'q1v'));
            expect(original.disabled).not.toBe(copy.disabled);
        });
    });
});
