import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { FeedbackAudioPlayer } from '../FeedbackAudioPlayer';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
    }),
}));

vi.mock('../../../hooks/useFeedbackAudioSrc', () => ({
    useFeedbackAudioSrc: (dataUrl?: string, path?: string) =>
        dataUrl ?? (path ? `https://cdn.example.com/${path}` : undefined),
}));

describe('FeedbackAudioPlayer', () => {
    it('renders nothing when there is no audio source at all', () => {
        const { container } = render(<FeedbackAudioPlayer onRemove={vi.fn()} />);
        expect(container.firstChild).toBeNull();
    });

    it('renders an audio element and a remove button for an inline data URL', () => {
        render(<FeedbackAudioPlayer audioDataUrl="data:audio/mp3;base64,AAAA" onRemove={vi.fn()} />);
        expect(screen.getByRole('button')).toBeTruthy();
        const audio = document.querySelector('audio');
        expect(audio).toBeTruthy();
        expect(audio!.getAttribute('src')).toBe('data:audio/mp3;base64,AAAA');
    });

    it('renders the remove button without an audio element while a storage path is still resolving', () => {
        render(<FeedbackAudioPlayer audioStoragePath="audio/rec1.mp3" onRemove={vi.fn()} />);
        expect(screen.getByRole('button')).toBeTruthy();
        expect(document.querySelector('audio')).toBeTruthy();
    });

    it('calls onRemove when the remove button is clicked', () => {
        const onRemove = vi.fn();
        render(<FeedbackAudioPlayer audioDataUrl="data:audio/mp3;base64,AAAA" onRemove={onRemove} />);
        fireEvent.click(screen.getByRole('button'));
        expect(onRemove).toHaveBeenCalled();
    });
});
