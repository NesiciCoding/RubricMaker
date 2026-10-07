import React from 'react';
import { screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Link, useLocation, useNavigate } from 'react-router-dom';
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

function SaveAndNextHarness() {
    const location = useLocation();
    const navigate = useNavigate();
    const { allowNavigation } = useUnsavedChangesGuard(location.pathname === '/');
    return (
        <div>
            <span>path:{location.pathname}</span>
            <button
                onClick={() => {
                    allowNavigation();
                    navigate('/next');
                }}
            >
                save-and-next
            </button>
            <Link to="/">home</Link>
        </div>
    );
}

function SamePathBypassHarness() {
    const location = useLocation();
    const navigate = useNavigate();
    const { allowNavigation } = useUnsavedChangesGuard(true);
    return (
        <div>
            <span>
                at:{location.pathname}
                {location.search}
            </span>
            <button
                onClick={() => {
                    allowNavigation();
                    navigate('/?tab=2');
                }}
            >
                same-path
            </button>
            <Link to="/other">leave</Link>
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

    it('ignores the confirm result when the component unmounts mid-confirmation', async () => {
        let resolveConfirm!: (leave: boolean) => void;
        mockConfirm.mockImplementation(() => new Promise((resolve) => (resolveConfirm = resolve)));
        const { unmount } = renderWithRouter(<Harness isDirty={true} />);
        fireEvent.click(screen.getByRole('link', { name: 'navigate' }));

        await waitFor(() => expect(mockConfirm).toHaveBeenCalled());
        unmount();
        await act(async () => {
            resolveConfirm(true);
        });
        expect(screen.queryByText('path:/other')).not.toBeInTheDocument();
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

    it('lets a save-then-navigate through without prompting, once', async () => {
        renderWithRouter(<SaveAndNextHarness />);
        fireEvent.click(screen.getByText('save-and-next'));
        await waitFor(() => expect(screen.getByText('path:/next')).toBeInTheDocument());
        expect(mockConfirm).not.toHaveBeenCalled();
    });

    it('consumes the bypass on a same-pathname navigation so a later exit still prompts', async () => {
        mockConfirm.mockResolvedValue(false);
        renderWithRouter(<SamePathBypassHarness />);
        fireEvent.click(screen.getByText('same-path'));
        await waitFor(() => expect(screen.getByText('at:/?tab=2')).toBeInTheDocument());
        fireEvent.click(screen.getByRole('link', { name: 'leave' }));
        await waitFor(() => expect(mockConfirm).toHaveBeenCalledTimes(1));
        expect(screen.getByText('at:/?tab=2')).toBeInTheDocument();
    });
});
