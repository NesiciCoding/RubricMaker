import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import NewRubricChooserModal from '../NewRubricChooserModal';
import type { UserTemplate } from '../../../types';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('../../../data/templates', () => ({
    QUICK_START_TEMPLATES: [
        { name: 'Essay Rubric', subject: 'English', criteria: [] },
        { name: 'Lab Report', subject: 'Science', criteria: [] },
    ],
}));

const userTemplates: UserTemplate[] = [
    { id: 'ut1', name: 'My Saved Rubric', subject: 'History', criteria: [], savedAt: '2024-01-01T00:00:00Z' },
];

describe('NewRubricChooserModal', () => {
    it('offers blank, template and import, and calls onBlank / onImport', () => {
        const onClose = vi.fn();
        const onBlank = vi.fn();
        const onImport = vi.fn();
        const onPickTemplate = vi.fn();
        render(
            <NewRubricChooserModal
                userTemplates={[]}
                onClose={onClose}
                onBlank={onBlank}
                onImport={onImport}
                onPickTemplate={onPickTemplate}
            />
        );
        expect(screen.getByText('rubricList.chooser_title')).toBeInTheDocument();
        expect(screen.getByText('rubricList.chooser_blank_title')).toBeInTheDocument();
        expect(screen.getByText('rubricList.chooser_template_title')).toBeInTheDocument();
        expect(screen.getByText('rubricList.chooser_import_title')).toBeInTheDocument();

        fireEvent.click(screen.getByText('rubricList.chooser_blank_title'));
        expect(onBlank).toHaveBeenCalledTimes(1);

        fireEvent.click(screen.getByText('rubricList.chooser_import_title'));
        expect(onImport).toHaveBeenCalledTimes(1);
    });

    it('closes via the header close button', () => {
        const onClose = vi.fn();
        render(
            <NewRubricChooserModal
                userTemplates={[]}
                onClose={onClose}
                onBlank={vi.fn()}
                onImport={vi.fn()}
                onPickTemplate={vi.fn()}
            />
        );
        fireEvent.click(screen.getByRole('button', { name: 'common.close' }));
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('drills into the template list, shows user templates above built-ins, and picks one', () => {
        const onPickTemplate = vi.fn();
        render(
            <NewRubricChooserModal
                userTemplates={userTemplates}
                onClose={vi.fn()}
                onBlank={vi.fn()}
                onImport={vi.fn()}
                onPickTemplate={onPickTemplate}
            />
        );
        fireEvent.click(screen.getByText('rubricList.chooser_template_title'));

        // The chooser's main options are gone; we're on the template list screen now.
        expect(screen.queryByText('rubricList.chooser_blank_title')).not.toBeInTheDocument();
        expect(screen.getByText('dashboard.my_templates')).toBeInTheDocument();
        expect(screen.getByText('My Saved Rubric')).toBeInTheDocument();
        expect(screen.getByText('dashboard.builtin_templates')).toBeInTheDocument();
        expect(screen.getByText('Essay Rubric')).toBeInTheDocument();
        expect(screen.getByText('Lab Report')).toBeInTheDocument();

        fireEvent.click(screen.getByText('My Saved Rubric'));
        expect(onPickTemplate).toHaveBeenCalledWith(userTemplates[0]);
    });

    it('picks a built-in template with id/createdAt/updatedAt cleared', () => {
        const onPickTemplate = vi.fn();
        render(
            <NewRubricChooserModal
                userTemplates={[]}
                onClose={vi.fn()}
                onBlank={vi.fn()}
                onImport={vi.fn()}
                onPickTemplate={onPickTemplate}
            />
        );
        fireEvent.click(screen.getByText('rubricList.chooser_template_title'));
        fireEvent.click(screen.getByText('Essay Rubric'));
        expect(onPickTemplate).toHaveBeenCalledWith(
            expect.objectContaining({
                name: 'Essay Rubric',
                subject: 'English',
                id: undefined,
                createdAt: undefined,
                updatedAt: undefined,
            })
        );
    });

    it('goes back from the template list to the main chooser', () => {
        render(
            <NewRubricChooserModal
                userTemplates={[]}
                onClose={vi.fn()}
                onBlank={vi.fn()}
                onImport={vi.fn()}
                onPickTemplate={vi.fn()}
            />
        );
        fireEvent.click(screen.getByText('rubricList.chooser_template_title'));
        expect(screen.getByText('dashboard.builtin_templates')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'common.back' }));
        expect(screen.getByText('rubricList.chooser_blank_title')).toBeInTheDocument();
        expect(screen.queryByText('dashboard.builtin_templates')).not.toBeInTheDocument();
    });
});
