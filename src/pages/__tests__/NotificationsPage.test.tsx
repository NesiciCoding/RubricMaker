import React from 'react';
import { screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithRouter } from '../../test-utils/renderWithProviders';
import type {
    OverdueGradingNotification,
    UnreadMessageNotification,
    ModerationPendingNotification,
} from '../../hooks/useNotificationFeed';

const overdueItem: OverdueGradingNotification = {
    id: 'overdue_grading:s1',
    type: 'overdue_grading',
    entityId: 's1',
    studentId: 's1',
    studentName: 'Alice',
    daysSince: 10,
    fingerprint: '2024-01-01T00:00:00Z',
    sortKey: '2024-01-01T00:00:00Z',
};

const messageItem: UnreadMessageNotification = {
    id: 'unread_message:s2__general__',
    type: 'unread_message',
    studentId: 's2',
    studentName: 'Bob',
    unreadCount: 2,
    thread: {
        studentId: 's2',
        contextType: 'general',
        contextId: null,
        contextLabel: null,
        messages: [],
        lastMessage: {
            id: 'm1',
            studentId: 's2',
            contextType: 'general',
            contextId: null,
            contextLabel: null,
            sender: 'student',
            body: 'hi',
            createdAt: '2024-01-02T00:00:00Z',
            readByTeacher: false,
            readByStudent: true,
        },
        unreadByTeacher: 2,
        unreadByStudent: 0,
    },
    sortKey: '2024-01-02T00:00:00Z',
};

const moderationItem: ModerationPendingNotification = {
    id: 'moderation_pending:sr-second',
    type: 'moderation_pending',
    entityId: 'sr-second',
    studentId: 's3',
    studentName: 'Cleo',
    pendingDays: 4,
    fingerprint: '2024-01-03T00:00:00Z',
    sortKey: '2024-01-03T00:00:00Z',
};

const mockDismiss = vi.fn();
const mockDismissAll = vi.fn();
const mockMarkThreadRead = vi.fn();
const mockNavigate = vi.fn();

let mockFeed: {
    items: unknown[];
    overdueItems: OverdueGradingNotification[];
    messageItems: UnreadMessageNotification[];
    moderationItems: ModerationPendingNotification[];
};

vi.mock('../../hooks/useNotificationFeed', () => ({
    useNotificationFeed: () => ({
        ...mockFeed,
        threshold: 7,
        count: mockFeed.items.length,
        dismiss: mockDismiss,
        dismissAll: mockDismissAll,
        markThreadRead: mockMarkThreadRead,
        markAllMessagesRead: vi.fn(),
    }),
}));

// Topbar (rendered by NotificationsPage) reads settings/classes off the domain hooks directly.
const makeAppContextMock = () => ({
    settings: { theme: 'dark', language: 'en' },
    updateSettings: vi.fn(),
    classes: [],
});
vi.mock('../../context/AppContext', () => ({
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

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key),
        i18n: { language: 'en' },
    }),
}));

