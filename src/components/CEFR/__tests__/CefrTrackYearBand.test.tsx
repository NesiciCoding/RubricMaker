import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import CefrTrackYearBand from '../CefrTrackYearBand';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

describe('CefrTrackYearBand', () => {
    it('shows the no-target message when no expected range is set', () => {
        render(<CefrTrackYearBand expectedRange={undefined} achievedLevel={null} status="no-data" />);
        expect(screen.getByText('cefr.track_year_band_no_target')).toBeInTheDocument();
    });

    it('renders the band with an aria label describing range and achieved level', () => {
        render(<CefrTrackYearBand expectedRange={{ min: 'a1', max: 'b1' }} achievedLevel="A2" status="on-track" />);
        expect(screen.getByText('cefr.track_year_band_title')).toBeInTheDocument();
        expect(screen.getByText('cefr.progress_status_on_track')).toBeInTheDocument();
        expect(screen.getByRole('img')).toHaveAccessibleName('cefr.track_year_band_aria_label');
    });

    it('falls back to the no-achieved key when no level has been reached', () => {
        render(<CefrTrackYearBand expectedRange={{ min: 'a1', max: 'b1' }} achievedLevel={null} status="behind" />);
        expect(screen.getByText('cefr.progress_status_behind')).toBeInTheDocument();
    });
});
