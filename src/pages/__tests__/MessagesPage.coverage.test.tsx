import React from 'react';
import { screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithRouter } from '../../test-utils/renderWithProviders';
import type { AppSettings, Message, Student } from '../../types';
import { DEFAULT_FORMAT } from '../../types';

const mockSettings: AppSettings = {
    defaultGradeScaleId: 'gs1',
    theme: 'dark',
    language: 'en',
    accentColor: '#3b82f6',
    defaultFormat: DEFAULT_FORMAT,
    notifyStudentsOnMessage: true,
};

const mockStudents: Student[] = [{ id: 's1', name: 'Alice', classId: 'c1' }];

const mockMessages: Message[] = [
    {
        id: 'm1',
        studentId: 's1',
        contextType: 'rubric',
        contextId: 'r1',
        contextLabel: 'Essay Rubric',
        sender: 'student',
        body: 'Why did I lose points?',
        createdAt: '2024-01-01T10:00:00Z',
        readByTeacher: false,
        readByStudent: true,
    },
    {
        id: 'm2',
        studentId: 's1',
        contextType: 'rubric',
        contextId: 'r1',
        contextLabel: 'Essay Rubric',
        sender: 'teacher',
        body: 'Here is why.',
        createdAt: '2024-01-01T11:00:00Z',
        readByTeacher: true,
        readByStudent: false,
    },
    // unknown student + no context id/label → fallbacks
    {
        id: 'm3',
        studentId: 'ghost',
        contextType: 'general',
        contextId: null,
        contextLabel: null,
        sender: 'student',
        body: 'Hello there',
        createdAt: '2024-01-02T10:00:00Z',
        readByTeacher: false,
        readByStudent: true,
    },
    // essay thread without a context label and already-read student message
    {
        id: 'm4',
        studentId: 's1',
        contextType: 'essay',
        contextId: 'e1',
        contextLabel: null,
        sender: 'student',
        body: 'Essay note',
        createdAt: '2024-01-03T10:00:00Z',
        readByTeacher: true,
        readByStudent: true,
    },
];

const mockSendMessage = vi.fn();
const mockMarkMessageReadByTeacher = vi.fn();
const mockNotifyStudentMessage = vi.fn();

const makeAppContextMock = () => ({
    messages: mockMessages,
    students: mockStudents,
    studentRubrics: [],
    settings: mockSettings,
    sendMessage: mockSendMessage,
    markMessageReadByTeacher: mockMarkMessageReadByTeacher,
    notifyStudentMessage: mockNotifyStudentMessage,
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

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key),
    }),
}));

beforeEach(() => {
    mockSendMessage.mockClear();
    mockMarkMessageReadByTeacher.mockClear();
    mockNotifyStudentMessage.mockClear();
});

