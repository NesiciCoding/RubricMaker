import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { Class, ClassMember } from '../../../types';

const mockDb = vi.hoisted(() => ({
    isConnected: true,
    userId: 'owner' as string | null,
    fetchClassMembers: vi.fn(),
    addClassMember: vi.fn(),
    addClassMemberByEmail: vi.fn(),
    removeClassMember: vi.fn(),
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key),
        i18n: { language: 'en', changeLanguage: vi.fn() },
    }),
}));

vi.mock('../../../hooks/useDbStatus', () => ({
    useDbStatus: () => ({
        isConnected: mockDb.isConnected,
        status: 'idle',
        lastSyncAt: null,
        userId: mockDb.userId,
        currentUser: null,
    }),
}));

vi.mock('../../../services/database', () => ({
    storageSync: {
        adapter: {
            fetchClassMembers: mockDb.fetchClassMembers,
            addClassMember: mockDb.addClassMember,
            addClassMemberByEmail: mockDb.addClassMemberByEmail,
            removeClassMember: mockDb.removeClassMember,
        },
    },
}));

import ClassShareModal from '../ClassShareModal';

const cls: Class = { id: 'c1', name: '3B English' };
const bob: ClassMember = { userId: 'u2', email: 'bob@school.nl', displayName: 'Bob', role: 'viewer' };

