import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import StandardMasteryTargetModal from '../Standards/StandardMasteryTargetModal';
import type { LinkedStandard, StandardMasteryTarget } from '../../types';

const pickedStandard = vi.hoisted((): LinkedStandard => ({
    guid: 'st-1',
    statementNotation: 'RH.6-8.1',
    description: 'Cite textual evidence',
    standardSetTitle: 'ELA Standards',
    jurisdictionTitle: 'California',
}));

vi.mock('../Standards/StandardsPickerModal', () => ({
    default: ({ onSelect, onClose }: { onSelect: (s: LinkedStandard) => void; onClose: () => void }) => (
        <div>
            <button type="button" onClick={() => onSelect(pickedStandard)}>
                mock-picker-select
            </button>
            <button type="button" onClick={onClose}>
                mock-picker-close
            </button>
        </div>
    ),
}));

const mockAddStandardMasteryTarget = vi.fn();
const mockUpdateStandardMasteryTarget = vi.fn();
const mockSettings = vi.hoisted(() => ({ standardsApiKey: '' }));

const makeAppValue = () => ({
    settings: mockSettings,
    addStandardMasteryTarget: mockAddStandardMasteryTarget,
    updateStandardMasteryTarget: mockUpdateStandardMasteryTarget,
});

vi.mock('../../context/AppContext', () => ({
    useApp: () => makeAppValue(),
    useRoster: () => makeAppValue(),
    useAuthoring: () => makeAppValue(),
    useAssessment: () => makeAppValue(),
    useEssays: () => makeAppValue(),
    useFlashcards: () => makeAppValue(),
    useSettings: () => makeAppValue(),
    usePlatform: () => makeAppValue(),
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

const existing: StandardMasteryTarget = {
    id: 'mt-1',
    standardGuid: 'st-1',
    standardDescription: 'Cite textual evidence',
    standardSetTitle: 'ELA Standards',
    year: 'jaar-2',
    voTrack: 'havo',
    targetPercentage: 80,
    updatedAt: '2024-01-01T00:00:00Z',
};

describe('StandardMasteryTargetModal', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockSettings.standardsApiKey = '';
    });

    it('disables the choose-standard button without an API key and shows the hint', () => {
        render(<StandardMasteryTargetModal onClose={vi.fn()} />);
        expect(screen.getByText('settings.mastery_target_add_title')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'settings.mastery_target_choose_standard' })).toBeDisabled();
        expect(screen.getByText('settings.mastery_target_needs_api_key')).toBeInTheDocument();
    });

    it('opens the picker, adds a standard, and saves a new target', () => {
        mockSettings.standardsApiKey = 'key';
        const onClose = vi.fn();
        render(<StandardMasteryTargetModal onClose={onClose} />);

        fireEvent.click(screen.getByRole('button', { name: 'settings.mastery_target_choose_standard' }));
        // Radix Dialog marks sibling content (the nested picker) aria-hidden, so query with hidden: true.
        fireEvent.click(screen.getByRole('button', { name: 'mock-picker-select', hidden: true }));
        expect(screen.getByText('RH.6-8.1')).toBeInTheDocument();
        expect(screen.getByText('Cite textual evidence')).toBeInTheDocument();

        fireEvent.change(screen.getByLabelText('studentsPage.form_school_year'), { target: { value: 'jaar-2' } });
        fireEvent.change(screen.getByLabelText('voTrack.section_label'), { target: { value: 'havo' } });
        fireEvent.change(screen.getByLabelText('settings.mastery_target_percentage_label'), {
            target: { value: '80' },
        });

        fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
        expect(mockAddStandardMasteryTarget).toHaveBeenCalledWith({
            standardGuid: 'st-1',
            standardDescription: 'Cite textual evidence',
            standardSetTitle: 'ELA Standards',
            year: 'jaar-2',
            voTrack: 'havo',
            targetPercentage: 80,
        });
        expect(onClose).toHaveBeenCalled();
    });

    it('omits the VO track for primary-school years without one', () => {
        mockSettings.standardsApiKey = 'key';
        render(<StandardMasteryTargetModal onClose={vi.fn()} />);

        fireEvent.click(screen.getByRole('button', { name: 'settings.mastery_target_choose_standard' }));
        fireEvent.click(screen.getByRole('button', { name: 'mock-picker-select', hidden: true }));
        fireEvent.change(screen.getByLabelText('studentsPage.form_school_year'), { target: { value: 'groep-8' } });
        expect(screen.queryByLabelText('voTrack.section_label')).not.toBeInTheDocument();
        fireEvent.change(screen.getByLabelText('settings.mastery_target_percentage_label'), {
            target: { value: '70' },
        });

        fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
        expect(mockAddStandardMasteryTarget).toHaveBeenCalledWith(
            expect.objectContaining({ year: 'groep-8', voTrack: undefined, targetPercentage: 70 })
        );
    });

    it('keeps the save button disabled while the form is incomplete or invalid', () => {
        mockSettings.standardsApiKey = 'key';
        render(<StandardMasteryTargetModal onClose={vi.fn()} />);

        const save = screen.getByRole('button', { name: 'common.save' });
        expect(save).toBeDisabled();

        fireEvent.click(screen.getByRole('button', { name: 'settings.mastery_target_choose_standard' }));
        fireEvent.click(screen.getByRole('button', { name: 'mock-picker-select', hidden: true }));
        // No year selected yet
        expect(save).toBeDisabled();

        fireEvent.change(screen.getByLabelText('studentsPage.form_school_year'), { target: { value: 'jaar-1' } });
        // Year present but percentage still empty and track unset
        expect(save).toBeDisabled();

        fireEvent.change(screen.getByLabelText('settings.mastery_target_percentage_label'), {
            target: { value: '150' },
        });
        expect(save).toBeDisabled();

        fireEvent.change(screen.getByLabelText('settings.mastery_target_percentage_label'), {
            target: { value: '50' },
        });
        fireEvent.change(screen.getByLabelText('voTrack.section_label'), { target: { value: 'vwo' } });
        expect(save).toBeEnabled();
    });

    it('prefills and updates an existing target', () => {
        const onClose = vi.fn();
        render(<StandardMasteryTargetModal existing={existing} onClose={onClose} />);

        expect(screen.getByText('settings.mastery_target_edit_title')).toBeInTheDocument();
        expect(screen.getByText('Cite textual evidence')).toBeInTheDocument();
        expect((screen.getByLabelText('studentsPage.form_school_year') as HTMLSelectElement).value).toBe('jaar-2');
        expect((screen.getByLabelText('voTrack.section_label') as HTMLSelectElement).value).toBe('havo');
        expect((screen.getByLabelText('settings.mastery_target_percentage_label') as HTMLInputElement).value).toBe(
            '80'
        );

        fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
        expect(mockUpdateStandardMasteryTarget).toHaveBeenCalledWith({
            ...existing,
            standardGuid: 'st-1',
            standardDescription: 'Cite textual evidence',
            standardSetTitle: 'ELA Standards',
            year: 'jaar-2',
            voTrack: 'havo',
            targetPercentage: 80,
        });
        expect(onClose).toHaveBeenCalled();
    });

    it('closes via the header close and cancel buttons', () => {
        const onClose = vi.fn();
        render(<StandardMasteryTargetModal onClose={onClose} />);

        fireEvent.click(screen.getByRole('button', { name: 'common.close' }));
        fireEvent.click(screen.getByRole('button', { name: 'common.cancel' }));
        expect(onClose).toHaveBeenCalledTimes(2);
    });

    it('reopens the picker via the change button and closes it without selecting', () => {
        mockSettings.standardsApiKey = 'key';
        render(<StandardMasteryTargetModal onClose={vi.fn()} />);

        fireEvent.click(screen.getByRole('button', { name: 'settings.mastery_target_choose_standard' }));
        fireEvent.click(screen.getByRole('button', { name: 'mock-picker-select', hidden: true }));

        // Change button reopens the picker for the now-set standard.
        fireEvent.click(screen.getByRole('button', { name: 'common.change', hidden: false }));
        expect(screen.getByRole('button', { name: 'mock-picker-close', hidden: true })).toBeInTheDocument();

        // Closing the picker keeps the selected standard.
        fireEvent.click(screen.getByRole('button', { name: 'mock-picker-close', hidden: true }));
        expect(screen.getByText('RH.6-8.1')).toBeInTheDocument();
    });
});
