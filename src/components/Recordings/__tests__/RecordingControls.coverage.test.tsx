import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import RecordingControls from '../RecordingControls';
import type { SessionRecording } from '../../../types';

const mocks = vi.hoisted(() => ({
    putBlob: vi.fn(),
    estimateUsage: vi.fn(),
    showToast: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    createObjectURL: vi.fn(),
    revokeObjectURL: vi.fn(),
}));

const recorderState = vi.hoisted(() => ({ status: 'idle' }));

vi.mock('../../../hooks/useMediaRecorder', () => ({
    useMediaRecorder: () => ({
        status: recorderState.status,
        start: mocks.start,
        stop: mocks.stop,
    }),
}));

vi.mock('../../../services/mediaStore', () => ({
    putBlob: mocks.putBlob,
    estimateUsage: mocks.estimateUsage,
}));

vi.mock('../../../hooks/useToast', () => ({
    useToast: () => ({ showToast: mocks.showToast }),
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key),
    }),
}));

beforeEach(() => {
    recorderState.status = 'idle';
    mocks.putBlob.mockResolvedValue(undefined);
    mocks.estimateUsage.mockResolvedValue({ quota: 0, usage: 0 });
    mocks.start.mockResolvedValue(true);
    mocks.stop.mockResolvedValue({ blob: new Blob(['x'], { type: 'audio/webm' }), mimeType: 'audio/webm' });
    vi.stubGlobal('URL', { ...URL, createObjectURL: mocks.createObjectURL, revokeObjectURL: mocks.revokeObjectURL });
    mocks.createObjectURL.mockReturnValue('blob:mock');
});

afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
});

function renderControls(overrides: Partial<React.ComponentProps<typeof RecordingControls>> = {}) {
    return render(<RecordingControls recordings={[]} onChange={vi.fn()} syncConfigured={false} {...overrides} />);
}

