import { describe, it, expect } from 'vitest';
import { diffRubricVersions } from './rubricVersionDiff';
import type { Rubric } from '../types';

function makeLevel(id: string, overrides: Partial<Rubric['criteria'][0]['levels'][0]> = {}) {
    return {
        id,
        label: 'Good',
        minPoints: 0,
        maxPoints: 5,
        description: 'desc',
        subItems: [],
        ...overrides,
    };
}

function makeCriterion(id: string, overrides: Partial<Rubric['criteria'][0]> = {}) {
    return {
        id,
        title: 'Criterion',
        description: '',
        weight: 50,
        levels: [makeLevel('l1')],
        ...overrides,
    };
}

function makeSnapshot(criteria: Rubric['criteria']): Omit<Rubric, 'versions'> {
    return {
        id: 'r1',
        name: 'Rubric',
        subject: '',
        description: '',
        criteria,
        gradeScaleId: 'gs1',
        format: {} as Rubric['format'],
        attachmentIds: [],
        createdAt: '',
        updatedAt: '',
        totalMaxPoints: 100,
        scoringMode: 'weighted-percentage',
    };
}

describe('diffRubricVersions', () => {
    it('detects an added criterion', () => {
        const from = makeSnapshot([]);
        const to = makeSnapshot([makeCriterion('c1')]);
        const diff = diffRubricVersions(from, to);
        expect(diff).toEqual([{ status: 'added', id: 'c1', title: 'Criterion', fieldChanges: [], levelDiffs: [] }]);
    });

    it('detects a removed criterion', () => {
        const from = makeSnapshot([makeCriterion('c1')]);
        const to = makeSnapshot([]);
        const diff = diffRubricVersions(from, to);
        expect(diff).toEqual([{ status: 'removed', id: 'c1', title: 'Criterion', fieldChanges: [], levelDiffs: [] }]);
    });

    it('detects a weight and level point change', () => {
        const from = makeSnapshot([makeCriterion('c1', { weight: 50, levels: [makeLevel('l1', { maxPoints: 5 })] })]);
        const to = makeSnapshot([makeCriterion('c1', { weight: 75, levels: [makeLevel('l1', { maxPoints: 10 })] })]);
        const diff = diffRubricVersions(from, to);
        expect(diff).toHaveLength(1);
        expect(diff[0].fieldChanges).toEqual([{ field: 'weight', from: '50', to: '75' }]);
        expect(diff[0].levelDiffs).toEqual([
            {
                status: 'changed',
                id: 'l1',
                label: 'Good',
                fieldChanges: [{ field: 'points', from: '0–5', to: '0–10' }],
            },
        ]);
    });

    it('returns no diff for identical snapshots', () => {
        const snap = makeSnapshot([makeCriterion('c1')]);
        expect(diffRubricVersions(snap, snap)).toEqual([]);
    });

    it('detects a level added within a shared criterion', () => {
        const from = makeSnapshot([makeCriterion('c1', { levels: [makeLevel('l1')] })]);
        const to = makeSnapshot([
            makeCriterion('c1', { levels: [makeLevel('l1'), makeLevel('l2', { label: 'Excellent' })] }),
        ]);
        const diff = diffRubricVersions(from, to);
        expect(diff).toHaveLength(1);
        expect(diff[0].levelDiffs).toEqual([{ status: 'added', id: 'l2', label: 'Excellent', fieldChanges: [] }]);
    });

    it('detects a level removed from a shared criterion', () => {
        const from = makeSnapshot([makeCriterion('c1', { levels: [makeLevel('l1'), makeLevel('l2')] })]);
        const to = makeSnapshot([makeCriterion('c1', { levels: [makeLevel('l1')] })]);
        const diff = diffRubricVersions(from, to);
        expect(diff).toHaveLength(1);
        expect(diff[0].levelDiffs).toEqual([{ status: 'removed', id: 'l2', label: 'Good', fieldChanges: [] }]);
    });

    it('detects label, description, and sub-item count changes on a level', () => {
        const from = makeSnapshot([
            makeCriterion('c1', {
                levels: [makeLevel('l1', { label: 'Good', description: 'old', subItems: [{ id: 'si1', label: 'x' }] })],
            }),
        ]);
        const to = makeSnapshot([
            makeCriterion('c1', {
                levels: [
                    makeLevel('l1', {
                        label: 'Great',
                        description: 'new',
                        subItems: [
                            { id: 'si1', label: 'x' },
                            { id: 'si2', label: 'y' },
                        ],
                    }),
                ],
            }),
        ]);
        const diff = diffRubricVersions(from, to);
        expect(diff[0].levelDiffs[0].fieldChanges.map((c) => c.field)).toEqual(['label', 'description', 'subItems']);
    });

    it('detects a criterion description change', () => {
        const from = makeSnapshot([makeCriterion('c1', { description: 'old desc' })]);
        const to = makeSnapshot([makeCriterion('c1', { description: 'new desc' })]);
        const diff = diffRubricVersions(from, to);
        expect(diff).toHaveLength(1);
        expect(diff[0].fieldChanges).toEqual([{ field: 'description', from: '', to: '' }]);
    });

    it('detects a criterion title change', () => {
        const from = makeSnapshot([makeCriterion('c1', { title: 'Old title' })]);
        const to = makeSnapshot([makeCriterion('c1', { title: 'New title' })]);
        const diff = diffRubricVersions(from, to);
        expect(diff).toHaveLength(1);
        expect(diff[0].fieldChanges).toEqual([{ field: 'title', from: 'Old title', to: 'New title' }]);
    });
});
