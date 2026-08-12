import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Link, useLocation } from 'react-router-dom';
import { renderWithRouter } from '../../test-utils/renderWithProviders';
import { useUnsavedChangesGuard } from '../useUnsavedChangesGuard';

const mockConfirm = vi.fn();
const dialogProps = {
    open: false,
    title: '',
    message: '',
    confirmLabel: '',
    cancelLabel: '',
    danger: true,
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
};

vi.mock('../useConfirm', () => ({
    useConfirm: () => ({ confirm: mockConfirm, dialogProps }),
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

function Harness({ isDirty }: { isDirty: boolean }) {
    const location = useLocation();
    useUnsavedChangesGuard(isDirty);
    return (
        <div>
            <span>path:{location.pathname}</span>
            <Link to="/other">navigate</Link>
        </div>
    );
}

describe('useUnsavedChangesGuard', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('does not block navigation when the form is clean', async () => {
        renderWithRouter(<Harness isDirty={false} />);
        fireEvent.click(screen.getByRole('link', { name: 'navigate' }));
        await waitFor(() => expect(screen.getByText('path:/other')).toBeInTheDocument());
        expect(mockConfirm).not.toHaveBeenCalled();
    });

    it('confirms before leaving when there are unsaved changes and proceeds on confirm', async () => {
        mockConfirm.mockResolvedValue(true);
        renderWithRouter(<Harness isDirty={true} />);
        fireEvent.click(screen.getByRole('link', { name: 'navigate' }));

        await waitFor(() => expect(mockConfirm).toHaveBeenCalled());
        expect(mockConfirm).toHaveBeenCalledWith({
            title: 'common.unsaved_title',
            message: 'common.unsaved_message',
            confirmLabel: 'common.unsaved_leave',
            cancelLabel: 'common.unsaved_stay',
        });
        await waitFor(() => expect(screen.getByText('path:/other')).toBeInTheDocument());
    });

    it('stays on the page when the user cancels', async () => {
        mockConfirm.mockResolvedValue(false);
        renderWithRouter(<Harness isDirty={true} />);
        fireEvent.click(screen.getByRole('link', { name: 'navigate' }));

        await waitFor(() => expect(mockConfirm).toHaveBeenCalled());
        expect(screen.getByText('path:/')).toBeInTheDocument();
    });

    it('registers a beforeunload handler that blocks tab close while dirty', () => {
        const { unmount } = renderWithRouter(<Harness isDirty={true} />);
        const event = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent;
        window.dispatchEvent(event);
        expect(event.defaultPrevented).toBe(true);

        unmount();
        const cleanEvent = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent;
        window.dispatchEvent(cleanEvent);
        expect(cleanEvent.defaultPrevented).toBe(false);
    });

    it('does not intercept beforeunload when clean', () => {
        renderWithRouter(<Harness isDirty={false} />);
        const event = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent;
        window.dispatchEvent(event);
        expect(event.defaultPrevented).toBe(false);
    });
});
