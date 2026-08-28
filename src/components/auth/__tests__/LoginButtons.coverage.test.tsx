import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import LoginButtons from '../LoginButtons';

const mockLoadDb = vi.hoisted(() => vi.fn());

vi.mock('../../../services/database/lazyDb', () => ({ loadDb: mockLoadDb }));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
        i18n: { language: 'en' },
    }),
}));

function makeStorageSync(overrides: Record<string, unknown> = {}) {
    return {
        adapter: {
            fetchAuthProviders: vi.fn(() => Promise.resolve(null)),
            signInWithEmail: vi.fn(() => Promise.resolve({ error: null })),
            verifyOtp: vi.fn(() => Promise.resolve({ error: null })),
            signInWithPassword: vi.fn(() => Promise.resolve({ error: null })),
            ...(overrides.adapter as Record<string, unknown> | undefined),
        },
        signInWithGoogle: vi.fn(() => Promise.resolve({ error: null })),
        signInWithMicrosoftPersonal: vi.fn(() => Promise.resolve({ error: null })),
        signInWithAzureAD: vi.fn(() => Promise.resolve({ error: null })),
    };
}

beforeEach(() => {
    mockLoadDb.mockReset();
});

describe('LoginButtons coverage', () => {
    it('logs an error when the provider list fetch fails', async () => {
        const storageSync = makeStorageSync({
            adapter: { fetchAuthProviders: vi.fn(() => Promise.reject(new Error('db down'))) },
        });
        mockLoadDb.mockResolvedValue({ storageSync });
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        render(<LoginButtons supabaseReady />);
        await waitFor(() => expect(errorSpy).toHaveBeenCalled());
        errorSpy.mockRestore();
    });

    it('shows the module-load error when OAuth throws', async () => {
        mockLoadDb.mockRejectedValue(new Error('module failed'));
        render(<LoginButtons supabaseReady />);
        fireEvent.click(screen.getByRole('button', { name: /sign in with google/i }));
        expect(await screen.findByText('toast.sign_in_module_load_failed')).toBeInTheDocument();
    });

    it('shows the module-load error when sending the OTP throws', async () => {
        mockLoadDb.mockRejectedValue(new Error('module failed'));
        render(<LoginButtons supabaseReady />);
        fireEvent.click(screen.getByRole('button', { name: /sign in with email/i }));
        fireEvent.change(screen.getByPlaceholderText(/your@email/i), { target: { value: 'a@b.com' } });
        fireEvent.click(screen.getByRole('button', { name: /send login code/i }));
        expect(await screen.findByText('toast.sign_in_module_load_failed')).toBeInTheDocument();
    });

    it('shows the module-load error when verifying the OTP throws', async () => {
        const storageSync = makeStorageSync();
        mockLoadDb.mockResolvedValue({ storageSync });
        render(<LoginButtons supabaseReady />);
        fireEvent.click(screen.getByRole('button', { name: /sign in with email/i }));
        fireEvent.change(screen.getByPlaceholderText(/your@email/i), { target: { value: 'a@b.com' } });
        fireEvent.click(screen.getByRole('button', { name: /send login code/i }));
        await waitFor(() => expect(storageSync.adapter.signInWithEmail).toHaveBeenCalled());
        fireEvent.change(screen.getByPlaceholderText('12345678'), { target: { value: '12345678' } });
        mockLoadDb.mockRejectedValue(new Error('module failed'));
        fireEvent.click(screen.getByRole('button', { name: /verify code/i }));
        expect(await screen.findByText('toast.sign_in_module_load_failed')).toBeInTheDocument();
    });

    it('requires email and password before the student password login', async () => {
        const storageSync = makeStorageSync();
        mockLoadDb.mockResolvedValue({ storageSync });
        render(<LoginButtons supabaseReady />);
        fireEvent.click(screen.getByRole('button', { name: /student login \(password\)/i }));
        const passwordInput = screen.getByPlaceholderText('Password');
        const emailInput = screen.getByPlaceholderText(/your@email/i);

        // Empty email AND empty password → both validation branches.
        fireEvent.keyDown(passwordInput, { key: 'Enter' });
        expect(screen.getByText('Enter your email and password.')).toBeInTheDocument();

        // Non-Enter key does not trigger login.
        fireEvent.keyDown(passwordInput, { key: 'Tab' });
        expect(storageSync.adapter.signInWithPassword).not.toHaveBeenCalled();

        // Email filled, password still empty → right operand of the validation.
        fireEvent.change(emailInput, { target: { value: 'student@school.com' } });
        fireEvent.keyDown(passwordInput, { key: 'Enter' });
        expect(screen.getByText('Enter your email and password.')).toBeInTheDocument();
        expect(storageSync.adapter.signInWithPassword).not.toHaveBeenCalled();
    });

    it('routes to config when student login is attempted while supabase is not ready', async () => {
        const onNeedConfig = vi.fn();
        render(<LoginButtons supabaseReady={false} onNeedConfig={onNeedConfig} />);
        fireEvent.click(screen.getByRole('button', { name: /student login \(password\)/i }));
        fireEvent.change(screen.getByPlaceholderText(/your@email/i), { target: { value: 's@school.com' } });
        fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'secret' } });
        fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
        expect(onNeedConfig).toHaveBeenCalled();
    });

    it('signs in a student via password with a returned error', async () => {
        const storageSync = makeStorageSync({
            adapter: { signInWithPassword: vi.fn(() => Promise.resolve({ error: 'Bad password' })) },
        });
        mockLoadDb.mockResolvedValue({ storageSync });
        render(<LoginButtons supabaseReady />);
        fireEvent.click(screen.getByRole('button', { name: /student login \(password\)/i }));
        fireEvent.change(screen.getByPlaceholderText(/your@email/i), { target: { value: 's@school.com' } });
        fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'wrong' } });
        fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
        expect(await screen.findByText('Bad password')).toBeInTheDocument();
        expect(storageSync.adapter.signInWithPassword).toHaveBeenCalledWith('s@school.com', 'wrong');
    });

    it('signs in a student via password successfully and calls onEmailSuccess', async () => {
        const storageSync = makeStorageSync();
        mockLoadDb.mockResolvedValue({ storageSync });
        const onEmailSuccess = vi.fn();
        render(<LoginButtons supabaseReady onEmailSuccess={onEmailSuccess} />);
        fireEvent.click(screen.getByRole('button', { name: /student login \(password\)/i }));
        fireEvent.change(screen.getByPlaceholderText(/your@email/i), { target: { value: 's@school.com' } });
        fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'secret' } });
        fireEvent.keyDown(screen.getByPlaceholderText('Password'), { key: 'Enter' });
        await waitFor(() => expect(onEmailSuccess).toHaveBeenCalled());
        expect(screen.getByText(/Signed in/)).toBeInTheDocument();
    });

    it('shows the module-load error when the student password login throws', async () => {
        mockLoadDb.mockRejectedValue(new Error('module failed'));
        render(<LoginButtons supabaseReady />);
        fireEvent.click(screen.getByRole('button', { name: /student login \(password\)/i }));
        fireEvent.change(screen.getByPlaceholderText(/your@email/i), { target: { value: 's@school.com' } });
        fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'secret' } });
        fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
        expect(await screen.findByText('toast.sign_in_module_load_failed')).toBeInTheDocument();
    });

    it('toggles the student login panel closed and clears inputs', () => {
        const storageSync = makeStorageSync();
        mockLoadDb.mockResolvedValue({ storageSync });
        render(<LoginButtons supabaseReady />);
        const toggle = screen.getByRole('button', { name: /student login \(password\)/i });
        fireEvent.click(toggle);
        expect(screen.getByPlaceholderText('Password')).toBeInTheDocument();
        fireEvent.click(toggle);
        expect(screen.queryByPlaceholderText('Password')).not.toBeInTheDocument();
    });
});
