import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { DbUser } from '../../services/database/types';

const users: DbUser[] = [
    { id: 'u-admin', email: 'admin@school.nl', displayName: 'Ada Admin', role: 'admin' } as DbUser,
    { id: 'u-teacher', email: 'teach@school.nl', displayName: 'Tom Teacher', role: 'teacher' } as DbUser,
];

const fetchAllUsers = vi.fn(() => Promise.resolve(users));
const updateUserRole = vi.fn((): Promise<{ success: boolean; error?: string }> => Promise.resolve({ success: true }));
const showToast = vi.fn();

vi.mock('../../context/AppContext', () => {
    const platform = { fetchAllUsers, updateUserRole, getCurrentDatabaseUserId: () => 'u-self' };
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
vi.mock('../../services/database', () => ({ loadSupabaseConfig: vi.fn(() => null), storageSync: {} }));
vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: Record<string, string>) => (opts ? `${key} ${JSON.stringify(opts)}` : key),
        i18n: { language: 'en' },
    }),
    Trans: ({ i18nKey }: { i18nKey: string }) => React.createElement('span', null, i18nKey),
}));

async function renderUsersTab() {
    const { UsersTab } = await import('../AdminPage');
    render(<UsersTab />);
    await screen.findByText('teach@school.nl');
    return screen.getAllByRole('combobox')[1];
}

describe('AdminPage UsersTab role changes (#629)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('asks for confirmation and does nothing when cancelled', async () => {
        const select = await renderUsersTab();
        fireEvent.change(select, { target: { value: 'admin' } });

        expect(await screen.findByText(/admin\.role_change_confirm /)).toHaveTextContent('Tom Teacher');
        fireEvent.click(screen.getByRole('button', { name: 'common.cancel' }));

        await waitFor(() => expect(screen.queryByText(/admin\.role_change_confirm /)).toBeNull());
        expect(updateUserRole).not.toHaveBeenCalled();
    });

    it('changes the role once confirmed', async () => {
        const select = await renderUsersTab();
        fireEvent.change(select, { target: { value: 'admin' } });
        fireEvent.click(await screen.findByRole('button', { name: 'common.confirm' }));

        await waitFor(() => expect(updateUserRole).toHaveBeenCalledWith('u-teacher', 'admin'));
        await waitFor(() => expect(screen.getAllByRole('combobox')[1]).toHaveValue('admin'));
    });

    it('explains the last-admin guard instead of showing the raw database error', async () => {
        updateUserRole.mockResolvedValueOnce({ success: false, error: 'Cannot remove the last admin' });
        await renderUsersTab();
        fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'teacher' } });
        fireEvent.click(await screen.findByRole('button', { name: 'common.confirm' }));

        await waitFor(() => expect(showToast).toHaveBeenCalledWith('admin.role_last_admin', 'error'));
        expect(screen.getAllByRole('combobox')[0]).toHaveValue('admin');
    });
});
