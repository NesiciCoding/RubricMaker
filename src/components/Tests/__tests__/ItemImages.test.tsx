import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { TestQuestion } from '../../../types';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

import ItemImage from '../ItemImage';
import StudentAnswerSurface from '../StudentAnswerSurface';

const png = 'https://example.com/cat.png';
const q = (partial: Partial<TestQuestion>): TestQuestion =>
    ({ id: 'q1', prompt: 'p', type: 'ordering', points: 1, ...partial }) as TestQuestion;

describe('item images', () => {
    it('renders only safe image URLs', () => {
        const { container, rerender } = render(<ItemImage url={png} alt="cat" />);
        expect(screen.getByRole('img', { name: 'cat' })).toHaveAttribute('src', png);
        rerender(<ItemImage url="javascript:alert(1)" />);
        expect(container).toBeEmptyDOMElement();
        rerender(<ItemImage />);
        expect(container).toBeEmptyDOMElement();
    });

    it('shows a picture on ordering, categorize and matching items', () => {
        const ordering = q({ orderItems: [{ id: 'a', text: 'First', imageUrl: png }] });
        const { unmount } = render(<StudentAnswerSurface question={ordering} value="" onChange={vi.fn()} code="c" />);
        expect(screen.getByRole('img', { name: 'First' })).toBeInTheDocument();
        unmount();

        const categorize = q({
            type: 'categorize',
            categories: [{ id: 'k', label: 'Animals' }],
            categorizeItems: [{ id: 'i', text: 'Cat', categoryId: 'k', imageUrl: png }],
        });
        const second = render(<StudentAnswerSurface question={categorize} value="" onChange={vi.fn()} code="c" />);
        expect(screen.getByRole('img', { name: 'Cat' })).toBeInTheDocument();
        second.unmount();

        const matching = q({
            type: 'matching',
            matchingPairs: [{ id: 'p', left: 'Dog', right: 'Hond', leftImageUrl: png }],
        });
        render(<StudentAnswerSurface question={matching} value="" onChange={vi.fn()} code="c" />);
        expect(screen.getByRole('img', { name: 'Dog' })).toBeInTheDocument();
    });
});
