import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import EssayEditor from './EssayEditor';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

/** The A4 sheet is the only element carrying the fixed page width. */
function pageSheet(container: HTMLElement) {
    return container.querySelector('div[style*="max-width: 794px"]');
}

const baseProps = {
    content: '<p>One two three</p>',
    onChange: vi.fn(),
    editable: false,
};

describe('EssayEditor page mode', () => {
    it('starts compact and takes the A4 sheet when the page mode arrives after mount', () => {
        const { container, rerender } = render(
            <EssayEditor {...baseProps} defaultPageMode={false} allowPageMode={false} />
        );
        expect(pageSheet(container)).toBeNull();

        rerender(<EssayEditor {...baseProps} defaultPageMode allowPageMode />);
        expect(pageSheet(container)).not.toBeNull();
    });

    it('returns to the compact flow when the sheet is no longer allowed', () => {
        const { container, rerender } = render(<EssayEditor {...baseProps} defaultPageMode allowPageMode />);
        expect(pageSheet(container)).not.toBeNull();

        rerender(<EssayEditor {...baseProps} defaultPageMode allowPageMode={false} />);
        expect(pageSheet(container)).toBeNull();
    });

    it('keeps a manual toggle when the prop itself has not changed', () => {
        const { container, rerender } = render(
            <EssayEditor {...baseProps} editable defaultPageMode={false} allowPageMode />
        );
        expect(pageSheet(container)).toBeNull();

        fireEvent.click(screen.getByTitle('editor.switchToPageView'));
        expect(pageSheet(container)).not.toBeNull();

        rerender(<EssayEditor {...baseProps} editable defaultPageMode={false} allowPageMode />);
        expect(pageSheet(container)).not.toBeNull();
    });
});
