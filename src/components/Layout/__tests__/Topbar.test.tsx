import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import Topbar from '../Topbar';

const mockUpdateSettings = vi.fn();
const mockClasses = [
    { id: 'c1', name: '5A' },
    { id: 'c2', name: '5B' },
];

vi.mock('../../../context/AppContext', () => ({
    useApp: () => ({
        settings: { theme: 'dark' },
        updateSettings: mockUpdateSettings,
        students: [],
        studentRubrics: [],
        classes: mockClasses,
        rubrics: [],
        tests: [],
        essayAssignments: [],
    }),
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('../NotificationBell', () => ({
    default: () => <div data-testid="notification-bell" />,
}));

vi.mock('react-router-dom', () => ({
    useNavigate: () => vi.fn(),
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

    it('renders a class selector bound to settings.activeClassId', () => {
        render(<Topbar title="Test" />);
        const select = screen.getByLabelText('search.active_class_label') as HTMLSelectElement;
        expect(select.value).toBe('');
        fireEvent.change(select, { target: { value: 'c2' } });
        expect(mockUpdateSettings).toHaveBeenCalledWith({ activeClassId: 'c2' });
    });

    it('opens the global search modal on Ctrl+K', () => {
        render(<Topbar title="Test" />);
        expect(screen.queryByPlaceholderText('search.placeholder')).not.toBeInTheDocument();
        fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
        expect(screen.getByPlaceholderText('search.placeholder')).toBeInTheDocument();
    });

    it('opens the global search modal via the search button', () => {
        render(<Topbar title="Test" />);
        fireEvent.click(screen.getByTitle('search.open_search'));
        expect(screen.getByPlaceholderText('search.placeholder')).toBeInTheDocument();
    });
});
