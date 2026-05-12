/**
 * Tests for small components and utilities that were at 0% or near-zero coverage.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

// ─── CefrBadge ────────────────────────────────────────────────────────────────

vi.mock('../../data/cefrDescriptors', () => ({
    CEFR_LEVEL_COLORS: {
        A1: '#22c55e', A2: '#16a34a', B1: '#3b82f6', B2: '#2563eb',
        C1: '#f59e0b', C2: '#d97706',
    },
}));

import CefrBadge from '../CEFR/CefrBadge';

describe('CefrBadge', () => {
    it('renders level text', () => {
        render(<CefrBadge level="B1" />);
        expect(screen.getByText('B1')).toBeInTheDocument();
    });

    it('renders sm size', () => {
        const { container } = render(<CefrBadge level="A1" size="sm" />);
        expect(container.firstChild).toBeTruthy();
    });

    it('renders lg size', () => {
        const { container } = render(<CefrBadge level="C2" size="lg" />);
        expect(container.firstChild).toBeTruthy();
    });

    it('shows label when showLabel and label provided', () => {
        render(<CefrBadge level="B2" showLabel label="Upper-Intermediate" />);
        expect(screen.getByText('Upper-Intermediate')).toBeInTheDocument();
    });

    it('does not show label when showLabel is false', () => {
        render(<CefrBadge level="B2" showLabel={false} label="Upper-Intermediate" />);
        expect(screen.queryByText('Upper-Intermediate')).not.toBeInTheDocument();
    });

    it('applies custom style', () => {
        const { container } = render(<CefrBadge level="A2" style={{ marginTop: 8 }} />);
        const span = container.firstChild as HTMLElement;
        expect(span.style.marginTop).toBe('8px');
    });
});

// ─── renderWithRouter utility ─────────────────────────────────────────────────

import { renderWithRouter } from '../../test-utils/renderWithProviders';

describe('renderWithRouter', () => {
    it('renders element wrapped in MemoryRouter', () => {
        const { container } = renderWithRouter(<div data-testid="test">Hello</div>);
        expect(screen.getByTestId('test')).toBeInTheDocument();
    });

    it('renders with custom initial route', () => {
        const { container } = renderWithRouter(<div>content</div>, { initialRoute: '/some/path' });
        expect(container.firstChild).toBeTruthy();
    });
});
