import { useCallback, useMemo } from 'react';
import { useAssessment, useAuthoring, useEssays, useGrading, useStudents } from '../context/AppContext';
import { usePendingGrading } from './usePendingGrading';
import { groupMessageThreads, MessageThread } from '../utils/messageThreads';
import { DEFAULT_MODERATION_THRESHOLD_PERCENT, getModerationQueue } from '../utils/coGradingModerationQueue';
import type { NotificationDismissalType } from '../types';

/**
 * Single source of truth for every "notification-worthy" signal in the app (roadmap
 * Phase 30), consumed by NotificationBell, Sidebar's badge, and NotificationsPage so
 * the three can't drift out of sync. Merges three independently-computed sources —
 * overdue grading (usePendingGrading: handed-in work waiting past the threshold, one item
 * per test or essay), unread messages (groupMessageThreads), and
 * moderation-pending (getModerationQueue, same defaults Sidebar.tsx's badge already
 * uses — no colleagueIds resolution here, matching that existing simplification) —
 * filtered against persisted dismissals for the two types that have them.
 *
 * Unread messages are deliberately not dismissible here: Message.readByTeacher is
 * already real, per-message, cross-device state, so "clearing" one is marking the
 * underlying message(s) read via markThreadRead/markAllMessagesRead, not a snooze.
 */

interface BaseNotificationItem {
    id: string;
    sortKey: string; // ISO-ish string; ascending sort = oldest first
}

interface StudentNotificationItem extends BaseNotificationItem {
    studentId: string;
    studentName: string;
}

export interface OverdueGradingNotification extends BaseNotificationItem {
    type: 'overdue_grading';
    entityId: string; // `test:<testId>` | `essay:<teacherKey>`
    fingerprint: string; // newest submittedAt in the group
    kind: 'test' | 'essay';
    title: string;
    waitingCount: number;
    daysSince: number; // oldest submission
    path: string;
}

export interface UnreadMessageNotification extends StudentNotificationItem {
    type: 'unread_message';
    unreadCount: number;
    thread: MessageThread;
}

export interface ModerationPendingNotification extends StudentNotificationItem {
    type: 'moderation_pending';
    entityId: string; // secondMarkerEntry.id
    fingerprint: string; // secondMarkerEntry.gradedAt
    pendingDays: number | null;
}

export type NotificationFeedItem =
    OverdueGradingNotification | UnreadMessageNotification | ModerationPendingNotification;

export type DismissibleNotification = OverdueGradingNotification | ModerationPendingNotification;

export interface UseNotificationFeedResult {
    items: NotificationFeedItem[];
    overdueItems: OverdueGradingNotification[];
    messageItems: UnreadMessageNotification[];
    moderationItems: ModerationPendingNotification[];
    count: number;
    threshold: number;
    dismiss: (item: DismissibleNotification) => void;
    dismissAll: (type: 'overdue_grading' | 'moderation_pending') => void;
    markThreadRead: (item: UnreadMessageNotification) => void;
    markAllMessagesRead: () => void;
}

