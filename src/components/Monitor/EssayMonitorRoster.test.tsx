import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import EssayMonitorRoster, { type EssayMonitorRow } from './EssayMonitorRoster';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

function row(overrides: Partial<EssayMonitorRow> = {}): EssayMonitorRow {
    return {
        studentId: 'ada',
        displayName: 'Ada Lovelace',
        presence: 'active',
        flags: { tabSwitchCount: 0, copyCount: 0, cutCount: 0, pasteCount: 0, battery: null, sebActive: false },
        snapshotWords: [10, 40],
        ...overrides,
    };
}

describe('EssayMonitorRoster', () => {
    it('marks the row the proctoring cursor is on', () => {
        render(
            <EssayMonitorRoster
                rows={[row({ selected: true }), row({ studentId: 'grace', displayName: 'Grace' })]}
                onWatch={() => {}}
            />
        );

        expect(screen.getByTestId('essay-row-ada').style.outline).toContain('accent-text');
        expect(screen.getByTestId('essay-row-grace').style.outline).toBe('');
    });

    it('shows a flag only on the rows the teacher flagged', () => {
        render(<EssayMonitorRoster rows={[row({ flagged: true }), row({ studentId: 'grace' })]} onWatch={() => {}} />);

        expect(screen.getByTestId('essay-flagged-ada')).toBeTruthy();
        expect(screen.queryByTestId('essay-flagged-grace')).toBeNull();
    });
});
