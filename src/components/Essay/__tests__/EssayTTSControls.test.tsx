import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import EssayTTSControls from '../EssayTTSControls';
import { useTTS, htmlToPlainText } from '../../../hooks/useTTS';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
    }),
}));

const mockSpeak = vi.fn();
const mockPause = vi.fn();
const mockResume = vi.fn();
const mockStop = vi.fn();

vi.mock('../../../hooks/useTTS', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../../hooks/useTTS')>();
    return {
        ...actual,
        useTTS: vi.fn(),
    };
});

function mockStatus(
    status: 'idle' | 'speaking' | 'paused' | 'unsupported',
    overrides: Partial<ReturnType<typeof useTTS>> = {}
) {
    vi.mocked(useTTS).mockReturnValue({
        status,
        charIndex: 50,
        totalChars: 200,
        speak: mockSpeak,
        pause: mockPause,
        resume: mockResume,
        stop: mockStop,
        ...overrides,
    });
}

describe('EssayTTSControls', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders nothing when speech synthesis is unsupported', () => {
        mockStatus('unsupported');
        const { container } = render(<EssayTTSControls promptText="Read me" contentHtml="<p>Hello</p>" lang="en" />);
        expect(container).toBeEmptyDOMElement();
    });

    it('plays the essay when idle and shows no stop button', () => {
        mockStatus('idle');
        render(<EssayTTSControls contentHtml="<p>Hello</p>" lang="en" />);

        fireEvent.click(screen.getByRole('button', { name: 'tts.play' }));

        expect(mockSpeak).toHaveBeenCalledWith(htmlToPlainText('<p>Hello</p>'));
        expect(screen.queryByRole('button', { name: 'tts.stop' })).not.toBeInTheDocument();
    });

    it('renders the prompt button only when promptText is present and speaks the prompt', () => {
        mockStatus('idle');
        render(<EssayTTSControls promptText="Read me" contentHtml="<p>Hello</p>" lang="en" />);

        fireEvent.click(screen.getByRole('button', { name: 'tts.read_prompt' }));

        expect(mockSpeak).toHaveBeenCalledWith('Read me');
    });

    it('omits the prompt button when promptText is missing', () => {
        mockStatus('idle');
        render(<EssayTTSControls contentHtml="<p>Hello</p>" lang="en" />);
        expect(screen.queryByRole('button', { name: 'tts.read_prompt' })).not.toBeInTheDocument();
    });

    it('pauses the prompt when it is the active speaking target', () => {
        mockStatus('idle');
        const { rerender } = render(<EssayTTSControls promptText="Read me" contentHtml="<p>Hello</p>" lang="en" />);
        fireEvent.click(screen.getByRole('button', { name: 'tts.read_prompt' }));
        expect(mockSpeak).toHaveBeenCalledWith('Read me');

        mockStatus('speaking');
        rerender(<EssayTTSControls promptText="Read me" contentHtml="<p>Hello</p>" lang="en" />);
        fireEvent.click(screen.getByRole('button', { name: 'tts.read_prompt' }));
        expect(mockPause).toHaveBeenCalledTimes(1);
        expect(mockSpeak).toHaveBeenCalledTimes(1);
    });

    it('resumes the prompt when it is the active paused target', () => {
        mockStatus('speaking');
        const { rerender } = render(<EssayTTSControls promptText="Read me" contentHtml="<p>Hello</p>" lang="en" />);
        fireEvent.click(screen.getByRole('button', { name: 'tts.read_prompt' }));

        mockStatus('paused');
        rerender(<EssayTTSControls promptText="Read me" contentHtml="<p>Hello</p>" lang="en" />);
        fireEvent.click(screen.getByRole('button', { name: 'tts.read_prompt' }));
        expect(mockResume).toHaveBeenCalledTimes(1);
        expect(mockSpeak).toHaveBeenCalledTimes(1);
    });

    it('pauses the essay when it is the active speaking target and shows pause icon', () => {
        mockStatus('idle');
        const { rerender } = render(<EssayTTSControls contentHtml="<p>Hello</p>" lang="en" />);
        fireEvent.click(screen.getByRole('button', { name: 'tts.play' }));

        mockStatus('speaking');
        rerender(<EssayTTSControls contentHtml="<p>Hello</p>" lang="en" />);
        fireEvent.click(screen.getByRole('button', { name: 'tts.pause' }));
        expect(mockPause).toHaveBeenCalledTimes(1);
        expect(mockSpeak).toHaveBeenCalledTimes(1);
    });

    it('resumes the essay when it is the active paused target', () => {
        mockStatus('speaking');
        const { rerender } = render(<EssayTTSControls contentHtml="<p>Hello</p>" lang="en" />);
        fireEvent.click(screen.getByRole('button', { name: 'tts.play' }));

        mockStatus('paused');
        rerender(<EssayTTSControls contentHtml="<p>Hello</p>" lang="en" />);
        fireEvent.click(screen.getByRole('button', { name: 'tts.resume' }));
        expect(mockResume).toHaveBeenCalledTimes(1);
        expect(mockSpeak).toHaveBeenCalledTimes(1);
    });

    it('shows stop and progress bar while busy and stops on click', () => {
        mockStatus('speaking');
        render(<EssayTTSControls contentHtml="<p>Hello</p>" lang="en" />);

        const stop = screen.getByRole('button', { name: 'tts.stop' });
        const progress = screen.getByRole('progressbar');
        expect(progress).toHaveAttribute('aria-valuenow', '25');

        fireEvent.click(stop);
        expect(mockStop).toHaveBeenCalledTimes(1);
    });

    it('omits the progress bar when totalChars is zero', () => {
        mockStatus('speaking', { totalChars: 0 });
        render(<EssayTTSControls contentHtml="<p>Hello</p>" lang="en" />);
        expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });
});
