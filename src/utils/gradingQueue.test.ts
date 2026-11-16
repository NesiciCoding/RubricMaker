import { describe, expect, it } from 'vitest';
import type { Student, StudentRubric } from '../types';
import { queueStatus } from '../components/Rubric/gradingQueueStatus';
import { buildQueueView, parseQueueParams, pickNextStudent, queueFilterParams } from './gradingQueue';

const sr = (studentId: string, levels: (string | null)[], extra: Partial<StudentRubric> = {}): StudentRubric => ({
    id: `sr-${studentId}`,
    rubricId: 'r1',
    studentId,
    entries: levels.map((levelId, i) => ({ criterionId: `c${i}`, levelId, comment: '', checkedSubItems: [] })),
    overallComment: '',
    isPeerReview: false,
    ...extra,
});
const stu = (id: string, name: string, classId = 'a'): Student => ({ id, name, classId });

describe('queueStatus', () => {
    it('is ungraded without a record or with nothing scored', () => {
        expect(queueStatus(undefined, 2)).toBe('ungraded');
        expect(queueStatus(sr('s', [null, null]), 2)).toBe('ungraded');
    });
    it('is in progress while criteria are missing, even once saved', () => {
        expect(queueStatus(sr('s', ['l', null]), 2)).toBe('inProgress');
        expect(queueStatus(sr('s', [null, null], { gradedAt: '2024-01-01' }), 2)).toBe('inProgress');
    });
    it('is graded only when every criterion is scored', () => {
        expect(queueStatus(sr('s', ['l', 'l']), 2)).toBe('graded');
    });
    it('counts single-point outcomes and overrides as scored', () => {
        const record = sr('s', [null, null]);
        record.entries[0].singlePointOutcome = 'meets';
        record.entries[1].overridePoints = 3;
        expect(queueStatus(record, 2)).toBe('graded');
    });
    it('lets not handed in win and never treats feedback-only as complete', () => {
        expect(queueStatus(sr('s', ['l', 'l'], { notHandedIn: true }), 2)).toBe('notHandedIn');
        expect(queueStatus(sr('s', ['l', 'l'], { feedbackOnly: true }), 2)).toBe('inProgress');
    });
    it('treats a rubric without criteria as graded only once saved', () => {
        expect(queueStatus(sr('s', []), 0)).toBe('ungraded');
        expect(queueStatus(sr('s', [], { gradedAt: '2024-01-01' }), 0)).toBe('graded');
    });
});

describe('parseQueueParams / queueFilterParams', () => {
    const valid = { classIds: new Set(['a']), groupIds: new Set(['g1']) };
    it('reads valid params', () => {
        const p = parseQueueParams(new URLSearchParams('class=a&status=inProgress&q=amara&group=g1'), valid);
        expect(p).toEqual({ classId: 'a', status: 'inProgress', search: 'amara', groupId: 'g1' });
    });
    it('falls back on unknown values and treats class=all as an explicit choice', () => {
        const p = parseQueueParams(new URLSearchParams('class=zzz&status=bogus&group=nope'), valid);
        expect(p).toEqual({ classId: undefined, status: 'all', search: '', groupId: undefined });
        expect(parseQueueParams(new URLSearchParams('class=all'), valid).classId).toBeNull();
    });
    it('keeps defaults out of the URL', () => {
        expect(queueFilterParams({ status: 'all', search: ' ' }, false).toString()).toBe('');
        expect(
            queueFilterParams({ classId: 'a', status: 'ungraded', search: 'x', groupId: 'g1' }, true).toString()
        ).toBe('class=a&status=ungraded&q=x&group=g1');
        expect(queueFilterParams({ status: 'all', search: '' }, true).toString()).toBe('class=all');
    });
});

