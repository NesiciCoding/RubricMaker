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
    notifyStudentsOnMessage: false,
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
        body: 'Why did I lose points on argument?',
        createdAt: '2024-01-01T10:00:00Z',
        readByTeacher: false,
        readByStudent: true,
    },
];

const mockSendMessage = vi.fn();
const mockMarkMessageReadByTeacher = vi.fn();
const mockNotifyStudentMessage = vi.fn();

let appOverrides: Record<string, unknown> = {};

vi.mock('../../context/AppContext', () => ({
    useApp: () => ({
        messages: mockMessages,
        students: mockStudents,
        studentRubrics: [],
        settings: mockSettings,
        sendMessage: mockSendMessage,
        markMessageReadByTeacher: mockMarkMessageReadByTeacher,
        notifyStudentMessage: mockNotifyStudentMessage,
        ...appOverrides,
    }),
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key),
        i18n: { language: 'en' },
    }),
}));

describe('MessagesPage', () => {
    beforeEach(() => {
        appOverrides = {};
        mockSendMessage.mockClear();
        mockMarkMessageReadByTeacher.mockClear();
        mockNotifyStudentMessage.mockClear();
    });

    it('shows the empty state when there are no messages', async () => {
        appOverrides = { messages: [] };
        const { default: MessagesPage } = await import('../MessagesPage');
        renderWithRouter(<MessagesPage />);
        expect(screen.getByText('messages.inbox_empty')).toBeInTheDocument();
    });

    it('lists a thread and expanding it marks the unread student message as read', async () => {
        const { default: MessagesPage } = await import('../MessagesPage');
        renderWithRouter(<MessagesPage />);
        expect(screen.getByText('Alice')).toBeInTheDocument();
        fireEvent.click(screen.getByText('Alice'));
        expect(mockMarkMessageReadByTeacher).toHaveBeenCalledWith('m1');
    });

    it('sends a reply within the thread context', async () => {
        const { default: MessagesPage } = await import('../MessagesPage');
        renderWithRouter(<MessagesPage />);
        fireEvent.click(screen.getByText('Alice'));
        const textarea = screen.getByPlaceholderText('messages.compose_placeholder');
        fireEvent.change(textarea, { target: { value: 'Here is why...' } });
        fireEvent.click(screen.getByText('messages.send_button'));
        expect(mockSendMessage).toHaveBeenCalledWith(
            expect.objectContaining({
                studentId: 's1',
                contextType: 'rubric',
                contextId: 'r1',
                sender: 'teacher',
                body: 'Here is why...',
            })
        );
        expect(mockNotifyStudentMessage).not.toHaveBeenCalled();
    });

    it('notifies the student on reply when the setting is enabled', async () => {
        appOverrides = { settings: { ...mockSettings, notifyStudentsOnMessage: true } };
        const { default: MessagesPage } = await import('../MessagesPage');
        renderWithRouter(<MessagesPage />);
        fireEvent.click(screen.getByText('Alice'));
        fireEvent.change(screen.getByPlaceholderText('messages.compose_placeholder'), {
            target: { value: 'Reply text' },
        });
        fireEvent.click(screen.getByText('messages.send_button'));
        expect(mockNotifyStudentMessage).toHaveBeenCalledWith('s1', 'Essay Rubric', 'Reply text');
    });

    it('starts a new general thread with a selected student', async () => {
        const { default: MessagesPage } = await import('../MessagesPage');
        renderWithRouter(<MessagesPage />);
        fireEvent.click(screen.getByText('messages.new_thread_button'));
        fireEvent.change(screen.getByLabelText('messages.select_student'), { target: { value: 's1' } });
        fireEvent.change(screen.getByPlaceholderText('messages.compose_placeholder'), {
            target: { value: 'Checking in' },
        });
        fireEvent.click(screen.getByText('messages.send_button'));
        expect(mockSendMessage).toHaveBeenCalledWith(
            expect.objectContaining({
                studentId: 's1',
                contextType: 'general',
                contextId: null,
                sender: 'teacher',
                body: 'Checking in',
            })
        );
    });
});
