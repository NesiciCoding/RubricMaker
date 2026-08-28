import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockEnterLocalMode = vi.fn();
const mockConnectForOAuth = vi.fn();
const mockLoadSupabaseConfig = vi.fn();

vi.mock('../../context/AppContext', () => ({
    usePlatform: () => ({
        enterLocalMode: mockEnterLocalMode,
        connectForOAuth: mockConnectForOAuth,
    }),
}));

vi.mock('../../services/database/supabaseConfig', () => ({
    loadSupabaseConfig: mockLoadSupabaseConfig,
}));

vi.mock('../../components/auth/LoginButtons', () => ({
    default: ({ onNeedConfig }: { onNeedConfig: () => void }) =>
        React.createElement('button', { onClick: onNeedConfig, 'data-testid': 'login-buttons' }, 'login-buttons'),
}));

let PageComp: React.ComponentType;

describe('LandingPage coverage', () => {
    beforeEach(async () => {
        mockEnterLocalMode.mockClear();
        mockConnectForOAuth.mockReset();
        mockConnectForOAuth.mockResolvedValue(true);
        mockLoadSupabaseConfig.mockReset();
        mockLoadSupabaseConfig.mockReturnValue(null);
        const mod = await import('../LandingPage');
        PageComp = mod.default;
    });

    it('renders the landing page and enters local mode', () => {
        render(<PageComp />);
        expect(screen.getByText('Try-out / Offline')).toBeInTheDocument();
        expect(screen.getByText('Teacher Login')).toBeInTheDocument();
        expect(screen.getByText('Student Login')).toBeInTheDocument();
        expect(screen.getByText("What's included")).toBeInTheDocument();
        expect(screen.getByText('For teachers')).toBeInTheDocument();
        expect(screen.getByText('For students')).toBeInTheDocument();
        // Feature titles from both groups.
        expect(screen.getByText('Rubric Builder')).toBeInTheDocument();
        expect(screen.getByText('View Feedback')).toBeInTheDocument();
        // Offline notice + privacy link.
        expect(screen.getByText('Privacy statement')).toBeInTheDocument();
        // Enter local mode.
        fireEvent.click(screen.getByText('Continue without account'));
        expect(mockEnterLocalMode).toHaveBeenCalled();
    });

    it('configures a custom Supabase instance successfully', async () => {
        mockLoadSupabaseConfig.mockReturnValue({ supabaseUrl: 'https://x.supabase.co', supabaseAnonKey: 'key-1' });
        render(<PageComp />);
        // Advanced config starts closed; open it.
        fireEvent.click(screen.getByText('Self-hosted / advanced'));
        expect(screen.getByPlaceholderText('https://your-project.supabase.co')).toHaveValue('https://x.supabase.co');
        fireEvent.change(screen.getByPlaceholderText('https://your-project.supabase.co'), {
            target: { value: ' https://y.supabase.co ' },
        });
        fireEvent.change(screen.getByPlaceholderText('anon key (eyJhbGci…)'), { target: { value: 'key-2' } });
        fireEvent.click(screen.getByText('Use this Supabase instance'));
        await waitFor(() =>
            expect(mockConnectForOAuth).toHaveBeenCalledWith({
                supabaseUrl: 'https://y.supabase.co',
                supabaseAnonKey: 'key-2',
            })
        );
    });

    it('shows the connecting state while configuring and reports failures', async () => {
        let resolveConnect: (v: boolean) => void = () => undefined;
        mockConnectForOAuth.mockReturnValue(
            new Promise<boolean>((res) => {
                resolveConnect = res;
            })
        );
        render(<PageComp />);
        fireEvent.click(screen.getByText('Self-hosted / advanced'));
        fireEvent.change(screen.getByPlaceholderText('https://your-project.supabase.co'), {
            target: { value: 'https://y.supabase.co' },
        });
        fireEvent.change(screen.getByPlaceholderText('anon key (eyJhbGci…)'), { target: { value: 'key-2' } });
        fireEvent.click(screen.getByText('Use this Supabase instance'));
        // Pending → the connecting label shows and the button is disabled.
        expect(screen.getByText('Connecting…')).toBeInTheDocument();
        expect((screen.getByText('Connecting…').closest('button') as HTMLButtonElement).disabled).toBe(true);
        await waitFor(() => resolveConnect(false));
        expect(await screen.findByText('Could not connect — check the URL and key.')).toBeInTheDocument();
    });

    it('validates empty fields in the advanced config', () => {
        render(<PageComp />);
        fireEvent.click(screen.getByText('Self-hosted / advanced'));
        // Whitespace-only values pass the disabled check but fail the trim validation.
        fireEvent.change(screen.getByPlaceholderText('https://your-project.supabase.co'), {
            target: { value: '   ' },
        });
        fireEvent.change(screen.getByPlaceholderText('anon key (eyJhbGci…)'), { target: { value: '  ' } });
        fireEvent.click(screen.getByText('Use this Supabase instance'));
        expect(screen.getByText('Both fields are required.')).toBeInTheDocument();
        expect(mockConnectForOAuth).not.toHaveBeenCalled();
    });

    it('opens the advanced config from the login buttons need-config callback', () => {
        render(<PageComp />);
        expect(screen.queryByPlaceholderText('https://your-project.supabase.co')).not.toBeInTheDocument();
        // Both the teacher and student login cards expose the need-config callback;
        // the shared advanced-config state opens the single instance in the teacher card.
        fireEvent.click(screen.getAllByTestId('login-buttons')[0]);
        fireEvent.click(screen.getAllByTestId('login-buttons')[1]);
        expect(screen.getAllByPlaceholderText('https://your-project.supabase.co').length).toBe(1);
    });
});
