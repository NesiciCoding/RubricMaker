import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import RubricPreviewPage from '../RubricPreviewPage';
import { encodeRubricShareCode } from '../../utils/rubricImport';
import { sheet, sheetRubric } from '../../test-utils/tieredSheetRubric';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key),
        i18n: { language: 'en' },
    }),
}));

function renderPreview(code: string) {
    const router = createMemoryRouter([{ path: '/preview/:code', element: <RubricPreviewPage /> }], {
        initialEntries: [`/preview/${code}`],
    });
    return render(<RouterProvider router={router} />);
}

describe('RubricPreviewPage — tiered rubric', () => {
    it("shows the sheet: requirements, then per criterion a column per tier with each band's statements", async () => {
        renderPreview(encodeRubricShareCode(sheetRubric()));
        expect(screen.getByRole('heading', { name: sheet.criteria[0].title })).toBeInTheDocument();
        expect(screen.getAllByRole('heading', { name: 'Havo' })).toHaveLength(sheet.criteria.length);
        expect(screen.getByText(sheet.requirements[0])).toBeInTheDocument();

        const vwoE = screen.getAllByRole('list', {
            name: 'rubricBuilder.tiered_cell_label:{"band":"E","tier":"VWO"}',
        })[0];
        expect(vwoE).toHaveTextContent(sheet.criteria[0].cells.vwo.e[0]);
        expect(vwoE).not.toHaveTextContent(sheet.criteria[0].cells.havo.e[0]);

        const { axe } = await import('jest-axe');
        const results = await axe(document.body, { rules: { 'color-contrast': { enabled: false } } });
        expect(results.violations).toEqual([]);
    });
});
