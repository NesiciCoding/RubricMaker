import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PortalCriterionFeedback } from '../PortalCriterionFeedback';
import type { Rubric } from '../../../types';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key),
        i18n: { language: 'en' },
    }),
}));

vi.mock('../../../hooks/usePortalFeedbackAudioSrc', () => ({
    usePortalFeedbackAudioSrc: (
        _studentRubricId: string,
        entry: { audioDataUrl?: string; audioStoragePath?: string }
    ) => entry.audioDataUrl ?? (entry.audioStoragePath ? `signed:${entry.audioStoragePath}` : undefined),
}));

const level = (id: string, label: string, description = '') => ({
    id,
    label,
    minPoints: 0,
    maxPoints: 1,
    description,
    subItems: [],
});

const rubric = {
    criteria: [
        { id: 'c1', title: 'Content', description: '', weight: 50, levels: [level('l1', 'Strong', 'Clear argument')] },
        { id: 'c2', title: 'Language', description: '', weight: 30, levels: [level('l2', 'Basic')] },
        { id: 'c3', title: 'Layout', description: '', weight: 20, levels: [level('l3', 'Good')] },
    ],
} as unknown as Pick<Rubric, 'criteria'>;

describe('PortalCriterionFeedback (#622)', () => {
    it('shows the level reached even when the criterion has no comment', () => {
        render(
            <PortalCriterionFeedback
                rubric={rubric}
                entries={[{ criterionId: 'c1', levelId: 'l1', checkedSubItems: [], comment: '' }]}
                studentRubricId="sr1"
            />
        );
        expect(screen.getByText('Content')).toBeInTheDocument();
        expect(screen.getByText(/sharedFeedback.your_level.*Strong/)).toBeInTheDocument();
        expect(screen.getByText('Clear argument')).toBeInTheDocument();
        expect(screen.queryByText('Language')).toBeNull();
    });

    it('shows a criterion whose only feedback is ticked checklist statements', () => {
        const checklistRubric = {
            criteria: [
                {
                    id: 'c1',
                    title: 'Spelling',
                    description: '',
                    weight: 100,
                    subItemMode: 'checklist',
                    levels: [{ ...level('l1', 'B'), subItems: [{ id: 'k1', label: 'Fewer than 8 errors' }] }],
                },
            ],
        } as unknown as Pick<Rubric, 'criteria'>;
        render(
            <PortalCriterionFeedback
                rubric={checklistRubric}
                entries={[{ criterionId: 'c1', levelId: null, checkedSubItems: ['k1'], comment: '' }]}
                studentRubricId="sr1"
            />
        );
        expect(screen.getByText('Spelling')).toBeInTheDocument();
        expect(screen.getByText('Fewer than 8 errors')).toBeInTheDocument();
    });

    it('plays inline and storage-backed voice feedback with an accessible name', () => {
        render(
            <PortalCriterionFeedback
                rubric={rubric}
                entries={[
                    {
                        criterionId: 'c2',
                        levelId: null,
                        checkedSubItems: [],
                        comment: 'Watch tenses',
                        audioDataUrl: 'data:audio/webm;base64,AA',
                    },
                    {
                        criterionId: 'c3',
                        levelId: null,
                        checkedSubItems: [],
                        comment: '',
                        audioStoragePath: 'u/clip.webm',
                    },
                ]}
                studentRubricId="sr1"
            />
        );
        const players = document.querySelectorAll('audio');
        expect(players).toHaveLength(2);
        expect(players[0]).toHaveAttribute('src', 'data:audio/webm;base64,AA');
        expect(players[1]).toHaveAttribute('src', 'signed:u/clip.webm');
        expect(players[0].getAttribute('aria-label')).toContain('sharedFeedback.audio_feedback_for');
        expect(screen.getByText('Watch tenses')).toBeInTheDocument();
    });

    it('renders nothing when no criterion has a level, comment or audio', () => {
        const { container } = render(<PortalCriterionFeedback rubric={rubric} entries={[]} studentRubricId="sr1" />);
        expect(container).toBeEmptyDOMElement();
    });
});
