import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import CefrBadge from '../CefrBadge';

describe('CefrBadge', () => {
    it('renders the CEFR level', () => {
        render(<CefrBadge level="B2" />);
        expect(screen.getByText('B2')).toBeInTheDocument();
    });

    it('renders the Cambridge short label when showCambridgeLabel is true and an exam exists', () => {
        render(<CefrBadge level="B2" showCambridgeLabel />);
        expect(screen.getByText('· FCE')).toBeInTheDocument();
    });

    it('does not render a Cambridge label for A1, even when showCambridgeLabel is true', () => {
        render(<CefrBadge level="A1" showCambridgeLabel />);
        expect(screen.queryByText(/·/)).toBeNull();
    });

    it('does not render a Cambridge label when showCambridgeLabel is false', () => {
        render(<CefrBadge level="B2" />);
        expect(screen.queryByText('· FCE')).toBeNull();
    });

    it('does not render a Cambridge label when showCambridgeLabel is explicitly false', () => {
        render(<CefrBadge level="C1" showCambridgeLabel={false} />);
        expect(screen.queryByText('· CAE')).toBeNull();
    });

    it('renders a working-toward level as an outlined badge with a tooltip (#691)', () => {
        render(<CefrBadge level="B1" developing title="Working toward B1" />);
        const badge = screen.getByText('B1');
        expect(badge).toHaveAttribute('data-developing', 'true');
        expect(badge.style.background).toBe('transparent');
        expect(badge.style.border).toContain('dashed');
        expect(screen.getByTitle('Working toward B1')).toBeInTheDocument();
    });

    it('renders achieved levels filled', () => {
        render(<CefrBadge level="B1" />);
        expect(screen.getByText('B1')).not.toHaveAttribute('data-developing');
    });
});
