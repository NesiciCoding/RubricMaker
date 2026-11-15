import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

vi.mock('../../components/Layout/Topbar', () => ({
    default: ({ title }: { title: string }) => <h1>{title}</h1>,
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
    it('asks before adding, and adds nothing on its own', async () => {
        await renderImport(encodeRubricShareCode(sharedRubric));

        expect(
            await screen.findByRole('heading', { level: 2, name: 'importRubric.confirm_title' })
        ).toBeInTheDocument();
        expect(screen.getByText('Shared essay rubric')).toBeInTheDocument();
        expect(screen.getByText('English')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'importRubric.confirm_view_preview' })).toHaveAttribute(
            'href',
            expect.stringContaining('/preview/')
        );
        expect(addRubric).not.toHaveBeenCalled();
    });

    it('adds the shared rubric once confirmed and opens it', async () => {
        await renderImport(encodeRubricShareCode(sharedRubric));

        fireEvent.click(await screen.findByRole('button', { name: /importRubric\.confirm_add/ }));

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

    it('adds the rubric only once, however often the button is clicked', async () => {
        await renderImport(encodeRubricShareCode(sharedRubric));

        const add = await screen.findByRole('button', { name: /importRubric\.confirm_add/ });
        fireEvent.click(add);
        fireEvent.click(add);

        await waitFor(() => expect(screen.getByRole('heading', { name: 'Rubric builder' })).toBeInTheDocument());
        expect(addRubric).toHaveBeenCalledTimes(1);
    });

    it('returns to the rubric list without adding when cancelled', async () => {
        await renderImport(encodeRubricShareCode(sharedRubric));

        fireEvent.click(await screen.findByRole('link', { name: 'common.cancel' }));

        await waitFor(() => expect(screen.getByRole('heading', { name: 'Rubric list' })).toBeInTheDocument());
        expect(addRubric).not.toHaveBeenCalled();
    });

    it('explains a damaged link and offers the rubric list instead', async () => {
        await renderImport('broken-code');

        await waitFor(() => expect(screen.getByText('importRubric.failed_title')).toBeInTheDocument());
        expect(screen.queryByRole('button', { name: /importRubric\.confirm_add/ })).not.toBeInTheDocument();
        expect(addRubric).not.toHaveBeenCalled();
        expect(screen.getByRole('link', { name: 'importRubric.back_to_rubrics' })).toHaveAttribute('href', '/rubrics');
    });
});
