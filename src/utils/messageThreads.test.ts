import { describe, it, expect } from 'vitest';
import { groupMessageThreads, countUnreadByTeacher } from './messageThreads';
import type { Message } from '../types';

function msg(overrides: Partial<Message>): Message {
    return {
        id: 'm',
        studentId: 's1',
        contextType: 'general',
        contextId: null,
        contextLabel: null,
        sender: 'student',
        body: 'body',
        createdAt: '2024-01-01T00:00:00Z',
        readByTeacher: false,
        readByStudent: false,
        ...overrides,
    };
}

describe('groupMessageThreads', () => {
    it('groups messages sharing (studentId, contextType, contextId) into one thread', () => {
        const messages = [
            msg({ id: 'a', createdAt: '2024-01-01T00:00:00Z', body: 'first' }),
            msg({ id: 'b', createdAt: '2024-01-02T00:00:00Z', body: 'second' }),
        ];
        const threads = groupMessageThreads(messages);
        expect(threads).toHaveLength(1);
        expect(threads[0].messages.map((m) => m.id)).toEqual(['a', 'b']);
        expect(threads[0].lastMessage.id).toBe('b');
    });

    it('keeps different contextType/contextId/studentId combos as separate threads', () => {
        const messages = [
            msg({ id: 'a', contextType: 'rubric', contextId: 'r1' }),
            msg({ id: 'b', contextType: 'test', contextId: 'r1' }),
            msg({ id: 'c', contextType: 'rubric', contextId: 'r2' }),
            msg({ id: 'd', studentId: 's2', contextType: 'rubric', contextId: 'r1' }),
        ];
        const threads = groupMessageThreads(messages);
        expect(threads).toHaveLength(4);
    });

    it('sorts threads by most recently active first', () => {
        const messages = [
            msg({ id: 'old', contextId: 'r1', createdAt: '2024-01-01T00:00:00Z' }),
            msg({ id: 'new', contextId: 'r2', createdAt: '2024-01-05T00:00:00Z' }),
        ];
        const threads = groupMessageThreads(messages);
        expect(threads[0].lastMessage.id).toBe('new');
        expect(threads[1].lastMessage.id).toBe('old');
    });

    it('counts unread-by-teacher as student-sent messages not yet read by the teacher', () => {
        const messages = [
            msg({ id: 'a', sender: 'student', readByTeacher: false }),
            msg({ id: 'b', sender: 'student', readByTeacher: true }),
            msg({ id: 'c', sender: 'teacher', readByTeacher: false }),
        ];
        const [thread] = groupMessageThreads(messages);
        expect(thread.unreadByTeacher).toBe(1);
    });

    it('counts unread-by-student as teacher-sent messages not yet read by the student', () => {
        const messages = [
            msg({ id: 'a', sender: 'teacher', readByStudent: false }),
            msg({ id: 'b', sender: 'teacher', readByStudent: true }),
            msg({ id: 'c', sender: 'student', readByStudent: false }),
        ];
        const [thread] = groupMessageThreads(messages);
        expect(thread.unreadByStudent).toBe(1);
    });
});

describe('countUnreadByTeacher', () => {
    it('counts the number of threads with at least one unread student message', () => {
        const messages = [
            msg({ id: 'a', contextId: 'r1', sender: 'student', readByTeacher: false }),
            msg({ id: 'b', contextId: 'r2', sender: 'student', readByTeacher: true }),
            msg({ id: 'c', contextId: 'r3', sender: 'teacher', readByTeacher: false }),
        ];
        expect(countUnreadByTeacher(messages)).toBe(1);
    });
});
