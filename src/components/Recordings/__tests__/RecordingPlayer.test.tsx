import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import type { SessionRecording } from '../../../types';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (k: string, fb?: string) => fb ?? k }),
}));

const { mockGetBlob } = vi.hoisted(() => ({ mockGetBlob: vi.fn() }));
vi.mock('../../../services/mediaStore', () => ({
    getBlob: mockGetBlob,
}));

import RecordingPlayer from '../RecordingPlayer';

const audioRecording: SessionRecording = {
    id: 'rec1',
    mediaType: 'audio',
    mimeType: 'audio/webm',
    durationSec: 10,
    sizeBytes: 1000,
    createdAt: '2024-01-01T00:00:00.000Z',
};

const videoRecording: SessionRecording = {
    ...audioRecording,
    id: 'rec2',
    mediaType: 'video',
    mimeType: 'video/webm',
};

describe('RecordingPlayer', () => {
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;

    beforeEach(() => {
        mockGetBlob.mockReset();
        URL.createObjectURL = vi.fn(() => 'blob:mock-url');
        URL.revokeObjectURL = vi.fn();
    });

    afterAll(() => {
        URL.createObjectURL = originalCreateObjectURL;
        URL.revokeObjectURL = originalRevokeObjectURL;
    });

    it('renders an audio element from a local blob', async () => {
        mockGetBlob.mockResolvedValue({
            id: 'rec1',
            blob: new Blob(['x'], { type: 'audio/webm' }),
            mimeType: 'audio/webm',
            createdAt: '2024-01-01T00:00:00.000Z',
        });
        const { container } = render(<RecordingPlayer recording={audioRecording} />);
        await waitFor(() => expect(container.querySelector('audio')).toBeTruthy());
        expect(container.querySelector('audio')?.getAttribute('src')).toBe('blob:mock-url');
    });

    it('renders a video element from a local blob', async () => {
        mockGetBlob.mockResolvedValue({
            id: 'rec2',
            blob: new Blob(['x'], { type: 'video/webm' }),
            mimeType: 'video/webm',
            createdAt: '2024-01-01T00:00:00.000Z',
        });
        const { container } = render(<RecordingPlayer recording={videoRecording} />);
        await waitFor(() => expect(container.querySelector('video')).toBeTruthy());
    });

    it('falls back to cloudUrl when the local blob is missing', async () => {
        mockGetBlob.mockResolvedValue(null);
        const { container } = render(
            <RecordingPlayer recording={audioRecording} cloudUrl="https://example.com/signed" />
        );
        await waitFor(() => expect(container.querySelector('audio')).toBeTruthy());
        expect(container.querySelector('audio')?.getAttribute('src')).toBe('https://example.com/signed');
    });

    it('shows an unavailable message when neither local blob nor cloudUrl exist', async () => {
        mockGetBlob.mockResolvedValue(null);
        render(<RecordingPlayer recording={audioRecording} />);
        await waitFor(() => expect(screen.getByText('recordings.unavailable')).toBeInTheDocument());
    });

    it('revokes the object URL on unmount', async () => {
        mockGetBlob.mockResolvedValue({
            id: 'rec1',
            blob: new Blob(['x'], { type: 'audio/webm' }),
            mimeType: 'audio/webm',
            createdAt: '2024-01-01T00:00:00.000Z',
        });
        const { container, unmount } = render(<RecordingPlayer recording={audioRecording} />);
        await waitFor(() => expect(container.querySelector('audio')).toBeTruthy());
        unmount();
        expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
    });
});
