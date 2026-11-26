import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import EssayEditor from './EssayEditor';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

/** #0f172a, the fixed page ink; jsdom reports computed colours as `rgb()`. */
const PAGE_INK_RGB = 'rgb(15, 23, 42)';

describe('EssayEditor page mode ink', () => {
    afterEach(() => {
        delete document.documentElement.dataset.theme;
    });

    for (const theme of ['light', 'dark'] as const) {
        it(`keeps the A4 sheet on page ink in the ${theme} theme`, async () => {
            document.documentElement.dataset.theme = theme;
            render(<EssayEditor content="<p>A marked essay</p>" onChange={() => {}} defaultPageMode />);

            const page = await screen.findByTestId('essay-page');
            expect(page).toHaveStyle({ background: '#fff' });
            // Not the theme's --text: page mode must stay legible on white paper in every palette.
            expect(getComputedStyle(page).color).toBe(PAGE_INK_RGB);
        });
    }

    it('leaves the compact editor theme-driven', async () => {
        document.documentElement.dataset.theme = 'dark';
        render(<EssayEditor content="<p>A marked essay</p>" onChange={() => {}} />);

        await waitFor(() => expect(document.querySelector('.essay-editor-content')).toBeTruthy());
        expect(screen.queryByTestId('essay-page')).not.toBeInTheDocument();
    });
});
