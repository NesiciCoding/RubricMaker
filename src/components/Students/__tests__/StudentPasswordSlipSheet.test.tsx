import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import StudentPasswordSlipSheet from '../StudentPasswordSlipSheet';
import type { PasswordSlip } from '../StudentPasswordSlipSheet';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key),
    }),
}));

const mockToCanvas = vi.fn().mockResolvedValue(undefined);

vi.mock('qrcode', () => ({
    default: {
        toCanvas: (...args: unknown[]) => mockToCanvas(...args),
    },
}));

const slips: PasswordSlip[] = [
    { id: 's1', name: 'Alice', email: 'alice@school.nl', password: 'geheim' },
    { id: 's2', name: 'Bob', email: 'bob@school.nl' },
];

describe('StudentPasswordSlipSheet', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders every slip with name, email, and password or error text', () => {
        render(<StudentPasswordSlipSheet slips={slips} onClose={vi.fn()} />);
        expect(screen.getByText('Alice')).toBeInTheDocument();
        expect(screen.getByText('alice@school.nl')).toBeInTheDocument();
        expect(screen.getByText('geheim')).toBeInTheDocument();
        expect(screen.getByText('Bob')).toBeInTheDocument();
        expect(screen.getByText('studentsPage.password_slip_item_error')).toBeInTheDocument();
    });

    it('shows the slip count in the title', () => {
        render(<StudentPasswordSlipSheet slips={slips} onClose={vi.fn()} />);
        expect(screen.getByText('studentsPage.password_slip_title:{"count":2}')).toBeInTheDocument();
    });

    it('generates a QR canvas for slips that have a password', () => {
        render(<StudentPasswordSlipSheet slips={slips} onClose={vi.fn()} />);
        expect(mockToCanvas).toHaveBeenCalledTimes(1);
        expect(mockToCanvas).toHaveBeenCalledWith(
            expect.any(HTMLCanvasElement),
            window.location.origin,
            expect.objectContaining({ width: 80 })
        );
    });

    it('switches between 2 and 4 column layouts', () => {
        render(<StudentPasswordSlipSheet slips={slips} onClose={vi.fn()} />);
        const grid = document.querySelector('.slip-sheet-grid') as HTMLElement;
        expect(grid.style.gridTemplateColumns).toBe('repeat(2, 1fr)');

        fireEvent.click(screen.getByRole('button', { name: '4 studentsPage.password_slip_columns' }));
        expect(grid.style.gridTemplateColumns).toBe('repeat(4, 1fr)');

        fireEvent.click(screen.getByRole('button', { name: '2 studentsPage.password_slip_columns' }));
        expect(grid.style.gridTemplateColumns).toBe('repeat(2, 1fr)');
    });

    it('logs a QR canvas failure without crashing', async () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        mockToCanvas.mockRejectedValueOnce(new Error('canvas boom'));
        render(<StudentPasswordSlipSheet slips={[slips[0]]} onClose={vi.fn()} />);
        await waitFor(() => expect(errorSpy).toHaveBeenCalled());
        errorSpy.mockRestore();
    });

    it('triggers the browser print dialog and calls onClose', () => {
        const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});
        const onClose = vi.fn();
        render(<StudentPasswordSlipSheet slips={slips} onClose={onClose} />);

        fireEvent.click(screen.getByRole('button', { name: 'common.print' }));
        expect(printSpy).toHaveBeenCalled();

        fireEvent.click(screen.getByRole('button', { name: 'common.close' }));
        expect(onClose).toHaveBeenCalled();
        printSpy.mockRestore();
    });
});