describe('NotificationsPage', () => {
    beforeEach(() => {
        mockFeed = { items: [], overdueItems: [], messageItems: [], moderationItems: [] };
        mockDismiss.mockClear();
        mockDismissAll.mockClear();
        mockMarkThreadRead.mockClear();
        mockNavigate.mockClear();
    });

    it('shows the empty state when there are no notifications', async () => {
        const { default: NotificationsPage } = await import('../NotificationsPage');
        renderWithRouter(<NotificationsPage />);
        expect(screen.getByText('notifications.empty_desc')).toBeInTheDocument();
    });

    it('lists items from all three sources', async () => {
        mockFeed = {
            items: [overdueItem, messageItem, moderationItem],
            overdueItems: [overdueItem],
            messageItems: [messageItem],
            moderationItems: [moderationItem],
        };
        const { default: NotificationsPage } = await import('../NotificationsPage');
        renderWithRouter(<NotificationsPage />);
        expect(screen.getByText('Alice')).toBeInTheDocument();
        expect(screen.getByText('Bob')).toBeInTheDocument();
        expect(screen.getByText('Cleo')).toBeInTheDocument();
    });

    it('filters to only the selected type', async () => {
        mockFeed = {
            items: [overdueItem, messageItem],
            overdueItems: [overdueItem],
            messageItems: [messageItem],
            moderationItems: [],
        };
        const { default: NotificationsPage } = await import('../NotificationsPage');
        renderWithRouter(<NotificationsPage />);
        fireEvent.click(screen.getByText('notifications.filter_unread_message'));
        expect(screen.queryByText('Alice')).not.toBeInTheDocument();
        expect(screen.getByText('Bob')).toBeInTheDocument();
    });

    it('navigates to the student profile when viewing an overdue-grading item', async () => {
        mockFeed = { items: [overdueItem], overdueItems: [overdueItem], messageItems: [], moderationItems: [] };
        const { default: NotificationsPage } = await import('../NotificationsPage');
        renderWithRouter(<NotificationsPage />);
        fireEvent.click(screen.getByText('notifications.action_view'));
        expect(mockNavigate).toHaveBeenCalledWith('/students/s1');
    });

    it('dismisses an overdue-grading item', async () => {
        mockFeed = { items: [overdueItem], overdueItems: [overdueItem], messageItems: [], moderationItems: [] };
        const { default: NotificationsPage } = await import('../NotificationsPage');
        renderWithRouter(<NotificationsPage />);
        fireEvent.click(screen.getByText('notifications.action_dismiss'));
        expect(mockDismiss).toHaveBeenCalledWith(overdueItem);
    });

    it('marks a message thread read instead of dismissing it', async () => {
        mockFeed = { items: [messageItem], overdueItems: [], messageItems: [messageItem], moderationItems: [] };
        const { default: NotificationsPage } = await import('../NotificationsPage');
        renderWithRouter(<NotificationsPage />);
        expect(screen.queryByText('notifications.action_dismiss')).not.toBeInTheDocument();
        fireEvent.click(screen.getByText('notifications.action_mark_read'));
        expect(mockMarkThreadRead).toHaveBeenCalledWith(messageItem);
    });

    it('clear-all on the overdue filter only dismisses overdue items, not messages', async () => {
        mockFeed = {
            items: [overdueItem, messageItem],
            overdueItems: [overdueItem],
            messageItems: [messageItem],
            moderationItems: [],
        };
        const { default: NotificationsPage } = await import('../NotificationsPage');
        renderWithRouter(<NotificationsPage />);
        fireEvent.click(screen.getByText('notifications.filter_overdue_grading'));
        fireEvent.click(screen.getByText('notifications.clear_all'));
        expect(mockDismissAll).toHaveBeenCalledWith('overdue_grading');
        expect(mockDismissAll).not.toHaveBeenCalledWith('moderation_pending');
        expect(mockMarkThreadRead).not.toHaveBeenCalled();
    });

    it('clear-all under the "all" filter never marks messages read', async () => {
        mockFeed = {
            items: [overdueItem, messageItem, moderationItem],
            overdueItems: [overdueItem],
            messageItems: [messageItem],
            moderationItems: [moderationItem],
        };
        const { default: NotificationsPage } = await import('../NotificationsPage');
        renderWithRouter(<NotificationsPage />);
        fireEvent.click(screen.getByText('notifications.clear_all'));
        expect(mockDismissAll).toHaveBeenCalledWith('overdue_grading');
        expect(mockDismissAll).toHaveBeenCalledWith('moderation_pending');
        expect(mockMarkThreadRead).not.toHaveBeenCalled();
    });

    it('hides the clear-all button on the messages-only filter, since nothing there is bulk-dismissible', async () => {
        mockFeed = { items: [messageItem], overdueItems: [], messageItems: [messageItem], moderationItems: [] };
        const { default: NotificationsPage } = await import('../NotificationsPage');
        renderWithRouter(<NotificationsPage />);
        fireEvent.click(screen.getByText('notifications.filter_unread_message'));
        expect(screen.queryByText('notifications.clear_all')).not.toBeInTheDocument();
    });

    it('navigates to messages and moderation from their item views', async () => {
        mockFeed = {
            items: [messageItem, moderationItem],
            overdueItems: [],
            messageItems: [messageItem],
            moderationItems: [moderationItem],
        };
        const { default: NotificationsPage } = await import('../NotificationsPage');
        renderWithRouter(<NotificationsPage />);
        const views = screen.getAllByText('notifications.action_view');
        fireEvent.click(views[0]);
        expect(mockNavigate).toHaveBeenCalledWith('/messages');
        fireEvent.click(views[1]);
        expect(mockNavigate).toHaveBeenCalledWith('/moderation');
    });

    it('shows no detail line for a moderation item without pending days', async () => {
        const noDays = { ...moderationItem, pendingDays: null };
        mockFeed = { items: [noDays], overdueItems: [], messageItems: [], moderationItems: [noDays] };
        const { default: NotificationsPage } = await import('../NotificationsPage');
        renderWithRouter(<NotificationsPage />);
        expect(screen.getByText('Cleo')).toBeInTheDocument();
    });

    it('clear-all on the moderation filter only dismisses moderation items', async () => {
        mockFeed = {
            items: [overdueItem, moderationItem],
            overdueItems: [overdueItem],
            messageItems: [],
            moderationItems: [moderationItem],
        };
        const { default: NotificationsPage } = await import('../NotificationsPage');
        renderWithRouter(<NotificationsPage />);
        fireEvent.click(screen.getByText('notifications.filter_moderation_pending'));
        fireEvent.click(screen.getByText('notifications.clear_all'));
        expect(mockDismissAll).toHaveBeenCalledWith('moderation_pending');
        expect(mockDismissAll).not.toHaveBeenCalledWith('overdue_grading');
    });
});
