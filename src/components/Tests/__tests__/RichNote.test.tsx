import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import RichNote from '../RichNote';

describe('RichNote', () => {
    it('keeps the line breaks of a note written before notes were rich text', () => {
        const { container } = render(<RichNote text={'First line\nSecond line'} />);
        expect(container.querySelectorAll('p')).toHaveLength(2);
        expect(screen.getByText('Second line')).toBeInTheDocument();
    });

    it('shows plain text with a bare < or > as text', () => {
        const { container } = render(<RichNote text="Remember that 3 < 5 and 7 > 2" />);
        expect(container).toHaveTextContent('Remember that 3 < 5 and 7 > 2');
    });

    it('renders formatted notes and strips anything unsafe', () => {
        const { container } = render(
            <RichNote
                text={'<p>See <strong>rule 3</strong></p><img src=x onerror="alert(1)"><script>alert(1)</script>'}
                lang="fr"
            />
        );
        expect(screen.getByText('rule 3').tagName).toBe('STRONG');
        expect(container.querySelector('script')).toBeNull();
        expect(container.querySelector('img')?.getAttribute('onerror')).toBeNull();
        expect(container.querySelector('[lang="fr"]')).not.toBeNull();
    });
});
