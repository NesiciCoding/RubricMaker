import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { DbUser } from '../../services/database/types';
import type { Class, School, Student } from '../../types';

const school: School = { id: 's1', name: 'Alpha School', retentionYears: 3, createdAt: '2026-01-01' };
const member = { id: 'u2', email: 'tom@school.nl', displayName: 'Tom', role: 'teacher', joinedAt: '' } as DbUser & {
    joinedAt: string;
};
const platform = {
    fetchSchools: vi.fn(() => Promise.resolve([school])),
    createSchool: vi.fn((): Promise<School | null> => Promise.resolve(school)),
    updateSchool: vi.fn(() => Promise.resolve({ success: true } as { success: boolean; error?: string })),
    deleteSchool: vi.fn(() => Promise.resolve({ success: true } as { success: boolean; error?: string })),
    fetchSchoolMembers: vi.fn(() => Promise.resolve([member])),
    removeSchoolMember: vi.fn(() => Promise.resolve({ success: true } as { success: boolean; error?: string })),
};
const students: Student[] = [
    { id: 'st1', name: 'Anna', classId: 'c1' },
    { id: 'st2', name: 'Ben', classId: 'c2', email: 'ben@x.nl' },
];
const classes: Class[] = [
    { id: 'c1', name: '1A' },
    { id: 'c2', name: '2B' },
];
const anonymizeStudent = vi.fn();
const deleteStudent = vi.fn();
const showToast = vi.fn();
const dbState = { isConnected: true };

vi.mock('../../context/AppContext', () => ({
    usePlatform: () => platform,
    useAuthoring: () => ({}),
    useClasses: () => ({ classes }),
    useGrading: () => ({}),
    useSettings: () => ({}),
    useStudents: () => ({ students, anonymizeStudent, deleteStudent }),
}));
vi.mock('../../hooks/useDbStatus', () => ({ useDbStatus: () => dbState }));
vi.mock('../../hooks/useToast', () => ({ useToast: () => ({ showToast }) }));
vi.mock('../../services/database', () => ({ loadSupabaseConfig: vi.fn(() => null), storageSync: {} }));
vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: Record<string, string>) => (opts ? `${key} ${JSON.stringify(opts)}` : key),
        i18n: { language: 'en' },
    }),
    Trans: ({ i18nKey }: { i18nKey: string }) => React.createElement('span', null, i18nKey),
}));

async function confirmDialog() {
    fireEvent.click(await screen.findByRole('button', { name: /admin\.btn_remove_member|common\.confirm/ }));
}

