import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import AccountPasswordCard from '../AccountPasswordCard';

const mocks = vi.hoisted(() => ({
    isConnected: true,
    isAnonymous: false,
    updateMyPassword: vi.fn(),
    showToast: vi.fn(),
}));

vi.mock('../../../services/database', () => ({
    storageSync: {
        adapter: {
            isAnonymousSession: () => mocks.isAnonymous,
            updateMyPassword: mocks.updateMyPassword,
        },
    },
}));

vi.mock('../../../hooks/useDbStatus', () => ({
    useDbStatus: () => ({ isConnected: mocks.isConnected }),
}));

vi.mock('../../../hooks/useToast', () => ({
    useToast: () => ({ showToast: mocks.showToast }),
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

function fill(password: string, confirm: string) {
    fireEvent.change(screen.getByLabelText('settings.account_password_new'), { target: { value: password } });
    fireEvent.change(screen.getByLabelText('settings.account_password_confirm'), { target: { value: confirm } });
    fireEvent.click(screen.getByRole('button', { name: 'settings.account_password_save' }));
}

beforeEach(() => {
    mocks.isConnected = true;
    mocks.isAnonymous = false;
    mocks.updateMyPassword.mockReset().mockResolvedValue({});
    mocks.showToast.mockReset();
});

describe('AccountPasswordCard', () => {
    it('renders nothing when there is no cloud connection', () => {
        mocks.isConnected = false;
        const { container } = render(<AccountPasswordCard />);
        expect(container).toBeEmptyDOMElement();
    });

    it('renders nothing for an anonymous session', () => {
        mocks.isAnonymous = true;
        const { container } = render(<AccountPasswordCard />);
        expect(container).toBeEmptyDOMElement();
    });

    it('rejects a password that is too short', () => {
        render(<AccountPasswordCard />);
        fill('short', 'short');
        expect(screen.getByRole('alert')).toHaveTextContent('settings.account_password_too_short');
        expect(mocks.updateMyPassword).not.toHaveBeenCalled();
    });

    it('rejects mismatched passwords', () => {
        render(<AccountPasswordCard />);
        fill('longenough1', 'longenough2');
        expect(screen.getByRole('alert')).toHaveTextContent('settings.account_password_mismatch');
        expect(mocks.updateMyPassword).not.toHaveBeenCalled();
    });

    it('saves the password, clears the fields and shows a toast', async () => {
        render(<AccountPasswordCard />);
        fill('longenough1', 'longenough1');
        await waitFor(() => expect(mocks.showToast).toHaveBeenCalledWith('settings.account_password_saved', 'success'));
        expect(mocks.updateMyPassword).toHaveBeenCalledWith('longenough1');
        expect(screen.getByLabelText('settings.account_password_new')).toHaveValue('');
    });

    it('translates known Supabase error codes', async () => {
        mocks.updateMyPassword.mockResolvedValue({ error: 'Password is too weak', code: 'weak_password' });
        render(<AccountPasswordCard />);
        fill('longenough1', 'longenough1');
        expect(await screen.findByRole('alert')).toHaveTextContent('auth.errors.weak_password');
    });

    it('falls back to the raw message for unknown errors', async () => {
        mocks.updateMyPassword.mockResolvedValue({ error: 'Something odd' });
        render(<AccountPasswordCard />);
        fill('longenough1', 'longenough1');
        expect(await screen.findByRole('alert')).toHaveTextContent('Something odd');
    });
});
