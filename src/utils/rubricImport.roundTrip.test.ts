import { describe, it, expect } from 'vitest';
import { parseJsonToRubric, encodeRubricShareCode, decodeRubricShareCode, normaliseShareCode } from './rubricImport';
import { DEFAULT_FORMAT, type Rubric } from '../types';

const exported: Rubric = {
    id: 'r1',
    name: 'Speaking task',
    subject: 'English',
    description: 'Oral exam',
    criteria: [
        {
            id: 'c1',
            title: 'Fluency',
            description: '',
            weight: 40,
            cefrDescriptors: [
                {
                    descriptorId: 'd1',
                    level: 'B1',
                    skill: 'speaking_production',
                    descriptionEn: 'x',
                    descriptionNl: 'x',
                },
            ],
            levels: [
                {
                    id: 'l1',
                    label: 'Strong',
                    minPoints: 8,
                    maxPoints: 10,
                    description: '',
                    cefrLevel: 'B2',
                    subItems: [{ id: 's1', label: 'Pace', minPoints: 1, maxPoints: 2 }],
                },
            ],
        },
        { id: 'c2', title: 'Range', description: '', weight: 40, levels: [] },
    ],
    gradeScaleId: 'gs-custom',
    format: { ...DEFAULT_FORMAT, headerColor: '#123456' },
    attachmentIds: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    totalMaxPoints: 30,
    scoringMode: 'total-points',
    cefrTargetLevel: 'B1',
    cefrSkill: 'speaking_production',
    cefrAchieveThreshold: 65,
    vocabularyItems: [
        {
            id: 'v1',
            phrase: 'on the other hand',
            category: 'vocabulary',
            linkedCriterionId: 'c1',
            linkedSubItemId: 's1',
        },
    ],
};

const asFile = (data: unknown) => new File([JSON.stringify(data)], 'export.json', { type: 'application/json' });

describe('rubric JSON export/import round trip (#699)', () => {
    it('keeps the scoring, format and CEFR settings of an exported rubric', async () => {
        const parsed = await parseJsonToRubric(asFile(exported));
        expect(parsed).toMatchObject({
            scoringMode: 'total-points',
            totalMaxPoints: 30,
            gradeScaleId: 'gs-custom',
            cefrTargetLevel: 'B1',
            cefrSkill: 'speaking_production',
            cefrAchieveThreshold: 65,
        });
        expect(parsed.format?.headerColor).toBe('#123456');
    });

    it('keeps weights exactly as exported, even when they do not total 100', async () => {
        const parsed = await parseJsonToRubric(asFile(exported));
        expect(parsed.criteria.map((c) => c.weight)).toEqual([40, 40]);
    });

    it('keeps fields it does not validate and remaps vocabulary links to the new ids', async () => {
        const parsed = await parseJsonToRubric(asFile(exported));
        const [c1] = parsed.criteria;
        expect(c1.id).not.toBe('c1');
        expect(c1.cefrDescriptors).toEqual(exported.criteria[0].cefrDescriptors);
        expect(c1.levels[0].cefrLevel).toBe('B2');
        expect(c1.levels[0].subItems[0]).toMatchObject({ minPoints: 1, maxPoints: 2 });
        expect(parsed.vocabularyItems?.[0]).toMatchObject({
            phrase: 'on the other hand',
            linkedCriterionId: c1.id,
            linkedSubItemId: c1.levels[0].subItems[0].id,
        });
        expect(parsed.vocabularyItems?.[0].id).not.toBe('v1');
    });

    it('ignores settings with unknown values instead of importing them', async () => {
        const parsed = await parseJsonToRubric(
            asFile({ ...exported, scoringMode: 'magic', totalMaxPoints: -5, cefrTargetLevel: 'D9' })
        );
        expect(parsed.scoringMode).toBeUndefined();
        expect(parsed.totalMaxPoints).toBeUndefined();
        expect(parsed.cefrTargetLevel).toBeUndefined();
        expect(parsed.cefrSkill).toBeUndefined();
    });
});

describe('rubric JSON import warnings (#699)', () => {
    it('warns about an empty rubric instead of calling it high quality', async () => {
        const parsed = await parseJsonToRubric(asFile({ criteria: [] }));
        expect(parsed.confidence).toBe('low');
        expect(parsed.warnings).toEqual([{ key: 'importRubric.warn_json_no_criteria' }]);
    });

    it('warns about criteria without levels and swaps inverted ranges', async () => {
        const parsed = await parseJsonToRubric(
            asFile({
                criteria: [
                    { title: 'A', weight: 50, levels: [{ label: 'Top', minPoints: 9, maxPoints: 4 }] },
                    { title: 'B', weight: 50 },
                ],
            })
        );
        expect(parsed.criteria[0].levels[0]).toMatchObject({ minPoints: 4, maxPoints: 9 });
        expect(parsed.warnings).toEqual([
            { key: 'importRubric.warn_json_range_swapped', params: { title: 'A', label: 'Top' } },
            { key: 'importRubric.warn_json_no_levels', params: { title: 'B' } },
        ]);
    });

    it('fills in missing weights and says so', async () => {
        const parsed = await parseJsonToRubric(
            asFile({
                criteria: [
                    { title: 'A', weight: 60, levels: [] },
                    { title: 'B', levels: [] },
                ],
            })
        );
        expect(parsed.criteria.map((c) => c.weight)).toEqual([60, 40]);
        expect(parsed.warnings).toContainEqual({ key: 'importRubric.warn_weights_partial', params: { remaining: 40 } });
    });

    it('splits an uneven remaining weight so the criteria still total 100', async () => {
        const parsed = await parseJsonToRubric(
            asFile({
                criteria: [
                    { title: 'A', weight: 50, levels: [] },
                    { title: 'B', levels: [] },
                    { title: 'C', levels: [] },
                    { title: 'D', levels: [] },
                ],
            })
        );
        const weights = parsed.criteria.map((c) => c.weight);
        expect(weights[0]).toBe(50);
        expect(weights.slice(1).sort((a, b) => a - b)).toEqual([16, 17, 17]);
        expect(parsed.warnings).toContainEqual({ key: 'importRubric.warn_weights_partial', params: { remaining: 50 } });
    });
});

describe('share code paste (#699)', () => {
    const code = encodeRubricShareCode(exported);

    it('strips whitespace, line breaks and quotes', () => {
        const wrapped = `"${code.slice(0, 40)}\n  ${code.slice(40, 90)}\r\n${code.slice(90)}"`;
        expect(normaliseShareCode(wrapped)).toBe(code);
    });

    it('accepts the full share preview link', () => {
        expect(normaliseShareCode(`https://school.example/app/#/preview/${code}?ref=mail`)).toBe(code);
    });

    it('decodes a pasted preview link into a rubric with fresh ids', () => {
        const parsed = decodeRubricShareCode(`  https://school.example/#/preview/${code}  `);
        expect(parsed.name).toBe('Speaking task');
        expect(parsed.scoringMode).toBe('total-points');
        expect(parsed.criteria[0].id).not.toBe('c1');
        expect(parsed.criteria[0].cefrDescriptors).toEqual(exported.criteria[0].cefrDescriptors);
    });
});
