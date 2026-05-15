import { describe, it, expect } from 'vitest';
import { getTutorialSteps } from './TutorialSteps';

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

    it('first step is centered with disableBeacon', () => {
        const steps = getTutorialSteps(t as any);
        expect(steps[0].placement).toBe('center');
        expect(steps[0].disableBeacon).toBe(true);
    });

    it('passes translation keys to t()', () => {
        const keys: string[] = [];
        const recorder = (key: string) => { keys.push(key); return key; };
        getTutorialSteps(recorder as any);
        expect(keys.some(k => k.startsWith('tutorial.'))).toBe(true);
    });

    it('step targets include expected data-tour selectors', () => {
        const steps = getTutorialSteps(t as any);
        const targets = steps.map(s => s.target as string);
        expect(targets).toContain('[data-tour="/rubrics"]');
        expect(targets).toContain('[data-tour="/students"]');
        expect(targets).toContain('[data-tour="/statistics"]');
    });
});
