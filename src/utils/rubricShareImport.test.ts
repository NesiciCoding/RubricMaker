import { describe, expect, it } from 'vitest';
import { rubricInputFromParsed } from './rubricShareImport';
import type { ParsedRubric } from './rubricImport';

function parsed(overrides: Partial<ParsedRubric> = {}): ParsedRubric {
    return {
        name: 'Shared rubric',
        subject: 'English',
        description: 'From a colleague',
        criteria: [],
        confidence: 'high',
        warnings: [],
        gradeScaleId: 'gs-shared',
        scoringMode: 'total-points',
        totalMaxPoints: 40,
        ...overrides,
    };
}

const workspace = { gradeScaleIds: ['gs-mine'], defaultGradeScaleId: 'gs-mine', fallbackName: 'Imported rubric' };

describe('rubricInputFromParsed', () => {
    it('keeps the shared settings when the grade scale exists locally', () => {
        const input = rubricInputFromParsed(parsed(), { ...workspace, gradeScaleIds: ['gs-shared', 'gs-mine'] });

        expect(input).toMatchObject({
            name: 'Shared rubric',
            subject: 'English',
            gradeScaleId: 'gs-shared',
            scoringMode: 'total-points',
            totalMaxPoints: 40,
            attachmentIds: [],
        });
    });

    it('falls back to the default grade scale for a scale from another workspace', () => {
        expect(rubricInputFromParsed(parsed(), workspace).gradeScaleId).toBe('gs-mine');
    });

    it('fills a name when the shared rubric has none', () => {
        expect(rubricInputFromParsed(parsed({ name: '' }), workspace).name).toBe('Imported rubric');
    });

    it('carries tiered and vocabulary sections only when present', () => {
        const plain = rubricInputFromParsed(parsed(), workspace);
        expect(plain.tiered).toBeUndefined();
        expect(plain.vocabularyItems).toBeUndefined();
    });
});
