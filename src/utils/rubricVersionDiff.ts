import type { Rubric, RubricCriterion, RubricLevel } from '../types';

export type DiffStatus = 'added' | 'removed' | 'changed';

export interface FieldChange {
    field: 'title' | 'weight' | 'description' | 'label' | 'points' | 'subItems';
    from: string;
    to: string;
}

export interface LevelDiff {
    status: DiffStatus;
    id: string;
    label: string;
    fieldChanges: FieldChange[];
}

export interface CriterionDiff {
    status: DiffStatus;
    id: string;
    title: string;
    fieldChanges: FieldChange[];
    levelDiffs: LevelDiff[];
}

type RubricSnapshot = Rubric;

function diffLevel(a: RubricLevel, b: RubricLevel): FieldChange[] {
    const changes: FieldChange[] = [];
    if (a.label !== b.label) changes.push({ field: 'label', from: a.label, to: b.label });
    if (a.minPoints !== b.minPoints || a.maxPoints !== b.maxPoints) {
        changes.push({ field: 'points', from: `${a.minPoints}–${a.maxPoints}`, to: `${b.minPoints}–${b.maxPoints}` });
    }
    if (a.description !== b.description) changes.push({ field: 'description', from: '', to: '' });
    if (a.subItems.length !== b.subItems.length) {
        changes.push({ field: 'subItems', from: String(a.subItems.length), to: String(b.subItems.length) });
    }
    return changes;
}

function diffLevels(a: RubricLevel[], b: RubricLevel[]): LevelDiff[] {
    const aById = new Map(a.map((l) => [l.id, l]));
    const bById = new Map(b.map((l) => [l.id, l]));
    const diffs: LevelDiff[] = [];

    for (const level of a) {
        if (!bById.has(level.id)) {
            diffs.push({ status: 'removed', id: level.id, label: level.label, fieldChanges: [] });
        }
    }
    for (const level of b) {
        const prev = aById.get(level.id);
        if (!prev) {
            diffs.push({ status: 'added', id: level.id, label: level.label, fieldChanges: [] });
            continue;
        }
        const fieldChanges = diffLevel(prev, level);
        if (fieldChanges.length > 0) {
            diffs.push({ status: 'changed', id: level.id, label: level.label, fieldChanges });
        }
    }
    return diffs;
}

function diffCriterion(
    a: RubricCriterion,
    b: RubricCriterion
): { fieldChanges: FieldChange[]; levelDiffs: LevelDiff[] } {
    const fieldChanges: FieldChange[] = [];
    if (a.title !== b.title) fieldChanges.push({ field: 'title', from: a.title, to: b.title });
    if (a.weight !== b.weight) fieldChanges.push({ field: 'weight', from: String(a.weight), to: String(b.weight) });
    if (a.description !== b.description) fieldChanges.push({ field: 'description', from: '', to: '' });
    return { fieldChanges, levelDiffs: diffLevels(a.levels, b.levels) };
}

export function diffRubricVersions(from: RubricSnapshot, to: RubricSnapshot): CriterionDiff[] {
    const fromById = new Map(from.criteria.map((c) => [c.id, c]));
    const toById = new Map(to.criteria.map((c) => [c.id, c]));
    const diffs: CriterionDiff[] = [];

    for (const criterion of from.criteria) {
        if (!toById.has(criterion.id)) {
            diffs.push({
                status: 'removed',
                id: criterion.id,
                title: criterion.title,
                fieldChanges: [],
                levelDiffs: [],
            });
        }
    }
    for (const criterion of to.criteria) {
        const prev = fromById.get(criterion.id);
        if (!prev) {
            diffs.push({ status: 'added', id: criterion.id, title: criterion.title, fieldChanges: [], levelDiffs: [] });
            continue;
        }
        const { fieldChanges, levelDiffs } = diffCriterion(prev, criterion);
        if (fieldChanges.length > 0 || levelDiffs.length > 0) {
            diffs.push({ status: 'changed', id: criterion.id, title: criterion.title, fieldChanges, levelDiffs });
        }
    }
    return diffs;
}
