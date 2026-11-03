import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import StatsCustomizeModal from '../StatsCustomizeModal';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

describe('StatsCustomizeModal', () => {
    it('reflects hidden sections and resets everything', () => {
        const onChange = vi.fn();
        const onClose = vi.fn();
        render(
            <StatsCustomizeModal
                hiddenSections={['heatmap']}
                includeTestsInTrends={false}
                onChange={onChange}
                onClose={onClose}
            />
        );
        expect(screen.getByRole('checkbox', { name: 'statistics.heatmap' })).not.toBeChecked();
        expect(screen.getByRole('checkbox', { name: 'statistics.class_trend' })).toBeChecked();
        fireEvent.click(screen.getByRole('checkbox', { name: 'statistics.heatmap' }));
        expect(onChange).toHaveBeenCalledWith({ statisticsHiddenSections: [] });
        fireEvent.click(screen.getByText('statistics.customize.reset'));
        expect(onChange).toHaveBeenCalledWith({ statisticsHiddenSections: [], statisticsTrendIncludeTests: true });
        fireEvent.click(screen.getByRole('button', { name: 'common.close' }));
        expect(onClose).toHaveBeenCalled();
    });
});
