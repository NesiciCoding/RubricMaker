import { describe, it, expect, vi } from 'vitest';
import { parseJsonToRubric } from './rubricImport';

describe('rubricImport', () => {
    describe('parseJsonToRubric', () => {
        it('successfully parses valid JSON into a rubric', async () => {
            const validJson = {
                name: 'Test Rubric',
                subject: 'Science',
                description: 'A test rubric',
                criteria: [
                    {
                        title: 'Criterion 1',
                        weight: 100,
                        levels: [
                            { label: 'Good', minPoints: 5, maxPoints: 5, description: '' }
                        ]
                    }
                ]
            };
            const file = new File([JSON.stringify(validJson)], 'test-rubric.json', { type: 'application/json' });

            const result = await parseJsonToRubric(file);

            expect(result.confidence).toBe('high');
            expect(result.name).toBe('Test Rubric');
            expect(result.subject).toBe('Science');
            expect(result.description).toBe('A test rubric');
            expect(result.criteria.length).toBe(1);
            expect(result.criteria[0].title).toBe('Criterion 1');
            expect(result.criteria[0].id).toBeDefined(); // IDs are regenerated
            expect(result.warnings.length).toBe(0);
        });

        it('returns an empty generic result with low confidence if JSON is invalid', async () => {
            const file = new File(['{ invalid_json '], 'bad.json', { type: 'application/json' });
            const result = await parseJsonToRubric(file);

            expect(result.confidence).toBe('low');
            expect(result.warnings.length).toBeGreaterThan(0);
            expect(result.criteria.length).toBe(0);
        });

        it('returns empty result if criteria array is missing', async () => {
            const noCriteriaJson = { name: 'Empty Rubric' };
            const file = new File([JSON.stringify(noCriteriaJson)], 'empty.json', { type: 'application/json' });
            const result = await parseJsonToRubric(file);

            expect(result.confidence).toBe('low');
            expect(result.warnings).toContain('Invalid JSON format: missing criteria array.');
        });

        it('uses filename as fallback name if name is missing in JSON', async () => {
            const json = { criteria: [] }; // valid format but no name
            const file = new File([JSON.stringify(json)], 'my-fallback.json', { type: 'application/json' });
            const result = await parseJsonToRubric(file);

            expect(result.name).toBe('my-fallback');
        });
    });

    // We can skip testing parseDocxToRubric and parsePdfToRubric deeply in this unit test file
    // as they rely heavily on third party robust libraries (mammoth and pdfjs-dist)
    // which would require complex mocking of binary file reading.
});
