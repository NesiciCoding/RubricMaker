import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import TestSettingsDrawer, { type TestSettingsValues } from '../TestSettingsDrawer';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));

const values: TestSettingsValues = {
    mode: 'assessment',
    placementEngine: 'mst',
    contentArea: '',
    contentLanguage: '',
    durationMinutes: '60',
    dueDate: '',
    shuffleQuestions: false,
    requireSEB: false,
    allowMultipleAttempts: false,
    gradeScaleId: 'gs1',
    norm: {},
    cefrTargetLevel: '',
    cefrSkill: '',
    printHeader: '',
    printIntro: '',
    printFooter: '',
};

function renderDrawer(
    overrides: Partial<React.ComponentProps<typeof TestSettingsDrawer>> = {},
    extraValues: Partial<TestSettingsValues> = {}
) {
    const onChange = vi.fn();
    const onNormChange = vi.fn();
    const onTabChange = vi.fn();
    const onClose = vi.fn();
    render(
        <TestSettingsDrawer
            open
            tab="basics"
            onTabChange={onTabChange}
            onClose={onClose}
            value={{ ...values, ...extraValues }}
            onChange={onChange}
            onNormChange={onNormChange}
            gradeScales={[{ id: 'gs1', name: 'A–F' } as never]}
            maxPoints={10}
            {...overrides}
        />
    );
    return { onChange, onNormChange, onTabChange, onClose };
}

describe('TestSettingsDrawer', () => {
    it('renders nothing until it is opened', () => {
        renderDrawer({ open: false });
        expect(screen.queryByTestId('settings-drawer')).not.toBeInTheDocument();
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('opens as a dialog with the tabs and the active pane marked', () => {
        renderDrawer();
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(screen.getByTestId('settings-drawer')).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: 'tests.settings_tab_basics' })).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByRole('tab', { name: 'tests.settings_tab_delivery' })).toHaveAttribute(
            'aria-selected',
            'false'
        );
    });

    it('reports every basics change as a patch', () => {
        const { onChange } = renderDrawer();
        fireEvent.change(screen.getByLabelText('tests.mode_label'), { target: { value: 'practice' } });
        expect(onChange).toHaveBeenCalledWith({ mode: 'practice' });
        fireEvent.change(screen.getByLabelText('tests.content_language_label'), { target: { value: 'nl' } });
        expect(onChange).toHaveBeenCalledWith({ contentLanguage: 'nl' });
        fireEvent.change(screen.getByLabelText('cefr.target_level_label'), { target: { value: 'B2' } });
        expect(onChange).toHaveBeenCalledWith({ cefrTargetLevel: 'B2' });
        fireEvent.change(screen.getByLabelText('cefr.skill_label'), { target: { value: 'writing' } });
        expect(onChange).toHaveBeenCalledWith({ cefrSkill: 'writing' });
    });

    it('asks for another tab instead of showing two panes at once', () => {
        const { onTabChange } = renderDrawer();
        fireEvent.click(screen.getByRole('tab', { name: 'tests.settings_tab_delivery' }));
        expect(onTabChange).toHaveBeenCalledWith('delivery');
        expect(document.getElementById('test-settings-panel-basics')).not.toHaveAttribute('hidden');
        expect(document.getElementById('test-settings-panel-delivery')).toHaveAttribute('hidden');
    });

    it('shows the duration error on the delivery tab and clears through the patch', () => {
        const { onChange } = renderDrawer({ tab: 'delivery', durationError: 'tests.bad_duration' });
        const duration = screen.getByLabelText('tests.duration_label');
        expect(duration).toHaveAttribute('aria-invalid', 'true');
        expect(screen.getByText('tests.bad_duration')).toBeInTheDocument();
        fireEvent.change(duration, { target: { value: '45' } });
        expect(onChange).toHaveBeenCalledWith({ durationMinutes: '45' });
        fireEvent.click(screen.getByText('tests.require_seb_label'));
        expect(onChange).toHaveBeenCalledWith({ requireSEB: true });
    });

    it('offers retakes only for practice tests', () => {
        renderDrawer({ tab: 'delivery' });
        expect(screen.queryByText('tests.allow_multiple_attempts_label')).not.toBeInTheDocument();
        renderDrawer({ tab: 'delivery' }, { mode: 'practice' });
        expect(screen.getByText('tests.allow_multiple_attempts_label')).toBeInTheDocument();
    });

    it('clears the grade scale and passes norm edits through', () => {
        const { onChange, onNormChange } = renderDrawer({ tab: 'scoring' });
        fireEvent.change(screen.getByLabelText('tests.grade_scale_label'), { target: { value: '' } });
        expect(onChange).toHaveBeenCalledWith({ gradeScaleId: undefined });
        fireEvent.change(document.getElementById('builder-norm-type')!, { target: { value: 'nterm' } });
        expect(onNormChange).toHaveBeenCalled();
    });

    it('switches an assessment into placement mode from the placement tab', () => {
        const { onChange } = renderDrawer({ tab: 'placement' });
        expect(screen.getByText('tests.settings_placement_off')).toBeInTheDocument();
        fireEvent.click(screen.getByText('tests.settings_placement_switch'));
        expect(onChange).toHaveBeenCalledWith({ mode: 'placement' });
    });

    it('keeps the paper fields on the print tab', () => {
        renderDrawer({ tab: 'print' });
        expect(screen.getByTestId('settings-printHeader')).toBeInTheDocument();
        expect(screen.getByTestId('settings-printIntro')).toBeInTheDocument();
        expect(screen.getByTestId('settings-printFooter')).toBeInTheDocument();
    });

    it('renders read-only for a shared test, and closes on Escape', () => {
        const { onClose } = renderDrawer({ readOnly: true });
        expect(screen.getByText('tests.settings_read_only')).toBeInTheDocument();
        expect(screen.getByLabelText('tests.mode_label')).toBeDisabled();
        fireEvent.keyDown(document.body, { key: 'Escape' });
        expect(onClose).toHaveBeenCalled();
    });
});
