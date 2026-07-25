import { describe, it, expect } from 'vitest';
import { isGeneratorTest } from './placementGenerator';

describe('isGeneratorTest', () => {
    it('is true only for placement mode with the generator engine', () => {
        expect(isGeneratorTest({ mode: 'placement', placementEngine: 'generator' })).toBe(true);
        expect(isGeneratorTest({ mode: 'placement', placementEngine: 'staircase' })).toBe(false);
        expect(isGeneratorTest({ mode: 'placement', placementEngine: 'mst' })).toBe(false);
        expect(isGeneratorTest({ mode: 'placement' })).toBe(false);
        expect(isGeneratorTest({ mode: 'assessment', placementEngine: 'generator' })).toBe(false);
    });
});
