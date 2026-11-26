import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { DEFAULT_FORMAT, type AppSettings, type Student, type StudentTest, type Test } from '../../types';
import { clearGradeQueueSession, gradeQueueSessionKey, loadGradeQueueSession } from '../../utils/gradeQueueSession';

const settings: AppSettings = {
    defaultGradeScaleId: 'gs1',
    theme: 'light',
    language: 'en',
    accentColor: '#3b82f6',
    defaultFormat: DEFAULT_FORMAT,
    gradeQueueView: 'question',
};

const student: Student = { id: 's1', name: 'Alice', classId: 'c1' };

const test: Test = {
    id: 't1',
    name: 'Unit test',
    requireSEB: false,
    shuffleQuestions: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    questions: [{ id: 'q1', type: 'open', prompt: 'Explain why.', points: 5 }],
};

const attempt: StudentTest = {
    id: 'st1',
    testId: 't1',
    studentId: 's1',
    answers: [{ questionId: 'q1', response: 'Because it rained.' }],
    status: 'submitted',
    startedAt: '2026-01-01T09:00:00.000Z',
};

const showToast = vi.fn();
const updateSettings = vi.fn();

vi.mock('../../context/useStore', () => ({
    useStoreSelector: (selector: (state: unknown) => unknown) =>
        selector({ tests: [test], studentTests: [attempt], students: [student] }),
    useStoreActions: () => ({
        saveStudentTest: vi.fn(),
        updateTest: vi.fn(),
        recordCommentBankUsage: vi.fn(),
        addCommentBankItem: vi.fn(),
    }),
}));

vi.mock('../../context/AppContext', () => ({
    useSettings: () => ({ settings, updateSettings }),
}));

vi.mock('../../hooks/useSharedMaterials', () => ({
    useOwnOrSharedItem: () => ({ item: test, entry: undefined, loading: false }),
}));

vi.mock('../../hooks/useDbStatus', () => ({
    useDbStatus: () => ({ isConnected: false, userId: 'u1', status: 'offline' }),
}));

vi.mock('../../hooks/useClassRoles', () => ({
    useCanEditStudentWork: () => () => true,
    useMyClassRoles: () => null,
}));

vi.mock('../../hooks/useToast', () => ({
    useToast: () => ({ showToast, dismissToast: vi.fn() }),
}));

vi.mock('../../components/Layout/Topbar', () => ({
    default: ({ title }: { title: string }) => <div>{title}</div>,
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
        i18n: { language: 'en' },
    }),
}));

const key = gradeQueueSessionKey('t1', 'u1');

async function renderQueue() {
    const Page = (await import('../TestGradingQueuePage')).default;
    const router = createMemoryRouter([{ path: '/tests/:testId/grade', element: <Page /> }], {
        initialEntries: ['/tests/t1/grade'],
    });
    return render(<RouterProvider router={router} />);
}

function pointsInput(): HTMLInputElement {
    return screen.getByLabelText('tests.queue.points_aria') as HTMLInputElement;
}

describe('test grading queue session restore', () => {
    beforeEach(() => {
        clearGradeQueueSession(key);
        showToast.mockClear();
    });

    afterEach(() => {
        cleanup();
        clearGradeQueueSession(key);
    });

    it('keeps a draft, then restores it after the page is reopened', async () => {
        const first = await renderQueue();
        fireEvent.change(pointsInput(), { target: { value: '3' } });

        await waitFor(() => expect(loadGradeQueueSession(key)).not.toBeNull(), { timeout: 2000 });
        expect(loadGradeQueueSession(key)?.draftPoints).toMatchObject({ 'st1:q1': '3' });
        first.unmount();

        await renderQueue();
        await waitFor(() => expect(pointsInput().value).toBe('3'));
        expect(showToast).toHaveBeenCalledWith('tests.queue.session_restored', 'info');
    });

    it('persists a skipped answer', async () => {
        await renderQueue();
        fireEvent.click(screen.getByRole('button', { name: 'tests.queue.skip' }));

        await waitFor(() => expect(loadGradeQueueSession(key)?.skipped).toContain('st1:q1'), { timeout: 2000 });
    });
});