describe('AdminPage SchoolsTab feedback (#634, #630)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        dbState.isConnected = true;
    });

    async function renderSchools() {
        const { SchoolsTab } = await import('../AdminPage');
        render(<SchoolsTab />);
        await screen.findByText('Alpha School');
    }

    it('reports a saved retention period, and a refused one as an error', async () => {
        await renderSchools();
        const retention = screen.getAllByRole('spinbutton').at(-1)!;
        fireEvent.change(retention, { target: { value: '5' } });
        fireEvent.click(screen.getByText('admin.btn_save'));
        await waitFor(() => expect(showToast).toHaveBeenCalledWith('admin.retention_saved', 'success'));

        platform.updateSchool.mockResolvedValueOnce({ success: false, error: 'school_not_changed' });
        fireEvent.change(retention, { target: { value: '6' } });
        fireEvent.click(screen.getByText('admin.btn_save'));
        await waitFor(() => expect(showToast).toHaveBeenCalledWith('admin.retention_save_failed', 'error'));
    });

    it('shows skeleton rows for the school list and the expanded member list', async () => {
        let resolveSchools: (value: School[]) => void = () => {};
        platform.fetchSchools.mockReturnValueOnce(
            new Promise((res) => {
                resolveSchools = res;
            })
        );
        const { SchoolsTab } = await import('../AdminPage');
        render(<SchoolsTab />);
        const schoolsStatus = screen.getByRole('status', { name: 'admin.schools_loading' });
        expect(schoolsStatus.querySelectorAll('.skeleton').length).toBeGreaterThan(0);
        resolveSchools([school]);
        await screen.findByText('Alpha School');

        let resolveMembers: (value: (DbUser & { joinedAt: string })[]) => void = () => {};
        platform.fetchSchoolMembers.mockReturnValueOnce(
            new Promise((res) => {
                resolveMembers = res;
            })
        );
        fireEvent.click(screen.getByLabelText('admin.btn_expand_members'));
        expect(await screen.findByRole('status', { name: 'admin.members_loading' })).toBeInTheDocument();
        resolveMembers([member]);
        expect(await screen.findByText('admin.btn_remove_member')).toBeInTheDocument();
    });

    it('confirms before removing a member and reports the result', async () => {
        await renderSchools();
        fireEvent.click(screen.getByLabelText('admin.btn_expand_members'));
        fireEvent.click(await screen.findByText('admin.btn_remove_member'));
        expect(await screen.findByText(/admin\.remove_member_confirm /)).toHaveTextContent('Tom');
        expect(platform.removeSchoolMember).not.toHaveBeenCalled();

        const buttons = screen.getAllByRole('button', { name: 'admin.btn_remove_member' });
        fireEvent.click(buttons[buttons.length - 1]);
        await waitFor(() => expect(platform.removeSchoolMember).toHaveBeenCalledWith('s1', 'u2'));
        await waitFor(() => expect(showToast).toHaveBeenCalledWith('admin.member_removed', 'success'));
        expect(screen.getByText('admin.role_teacher')).toBeInTheDocument();
    });

    it('reports failed create and delete', async () => {
        platform.createSchool.mockResolvedValueOnce(null);
        platform.deleteSchool.mockResolvedValueOnce({ success: false, error: 'school_not_changed' });
        await renderSchools();
        fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: 'Beta' } });
        fireEvent.click(screen.getByText('admin.btn_create_school'));
        await waitFor(() => expect(showToast).toHaveBeenCalledWith('admin.school_create_failed', 'error'));

        fireEvent.click(screen.getByLabelText('admin.btn_delete'));
        await confirmDialog();
        await waitFor(() => expect(showToast).toHaveBeenCalledWith('admin.school_delete_failed', 'error'));
    });
});

describe('AdminPage DataTab and RetentionTab (#634)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        dbState.isConnected = true;
    });

    it('filters students by class and search, and reports anonymize/delete', async () => {
        const { DataTab } = await import('../AdminPage');
        render(<DataTab />);
        expect(screen.getByText('Anna')).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText('admin.data_class_filter'), { target: { value: 'c2' } });
        expect(screen.queryByText('Anna')).toBeNull();
        expect(screen.getByText('Ben')).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText('admin.data_search_placeholder'), { target: { value: 'zzz' } });
        expect(screen.getByText('admin.data_no_results')).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText('admin.data_search_placeholder'), { target: { value: 'ben@' } });

        fireEvent.click(screen.getByText('admin.anonymize_btn'));
        await confirmDialog();
        await waitFor(() => expect(anonymizeStudent).toHaveBeenCalledWith('st2'));
        expect(showToast).toHaveBeenCalledWith('admin.anonymize_done', 'success');

        fireEvent.click(screen.getByLabelText('admin.delete_student_btn'));
        await confirmDialog();
        await waitFor(() => expect(deleteStudent).toHaveBeenCalledWith('st2'));
        expect(showToast).toHaveBeenCalledWith('admin.delete_student_done', 'success');
    });

    it('says retention is not automatic in local mode', async () => {
        const { RetentionTab } = await import('../AdminPage');
        dbState.isConnected = false;
        const { unmount } = render(<RetentionTab />);
        expect(screen.getByText('admin.retention_desc_local')).toBeInTheDocument();
        unmount();
        dbState.isConnected = true;
        render(<RetentionTab />);
        expect(screen.getByText('admin.retention_desc')).toBeInTheDocument();
    });
});
