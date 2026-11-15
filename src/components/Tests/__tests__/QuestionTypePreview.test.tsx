import React from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import QuestionTypePreview from '../QuestionTypePreview';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));

const innerStyle = (container: HTMLElement) =>
    container.querySelector<HTMLElement>('.qtype-preview-inner')?.getAttribute('style') ?? '';

describe('QuestionTypePreview', () => {
    it('renders the student answer control itself rather than an image', () => {
        const { container } = render(<QuestionTypePreview type="multiple-choice" />);
        expect(container.querySelectorAll('img')).toHaveLength(0);
        expect(container.querySelectorAll('input[type="radio"]').length).toBeGreaterThan(1);
        expect(container.querySelector('.qtype-preview-surface')?.textContent).toContain('lovely');
    });

    it('scales down to fit a card when the host cannot be measured', () => {
        // jsdom never lays out, so clientWidth stays 0 — exactly the case the fallback covers.
        const { container } = render(<QuestionTypePreview type="true-false" />);
        expect(innerStyle(container)).toContain('scale(0.6)');
    });

    it('centres a control that is shorter than the card box', () => {
        const clientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
        const offsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');
        Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, value: 320 });
        Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, value: 87 });
        try {
            const { container } = render(<QuestionTypePreview type="true-false" />);
            // 320/520 ≈ 0.615 → 87px of control becomes ~54px, centred in the 150px card box.
            expect(innerStyle(container)).toMatch(/translateY\(48px\) scale\(0\.615/);
        } finally {
            if (clientWidth) Object.defineProperty(HTMLElement.prototype, 'clientWidth', clientWidth);
            if (offsetHeight) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', offsetHeight);
        }
    });

    it('leaves the full variant unscaled until it can be measured', () => {
        const { container } = render(<QuestionTypePreview type="hot-text" variant="full" />);
        expect(container.querySelector('.qtype-preview-card')).toBeNull();
        expect(container.querySelector('.is-clipped')).toBeNull();
    });
});
