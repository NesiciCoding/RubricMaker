import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import StudentFeedbackPage from '../StudentFeedbackPage';
import { encodeFeedbackCode } from '../../utils/shareCode';
import { makeTotalPointsGrade, makeTotalPointsRubric, totalPointsScale } from '../../test-utils/totalPointsRubric';
import type { StudentRubric } from '../../types';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));

function renderPage(sr: StudentRubric) {
    const code = encodeFeedbackCode({
        sr,
        rubric: makeTotalPointsRubric(),
        student: { id: 'tp-student', name: 'Alice', classId: 'k1' } as never,
        scale: totalPointsScale,
    });
    const router = createMemoryRouter([{ path: '/feedback/:code', element: <StudentFeedbackPage /> }], {
        initialEntries: [`/feedback/${code}`],
    });
    return render(<RouterProvider router={router} />);
}

function gradeWithComments(criterionComment: string, overallComment: string): StudentRubric {
    return makeTotalPointsGrade({
        entries: [
            {
                criterionId: 'c1',
                levelId: 'c1-hi',
                checkedSubItems: [],
                comment: criterionComment,
                selectedPoints: 5,
            },
            { criterionId: 'c2', levelId: 'c2-hi', checkedSubItems: [], comment: '', selectedPoints: 3 },
        ],
        overallComment,
    });
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('StudentFeedbackPage rich-text comments', () => {
    it('renders a criterion comment as formatted content, not literal markup', () => {
        const { container } = renderPage(gradeWithComments('<p>Strong <strong>opening</strong> paragraph</p>', ''));

        const paragraph = container.querySelector('.essay-editor-content p');
        expect(paragraph?.textContent).toBe('Strong opening paragraph');
        expect(paragraph?.querySelector('strong')?.textContent).toBe('opening');
        expect(container.textContent).not.toContain('<strong>');
    });

    it('renders the overall comment as formatted content, not literal markup', () => {
        const { container } = renderPage(gradeWithComments('', '<p>Well <em>done</em> overall</p>'));

        const paragraph = container.querySelector('.essay-editor-content p');
        expect(paragraph?.textContent).toBe('Well done overall');
        expect(paragraph?.querySelector('em')?.textContent).toBe('done');
        expect(container.textContent).not.toContain('<em>');
    });

    it('prints the page from the no-print toolbar', () => {
        const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});
        renderPage(gradeWithComments('', '<p>Overall</p>'));

        fireEvent.click(screen.getByRole('button', { name: /common\.print/i }));

        expect(printSpy).toHaveBeenCalledTimes(1);
    });
});
