import { screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { renderWithRouter } from '../../test-utils/renderWithProviders';
import { loadStore, saveRubrics } from '../../store/storage';
import { DEFAULT_FORMAT } from '../../types';
import type { Rubric } from '../../types';
import RubricList from '../RubricList';

const rubric: Rubric = {
    id: 'r-exit',
    name: 'Closing Tab Rubric',
    subject: 'English',
    description: '',
    criteria: [],
    gradeScaleId: 'default',
    format: DEFAULT_FORMAT,
    attachmentIds: [],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    totalMaxPoints: 0,
    scoringMode: 'weighted-percentage',
};

describe('RubricList pending delete on page exit (#683)', () => {
    beforeEach(() => {
        localStorage.clear();
        saveRubrics([rubric]);
    });

    it('writes the delete to offline storage before pagehide returns', async () => {
        renderWithRouter(<RubricList />, { withAppProvider: true });
        await act(async () => {
            fireEvent.click(await screen.findByTitle('rubricList.action_delete'));
        });
        await act(async () => {
            fireEvent.click(screen.getByText('common.delete'));
        });
        expect(loadStore().rubrics.map((r) => r.id)).toContain('r-exit');
        // No act(): the tab is going away, so nothing after the event handler gets to run.
        window.dispatchEvent(new Event('pagehide'));
        expect(loadStore().rubrics.map((r) => r.id)).not.toContain('r-exit');
    });
});
