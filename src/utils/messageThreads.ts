import { Message } from '../types';

/**
 * A "thread" is every Message sharing (studentId, contextType, contextId) — there is no
 * separate threads table/type, this is purely a client-side grouping of the flat Message
 * list, ordered oldest-first (chronological reading order).
 */
export interface MessageThread {
    studentId: string;
    contextType: Message['contextType'];
    contextId: string | null;
    contextLabel: string | null;
    messages: Message[];
    lastMessage: Message;
    unreadByTeacher: number;
    unreadByStudent: number;
}

function threadKey(m: Pick<Message, 'studentId' | 'contextType' | 'contextId'>): string {
    return `${m.studentId}__${m.contextType}__${m.contextId ?? ''}`;
}

/** Groups messages into threads, sorted by most recently active thread first. */
export function groupMessageThreads(messages: Message[]): MessageThread[] {
    const byKey = new Map<string, Message[]>();
    for (const m of messages) {
        const key = threadKey(m);
        const list = byKey.get(key);
        if (list) list.push(m);
        else byKey.set(key, [m]);
    }

    const threads: MessageThread[] = [];
    for (const msgs of byKey.values()) {
        const sorted = [...msgs].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        const last = sorted[sorted.length - 1];
        threads.push({
            studentId: last.studentId,
            contextType: last.contextType,
            contextId: last.contextId,
            contextLabel: last.contextLabel,
            messages: sorted,
            lastMessage: last,
            unreadByTeacher: sorted.filter((m) => m.sender === 'student' && !m.readByTeacher).length,
            unreadByStudent: sorted.filter((m) => m.sender === 'teacher' && !m.readByStudent).length,
        });
    }

    return threads.sort((a, b) => b.lastMessage.createdAt.localeCompare(a.lastMessage.createdAt));
}

/** Total unread-by-teacher count across every thread, for the notification bell badge. */
export function countUnreadByTeacher(messages: Message[]): number {
    return groupMessageThreads(messages).filter((t) => t.unreadByTeacher > 0).length;
}
