import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { RemountOnParam } from '../../components/ui/RemountOnParam';
import type { EssayAssignment } from '../../types';

const essayA: EssayAssignment = {
    rubricId: 'r1',
    studentId: 's1',
    teacherKey: 'tk-a',
    title: 'Should schools ban smartphones?',
    readOnlyAfterSubmit: true,
    createdAt: '2024-01-01T00:00:00Z',
};
const essayB: EssayAssignment = {
    ...essayA,
    teacherKey: 'tk-b',
    title: 'My favourite holiday memory',
};

const mockUpdateEssayGroup = vi.fn();
const mockApp = {
    essayAssignments: [essayA, essayB],
    essaySubmissions: [],
    rubrics: [],
    classes: [],
    students: [],
    studentRubrics: [],
    addEssayAssignments: vi.fn(),
    updateEssayGroup: mockUpdateEssayGroup,
    addEssaySubmission: vi.fn(),
    settings: {},
};
vi.mock('../../context/AppContext', () => ({
    useRoster: () => mockApp,
    useStudents: () => mockApp,
    useClasses: () => mockApp,
    useGrading: () => mockApp,
    useAuthoring: () => mockApp,
    useAssessment: () => mockApp,
    useEssays: () => mockApp,
    useFlashcards: () => mockApp,
    useSettings: () => mockApp,
    usePlatform: () => mockApp,
}));
vi.mock('../../hooks/useToast', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));

describe('EssayBuilderPage route changes (#612)', () => {
    beforeEach(() => mockUpdateEssayGroup.mockClear());

    it('reloads the form from the essay in the URL and saves only that essay', async () => {
        const { default: EssayBuilderPage } = await import('../EssayBuilderPage');
        // Same wiring as App.tsx.
        const element = (
            <RemountOnParam param="teacherKey">
                <EssayBuilderPage />
            </RemountOnParam>
        );
        const router = createMemoryRouter(
            [
                { path: '/essays/new', element },
                { path: '/essays/:teacherKey', element },
            ],
            { initialEntries: ['/essays/tk-a'] }
        );
        render(<RouterProvider router={router} />);
        const titleInput = () => screen.getByPlaceholderText('essays.title_label');
        expect(titleInput()).toHaveValue(essayA.title);

        await act(() => router.navigate('/essays/tk-b'));
        expect(titleInput()).toHaveValue(essayB.title);
        fireEvent.click(screen.getByText('essays.save'));
        expect(mockUpdateEssayGroup).toHaveBeenCalledWith('tk-b', expect.objectContaining({ title: essayB.title }));

        await act(() => router.navigate('/essays/new'));
        expect(titleInput()).toHaveValue('');

        await act(() => router.navigate('/essays/tk-a'));
        expect(titleInput()).toHaveValue(essayA.title);
    });
});