describe('RecordingControls coverage', () => {
    it('warns when sync is not configured and disables video recording', () => {
        renderControls();
        expect(screen.getByText('recordings.local_only_warning')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /recordings.record_video/ })).toBeDisabled();
    });

    it('records audio and persists the recording on stop', async () => {
        const onChange = vi.fn();
        const r = renderControls({ onChange, syncConfigured: true });
        const rerenderRecording = () =>
            r.rerender(<RecordingControls recordings={[]} onChange={onChange} syncConfigured />);

        fireEvent.click(screen.getByRole('button', { name: /recordings.record_audio/ }));
        await act(async () => undefined);
        expect(mocks.start).toHaveBeenCalledWith({ video: false });

        // flip the recorder into recording state and re-render
        recorderState.status = 'recording';
        rerenderRecording();
        fireEvent.click(screen.getByRole('button', { name: /recordings.stop_recording/ }));
        await act(async () => undefined);
        expect(mocks.stop).toHaveBeenCalledTimes(1);
        expect(mocks.putBlob).toHaveBeenCalled();
        expect(onChange).toHaveBeenCalledWith([
            expect.objectContaining({
                mediaType: 'audio',
                mimeType: 'audio/webm',
                durationSec: expect.any(Number),
                synced: false,
            }),
        ]);
    });

    it('records video with a duration when sync is configured', async () => {
        const onChange = vi.fn();
        const r = renderControls({ onChange, syncConfigured: true });
        const rerenderRecording = () =>
            r.rerender(<RecordingControls recordings={[]} onChange={onChange} syncConfigured />);
        fireEvent.click(screen.getByRole('button', { name: /recordings.record_video/ }));
        await act(async () => undefined);
        expect(mocks.start).toHaveBeenCalledWith({ video: true });

        recorderState.status = 'recording';
        rerenderRecording();
        fireEvent.click(screen.getByRole('button', { name: /recordings.stop_recording/ }));
        await act(async () => undefined);
        expect(onChange).toHaveBeenCalledWith([expect.objectContaining({ mediaType: 'video' })]);
    });

    it('blocks video when sync is missing, warns on quota, and reports start errors', async () => {
        renderControls();
        // quota warning path (audio)
        mocks.estimateUsage.mockResolvedValueOnce({ quota: 100, usage: 90 }); // 10MB headroom < 60MB
        fireEvent.click(screen.getByRole('button', { name: /recordings.record_audio/ }));
        await act(async () => undefined);
        expect(mocks.showToast).toHaveBeenCalledWith('recordings.quota_warning', 'warning');
        expect(mocks.start).not.toHaveBeenCalled();

        // start error path
        mocks.estimateUsage.mockResolvedValueOnce({ quota: 0, usage: 0 });
        mocks.start.mockResolvedValueOnce(false);
        fireEvent.click(screen.getByRole('button', { name: /recordings.record_audio/ }));
        await act(async () => undefined);
        expect(mocks.showToast).toHaveBeenCalledWith('recordings.start_error', 'error');
    });

    it('rejects oversized recordings and retries failed saves', async () => {
        const onChange = vi.fn();
        const bigBlob = new Blob([new ArrayBuffer(51 * 1024 * 1024)]);
        mocks.stop.mockResolvedValueOnce({ blob: bigBlob, mimeType: 'video/mp4' });
        const r = renderControls({ onChange, syncConfigured: true });
        const rerenderRecording = () =>
            r.rerender(<RecordingControls recordings={[]} onChange={onChange} syncConfigured />);

        recorderState.status = 'recording';
        rerenderRecording();
        fireEvent.click(screen.getByRole('button', { name: /recordings.stop_recording/ }));
        await act(async () => undefined);
        expect(mocks.showToast).toHaveBeenCalledWith('recordings.too_large_warning', 'warning');
        expect(mocks.putBlob).not.toHaveBeenCalled();

        // save failure → pending alert with retry, download, and discard
        mocks.putBlob.mockRejectedValueOnce(new Error('storage down'));
        mocks.stop.mockResolvedValueOnce({ blob: new Blob(['y'], { type: 'audio/webm' }), mimeType: 'audio/webm' });
        fireEvent.click(screen.getByRole('button', { name: /recordings.stop_recording/ }));
        expect(await screen.findByRole('alert')).toBeInTheDocument();
        expect(screen.getByText('recordings.save_error')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /recordings.download/ })).toHaveAttribute('href', 'blob:mock');

        // retry succeeds
        mocks.putBlob.mockResolvedValueOnce(undefined);
        fireEvent.click(screen.getByRole('button', { name: /recordings.retry_save/ }));
        await act(async () => undefined);
        expect(onChange).toHaveBeenCalled();

        // discard the pending recording
        mocks.putBlob.mockRejectedValueOnce(new Error('again'));
        mocks.stop.mockResolvedValueOnce({ blob: new Blob(['z'], { type: 'audio/webm' }), mimeType: 'audio/webm' });
        fireEvent.click(screen.getByRole('button', { name: /recordings.stop_recording/ }));
        expect(await screen.findByRole('alert')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'recordings.discard' }));
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('handles a null stop result and mime types without a slash', async () => {
        const onChange = vi.fn();
        const r = renderControls({ onChange, syncConfigured: true });
        const rerenderRecording = () =>
            r.rerender(<RecordingControls recordings={[]} onChange={onChange} syncConfigured />);

        // stop resolves null → nothing persisted
        mocks.stop.mockResolvedValueOnce(null);
        recorderState.status = 'recording';
        rerenderRecording();
        fireEvent.click(screen.getByRole('button', { name: /recordings.stop_recording/ }));
        await act(async () => undefined);
        expect(mocks.putBlob).not.toHaveBeenCalled();
        expect(onChange).not.toHaveBeenCalled();

        // mime without a slash → the `?? 'webm'` download extension fallback
        mocks.putBlob.mockRejectedValueOnce(new Error('down'));
        mocks.stop.mockResolvedValueOnce({ blob: new Blob(['z'], { type: 'audio' }), mimeType: 'audio' });
        fireEvent.click(screen.getByRole('button', { name: /recordings.stop_recording/ }));
        expect(await screen.findByRole('alert')).toBeInTheDocument();
        const link = screen.getByRole('link', { name: /recordings.download/ });
        expect(link.getAttribute('download')).toMatch(/\.webm$/);
        expect(link.getAttribute('href')).toBe('blob:mock');
    });

    it('lists recordings and discards one via the row button', () => {
        const onChange = vi.fn();
        const existing: SessionRecording[] = [
            {
                id: 'r1',
                mediaType: 'audio',
                mimeType: 'audio/webm',
                durationSec: 12,
                sizeBytes: 100,
                createdAt: '2024-01-01T00:00:00Z',
                synced: false,
            },
            {
                id: 'r2',
                mediaType: 'video',
                mimeType: 'video/webm',
                durationSec: 3,
                sizeBytes: 200,
                createdAt: '2024-01-01T00:00:00Z',
                synced: true,
            },
        ];
        renderControls({ recordings: existing, onChange });
        expect(screen.getByText(/recordings.type_audio/)).toBeInTheDocument();
        expect(screen.getByText(/recordings.type_video/)).toBeInTheDocument();
        expect(screen.getAllByText(/recordings.duration_seconds/)).toHaveLength(2);

        fireEvent.click(screen.getAllByRole('button', { name: 'recordings.discard' })[0]);
        expect(onChange).toHaveBeenCalledWith([existing[1]]);
    });
});
