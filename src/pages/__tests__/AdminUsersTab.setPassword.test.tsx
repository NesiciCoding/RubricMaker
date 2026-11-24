import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { DbUser } from '../../services/database/types';

const users: DbUser[] = [
    { id: 'u-teacher', email: 'teach@school.nl', displayName: 'Tom Teacher', role: 'teacher' } as DbUser,
];

const adminSetUserPassword = vi.fn((): Promise<{ success: boolean; error?: string }> =>
    Promise.resolve({ success: true })
);
const showToast = vi.fn();

vi.mock('../../context/AppContext', () => {
    const platform = {
        fetchAllUsers: () => Promise.resolve(users),
        updateUserRole: vi.fn(),
        getCurrentDatabaseUserId: () => 'u-self',
    };
    return {
        usePlatform: () => platform,
        useAuthoring: () => ({}),
        useClasses: () => ({}),
        useGrading: () => ({}),
        useSettings: () => ({}),
        useStudents: () => ({}),
    };
});
vi.mock('../../hooks/useDbStatus', () => ({ useDbStatus: () => ({ isConnected: true }) }));
vi.mock('../../hooks/useToast', () => ({ useToast: () => ({ showToast }) }));
vi.mock('../../services/database', () => ({
    loadSupabaseConfig: vi.fn(() => null),
    storageSync: { adapter: { adminSetUserPassword } },
}));
vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: Record<string, string>) => (opts ? `${key} ${JSON.stringify(opts)}` : key),
        i18n: { language: 'en' },
    }),
    Trans: ({ i18nKey }: { i18nKey: string }) => React.createElement('span', null, i18nKey),
}));

async function openForm() {
    const { UsersTab } = await import('../AdminPage');
    render(<UsersTab />);
    await screen.findByText('teach@school.nl');
    fireEvent.click(screen.getByRole('button', { name: 'admin.set_password' }));
    return screen.getByLabelText('admin.set_password_label');
}

describe('AdminPage UsersTab set password', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('keeps save disabled until the password is 8 to 72 bytes', async () => {
        const input = await openForm();
        const save = screen.getAllByRole('button', { name: 'admin.set_password' })[1];
        expect(save).toBeDisabled();
        fireEvent.change(input, { target: { value: 'short' } });
        expect(save).toBeDisabled();
        fireEvent.change(input, { target: { value: 'a'.repeat(73) } });
        expect(save).toBeDisabled();
        fireEvent.change(input, { target: { value: 'longenough1' } });
        expect(save).toBeEnabled();
    });

    it('calls the RPC with the email, password and confirm flag, then toasts and closes', async () => {
        const input = await openForm();
        fireEvent.change(input, { target: { value: 'longenough1' } });
        fireEvent.click(screen.getByLabelText('admin.set_password_confirm_email'));
        fireEvent.click(screen.getAllByRole('button', { name: 'admin.set_password' })[1]);

        await waitFor(() => expect(adminSetUserPassword).toHaveBeenCalledWith('teach@school.nl', 'longenough1', false));
        await waitFor(() =>
            expect(showToast).toHaveBeenCalledWith(expect.stringContaining('set_password_done'), 'success')
        );
        expect(screen.queryByLabelText('admin.set_password_label')).toBeNull();
    });

    it('shows the error and keeps the form open when the RPC fails', async () => {
        adminSetUserPassword.mockResolvedValueOnce({ success: false, error: 'Not allowed' });
        const input = await openForm();
        fireEvent.change(input, { target: { value: 'longenough1' } });
        fireEvent.click(screen.getAllByRole('button', { name: 'admin.set_password' })[1]);

        await waitFor(() => expect(showToast).toHaveBeenCalledWith(expect.stringContaining('Not allowed'), 'error'));
        expect(screen.getByLabelText('admin.set_password_label')).toBeInTheDocument();
    });
});
