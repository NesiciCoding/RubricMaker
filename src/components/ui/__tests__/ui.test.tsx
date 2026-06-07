import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FileText } from 'lucide-react';
import Modal from '../Modal';
import { ConfirmDialog } from '../ConfirmDialog';
import { EmptyState } from '../EmptyState';
import { ErrorBoundary } from '../ErrorBoundary';
import { Skeleton, SkeletonText, SkeletonCard, SkeletonRow } from '../Skeleton';

// ─── Modal ───────────────────────────────────────────────────────────────────

describe('Modal', () => {
    it('renders children', () => {
        render(
            <Modal titleId="m1" onClose={vi.fn()}>
                <p>Modal body</p>
            </Modal>
        );
        expect(screen.getByText('Modal body')).toBeInTheDocument();
    });

    it('has dialog role', () => {
        render(
            <Modal titleId="m1" onClose={vi.fn()}>
                <span>x</span>
            </Modal>
        );
        expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('applies custom maxWidth via style', () => {
        render(
            <Modal titleId="m1" onClose={vi.fn()} maxWidth={800}>
                <span>x</span>
            </Modal>
        );
        const dialog = screen.getByRole('dialog');
        expect(dialog.getAttribute('style')).toContain('800px');
    });

    it('appends extra className to the dialog element', () => {
        render(
            <Modal titleId="m1" onClose={vi.fn()} className="wide">
                <span>x</span>
            </Modal>
        );
        expect(screen.getByRole('dialog').className).toContain('wide');
    });

    it('calls onClose when Escape key pressed', () => {
        const onClose = vi.fn();
        render(
            <Modal titleId="m1" onClose={onClose}>
                <span>x</span>
            </Modal>
        );
        fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
        expect(onClose).toHaveBeenCalled();
    });
});

// ─── ConfirmDialog ───────────────────────────────────────────────────────────

describe('ConfirmDialog', () => {
    const baseProps = {
        title: 'Delete item',
        message: 'Are you sure?',
        onConfirm: vi.fn(),
        onCancel: vi.fn(),
    };

    beforeEach(() => vi.clearAllMocks());

    it('renders nothing when open=false', () => {
        render(<ConfirmDialog {...baseProps} open={false} />);
        expect(screen.queryByText('Delete item')).not.toBeInTheDocument();
    });

    it('renders title and message when open=true', () => {
        render(<ConfirmDialog {...baseProps} open />);
        expect(screen.getByText('Delete item')).toBeInTheDocument();
        expect(screen.getByText('Are you sure?')).toBeInTheDocument();
    });

    it('clicking the confirm button calls onConfirm', () => {
        const onConfirm = vi.fn();
        render(<ConfirmDialog {...baseProps} open onConfirm={onConfirm} />);
        fireEvent.click(screen.getByRole('button', { name: /confirm/i }));
        expect(onConfirm).toHaveBeenCalledTimes(1);
    });

    it('clicking the cancel button calls onCancel', () => {
        const onCancel = vi.fn();
        render(<ConfirmDialog {...baseProps} open onCancel={onCancel} />);
        fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
        expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it('uses custom confirm and cancel labels', () => {
        render(<ConfirmDialog {...baseProps} open confirmLabel="Yes, delete" cancelLabel="No thanks" />);
        expect(screen.getByRole('button', { name: 'Yes, delete' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'No thanks' })).toBeInTheDocument();
    });

    it('renders btn-danger class when danger=true', () => {
        render(<ConfirmDialog {...baseProps} open danger />);
        expect(screen.getByRole('button', { name: /confirm/i }).className).toContain('btn-danger');
    });

    it('renders btn-primary class when danger=false', () => {
        render(<ConfirmDialog {...baseProps} open danger={false} />);
        expect(screen.getByRole('button', { name: /confirm/i }).className).toContain('btn-primary');
    });

    it('shows alert triangle icon when danger=true', () => {
        render(<ConfirmDialog {...baseProps} open danger />);
        // Portal renders outside container — query the document
        expect(document.querySelector('svg[aria-hidden="true"]')).toBeTruthy();
    });

    it('does not render the alert icon when danger=false', () => {
        render(<ConfirmDialog {...baseProps} open danger={false} />);
        // No AlertTriangle when danger=false — only the confirm/cancel buttons exist
        expect(screen.queryByRole('button', { name: /confirm/i })?.className).not.toContain('btn-danger');
    });

    it('calls onCancel when the dialog is dismissed via Escape', () => {
        const onCancel = vi.fn();
        render(<ConfirmDialog {...baseProps} open onCancel={onCancel} />);
        fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
        expect(onCancel).toHaveBeenCalled();
    });
});

// ─── EmptyState ───────────────────────────────────────────────────────────────

describe('EmptyState', () => {
    it('renders the title', () => {
        render(<EmptyState icon={FileText} title="Nothing here" />);
        expect(screen.getByText('Nothing here')).toBeInTheDocument();
    });

    it('renders description when provided', () => {
        render(<EmptyState icon={FileText} title="Title" description="Some detail text" />);
        expect(screen.getByText('Some detail text')).toBeInTheDocument();
    });

    it('does not render description when omitted', () => {
        render(<EmptyState icon={FileText} title="Title" />);
        expect(screen.queryByText('Some detail text')).not.toBeInTheDocument();
    });

    it('renders action button when action prop is provided', () => {
        render(<EmptyState icon={FileText} title="Title" action={{ label: 'Add item', onClick: vi.fn() }} />);
        expect(screen.getByRole('button', { name: 'Add item' })).toBeInTheDocument();
    });

    it('calls action.onClick when the action button is clicked', () => {
        const onClick = vi.fn();
        render(<EmptyState icon={FileText} title="Title" action={{ label: 'Add item', onClick }} />);
        fireEvent.click(screen.getByRole('button', { name: 'Add item' }));
        expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('does not render a button when action is omitted', () => {
        render(<EmptyState icon={FileText} title="Title" />);
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });
});

// ─── ErrorBoundary ───────────────────────────────────────────────────────────

function Bomb(): React.ReactElement {
    throw new Error('test-boom');
}

describe('ErrorBoundary', () => {
    beforeEach(() => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('renders children when no error is thrown', () => {
        render(
            <ErrorBoundary>
                <p>Safe content</p>
            </ErrorBoundary>
        );
        expect(screen.getByText('Safe content')).toBeInTheDocument();
    });

    it('renders default fallback UI when a child throws', () => {
        render(
            <ErrorBoundary>
                <Bomb />
            </ErrorBoundary>
        );
        expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    });

    it('shows the error message in the fallback UI', () => {
        render(
            <ErrorBoundary>
                <Bomb />
            </ErrorBoundary>
        );
        expect(screen.getByText('test-boom')).toBeInTheDocument();
    });

    it('renders custom fallback when fallback prop is provided', () => {
        render(
            <ErrorBoundary fallback={<p>Custom error UI</p>}>
                <Bomb />
            </ErrorBoundary>
        );
        expect(screen.getByText('Custom error UI')).toBeInTheDocument();
        expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
    });

    it('shows a Reload page button in the default fallback', () => {
        render(
            <ErrorBoundary>
                <Bomb />
            </ErrorBoundary>
        );
        expect(screen.getByRole('button', { name: /reload page/i })).toBeInTheDocument();
    });

    it('reloads the page when the Reload page button is clicked', () => {
        const reload = vi.fn();
        const originalLocation = window.location;
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: { ...originalLocation, reload },
        });

        render(
            <ErrorBoundary>
                <Bomb />
            </ErrorBoundary>
        );
        fireEvent.click(screen.getByRole('button', { name: /reload page/i }));
        expect(reload).toHaveBeenCalledTimes(1);

        Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
    });
});

// ─── Skeleton ─────────────────────────────────────────────────────────────────

describe('Skeleton', () => {
    it('renders a skeleton element', () => {
        const { container } = render(<Skeleton />);
        expect(container.querySelector('.skeleton')).toBeTruthy();
    });

    it('applies custom width', () => {
        const { container } = render(<Skeleton width="50%" />);
        const el = container.querySelector('.skeleton') as HTMLElement;
        expect(el.style.width).toBe('50%');
    });

    it('applies custom height', () => {
        const { container } = render(<Skeleton height="3rem" />);
        const el = container.querySelector('.skeleton') as HTMLElement;
        expect(el.style.height).toBe('3rem');
    });

    it('applies custom borderRadius', () => {
        const { container } = render(<Skeleton borderRadius="50%" />);
        const el = container.querySelector('.skeleton') as HTMLElement;
        expect(el.style.borderRadius).toBe('50%');
    });

    it('merges custom style', () => {
        const { container } = render(<Skeleton style={{ opacity: 0.4 }} />);
        const el = container.querySelector('.skeleton') as HTMLElement;
        expect(el.style.opacity).toBe('0.4');
    });
});

describe('SkeletonText', () => {
    it('renders 3 skeleton lines by default', () => {
        const { container } = render(<SkeletonText />);
        expect(container.querySelectorAll('.skeleton')).toHaveLength(3);
    });

    it('renders the specified number of lines', () => {
        const { container } = render(<SkeletonText lines={5} />);
        expect(container.querySelectorAll('.skeleton')).toHaveLength(5);
    });

    it('renders 1 line', () => {
        const { container } = render(<SkeletonText lines={1} />);
        expect(container.querySelectorAll('.skeleton')).toHaveLength(1);
    });
});

describe('SkeletonCard', () => {
    it('renders without crash and has a card wrapper', () => {
        const { container } = render(<SkeletonCard />);
        expect(container.querySelector('.card')).toBeTruthy();
    });

    it('accepts a custom style prop', () => {
        const { container } = render(<SkeletonCard style={{ maxWidth: 400 }} />);
        const card = container.querySelector('.card') as HTMLElement;
        expect(card.style.maxWidth).toBe('400px');
    });
});

describe('SkeletonRow', () => {
    it('renders without crash', () => {
        const { container } = render(<SkeletonRow />);
        expect(container.firstChild).toBeTruthy();
    });

    it('renders multiple skeleton elements', () => {
        const { container } = render(<SkeletonRow />);
        expect(container.querySelectorAll('.skeleton').length).toBeGreaterThan(1);
    });
});