describe('ClassShareModal', () => {
    beforeEach(() => {
        mockDb.isConnected = true;
        mockDb.userId = 'owner';
        mockDb.fetchClassMembers.mockReset().mockResolvedValue([]);
        mockDb.addClassMember.mockReset().mockResolvedValue({ success: true });
        mockDb.addClassMemberByEmail.mockReset().mockResolvedValue({ success: true });
        mockDb.removeClassMember.mockReset().mockResolvedValue({ success: true });
    });

    it('explains that sharing needs a cloud account when not connected', () => {
        mockDb.isConnected = false;
        render(<ClassShareModal classItem={cls} onClose={vi.fn()} />);
        expect(screen.getByText('classShare.requires_cloud')).toBeInTheDocument();
        expect(screen.queryByLabelText('classShare.email_label')).not.toBeInTheDocument();
        expect(mockDb.fetchClassMembers).not.toHaveBeenCalled();
    });

    it('shares the class by email with the chosen role and refreshes the member list', async () => {
        mockDb.fetchClassMembers.mockResolvedValueOnce([]).mockResolvedValueOnce([{ ...bob, role: 'editor' }]);
        render(<ClassShareModal classItem={cls} onClose={vi.fn()} />);
        await screen.findByText('classShare.no_members');

        fireEvent.change(screen.getByLabelText('classShare.email_label'), { target: { value: ' bob@school.nl ' } });
        fireEvent.change(screen.getByLabelText('classShare.role_label'), { target: { value: 'editor' } });
        fireEvent.click(screen.getByRole('button', { name: 'classShare.share_btn' }));

        await screen.findByText('classShare.success:{"email":"bob@school.nl"}');
        expect(mockDb.addClassMemberByEmail).toHaveBeenCalledWith('c1', 'bob@school.nl', 'editor');
        expect(screen.getByText('Bob')).toBeInTheDocument();
        expect(screen.getByLabelText('classShare.email_label')).toHaveValue('');
    });

    it('reports an unknown email', async () => {
        mockDb.addClassMemberByEmail.mockResolvedValue({ success: false, notFound: true, error: 'x' });
        render(<ClassShareModal classItem={cls} onClose={vi.fn()} />);
        fireEvent.change(screen.getByLabelText('classShare.email_label'), { target: { value: 'nobody@x.com' } });
        fireEvent.keyDown(screen.getByLabelText('classShare.email_label'), { key: 'Enter' });
        expect(await screen.findByText('classShare.not_found:{"email":"nobody@x.com"}')).toBeInTheDocument();
    });

    it('reports a failed share', async () => {
        mockDb.addClassMemberByEmail.mockResolvedValue({ success: false, error: 'RLS denied' });
        render(<ClassShareModal classItem={cls} onClose={vi.fn()} />);
        fireEvent.change(screen.getByLabelText('classShare.email_label'), { target: { value: 'a@b.c' } });
        fireEvent.click(screen.getByRole('button', { name: 'classShare.share_btn' }));
        expect(await screen.findByText('classShare.failed:{"error":"RLS denied"}')).toBeInTheDocument();
    });

    it('changes a co-teacher role and removes access', async () => {
        mockDb.fetchClassMembers.mockResolvedValue([bob]);
        render(<ClassShareModal classItem={cls} onClose={vi.fn()} />);
        const roleSelect = await screen.findByLabelText('classShare.role_for:{"name":"Bob"}');

        fireEvent.change(roleSelect, { target: { value: 'editor' } });
        await waitFor(() => expect(mockDb.addClassMember).toHaveBeenCalledWith('c1', 'u2', 'editor'));
        await waitFor(() => expect(roleSelect).toHaveValue('editor'));

        fireEvent.click(screen.getByRole('button', { name: 'classShare.remove:{"name":"Bob"}' }));
        await waitFor(() => expect(screen.queryByText('Bob')).not.toBeInTheDocument());
        expect(mockDb.removeClassMember).toHaveBeenCalledWith('c1', 'u2');
    });

    it('shows a read-only notice to a co-teacher the class was shared with', async () => {
        mockDb.userId = 'u2';
        mockDb.fetchClassMembers.mockResolvedValue([bob]);
        render(<ClassShareModal classItem={cls} onClose={vi.fn()} />);
        expect(await screen.findByText('classShare.shared_with_you')).toBeInTheDocument();
        expect(screen.queryByLabelText('classShare.email_label')).not.toBeInTheDocument();
    });

    it('tells the owner they cannot share with their own account', async () => {
        mockDb.addClassMemberByEmail.mockResolvedValue({ success: false, isSelf: true, error: 'x' });
        render(<ClassShareModal classItem={cls} onClose={vi.fn()} />);
        fireEvent.change(screen.getByLabelText('classShare.email_label'), { target: { value: 'me@school.nl' } });
        fireEvent.click(screen.getByRole('button', { name: 'classShare.share_btn' }));
        expect(await screen.findByText('classShare.cannot_share_self')).toBeInTheDocument();
    });

    it('re-enables sharing when the request rejects', async () => {
        mockDb.addClassMemberByEmail.mockRejectedValue(new Error('Not connected'));
        render(<ClassShareModal classItem={cls} onClose={vi.fn()} />);
        fireEvent.change(screen.getByLabelText('classShare.email_label'), { target: { value: 'a@b.c' } });
        fireEvent.click(screen.getByRole('button', { name: 'classShare.share_btn' }));
        expect(await screen.findByText('classShare.failed:{"error":"Not connected"}')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'classShare.share_btn' })).toBeEnabled();
    });

    it('shows an error when loading co-teachers rejects', async () => {
        mockDb.fetchClassMembers.mockRejectedValue(new Error('offline'));
        render(<ClassShareModal classItem={cls} onClose={vi.fn()} />);
        expect(await screen.findByText('classShare.failed:{"error":"offline"}')).toBeInTheDocument();
    });

    it('locks a co-teacher row while a change is in flight so a removal cannot be undone', async () => {
        mockDb.fetchClassMembers.mockResolvedValue([bob]);
        let finishRoleChange: (r: { success: boolean }) => void = () => {};
        mockDb.addClassMember.mockReturnValue(new Promise((resolve) => (finishRoleChange = resolve)));
        render(<ClassShareModal classItem={cls} onClose={vi.fn()} />);
        const roleSelect = await screen.findByLabelText('classShare.role_for:{"name":"Bob"}');
        const removeBtn = screen.getByRole('button', { name: 'classShare.remove:{"name":"Bob"}' });

        fireEvent.change(roleSelect, { target: { value: 'editor' } });
        await waitFor(() => expect(removeBtn).toBeDisabled());
        expect(roleSelect).toBeDisabled();
        fireEvent.click(removeBtn);
        expect(mockDb.removeClassMember).not.toHaveBeenCalled();

        finishRoleChange({ success: true });
        await waitFor(() => expect(removeBtn).toBeEnabled());
    });

    it('surfaces a rejected removal and unlocks the row', async () => {
        mockDb.fetchClassMembers.mockResolvedValue([bob]);
        mockDb.removeClassMember.mockRejectedValue(new Error('boom'));
        render(<ClassShareModal classItem={cls} onClose={vi.fn()} />);
        const removeBtn = await screen.findByRole('button', { name: 'classShare.remove:{"name":"Bob"}' });
        fireEvent.click(removeBtn);
        expect(await screen.findByText('classShare.failed:{"error":"boom"}')).toBeInTheDocument();
        expect(screen.getByText('Bob')).toBeInTheDocument();
        expect(removeBtn).toBeEnabled();
    });
});
