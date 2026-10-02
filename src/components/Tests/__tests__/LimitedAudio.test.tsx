import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key} ${JSON.stringify(opts)}` : key),
    }),
}));

import LimitedAudio from '../LimitedAudio';

beforeEach(() => {
    window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
});

describe('LimitedAudio', () => {
    it('renders a native player when there is no play limit', () => {
        const { container } = render(<LimitedAudio src="a.mp3" plays={0} onPlay={vi.fn()} lang="en" label="Clip" />);
        expect(container.querySelector('audio[controls]')).not.toBeNull();
        expect(screen.queryByRole('button')).toBeNull();
    });

    it('counts plays and disables the button once the limit is reached', async () => {
        const onPlay = vi.fn();
        const { rerender } = render(
            <LimitedAudio src="a.mp3" maxPlays={2} plays={0} onPlay={onPlay} lang="en" label="Clip" />
        );
        fireEvent.click(screen.getByRole('button', { name: /Clip/ }));
        await waitFor(() => expect(onPlay).toHaveBeenCalledWith(1));
        expect(screen.getByRole('status')).toHaveTextContent('"left":2');

        rerender(<LimitedAudio src="a.mp3" maxPlays={2} plays={2} onPlay={onPlay} lang="en" label="Clip" />);
        expect(screen.getByRole('button', { name: /Clip/ })).toBeDisabled();
        expect(screen.getByRole('status')).toHaveTextContent('tests.taking.audio_no_plays_left');
        fireEvent.click(screen.getByRole('button', { name: /Clip/ }));
        expect(onPlay).toHaveBeenCalledTimes(1);
    });

    it('does not count a play the browser refused to start', async () => {
        window.HTMLMediaElement.prototype.play = vi.fn().mockRejectedValue(new Error('NotAllowedError'));
        const onPlay = vi.fn();
        render(<LimitedAudio src="a.mp3" maxPlays={2} plays={0} onPlay={onPlay} lang="en" label="Clip" />);
        const button = screen.getByRole('button', { name: /Clip/ });
        fireEvent.click(button);
        await waitFor(() => expect(window.HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1));
        await Promise.resolve();
        expect(onPlay).not.toHaveBeenCalled();
        fireEvent.click(button);
        await waitFor(() => expect(window.HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(2));
    });

    it('ignores a second click while the first start is still pending', () => {
        let resolve!: () => void;
        window.HTMLMediaElement.prototype.play = vi.fn(() => new Promise<void>((r) => (resolve = r)));
        const onPlay = vi.fn();
        render(<LimitedAudio src="a.mp3" maxPlays={3} plays={0} onPlay={onPlay} lang="en" label="Clip" />);
        const button = screen.getByRole('button', { name: /Clip/ });
        fireEvent.click(button);
        fireEvent.click(button);
        expect(window.HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
        resolve();
    });

    it('renders nothing without a source or spoken text', () => {
        const { container } = render(<LimitedAudio plays={0} onPlay={vi.fn()} lang="en" label="Clip" />);
        expect(container).toBeEmptyDOMElement();
    });
});
