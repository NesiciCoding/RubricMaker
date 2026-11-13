import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
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
        expect(screen.getByText('tooltips.landing_tryout_title')).toBeInTheDocument();
        expect(screen.getByText('tooltips.landing_teacher_title')).toBeInTheDocument();
        expect(screen.getByText('tooltips.landing_student_title')).toBeInTheDocument();
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

    // F3: self-hosted Supabase config was removed from the landing page — cloud
    // sync is connected via Settings → Database. The login buttons' need-config
    // callback now shows a hint instead of opening an inline config form.
    it('shows a cloud hint instead of self-hosted config when login needs configuration', () => {
        render(<PageComp />);
        expect(screen.queryByText('Self-hosted / advanced')).not.toBeInTheDocument();
        expect(screen.queryByPlaceholderText('https://your-project.supabase.co')).not.toBeInTheDocument();
        fireEvent.click(screen.getAllByTestId('login-buttons')[0]);
        expect(screen.getByText(/Cloud sync is not configured on this device/)).toBeInTheDocument();
    });

    it('does not show the cloud hint when cloud sync is already configured', () => {
        mockLoadSupabaseConfig.mockReturnValue({ supabaseUrl: 'https://x.supabase.co', supabaseAnonKey: 'key-1' });
        render(<PageComp />);
        fireEvent.click(screen.getAllByTestId('login-buttons')[0]);
        expect(screen.queryByText(/Cloud sync is not configured on this device/)).not.toBeInTheDocument();
    });
});
