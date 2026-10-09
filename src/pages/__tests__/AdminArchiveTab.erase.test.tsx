import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Student } from '../../types';

const archived: Student[] = [{ id: 's1', name: 'Alice', classId: 'c1', archivedAt: '2026-09-01T00:00:00Z' }];
const eraseStudent = vi.fn((): Promise<{ success: boolean; error?: string; leftoverFiles: number }> =>
    Promise.resolve({ success: true, leftoverFiles: 0 })
);
const showToast = vi.fn();

vi.mock('../../context/AppContext', () => {
    const studentsValue = {
        students: [],
        archivedStudents: archived,
        restoreStudent: vi.fn(),
        anonymizeStudent: vi.fn(),
        eraseStudent,
    };
    return {
        useStudents: () => studentsValue,
        useClasses: () => ({ classes: [{ id: 'c1', name: 'Class A' }] }),
        useGrading: () => ({ deletedStudentRubrics: [], restoreStudentRubric: vi.fn() }),
        useAuthoring: () => ({ rubrics: [] }),
        usePlatform: () => ({}),
        useSettings: () => ({}),
    };
});
vi.mock('../../hooks/useToast', () => ({ useToast: () => ({ showToast }) }));
vi.mock('../../services/database', () => ({ loadSupabaseConfig: vi.fn(() => null), storageSync: {} }));
vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key} ${JSON.stringify(opts)}` : key),
        i18n: { language: 'en' },
    }),
    Trans: ({ i18nKey }: { i18nKey: string }) => React.createElement('span', null, i18nKey),
}));

async function renderArchive() {
    const { ArchiveTab } = await import('../AdminPage');
    render(<ArchiveTab />);
    return screen.getByRole('button', { name: /admin\.erase_btn/ });
}

describe('AdminPage ArchiveTab — erase student (#644)', () => {
    beforeEach(() => vi.clearAllMocks());

    it('erases only after confirmation, naming the student', async () => {
        fireEvent.click(await renderArchive());
        expect(await screen.findByText(/admin\.erase_confirm .*Alice/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'common.cancel' }));
        await waitFor(() => expect(screen.queryByText(/admin\.erase_confirm /)).toBeNull());
        expect(eraseStudent).not.toHaveBeenCalled();

        fireEvent.click(screen.getByRole('button', { name: /admin\.erase_btn/ }));
        const dialogButtons = await screen.findAllByRole('button', { name: /admin\.erase_btn/ });
        fireEvent.click(dialogButtons[dialogButtons.length - 1]);
        await waitFor(() => expect(eraseStudent).toHaveBeenCalledWith('s1'));
        await waitFor(() => expect(showToast).toHaveBeenCalledWith('admin.erase_success', 'success'));
    });

    it('explains offline, partial and failed erasures', async () => {
        const run = async () => {
            fireEvent.click(screen.getAllByRole('button', { name: /admin\.erase_btn/ })[0]);
            const buttons = await screen.findAllByRole('button', { name: /admin\.erase_btn/ });
            fireEvent.click(buttons[buttons.length - 1]);
        };
        await renderArchive();

        eraseStudent.mockResolvedValueOnce({ success: false, error: 'offline', leftoverFiles: 0 });
        await run();
        await waitFor(() => expect(showToast).toHaveBeenCalledWith('admin.erase_offline', 'error'));

        eraseStudent.mockResolvedValueOnce({ success: true, leftoverFiles: 2 });
        await run();
        await waitFor(() => expect(showToast).toHaveBeenCalledWith('admin.erase_partial {"n":2}', 'warning'));

        eraseStudent.mockResolvedValueOnce({ success: false, error: 'messages', leftoverFiles: 0 });
        await run();
        await waitFor(() => expect(showToast).toHaveBeenCalledWith('admin.erase_failed {"error":"messages"}', 'error'));
    });
});
