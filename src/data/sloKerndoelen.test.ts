import { describe, it, expect } from 'vitest';
import { SLO_KERNDOELEN, SLO_PHASES, sloGoalToFrameworkDescriptor } from './sloKerndoelen';

const goals = SLO_KERNDOELEN.flatMap((kd) => kd.goals.map((goal) => ({ kd, goal })));

describe('sloKerndoelen', () => {
    it('covers the 5 English kerndoelen and their 15 goals across primary and secondary', () => {
        expect(SLO_KERNDOELEN.map((kd) => kd.id)).toEqual([
            'slo-po-33',
            'slo-po-34',
            'slo-vo-34',
            'slo-vo-35',
            'slo-vo-36',
        ]);
        expect(goals).toHaveLength(15);
        expect(new Set(SLO_KERNDOELEN.map((kd) => kd.phase))).toEqual(new Set(SLO_PHASES));
    });

    it('keeps ids unique even though primary and secondary both have a kerndoel 34', () => {
        const ids = [...SLO_KERNDOELEN.map((kd) => kd.id), ...goals.map(({ goal }) => goal.id)];
        expect(new Set(ids).size).toBe(ids.length);
        const labels = SLO_KERNDOELEN.map((kd) => kd.labelEn);
        expect(new Set(labels).size).toBe(labels.length);
    });

    it('numbers each goal after its kerndoel and phase, with Dutch and English text', () => {
        for (const { kd, goal } of goals) {
            expect(goal.code.startsWith(kd.number)).toBe(true);
            expect(goal.id).toBe(`slo-${kd.phase}-${goal.code.toLowerCase()}`);
            expect(goal.descriptionEn).toBeTruthy();
            expect(goal.descriptionNl).toBeTruthy();
        }
    });

    it('builds a linked descriptor that leads with the goal code', () => {
        const kd = SLO_KERNDOELEN.find((k) => k.id === 'slo-vo-35')!;
        const goal = kd.goals.find((g) => g.code === '35D')!;
        expect(sloGoalToFrameworkDescriptor(kd, goal)).toEqual({
            descriptorId: 'slo-vo-35d',
            framework: 'slo',
            categoryId: 'slo-vo-35',
            categoryLabelEn: kd.labelEn,
            categoryLabelNl: kd.labelNl,
            categoryColor: kd.color,
            descriptionEn: `35D — ${goal.descriptionEn}`,
            descriptionNl: `35D — ${goal.descriptionNl}`,
        });
    });
});
