import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import CefrPlacementCard from '../CefrPlacementCard';
import type { CefrPlacementEstimate } from '../../../utils/cefrStudentAggregator';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

const placement: CefrPlacementEstimate = {
    level: 'B1',
    testId: 't1',
    testName: 'Placement A',
    assessedAt: '2024-05-01T10:00:00Z',
    path: [],
};

describe('CefrPlacementCard', () => {
    it('renders the placement level and provenance text', () => {
        render(<CefrPlacementCard placement={placement} />);
        expect(screen.getByText('B1')).toBeInTheDocument();
        expect(screen.getByText('cefrOverview.placement_badge')).toBeInTheDocument();
        expect(screen.getByText('cefrOverview.placement_from')).toBeInTheDocument();
    });

    it('renders the Cambridge exam label when requested', () => {
        render(<CefrPlacementCard placement={placement} showCambridgeLabel />);
        expect(screen.getByText('· PET')).toBeInTheDocument();
    });
});
