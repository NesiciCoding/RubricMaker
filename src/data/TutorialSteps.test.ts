import { describe, it, expect } from 'vitest';
import {
    getTutorialSteps,
    getComparativeTourSteps,
    getEssayBuilderTourSteps,
    getTestBuilderTourSteps,
    getActivityDashboardTourSteps,
    getCefrOverviewTourSteps,
    getSpeakingTourSteps,
    getStudentProfileTourSteps,
    getStudentsTourSteps,
} from './TutorialSteps';

const t = (key: string) => key;

describe('getTutorialSteps', () => {
    it('returns 10 steps', () => {
        const steps = getTutorialSteps(t as any);
        expect(steps).toHaveLength(10);
    });

    it('every step has a non-empty target, title, content, and placement', () => {
        const steps = getTutorialSteps(t as any);
        for (const step of steps) {
            expect(typeof step.target).toBe('string');
            expect((step.target as string).length).toBeGreaterThan(0);
            expect(typeof step.title).toBe('string');
            expect(typeof step.content).toBe('string');
            expect(typeof step.placement).toBe('string');
        }
    });

    it('first step is centered with skipBeacon', () => {
        const steps = getTutorialSteps(t as any);
        expect(steps[0].placement).toBe('center');
        expect(steps[0].skipBeacon).toBe(true);
    });

    it('passes translation keys to t()', () => {
        const keys: string[] = [];
        const recorder = (key: string) => {
            keys.push(key);
            return key;
        };
        getTutorialSteps(recorder as any);
        expect(keys.some((k) => k.startsWith('tutorial.'))).toBe(true);
    });

    it('step targets include expected data-tour selectors', () => {
        const steps = getTutorialSteps(t as any);
        const targets = steps.map((s) => s.target as string);
        expect(targets).toContain('[data-tour="/rubrics"]');
        expect(targets).toContain('[data-tour="/students"]');
        expect(targets).toContain('[data-tour="/cefr-overview"]');
        expect(targets).toContain('[data-tour="/statistics"]');
    });

    it('no step targets a class that only exists on a sub-page', () => {
        const steps = getTutorialSteps(t as any);
        const targets = steps.map((s) => s.target as string);
        expect(targets).not.toContain('.compare-btn-tutorial');
    });
});

describe('per-page tours', () => {
    const builders = {
        comparative: getComparativeTourSteps,
        essayBuilder: getEssayBuilderTourSteps,
        testBuilder: getTestBuilderTourSteps,
        activityDashboard: getActivityDashboardTourSteps,
        cefrOverview: getCefrOverviewTourSteps,
        speaking: getSpeakingTourSteps,
        studentProfile: getStudentProfileTourSteps,
        students: getStudentsTourSteps,
    };

    for (const [name, build] of Object.entries(builders)) {
        it(`${name} tour has 3–5 well-formed steps`, () => {
            const steps = build(t as any);
            expect(steps.length).toBeGreaterThanOrEqual(3);
            expect(steps.length).toBeLessThanOrEqual(5);
            for (const step of steps) {
                expect(typeof step.target).toBe('string');
                expect(step.target as string).toMatch(/^\[data-tour="/);
                expect(typeof step.title).toBe('string');
                expect(typeof step.content).toBe('string');
                expect(step.skipBeacon).toBe(true);
            }
        });

        it(`${name} tour passes tutorial.* keys to t()`, () => {
            const keys: string[] = [];
            build(((key: string) => {
                keys.push(key);
                return key;
            }) as any);
            expect(keys.every((k) => k.startsWith('tutorial.'))).toBe(true);
        });
    }
});
