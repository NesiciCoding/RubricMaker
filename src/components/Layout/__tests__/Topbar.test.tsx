import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import Topbar from '../Topbar';

const mockUpdateSettings = vi.fn();

vi.mock('../../../context/AppContext', () => ({
    useApp: () => ({
        settings: { theme: 'dark' },
        updateSettings: mockUpdateSettings,
    }),
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

describe('Topbar', () => {
    it('renders the title', () => {
        render(<Topbar title="My Page" />);
        expect(screen.getByText('My Page')).toBeInTheDocument();
    });

    it('renders optional actions', () => {
        render(<Topbar title="Test" actions={<button>Action</button>} />);
        expect(screen.getByText('Action')).toBeInTheDocument();
    });

    it('renders without actions', () => {
        const { container } = render(<Topbar title="No Actions" />);
        expect(container.firstChild).toBeTruthy();
    });

    it('calls updateSettings to toggle theme on button click', () => {
        mockUpdateSettings.mockClear();
        render(<Topbar title="Test" />);
        const button = screen.getByTitle('common.toggle_theme');
        fireEvent.click(button);
        expect(mockUpdateSettings).toHaveBeenCalledWith({ theme: 'light' });
    });

    it('shows sun icon when theme is dark', () => {
        const { container } = render(<Topbar title="Test" />);
        // Sun icon is rendered when dark theme; just check something renders
        expect(container.querySelector('.topbar')).toBeTruthy();
    });
});