describe('MessagesPage coverage', () => {
    it('expands and collapses threads, renders teacher/student bubbles and fallback labels', async () => {
        const { default: MessagesPage } = await import('../MessagesPage');
        renderWithRouter(<MessagesPage />);

        // fallback name for the unknown student, fallback badge for general
        expect(screen.getByText('ghost')).toBeInTheDocument();
        expect(screen.getByText('messages.context_general')).toBeInTheDocument();
        expect(screen.getByText('messages.context_essay')).toBeInTheDocument();

        // target the rubric thread explicitly (Alice appears in two thread headers)
        const rubricThreadButton = screen.getByText('Essay Rubric').closest('button') as HTMLElement;
        fireEvent.click(rubricThreadButton);
        expect(mockMarkMessageReadByTeacher).toHaveBeenCalledWith('m1');
        expect(screen.getAllByText('Here is why.').length).toBeGreaterThan(0); // preview + bubble
        expect(screen.getAllByText('Why did I lose points?').length).toBeGreaterThan(0);

        // collapse the same thread (expandedKey === key arm) — the reply box disappears
        fireEvent.click(rubricThreadButton);
        expect(screen.queryByPlaceholderText('messages.compose_placeholder')).not.toBeInTheDocument();

        // re-expand — the thread opens again (the read/unread split is already
        // covered by m1 unread + the essay note read on the first expansion)
        fireEvent.click(rubricThreadButton);
        expect(screen.getAllByText('Here is why.').length).toBeGreaterThan(0);
    });

    it('starts a new general thread with notifications on and cancels it', async () => {
        const { default: MessagesPage } = await import('../MessagesPage');
        renderWithRouter(<MessagesPage />);

        fireEvent.click(screen.getByText('messages.new_thread_button'));
        fireEvent.change(screen.getByLabelText('messages.select_student'), { target: { value: 's1' } });
        fireEvent.change(screen.getByPlaceholderText('messages.compose_placeholder'), {
            target: { value: 'General check-in' },
        });
        fireEvent.click(screen.getByText('messages.send_button'));
        expect(mockSendMessage).toHaveBeenCalledWith(
            expect.objectContaining({
                studentId: 's1',
                contextType: 'general',
                contextId: null,
                contextLabel: null,
                sender: 'teacher',
                body: 'General check-in',
            })
        );
        // notify path in sendNewThread (null context label)
        expect(mockNotifyStudentMessage).toHaveBeenCalledWith('s1', null, 'General check-in');
        // the composer closes and resets
        expect(screen.queryByLabelText('messages.select_student')).not.toBeInTheDocument();

        // cancel button closes the new-thread composer
        fireEvent.click(screen.getByText('messages.new_thread_button'));
        fireEvent.click(screen.getByText('common.cancel'));
        expect(screen.queryByLabelText('messages.select_student')).not.toBeInTheDocument();
    });

    it('replies inside an expanded thread and notifies the student', async () => {
        const { default: MessagesPage } = await import('../MessagesPage');
        renderWithRouter(<MessagesPage />);

        // expand the rubric thread and type a reply
        fireEvent.click(screen.getByText('Essay Rubric').closest('button') as HTMLElement);
        fireEvent.change(screen.getByPlaceholderText('messages.compose_placeholder'), {
            target: { value: 'You can improve it.' },
        });
        fireEvent.click(screen.getByText('messages.send_button'));
        expect(mockSendMessage).toHaveBeenCalledWith(
            expect.objectContaining({
                studentId: 's1',
                contextType: 'rubric',
                contextId: 'r1',
                contextLabel: 'Essay Rubric',
                sender: 'teacher',
                body: 'You can improve it.',
            })
        );
        // notify path inside sendReply with the thread's context label
        expect(mockNotifyStudentMessage).toHaveBeenCalledWith('s1', 'Essay Rubric', 'You can improve it.');
    });

    it('skips the student notification when disabled', async () => {
        mockSettings.notifyStudentsOnMessage = false;
        try {
            const { default: MessagesPage } = await import('../MessagesPage');
            renderWithRouter(<MessagesPage />);

            fireEvent.click(screen.getByText('Essay Rubric').closest('button') as HTMLElement);
            fireEvent.change(screen.getByPlaceholderText('messages.compose_placeholder'), {
                target: { value: 'Quiet reply' },
            });
            fireEvent.click(screen.getByText('messages.send_button'));
            expect(mockSendMessage).toHaveBeenCalled();
            expect(mockNotifyStudentMessage).not.toHaveBeenCalled();

            // same false arm inside sendNewThread (collapse the thread first so
            // only the new-thread composer's textarea is present)
            fireEvent.click(screen.getByText('Essay Rubric').closest('button') as HTMLElement);
            fireEvent.click(screen.getByText('messages.new_thread_button'));
            fireEvent.change(screen.getByLabelText('messages.select_student'), { target: { value: 's1' } });
            fireEvent.change(screen.getByPlaceholderText('messages.compose_placeholder'), {
                target: { value: 'Quiet new thread' },
            });
            fireEvent.click(screen.getByText('messages.send_button'));
            expect(mockSendMessage).toHaveBeenCalled();
            expect(mockNotifyStudentMessage).not.toHaveBeenCalled();
        } finally {
            mockSettings.notifyStudentsOnMessage = true;
        }
    });

    it('shows the empty inbox state when there are no threads', async () => {
        const original = mockMessages.splice(0, mockMessages.length);
        try {
            const { default: MessagesPage } = await import('../MessagesPage');
            renderWithRouter(<MessagesPage />);
            expect(screen.getByText('messages.inbox_empty')).toBeInTheDocument();
            expect(screen.getByText('messages.inbox_empty_desc')).toBeInTheDocument();
        } finally {
            mockMessages.push(...original);
        }
    });
});
