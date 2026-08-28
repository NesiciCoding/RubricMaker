import React from 'react';
import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import RichContent from '../RichContent';

describe('RichContent', () => {
    it('renders sanitized html with the base class when no className is given', () => {
        const { container } = render(<RichContent html="<p>Hello <b>world</b></p>" />);
        const el = container.querySelector('.essay-editor-content');
        expect(el).toBeTruthy();
        expect(el?.textContent).toContain('Hello world');
        expect(el?.className).toBe('essay-editor-content');
    });

    it('appends a custom className when provided', () => {
        const { container } = render(<RichContent html="<p>Hi</p>" className="extra-class" />);
        expect(container.querySelector('.essay-editor-content.extra-class')).toBeTruthy();
    });
});
