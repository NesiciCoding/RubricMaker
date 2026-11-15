import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import RubricPreviewPage from '../RubricPreviewPage';
import { encodeRubricShareCode } from '../../utils/rubricImport';
import { makeTotalPointsRubric } from '../../test-utils/totalPointsRubric';
import { DEFAULT_FORMAT } from '../../types';
import type { Rubric } from '../../types';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key),
        i18n: { language: 'en' },
    }),
}));

function renderPreview(rubric: Rubric) {
    const code = encodeRubricShareCode(rubric);
    const router = createMemoryRouter([{ path: '/preview/:code', element: <RubricPreviewPage /> }], {
        initialEntries: [`/preview/${code}`],
    });
    return render(<RouterProvider router={router} />);
}

function levelLabels(container: HTMLElement): string[] {
    return Array.from(container.querySelectorAll('ul li')).map((li) =>
        (li.firstElementChild?.firstChild?.textContent ?? '').trim()
    );
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('RubricPreviewPage format fidelity', () => {
    it('hides criterion weights when the rubric format sets showWeights to false', () => {
        const { container } = renderPreview(
            makeTotalPointsRubric({ format: { ...DEFAULT_FORMAT, showWeights: false } })
        );

        expect(screen.queryByText(/rubricPreview\.weight/)).not.toBeInTheDocument();
        expect(container.textContent).not.toContain('rubricPreview.weight');
    });

    it('shows criterion weights by default', () => {
        renderPreview(makeTotalPointsRubric());

        expect(screen.getAllByText(/rubricPreview\.weight/).length).toBeGreaterThan(0);
    });

    it('renders levels worst-first when the rubric format asks for it', () => {
        const { container } = renderPreview(
            makeTotalPointsRubric({ format: { ...DEFAULT_FORMAT, levelOrder: 'worst-first' } })
        );

        const labels = levelLabels(container);
        expect(labels.indexOf('Low')).toBeLessThan(labels.indexOf('High'));
    });

    it('renders levels best-first by default', () => {
        const { container } = renderPreview(makeTotalPointsRubric());

        const labels = levelLabels(container);
        expect(labels.indexOf('High')).toBeLessThan(labels.indexOf('Low'));
    });

    it('prints the page with the format orientation applied', () => {
        const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});
        renderPreview(makeTotalPointsRubric({ format: { ...DEFAULT_FORMAT, orientation: 'landscape' } }));

        fireEvent.click(screen.getByRole('button', { name: /common\.print/i }));

        expect(printSpy).toHaveBeenCalledTimes(1);
    });
});
