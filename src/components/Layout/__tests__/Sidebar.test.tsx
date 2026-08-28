import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import type { AppSettings } from '../../../types';
import type { StoreData } from '../../../store/storage';
import Sidebar from '../Sidebar';

let mockUserRole: string = 'user';
let mockNotificationCount = 0;
let mockModerationCount = 0;

const makeAppContextMock = (): Partial<StoreData> => ({
    settings: { userRole: mockUserRole } as AppSettings,
    rubrics: [],
    studentRubrics: [
        {
            id: 'sr1',
            rubricId: 'r1',
            studentId: 's1',
            entries: [],
            overallComment: '',
            isPeerReview: false,
            deletedAt: undefined,
        },
    ],
    peerReviews: [],
    students: [],
});

vi.mock('../../../hooks/useNotificationFeed', () => ({
    useNotificationFeed: () => ({ count: mockNotificationCount, items: [] }),
}));

vi.mock('../../../utils/coGradingModerationQueue', () => ({
    getModerationQueue: () => Array.from({ length: mockModerationCount }),
}));
vi.mock('../../../context/AppContext', () => ({
    useRoster: () => makeAppContextMock(),
    useStudents: () => makeAppContextMock(),
    useClasses: () => makeAppContextMock(),
    useGrading: () => makeAppContextMock(),
    useAuthoring: () => makeAppContextMock(),
    useAssessment: () => makeAppContextMock(),
    useEssays: () => makeAppContextMock(),
    useFlashcards: () => makeAppContextMock(),
    useSettings: () => makeAppContextMock(),
    usePlatform: () => makeAppContextMock(),
}));

// Sidebar reads data via the selector store; route selectors to the same mock value.
vi.mock('../../../context/useStore', () => ({
    useStoreSelector: <T,>(selector: (state: StoreData) => T): T => selector(makeAppContextMock() as StoreData),
    useStoreActions: () => makeAppContextMock(),
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
        renderSidebar('/activity-dashboard');
        expect(screen.getByText('navigation.statistics')).toBeInTheDocument();
        expect(screen.getByText('navigation.export')).toBeInTheDocument();
        expect(screen.getByText('navigation.activity_dashboard')).toBeInTheDocument();
    });

    it('shows moderation under Assessments and messages under Students', () => {
        renderSidebar('/moderation');
        expect(screen.getByText('navigation.moderation')).toBeInTheDocument();
        renderSidebar('/messages');
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

    it('keeps a domain highlighted on a footer route with no matching domain', () => {
        renderSidebar('/settings');
        // Footer routes match no domain — the previously-active (Overview) domain stays highlighted
        expect(screen.getByText('navigation.dashboard')).toBeInTheDocument();
    });

    it('shows moderation and notification badges when counts are non-zero', () => {
        mockModerationCount = 2;
        mockNotificationCount = 3;
        renderSidebar('/moderation');
        expect(screen.getByLabelText('sidebar.moderation_pending_badge')).toBeInTheDocument();
        renderSidebar('/notifications');
        expect(screen.getByLabelText('sidebar.notifications_badge')).toBeInTheDocument();
    });

    it('marks the active sub-item and footer links with the active class', () => {
        const { container } = renderSidebar('/statistics');
        const active = container.querySelector('.nav-item.active');
        expect(active).toBeTruthy();
    });

    it('marks docs, privacy, and admin links active when on those routes', () => {
        mockUserRole = 'admin';
        const docs = renderSidebar('/docs');
        expect(docs.container.querySelector('.nav-item.active')).toBeTruthy();
        const admin = renderSidebar('/admin');
        expect(admin.container.querySelector('.nav-item.active')).toBeTruthy();
        const privacy = renderSidebar('/privacy');
        expect(privacy.container.querySelector('.nav-item.active')).toBeTruthy();
    });

    it('calls onMobileClose when a location change happens while the drawer is open', () => {
        const onMobileClose = vi.fn();
        function NavigateLater() {
            const navigate = useNavigate();
            return <button onClick={() => navigate('/rubrics')}>go</button>;
        }
        render(
            <MemoryRouter initialEntries={['/']}>
                <NavigateLater />
                <Sidebar mobileOpen onMobileClose={onMobileClose} />
            </MemoryRouter>
        );
        const callsAfterMount = onMobileClose.mock.calls.length;
        fireEvent.click(screen.getByText('go'));
        // navigating to a new location triggers the effect again
        expect(onMobileClose.mock.calls.length).toBeGreaterThan(callsAfterMount);
    });

    it('applies mobile-open styling when the drawer is open', () => {
        const { container } = render(
            <MemoryRouter initialEntries={['/']}>
                <Sidebar mobileOpen onMobileClose={vi.fn()} />
            </MemoryRouter>
        );
        expect(container.querySelector('.sidebar.mobile-open')).toBeTruthy();
        expect(container.querySelector('.sidebar-backdrop.visible')).toBeTruthy();
    });
});

// The final `?? domains[0]` fallback can never fire: lastDomainKey is always seeded from a valid domain key.
