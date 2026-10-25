import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import PassageReadAloud from '../PassageReadAloud';
import { useTTS } from '../../../hooks/useTTS';

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
        charIndex: 0,
        totalChars: 100,
        speak: mockSpeak,
        pause: mockPause,
        resume: mockResume,
        stop: mockStop,
        ...overrides,
    });
}

describe('PassageReadAloud aria-live status (#886)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders nothing when speech synthesis is unsupported', () => {
        mockStatus('unsupported');
        const { container } = render(<PassageReadAloud contentHtml="<p>Hello</p>" lang="en" />);
        expect(container).toBeEmptyDOMElement();
    });

    it('is empty while idle', () => {
        mockStatus('idle');
        render(<PassageReadAloud contentHtml="<p>Hello</p>" lang="en" />);
        expect(screen.getByRole('status', { hidden: true })).toHaveTextContent('');
    });

    it('announces reading while speaking', () => {
        mockStatus('speaking');
        render(<PassageReadAloud contentHtml="<p>Hello</p>" lang="en" />);
        expect(screen.getByRole('status', { hidden: true })).toHaveTextContent('tts.now_reading');
    });

    it('announces paused while paused', () => {
        mockStatus('paused');
        render(<PassageReadAloud contentHtml="<p>Hello</p>" lang="en" />);
        expect(screen.getByRole('status', { hidden: true })).toHaveTextContent('tts.reading_paused');
    });

    it('clears the announcement once stopped', () => {
        mockStatus('speaking');
        const { rerender } = render(<PassageReadAloud contentHtml="<p>Hello</p>" lang="en" />);
        fireEvent.click(screen.getByRole('button', { name: 'tts.stop' }));
        expect(mockStop).toHaveBeenCalledTimes(1);

        mockStatus('idle');
        rerender(<PassageReadAloud contentHtml="<p>Hello</p>" lang="en" />);
        expect(screen.getByRole('status', { hidden: true })).toHaveTextContent('');
    });
});
