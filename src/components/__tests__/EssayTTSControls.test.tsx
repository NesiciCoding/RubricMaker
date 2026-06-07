import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import EssayTTSControls from '../Essay/EssayTTSControls';
import type { UseTTSReturn } from '../../hooks/useTTS';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

const mockSpeak = vi.fn();
const mockPause = vi.fn();
const mockResume = vi.fn();
const mockStop = vi.fn();

let mockReturn: UseTTSReturn;

vi.mock('../../hooks/useTTS', () => ({
    useTTS: () => mockReturn,
    htmlToPlainText: (html: string) => html.replace(/<[^>]+>/g, ' ').trim(),
}));

function makeReturn(overrides: Partial<UseTTSReturn> = {}): UseTTSReturn {
    return {
        status: 'idle',
        charIndex: 0,
        totalChars: 0,
        speak: mockSpeak,
        pause: mockPause,
        resume: mockResume,
        stop: mockStop,
        ...overrides,
    };
}

describe('EssayTTSControls', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockReturn = makeReturn();
    });

    it('renders nothing when TTS is unsupported', () => {
        mockReturn = makeReturn({ status: 'unsupported' });
        const { container } = render(<EssayTTSControls contentHtml="<p>Hello</p>" lang="en" />);
        expect(container.firstChild).toBeNull();
    });

    it('does not render the prompt button when promptText is absent', () => {
        render(<EssayTTSControls contentHtml="<p>Hello</p>" lang="en" />);
        expect(screen.queryByLabelText('tts.read_prompt')).toBeNull();
        expect(screen.getByLabelText('tts.play')).toBeInTheDocument();
    });

    it('renders the prompt button when promptText is provided', () => {
        render(<EssayTTSControls promptText="Write about your day" contentHtml="<p>Hello</p>" lang="en" />);
        expect(screen.getByLabelText('tts.read_prompt')).toBeInTheDocument();
    });

    it('starts reading the prompt on click', () => {
        render(<EssayTTSControls promptText="Write about your day" contentHtml="<p>Hello</p>" lang="en" />);
        fireEvent.click(screen.getByLabelText('tts.read_prompt'));
        expect(mockSpeak).toHaveBeenCalledWith('Write about your day');
    });

    it('pauses prompt playback when clicked again while speaking the prompt', () => {
        const { rerender } = render(
            <EssayTTSControls promptText="Write about your day" contentHtml="<p>Hello</p>" lang="en" />
        );
        fireEvent.click(screen.getByLabelText('tts.read_prompt'));
        expect(mockSpeak).toHaveBeenCalledWith('Write about your day');

        mockReturn = makeReturn({ status: 'speaking' });
        rerender(<EssayTTSControls promptText="Write about your day" contentHtml="<p>Hello</p>" lang="en" />);
        fireEvent.click(screen.getByLabelText('tts.read_prompt'));
        expect(mockPause).toHaveBeenCalled();
    });

    it('resumes prompt playback when paused and clicked again', () => {
        const { rerender } = render(
            <EssayTTSControls promptText="Write about your day" contentHtml="<p>Hello</p>" lang="en" />
        );
        fireEvent.click(screen.getByLabelText('tts.read_prompt'));

        mockReturn = makeReturn({ status: 'paused' });
        rerender(<EssayTTSControls promptText="Write about your day" contentHtml="<p>Hello</p>" lang="en" />);
        fireEvent.click(screen.getByLabelText('tts.read_prompt'));
        expect(mockResume).toHaveBeenCalled();
    });

    it('starts reading the essay content on play click, converting HTML to plain text', () => {
        render(<EssayTTSControls contentHtml="<p>Hello world</p>" lang="en" />);
        fireEvent.click(screen.getByLabelText('tts.play'));
        expect(mockSpeak).toHaveBeenCalledWith('Hello world');
    });

    it('pauses essay playback when clicked again while speaking the essay', () => {
        const { rerender } = render(<EssayTTSControls contentHtml="<p>Hello world</p>" lang="en" />);
        fireEvent.click(screen.getByLabelText('tts.play'));
        expect(mockSpeak).toHaveBeenCalledWith('Hello world');

        mockReturn = makeReturn({ status: 'speaking' });
        rerender(<EssayTTSControls contentHtml="<p>Hello world</p>" lang="en" />);
        fireEvent.click(screen.getByLabelText('tts.pause'));
        expect(mockPause).toHaveBeenCalled();
    });

    it('resumes essay playback when paused and clicked again', () => {
        const { rerender } = render(<EssayTTSControls contentHtml="<p>Hello world</p>" lang="en" />);
        fireEvent.click(screen.getByLabelText('tts.play'));
        expect(mockSpeak).toHaveBeenCalledWith('Hello world');

        mockReturn = makeReturn({ status: 'paused' });
        rerender(<EssayTTSControls contentHtml="<p>Hello world</p>" lang="en" />);
        fireEvent.click(screen.getByLabelText('tts.resume'));
        expect(mockResume).toHaveBeenCalled();
    });

    it('shows a stop button while busy and stops playback on click', () => {
        mockReturn = makeReturn({ status: 'speaking', charIndex: 5, totalChars: 20 });
        render(<EssayTTSControls contentHtml="<p>Hello world</p>" lang="en" />);
        const stopBtn = screen.getByLabelText('tts.stop');
        fireEvent.click(stopBtn);
        expect(mockStop).toHaveBeenCalled();
    });

    it('does not show stop button or progress bar when idle', () => {
        render(<EssayTTSControls contentHtml="<p>Hello world</p>" lang="en" />);
        expect(screen.queryByLabelText('tts.stop')).toBeNull();
        expect(screen.queryByRole('progressbar')).toBeNull();
    });

    it('renders a progress bar reflecting playback progress while busy', () => {
        mockReturn = makeReturn({ status: 'speaking', charIndex: 25, totalChars: 100 });
        render(<EssayTTSControls contentHtml="<p>Hello world</p>" lang="en" />);
        const progress = screen.getByRole('progressbar');
        expect(progress).toHaveAttribute('aria-valuenow', '25');
    });
});
