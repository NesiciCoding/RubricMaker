import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import PortalLiveWritingJoin from '../PortalLiveWritingJoin';

const mockJoin = vi.fn();

vi.mock('../../../services/database/LiveWritingAdapter', () => ({
    LiveWritingAdapter: {
        forPortal: () => ({ joinViaPortal: mockJoin }),
    },
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
        i18n: { language: 'en' },
    }),
}));

function renderCard() {
    const router = createMemoryRouter(
        [
            { path: '/', element: <PortalLiveWritingJoin /> },
            { path: '/join/:code', element: <div>live-room</div> },
        ],
        { initialEntries: ['/'] }
    );
    return render(<RouterProvider router={router} />);
}

function enterCode(code: string) {
    const input = screen.getByLabelText('liveWriting.code_label');
    fireEvent.change(input, { target: { value: code } });
    fireEvent.click(screen.getByRole('button', { name: /liveWriting.portal_join_button/ }));
}

describe('PortalLiveWritingJoin', () => {
    beforeEach(() => {
        mockJoin.mockReset();
        sessionStorage.clear();
    });

    it('rejects an incomplete code without calling the server', async () => {
        renderCard();
        enterCode('abc');

        expect(await screen.findByRole('alert')).toHaveTextContent('liveWriting.invalid_code');
        expect(mockJoin).not.toHaveBeenCalled();
    });

    it('stores the portal join and lands on the room without the name picker', async () => {
        mockJoin.mockResolvedValue({ participantId: 'p1', joinToken: 'token-1' });
        renderCard();

        enterCode('abc123');

        await waitFor(() => expect(screen.getByText('live-room')).toBeInTheDocument());
        expect(mockJoin).toHaveBeenCalledWith('RM-ABC123');
        expect(JSON.parse(sessionStorage.getItem('rm_live_write_join:RM-ABC123') ?? '{}')).toEqual({
            participantId: 'p1',
            joinToken: 'token-1',
        });
    });

    it('explains a session that did not enable portal join', async () => {
        mockJoin.mockRejectedValue(new Error('portal_join_disabled'));
        renderCard();

        enterCode('abc123');

        expect(await screen.findByRole('alert')).toHaveTextContent('liveWriting.portal_join_disabled');
        expect(screen.queryByText('live-room')).not.toBeInTheDocument();
    });

    it('explains a signed-out or not-linked student', async () => {
        mockJoin.mockRejectedValue(new Error('student_not_in_class'));
        renderCard();

        enterCode('abc123');

        expect(await screen.findByRole('alert')).toHaveTextContent('liveWriting.student_not_in_class');
    });
});
