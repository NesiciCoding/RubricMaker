import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LiveWritingSharePromptPanel from '../LiveWritingSharePromptPanel';
import type { LiveWritingSession } from '../../../types';

const mockPublish = vi.fn();
const mockShowToast = vi.fn();

vi.mock('../../../services/database', () => ({
    storageSync: { adapter: { publishToMarketplace: (...args: unknown[]) => mockPublish(...args) } },
}));

vi.mock('../../../hooks/useToast', () => ({
    useToast: () => ({ showToast: mockShowToast }),
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
        i18n: { language: 'en' },
    }),
}));

const session = {
    id: 's1',
    classId: 'c1',
    title: 'Friday quick-write',
    prompt: 'Write about a time you changed your mind.',
    imagePath: 'prompts/mind.webp',
    minutesPerRound: 10,
    minWords: 50,
    maxWords: 200,
    scaffoldPrompts: ['Start with the moment you hesitated.'],
} as unknown as LiveWritingSession;

describe('LiveWritingSharePromptPanel', () => {
    beforeEach(() => {
        mockPublish.mockReset();
        mockShowToast.mockReset();
    });

    it('explains that a school is required before it can share', () => {
        render(<LiveWritingSharePromptPanel session={session} />);
        expect(screen.getByText('liveWriting.share_requires_school')).toBeInTheDocument();
    });

    it('publishes only the prompt payload with required tags', async () => {
        mockPublish.mockResolvedValue({ id: 'listing-1' });
        render(<LiveWritingSharePromptPanel session={session} schoolId="school-1" />);

        fireEvent.click(screen.getByText('liveWriting.share_open'));
        fireEvent.change(screen.getByLabelText('liveWriting.share_subject'), { target: { value: 'English' } });
        fireEvent.change(screen.getByLabelText('liveWriting.share_language'), { target: { value: 'English' } });
        fireEvent.click(screen.getByText('B1'));
        fireEvent.click(screen.getByText('liveWriting.focus_narrative'));

        fireEvent.click(screen.getByText('liveWriting.share_publish'));

        await waitFor(() => expect(mockPublish).toHaveBeenCalledTimes(1));
        expect(mockPublish).toHaveBeenCalledWith(
            'school-1',
            'live_prompt',
            {
                title: session.title,
                prompt: session.prompt,
                imagePath: 'prompts/mind.webp',
                minutesPerRound: 10,
                minWords: 50,
                maxWords: 200,
                scaffoldPrompts: ['Start with the moment you hesitated.'],
            },
            undefined,
            {
                name: session.title,
                subject: 'English',
                language: 'English',
                cefrLevels: ['B1'],
                writingFocus: ['narrative'],
                schoolYear: undefined,
            }
        );
        expect(mockShowToast).toHaveBeenCalledWith('liveWriting.share_published', 'success');
    });

    it('keeps publishing disabled until every required tag is set', () => {
        render(<LiveWritingSharePromptPanel session={session} schoolId="school-1" />);
        fireEvent.click(screen.getByText('liveWriting.share_open'));
        expect(screen.getByText('liveWriting.share_publish').closest('button')).toBeDisabled();
    });
});