describe('buildQueueView', () => {
    const roster = [stu('1', 'Amara Okafor'), stu('2', 'José Díaz'), stu('3', 'Zoë Smit', 'b')];
    const grades = new Map<string, StudentRubric>([
        ['1', sr('1', ['l', 'l'])],
        ['2', sr('2', ['l', null], { groupId: 'g1', groupName: 'Team Rocket' })],
        ['3', sr('3', [null, null], { groupId: 'g1', groupName: 'Team Rocket' })],
    ]);
    const groups = [{ groupId: 'g1', name: 'Team Rocket', memberIds: ['2', '3'] }];
    const base = {
        roster,
        gradeByStudent: grades,
        totalCriteria: 2,
        groups,
        classNameById: new Map([
            ['a', '3A'],
            ['b', '3B'],
        ]),
    };

    it('applies class, group, status and search together', () => {
        const view = (filters: Parameters<typeof buildQueueView>[0]['filters']) =>
            buildQueueView({ ...base, filters }).visible.map((s) => s.id);
        expect(view({ status: 'all', search: '' })).toEqual(['1', '2', '3']);
        expect(view({ classId: 'a', status: 'all', search: '' })).toEqual(['1', '2']);
        expect(view({ status: 'all', search: 'okafor amara' })).toEqual(['1']);
        expect(view({ status: 'all', search: 'jose' })).toEqual(['2']);
        expect(view({ status: 'all', search: 'rocket' })).toEqual(['2', '3']);
        expect(view({ status: 'all', search: '3b' })).toEqual(['3']);
        expect(view({ status: 'inProgress', search: '', groupId: 'g1' })).toEqual(['2']);
        expect(view({ classId: 'a', status: 'ungraded', search: '', groupId: 'g1' })).toEqual([]);
    });

    it('hides groups with no member in the class scope and drops out-of-scope members', () => {
        const a = buildQueueView({ ...base, filters: { classId: 'a', status: 'all', search: '' } });
        expect(a.scopedGroups[0].memberIds).toEqual(['2']);
        const none = buildQueueView({
            ...base,
            groups: [{ groupId: 'g2', memberIds: ['3'] }],
            filters: { classId: 'a', status: 'all', search: '' },
        });
        expect(none.scopedGroups).toEqual([]);
    });

    it('lets the chip base ignore status so counts add up to the search result', () => {
        const v = buildQueueView({ ...base, filters: { status: 'graded', search: 'a' } });
        expect(v.chipBase.length).toBeGreaterThan(v.visible.length);
    });
});

describe('pickNextStudent', () => {
    const list = [stu('1', 'A'), stu('2', 'B'), stu('3', 'C'), stu('4', 'D')];
    const statuses: Record<string, ReturnType<typeof queueStatus>> = {
        '1': 'graded',
        '2': 'ungraded',
        '3': 'notHandedIn',
        '4': 'inProgress',
    };
    const statusOf = (id: string) => statuses[id];

    it('starts from the top without a current student', () => {
        expect(pickNextStudent(list, null, statusOf)?.student.id).toBe('2');
    });
    it('prefers in-progress and ungraded work and skips not handed in', () => {
        expect(pickNextStudent(list, '2', statusOf)).toMatchObject({ student: { id: '4' }, reason: 'work' });
    });
    it('wraps around after the last student', () => {
        expect(pickNextStudent(list, '4', statusOf)?.student.id).toBe('2');
    });
    it('falls back to not handed in only when no other work remains', () => {
        const only: Record<string, ReturnType<typeof queueStatus>> = { ...statuses, '2': 'graded', '4': 'graded' };
        expect(pickNextStudent(list, '1', (id) => only[id])).toMatchObject({
            student: { id: '3' },
            reason: 'notHandedIn',
        });
    });
    it('returns null when everything is finished, unless a review pass is allowed', () => {
        const done = (id: string) => (id === '3' ? 'notHandedIn' : 'graded') as ReturnType<typeof queueStatus>;
        const noNhi = list.filter((s) => s.id !== '3');
        expect(pickNextStudent(noNhi, '1', () => 'graded')).toBeNull();
        expect(pickNextStudent(noNhi, '1', () => 'graded', { allowReview: true })).toMatchObject({
            student: { id: '2' },
            reason: 'review',
        });
        expect(pickNextStudent([list[0]], '1', done)).toBeNull();
    });
    it('falls back deterministically when the current student was filtered out', () => {
        expect(pickNextStudent(list, 'gone', statusOf)?.student.id).toBe('2');
    });
    it('returns null for an empty view', () => {
        expect(pickNextStudent([], '1', statusOf)).toBeNull();
    });
});
