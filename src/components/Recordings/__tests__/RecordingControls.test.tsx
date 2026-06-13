import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SessionRecording } from '../../../types';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (k: string, fbOrOpts?: string | { count?: number }) => {
            if (typeof fbOrOpts === 'string') return fbOrOpts;
            if (fbOrOpts && typeof fbOrOpts.count === 'number') return `${fbOrOpts.count}s`;
            return k;
        },
    }),
}));

const { mockStart, mockStop, mockStatusRef, mockPutBlob, mockEstimateUsage } = vi.hoisted(() => ({
    mockStart: vi.fn(),
    mockStop: vi.fn(),
    mockStatusRef: { current: 'idle' as 'idle' | 'recording' | 'stopped' | 'error' },
    mockPutBlob: vi.fn(async () => ({})),
    mockEstimateUsage: vi.fn(async () => ({ usage: 0, quota: 1_000_000_000 })),
}));

vi.mock('../../../hooks/useMediaRecorder', () => ({
    useMediaRecorder: () => ({
        status: mockStatusRef.current,
        recordingKey: null,
        error: null,
        start: mockStart,
        stop: mockStop,
    }),
}));

vi.mock('../../../services/mediaStore', () => ({
    putBlob: mockPutBlob,
    estimateUsage: mockEstimateUsage,
}));

import RecordingControls from '../RecordingControls';

describe('RecordingControls', () => {
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;

    beforeEach(() => {
        mockStatusRef.current = 'idle';
        mockStart.mockReset();
        mockStop.mockReset();
        mockPutBlob.mockClear();
        mockEstimateUsage.mockReset().mockResolvedValue({ usage: 0, quota: 1_000_000_000 });
        URL.createObjectURL = vi.fn(() => 'blob:mock-url');
        URL.revokeObjectURL = vi.fn();
    });

    afterEach(() => {
        URL.createObjectURL = originalCreateObjectURL;
        URL.revokeObjectURL = originalRevokeObjectURL;
    });

    it('renders record buttons and disables video when sync is not configured', () => {
        render(<RecordingControls recordings={[]} onChange={vi.fn()} syncConfigured={false} />);
        expect(screen.getByText('recordings.record_audio')).toBeInTheDocument();
        const videoBtn = screen.getByText('recordings.record_video').closest('button');
        expect(videoBtn).toBeDisabled();
        expect(screen.getByText('recordings.local_only_warning')).toBeInTheDocument();
    });

    it('enables video recording when sync is configured', () => {
        render(<RecordingControls recordings={[]} onChange={vi.fn()} syncConfigured={true} />);
        const videoBtn = screen.getByText('recordings.record_video').closest('button');
        expect(videoBtn).not.toBeDisabled();
        expect(screen.queryByText('recordings.local_only_warning')).not.toBeInTheDocument();
    });

    it('blocks starting a recording when quota headroom is too low', async () => {
        mockEstimateUsage.mockResolvedValue({ usage: 999_950_000, quota: 1_000_000_000 }); // 50KB headroom
        render(<RecordingControls recordings={[]} onChange={vi.fn()} syncConfigured={false} />);
        fireEvent.click(screen.getByText('recordings.record_audio'));
        await waitFor(() => expect(mockEstimateUsage).toHaveBeenCalled());
        expect(mockStart).not.toHaveBeenCalled();
    });

    it('starts a recording when there is enough headroom', async () => {
        mockStart.mockResolvedValue(true);
        render(<RecordingControls recordings={[]} onChange={vi.fn()} syncConfigured={false} />);
        fireEvent.click(screen.getByText('recordings.record_audio'));
        await waitFor(() => expect(mockStart).toHaveBeenCalledWith({ video: false }));
    });

    it('saves the blob and appends metadata on stop', async () => {
        mockStatusRef.current = 'recording';
        mockStop.mockResolvedValue({ blob: new Blob(['x'], { type: 'audio/webm' }), mimeType: 'audio/webm' });
        const onChange = vi.fn();
        render(<RecordingControls recordings={[]} onChange={onChange} syncConfigured={false} />);
        fireEvent.click(screen.getByText('recordings.stop_recording'));
        await waitFor(() => expect(mockPutBlob).toHaveBeenCalled());
        await waitFor(() => expect(onChange).toHaveBeenCalled());
        const newRecordings = onChange.mock.calls[0][0] as SessionRecording[];
        expect(newRecordings).toHaveLength(1);
        expect(newRecordings[0].mediaType).toBe('audio');
        expect(newRecordings[0].mimeType).toBe('audio/webm');
    });

    it('keeps the recording available for retry/download when saving fails', async () => {
        mockStatusRef.current = 'recording';
        mockStop.mockResolvedValue({ blob: new Blob(['x'], { type: 'audio/webm' }), mimeType: 'audio/webm' });
        mockPutBlob.mockRejectedValueOnce(new Error('quota exceeded')).mockResolvedValueOnce({});
        const onChange = vi.fn();
        render(<RecordingControls recordings={[]} onChange={onChange} syncConfigured={false} />);

        fireEvent.click(screen.getByText('recordings.stop_recording'));
        await waitFor(() => expect(mockPutBlob).toHaveBeenCalledTimes(1));
        expect(onChange).not.toHaveBeenCalled();

        const downloadLink = await screen.findByText('recordings.download');
        expect(downloadLink.closest('a')).toHaveAttribute('href', 'blob:mock-url');

        fireEvent.click(screen.getByText('recordings.retry_save'));
        await waitFor(() => expect(mockPutBlob).toHaveBeenCalledTimes(2));
        await waitFor(() => expect(onChange).toHaveBeenCalled());
        expect(screen.queryByText('recordings.retry_save')).not.toBeInTheDocument();
    });

    it('discards a too-large recording without saving', async () => {
        mockStatusRef.current = 'recording';
        const bigBlob = { size: 60 * 1024 * 1024, type: 'audio/webm' } as unknown as Blob;
        mockStop.mockResolvedValue({ blob: bigBlob, mimeType: 'audio/webm' });
        const onChange = vi.fn();
        render(<RecordingControls recordings={[]} onChange={onChange} syncConfigured={false} />);
        fireEvent.click(screen.getByText('recordings.stop_recording'));
        await waitFor(() => expect(mockStop).toHaveBeenCalled());
        expect(mockPutBlob).not.toHaveBeenCalled();
        expect(onChange).not.toHaveBeenCalled();
    });

    it('lists existing recordings and discards on click', () => {
        const recordings: SessionRecording[] = [
            {
                id: 'rec1',
                mediaType: 'audio',
                mimeType: 'audio/webm',
                durationSec: 12,
                sizeBytes: 1000,
                createdAt: '2024-01-01T00:00:00.000Z',
            },
        ];
        const onChange = vi.fn();
        render(<RecordingControls recordings={recordings} onChange={onChange} syncConfigured={false} />);
        expect(screen.getByText(/recordings.type_audio/)).toBeInTheDocument();
        fireEvent.click(screen.getByLabelText('recordings.discard'));
        expect(onChange).toHaveBeenCalledWith([]);
    });
});
