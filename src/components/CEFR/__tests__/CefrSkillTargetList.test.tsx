import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import CefrSkillTargetList from '../CefrSkillTargetList';
import type { CefrSkillTargetProgress } from '../../../utils/masteryTargetAnalysis';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: Record<string, unknown>) =>
            opts && typeof opts === 'object' ? `${key}:${JSON.stringify(opts)}` : key,
        i18n: { language: 'en' },
    }),
}));

const base: CefrSkillTargetProgress = {
    skill: 'reading',
    achievedLevel: 'A2',
    configured: false,
    calibrated: false,
    status: 'behind',
};

describe('CefrSkillTargetList', () => {
    it('labels a curriculum expectation as such', () => {
        render(<CefrSkillTargetList rows={[{ ...base, expectedRange: { min: 'b1-minus', max: 'b1-minus' } }]} />);
        expect(screen.getByText('B1-')).toBeInTheDocument();
        expect(screen.getByText('cefr.skill_target_from_curriculum')).toBeInTheDocument();
    });

    it('labels a cohort-calibrated expectation and explains what it moved from', () => {
        render(
            <CefrSkillTargetList
                rows={[
                    {
                        ...base,
                        calibrated: true,
                        expectedRange: { min: 'a2-plus', max: 'a2-plus' },
                        standardRange: { min: 'b1-minus', max: 'b1-minus' },
                    },
                ]}
            />
        );
        expect(screen.getByText('A2+')).toBeInTheDocument();
        expect(screen.getByText('cefr.skill_target_from_cohort')).toBeInTheDocument();
        expect(screen.getByTitle('cefr.skill_target_calibrated_tooltip:{"range":"B1-"}')).toBeInTheDocument();
    });

    it('shows a teacher-configured level and an unset skill without either label', () => {
        render(
            <CefrSkillTargetList
                rows={[
                    { ...base, configured: true, targetLevel: 'b1-plus' },
                    { ...base, skill: 'listening', achievedLevel: null, status: 'no-data' },
                ]}
            />
        );
        expect(screen.getByText('B1+')).toBeInTheDocument();
        expect(screen.queryByText('cefr.skill_target_from_curriculum')).not.toBeInTheDocument();
        expect(screen.getByText('cefr.skill_target_not_set')).toBeInTheDocument();
        expect(screen.getByText('cefr.skill_target_no_data')).toBeInTheDocument();
    });
});