export function useNotificationFeed(): UseNotificationFeedResult {
    const { pendingGroups, threshold } = usePendingGrading();
    // Defaulted rather than required: NotificationBell (and so this hook) renders on
    // nearly every page via Topbar, so any test double that predates this hook may not
    // stub every one of these collections.
    const { students = [] } = useStudents();
    const { studentRubrics = [] } = useGrading();

    const { rubrics = [] } = useAuthoring();
    const { peerReviews = [] } = useAssessment();
    const { messages = [], notificationDismissals = [], dismissNotification, markMessageReadByTeacher } = useEssays();

    const dismissedFingerprints = useMemo(() => {
        const map = new Map<string, string>();
        for (const d of notificationDismissals) map.set(d.id, d.fingerprint);
        return map;
    }, [notificationDismissals]);

    const isDismissed = useCallback(
        (type: NotificationDismissalType, entityId: string, fingerprint: string) =>
            dismissedFingerprints.get(`${type}:${entityId}`) === fingerprint,
        [dismissedFingerprints]
    );

    const overdueItems = useMemo<OverdueGradingNotification[]>(
        () =>
            pendingGroups
                .filter((g) => !isDismissed('overdue_grading', g.key, g.newestSubmittedAt))
                .map((g) => ({
                    id: `overdue_grading:${g.key}`,
                    type: 'overdue_grading' as const,
                    entityId: g.key,
                    fingerprint: g.newestSubmittedAt,
                    kind: g.kind,
                    title: g.title,
                    waitingCount: g.studentIds.length,
                    daysSince: g.daysWaiting,
                    path: g.path,
                    sortKey: g.oldestSubmittedAt,
                })),
        [pendingGroups, isDismissed]
    );

    const messageItems = useMemo<UnreadMessageNotification[]>(() => {
        // Only active students count: an archived student's thread stays readable in Messages but
        // must not keep the badge up.
        const threads = groupMessageThreads(messages).filter(
            (t) => t.unreadByTeacher > 0 && students.some((s) => s.id === t.studentId)
        );
        return threads
            .map((thread) => {
                const student = students.find((s) => s.id === thread.studentId);
                return {
                    id: `unread_message:${thread.studentId}__${thread.contextType}__${thread.contextId ?? ''}`,
                    type: 'unread_message' as const,
                    studentId: thread.studentId,
                    studentName: student?.name ?? thread.studentId,
                    unreadCount: thread.unreadByTeacher,
                    thread,
                    sortKey: thread.lastMessage.createdAt,
                };
            })
            .sort((a, b) => a.sortKey.localeCompare(b.sortKey));
    }, [messages, students]);

    const moderationItems = useMemo<ModerationPendingNotification[]>(() => {
        const queue = getModerationQueue(
            rubrics,
            studentRubrics,
            peerReviews,
            students,
            DEFAULT_MODERATION_THRESHOLD_PERCENT
        );
        return queue
            .filter(
                (item) =>
                    !isDismissed('moderation_pending', item.secondMarkerEntry.id, item.secondMarkerEntry.gradedAt ?? '')
            )
            .map((item) => {
                const student = students.find((s) => s.id === item.studentId);
                const fingerprint = item.secondMarkerEntry.gradedAt ?? '';
                return {
                    id: `moderation_pending:${item.secondMarkerEntry.id}`,
                    type: 'moderation_pending' as const,
                    entityId: item.secondMarkerEntry.id,
                    studentId: item.studentId,
                    studentName: student?.name ?? item.studentId,
                    pendingDays: item.secondMarkerEntry.gradedAt
                        ? Math.floor((Date.now() - new Date(item.secondMarkerEntry.gradedAt).getTime()) / 86_400_000)
                        : null,
                    fingerprint,
                    sortKey: fingerprint,
                };
            })
            .sort((a, b) => a.sortKey.localeCompare(b.sortKey));
    }, [rubrics, studentRubrics, peerReviews, students, isDismissed]);

    const items = useMemo<NotificationFeedItem[]>(
        () => [...overdueItems, ...messageItems, ...moderationItems].sort((a, b) => a.sortKey.localeCompare(b.sortKey)),
        [overdueItems, messageItems, moderationItems]
    );

    const dismiss = useCallback(
        (item: DismissibleNotification) => dismissNotification(item.type, item.entityId, item.fingerprint),
        [dismissNotification]
    );

    const dismissAll = useCallback(
        (type: 'overdue_grading' | 'moderation_pending') => {
            const source = type === 'overdue_grading' ? overdueItems : moderationItems;
            source.forEach((item) => dismissNotification(item.type, item.entityId, item.fingerprint));
        },
        [overdueItems, moderationItems, dismissNotification]
    );

    const markThreadRead = useCallback(
        (item: UnreadMessageNotification) => {
            item.thread.messages
                .filter((m) => m.sender === 'student' && !m.readByTeacher)
                .forEach((m) => markMessageReadByTeacher(m.id));
        },
        [markMessageReadByTeacher]
    );

    const markAllMessagesRead = useCallback(() => {
        messageItems.forEach((item) => markThreadRead(item));
    }, [messageItems, markThreadRead]);

    return {
        items,
        overdueItems,
        messageItems,
        moderationItems,
        count: items.length,
        threshold,
        dismiss,
        dismissAll,
        markThreadRead,
        markAllMessagesRead,
    };
}
