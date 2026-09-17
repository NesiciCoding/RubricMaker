import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import TestSlipSheet from '../TestSlipSheet';

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

const students = [
    { id: 's1', name: 'Alice' },
    { id: 's2', name: 'Bob' },
];

describe('TestSlipSheet', () => {
    beforeEach(() => vi.clearAllMocks());

    it('renders one item with a QR canvas per student', () => {
        const buildUrl = (id: string) => `https://app/#/test/${id}`;
        render(
            <TestSlipSheet
                students={students}
                testName="Unit 3 Test"
                durationMinutes={45}
                buildUrl={buildUrl}
                onClose={vi.fn()}
            />
        );
        expect(screen.getByText('Alice')).toBeInTheDocument();
        expect(screen.getByText('Bob')).toBeInTheDocument();
        expect(screen.getAllByText('Unit 3 Test')).toHaveLength(2);
        expect(mockToCanvas).toHaveBeenCalledTimes(2);
        expect(mockToCanvas).toHaveBeenCalledWith(
            expect.any(HTMLCanvasElement),
            'https://app/#/test/s1',
            expect.objectContaining({ width: 80 })
        );
    });

    it('switches column layout and closes', () => {
        const onClose = vi.fn();
        render(<TestSlipSheet students={students} testName="T" buildUrl={(id) => id} onClose={onClose} />);
        const grid = document.querySelector('.slip-sheet-grid') as HTMLElement;
        expect(grid.style.gridTemplateColumns).toBe('repeat(2, 1fr)');
        fireEvent.click(screen.getByRole('button', { name: '4 slip_sheet.columns' }));
        expect(grid.style.gridTemplateColumns).toBe('repeat(4, 1fr)');

        fireEvent.click(screen.getByRole('button', { name: 'common.close' }));
        expect(onClose).toHaveBeenCalled();
    });
});
