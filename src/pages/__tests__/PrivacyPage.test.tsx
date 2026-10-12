import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { axe } from 'jest-axe';
import PrivacyPage from '../PrivacyPage';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('../../components/Layout/Topbar', () => ({
    default: ({ title }: { title: string }) => <header data-testid="teacher-topbar">{title}</header>,
}));

function renderAt(element: React.ReactElement) {
    const router = createMemoryRouter(
        [
            { path: '/privacy', element },
            { path: '/portal/:id', element: <div>portal home</div> },
        ],
        { initialEntries: ['/privacy'] }
    );
    return render(<RouterProvider router={router} />);
}

describe('PrivacyPage (#619)', () => {
    it('keeps the teacher topbar for teachers', () => {
        renderAt(<PrivacyPage />);
        expect(screen.getByTestId('teacher-topbar')).toBeInTheDocument();
        expect(screen.queryByText('studentPortal.back_to_portal')).toBeNull();
    });

    it('shows students a plain header with a way back to their portal and no teacher chrome', async () => {
        renderAt(<PrivacyPage studentPortalPath="/portal/s1" />);
        expect(screen.queryByTestId('teacher-topbar')).toBeNull();
        expect(screen.getByRole('link', { name: /studentPortal.back_to_portal/ })).toHaveAttribute(
            'href',
            '/portal/s1'
        );
        expect(screen.getByRole('main')).toBeInTheDocument();
        const results = await axe(document.body, { rules: { 'color-contrast': { enabled: false } } });
        expect(results.violations).toEqual([]);
    });

    it('styles external links in the body text colour with an underline', () => {
        renderAt(<PrivacyPage studentPortalPath="/portal/s1" />);
        const external = screen.getAllByRole('link').filter((a) => a.getAttribute('target') === '_blank');
        expect(external.length).toBe(6);
        for (const link of external) {
            expect(link).toHaveStyle({ color: 'var(--text)', textDecoration: 'underline' });
        }
    });
});
