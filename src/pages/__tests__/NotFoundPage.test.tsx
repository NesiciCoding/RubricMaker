import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import NotFoundPage from '../NotFoundPage';

const mockNavigate = vi.fn();
let mockLocationKey = 'default';

vi.mock('react-router-dom', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react-router-dom')>();
    return {
        ...actual,
        useNavigate: () => mockNavigate,
        useLocation: () => ({ pathname: '/nowhere/stale-link', key: mockLocationKey }),
    };
});

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));

vi.mock('../../components/Layout/Topbar', () => ({ default: () => null }));

function renderPage() {
    return render(
        <MemoryRouter initialEntries={['/nowhere/stale-link']}>
            <NotFoundPage />
        </MemoryRouter>
    );
}

beforeEach(() => {
    mockNavigate.mockClear();
    mockLocationKey = 'default';
});

describe('NotFoundPage', () => {
    it('shows the requested path and links back into the app', () => {
        renderPage();

        expect(screen.getByText('/nowhere/stale-link')).toBeInTheDocument();
        expect(screen.getByText('notFound.quick_links')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'navigation.rubrics' })).toHaveAttribute('href', '/rubrics');
        expect(screen.getByRole('link', { name: 'navigation.students' })).toHaveAttribute('href', '/students');
        expect(screen.getByRole('link', { name: 'navigation.docs' })).toHaveAttribute('href', '/docs');
    });

    it('goes home instead of stepping back when the page was opened directly', () => {
        renderPage();

        fireEvent.click(screen.getByRole('button', { name: 'notFound.go_back' }));

        expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true });
    });

    it('steps back through history when there is history to step through', () => {
        mockLocationKey = 'abc123';
        renderPage();

        fireEvent.click(screen.getByRole('button', { name: 'notFound.go_back' }));

        expect(mockNavigate).toHaveBeenCalledWith(-1);
    });
});
