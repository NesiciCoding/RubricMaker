import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import Sidebar from '../Sidebar';

let mockUserRole: string = 'user';

vi.mock('../../../context/AppContext', () => ({
    useApp: () => ({
        settings: { userRole: mockUserRole },
    }),
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
    }),
}));

function renderSidebar(initialRoute = '/') {
    return render(
        <MemoryRouter initialEntries={[initialRoute]}>
            <Sidebar />
        </MemoryRouter>
    );
}

describe('Sidebar', () => {
    beforeEach(() => {
        mockUserRole = 'user';
    });

    it('renders the domain rail', () => {
        renderSidebar();
        expect(screen.getAllByText('sidebar.domain_overview').length).toBeGreaterThan(0);
        expect(screen.getByText('sidebar.domain_assessments')).toBeInTheDocument();
        expect(screen.getByText('sidebar.domain_students')).toBeInTheDocument();
        expect(screen.getByText('sidebar.domain_insights')).toBeInTheDocument();
        expect(screen.getByText('sidebar.domain_library')).toBeInTheDocument();
    });

    it('shows the Overview domain sub-items by default at /', () => {
        renderSidebar('/');
        expect(screen.getByText('navigation.dashboard')).toBeInTheDocument();
    });

    it('shows the Insights domain sub-items including Activity Dashboard', () => {
        renderSidebar('/statistics');
        expect(screen.getByText('navigation.statistics')).toBeInTheDocument();
        expect(screen.getByText('navigation.export')).toBeInTheDocument();
        expect(screen.getByText('navigation.activity_dashboard')).toBeInTheDocument();
    });

    it('shows moderation under Assessments and messages under Students', () => {
        renderSidebar('/rubrics');
        expect(screen.getByText('navigation.moderation')).toBeInTheDocument();
        renderSidebar('/students');
        expect(screen.getByText('navigation.messages')).toBeInTheDocument();
    });

    it('shows the Assessments domain sub-items when on a rubrics route', () => {
        renderSidebar('/rubrics');
        expect(screen.getByText('navigation.rubrics')).toBeInTheDocument();
        expect(screen.getByText('navigation.tests')).toBeInTheDocument();
        expect(screen.getByText('navigation.essays')).toBeInTheDocument();
        expect(screen.getByText('navigation.marketplace')).toBeInTheDocument();
    });

    it('shows the Students domain sub-items when on a students route', () => {
        renderSidebar('/students');
        expect(screen.getByText('navigation.students')).toBeInTheDocument();
        expect(screen.getByText('navigation.cefr_overview')).toBeInTheDocument();
        expect(screen.getByText('navigation.vocabulary')).toBeInTheDocument();
    });

    it('renders settings nav link', () => {
        renderSidebar();
        expect(screen.getByText('common.settings')).toBeInTheDocument();
    });

    it('hides admin link for non-admin user', () => {
        mockUserRole = 'user';
        renderSidebar();
        expect(screen.queryByText('admin.title')).toBeNull();
    });

    it('shows admin link for admin user', () => {
        mockUserRole = 'admin';
        renderSidebar();
        expect(screen.getByText('admin.title')).toBeInTheDocument();
    });
});
