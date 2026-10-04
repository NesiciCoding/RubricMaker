import { describe, it, expect, vi } from 'vitest';
import en from '../locales/en.json';
import nl from '../locales/nl.json';
import fr from '../locales/fr.json';
import de from '../locales/de.json';
import es from '../locales/es.json';
import {
    getTutorialSteps,
    getStatisticsTourSteps,
    withMobileDrawer,
    SIDEBAR_TOUR_TARGETS,
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
    it('returns 5 steps', () => {
        const steps = getTutorialSteps(t as any);
        expect(steps).toHaveLength(5);
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
        expect(targets).toContain('.nav-rail');
        expect(targets).toContain('[data-tour="dashboard-grades"]');
        expect(targets).toContain('[data-tour="/settings"]');
        expect(targets).toContain('[data-tour="help"]');
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

describe('withMobileDrawer', () => {
    it('opens the drawer for sidebar steps and closes it for others', async () => {
        vi.useFakeTimers();
        const setOpen = vi.fn();
        const steps = withMobileDrawer(getTutorialSteps(t as any), setOpen);
        const nav = steps.find((s) => s.target === '.nav-rail')!;
        const grades = steps.find((s) => s.target === '[data-tour="dashboard-grades"]')!;

        const pending = nav.before!({} as any);
        expect(setOpen).toHaveBeenLastCalledWith(true);
        await vi.advanceTimersByTimeAsync(400);
        await pending;

        await grades.before!({} as any);
        expect(setOpen).toHaveBeenLastCalledWith(false);
        vi.useRealTimers();
    });

    it('SIDEBAR_TOUR_TARGETS only lists targets used by the main tour', () => {
        const targets = getTutorialSteps(t as any).map((s) => s.target);
        for (const target of SIDEBAR_TOUR_TARGETS) expect(targets).toContain(target);
    });
});

describe('tutorial locale keys', () => {
    const locales = { en, nl, fr, de, es } as Record<string, any>;
    const collect = (build: (tf: any) => unknown) => {
        const keys: string[] = [];
        build((k: string) => (keys.push(k), k));
        return keys;
    };
    const keys = [...collect(getTutorialSteps), ...collect(getStatisticsTourSteps), 'tutorial.page_tour_button'];

    for (const [name, locale] of Object.entries(locales)) {
        it(`${name} has every key used by the main and statistics tours`, () => {
            for (const key of keys) {
                expect(locale.tutorial[key.replace('tutorial.', '')], key).toBeTruthy();
            }
        });
    }
});
