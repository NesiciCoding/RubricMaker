import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { encodeRubricShareCode } from '../../utils/rubricImport';
import { DEFAULT_FORMAT, type GradeScale, type Rubric } from '../../types';

const addRubric = vi.fn();
const gradeScales: GradeScale[] = [
    { id: 'gs-mine', name: 'Percentage', type: 'percentage', ranges: [] },
    { id: 'gs-shared', name: 'Letters', type: 'letter', ranges: [] },
];

vi.mock('../../context/AppContext', () => ({
    useAuthoring: () => ({ gradeScales, addRubric }),
    useSettings: () => ({ settings: { defaultGradeScaleId: 'gs-mine' } }),
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));

const sharedRubric: Rubric = {
    id: 'r-shared',
    name: 'Shared essay rubric',
    subject: 'English',
    description: 'Sent by a colleague',
    gradeScaleId: 'gs-shared',
    scoringMode: 'total-points',
    totalMaxPoints: 40,
    format: DEFAULT_FORMAT,
    criteria: [
        {
            id: 'c1',
            title: 'Structure',
            description: '',
            weight: 100,
            levels: [{ id: 'l1', label: 'Good', minPoints: 0, maxPoints: 40, description: '', subItems: [] }],
        },
    ],
    attachmentIds: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
};

async function renderImport(code: string) {
    const { default: RubricImportPage } = await import('../RubricImportPage');
    const router = createMemoryRouter(
        [
            { path: '/rubrics/import/:code', element: <RubricImportPage /> },
            { path: '/rubrics/:id', element: <h1>Rubric builder</h1> },
            { path: '/rubrics', element: <h1>Rubric list</h1> },
        ],
        { initialEntries: [`/rubrics/import/${code}`] }
    );
    render(<RouterProvider router={router} />);
}

beforeEach(() => {
    addRubric.mockReset();
    addRubric.mockImplementation(() => ({ id: 'new-rubric' }));
});

describe('RubricImportPage', () => {
    it('adds the shared rubric to the workspace and opens it', async () => {
        await renderImport(encodeRubricShareCode(sharedRubric));

        await waitFor(() => expect(screen.getByRole('heading', { name: 'Rubric builder' })).toBeInTheDocument());
        expect(addRubric).toHaveBeenCalledTimes(1);
        expect(addRubric).toHaveBeenCalledWith(
            expect.objectContaining({
                name: 'Shared essay rubric',
                gradeScaleId: 'gs-shared',
                scoringMode: 'total-points',
                totalMaxPoints: 40,
            })
        );
    });

    it('adds the rubric only once', async () => {
        await renderImport(encodeRubricShareCode(sharedRubric));

        await waitFor(() => expect(screen.getByRole('heading', { name: 'Rubric builder' })).toBeInTheDocument());
        expect(addRubric).toHaveBeenCalledTimes(1);
    });

    it('explains a damaged link and offers the rubric list instead', async () => {
        await renderImport('broken-code');

        await waitFor(() => expect(screen.getByText('importRubric.failed_title')).toBeInTheDocument());
        expect(addRubric).not.toHaveBeenCalled();
        expect(screen.getByRole('link', { name: 'importRubric.back_to_rubrics' })).toHaveAttribute('href', '/rubrics');
    });
});
