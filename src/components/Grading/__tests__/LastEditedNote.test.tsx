import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import LastEditedNote from '../LastEditedNote';
import { lastEditedNameCache } from '../lastEditedNameCache';

const mockFetchNames = vi.fn();
vi.mock('../../../services/database/lazyDb', () => ({
    loadDb: async () => ({ storageSync: { adapter: { fetchProfileNames: mockFetchNames } } }),
}));
vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key),
        i18n: { language: 'en' },
    }),
}));

describe('LastEditedNote', () => {
    beforeEach(() => {
        lastEditedNameCache.clear();
        mockFetchNames.mockReset().mockResolvedValue({ ann: 'Ann Smith' });
    });

    it('renders nothing for a grade nobody has edited in the cloud yet', () => {
        const { container } = render(<LastEditedNote currentUserId="me" />);
        expect(container).toBeEmptyDOMElement();
    });

    it('calls my own edit "you" without looking anyone up', () => {
        render(<LastEditedNote editorId="me" currentUserId="me" />);
        expect(screen.getByTestId('last-edited-note')).toHaveTextContent(
            'gradeStudent.last_edited_by:{"name":"gradeStudent.last_edited_you"}'
        );
        expect(mockFetchNames).not.toHaveBeenCalled();
    });

    it('names a co-teacher with the time of the change, and reuses the looked-up name', async () => {
        const at = '2026-03-01T10:00:00Z';
        const { unmount } = render(<LastEditedNote editorId="ann" currentUserId="me" at={at} />);
        await waitFor(() => expect(screen.getByTestId('last-edited-note')).toHaveTextContent('Ann Smith'));
        expect(screen.getByTestId('last-edited-note')).toHaveTextContent('gradeStudent.last_edited_by_at');
        expect(screen.getByTestId('last-edited-note')).toHaveTextContent(new Date(at).toLocaleString('en'));
        expect(mockFetchNames).toHaveBeenCalledWith(['ann']);
        unmount();

        render(<LastEditedNote editorId="ann" currentUserId="me" />);
        expect(screen.getByTestId('last-edited-note')).toHaveTextContent('Ann Smith');
        expect(mockFetchNames).toHaveBeenCalledTimes(1);
    });

    it('falls back to "a colleague" when the name is hidden or the lookup fails', async () => {
        mockFetchNames.mockResolvedValueOnce({});
        const { unmount } = render(<LastEditedNote editorId="hidden" currentUserId="me" />);
        await waitFor(() => expect(lastEditedNameCache.has('me:hidden')).toBe(true));
        expect(screen.getByTestId('last-edited-note')).toHaveTextContent('sharing.unknown_teacher');
        unmount();

        mockFetchNames.mockRejectedValueOnce(new Error('offline'));
        render(<LastEditedNote editorId="broken" currentUserId={null} />);
        await waitFor(() => expect(lastEditedNameCache.get(':broken')).toBeNull());
        expect(screen.getByTestId('last-edited-note')).toHaveTextContent('sharing.unknown_teacher');
    });

    it('never shows a name looked up by another signed-in account', async () => {
        const { unmount } = render(<LastEditedNote editorId="ann" currentUserId="me" />);
        await waitFor(() => expect(screen.getByTestId('last-edited-note')).toHaveTextContent('Ann Smith'));
        unmount();
        mockFetchNames.mockResolvedValueOnce({});
        render(<LastEditedNote editorId="ann" currentUserId="someone-else" />);
        await waitFor(() => expect(lastEditedNameCache.has('someone-else:ann')).toBe(true));
        expect(screen.getByTestId('last-edited-note')).not.toHaveTextContent('Ann Smith');
        expect(mockFetchNames).toHaveBeenCalledTimes(2);
    });
});
