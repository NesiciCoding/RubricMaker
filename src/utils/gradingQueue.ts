import type { StudentRubric, Student } from '../types';
import { queueStatus, type QueueStudentStatus } from '../components/Rubric/gradingQueueStatus';
import { matchesSearch } from './searchMatch';

export type QueueStatusFilter = 'all' | QueueStudentStatus;

export interface QueueFilters {
    classId?: string;
    status: QueueStatusFilter;
    search: string;
    groupId?: string;
}

export const QUEUE_STATUS_FILTERS: QueueStatusFilter[] = ['all', 'graded', 'inProgress', 'ungraded', 'notHandedIn'];

export interface QueueGroup {
    groupId: string;
    name?: string;
    memberIds: string[];
}

/** Marks the grading route as opened from the queue, so it follows the queue's view. */
export const FROM_QUEUE_PARAM = 'from';

/**
 * Reads the queue filters out of a query string. Unknown or stale values (a deleted class, a typo
 * in a shared link) fall back instead of producing an empty queue nobody can explain.
 */
export function parseQueueParams(
    params: URLSearchParams,
    valid: { classIds: Set<string>; groupIds: Set<string> }
): { classId?: string | null; status: QueueStatusFilter; search: string; groupId?: string } {
    const rawClass = params.get('class');
    const rawStatus = params.get('status') as QueueStatusFilter | null;
    const rawGroup = params.get('group');
    return {
        // `null` means the link explicitly chose "all classes"; undefined means fall back to the saved class.
        classId: rawClass === 'all' ? null : rawClass && valid.classIds.has(rawClass) ? rawClass : undefined,
        status: rawStatus && QUEUE_STATUS_FILTERS.includes(rawStatus) ? rawStatus : 'all',
        search: params.get('q') ?? '',
        groupId: rawGroup && valid.groupIds.has(rawGroup) ? rawGroup : undefined,
    };
}

/** Serialises filters, leaving defaults out so an unfiltered queue keeps a clean URL. */
export function queueFilterParams(filters: QueueFilters, classChosen: boolean): URLSearchParams {
    const params = new URLSearchParams();
    if (classChosen) params.set('class', filters.classId ?? 'all');
    if (filters.status !== 'all') params.set('status', filters.status);
    if (filters.search.trim()) params.set('q', filters.search);
    if (filters.groupId) params.set('group', filters.groupId);
    return params;
}

export interface QueueViewInput {
    roster: Student[];
    gradeByStudent: Map<string, StudentRubric>;
    totalCriteria: number;
    groups: QueueGroup[];
    classNameById: Map<string, string>;
    filters: QueueFilters;
}

export interface QueueView {
    scopedRoster: Student[];
    scopedGroups: QueueGroup[];
    /** Class + group + search applied, status not: what the status chip counts add up to. */
    chipBase: Student[];
    visible: Student[];
    statusOf: (studentId: string) => QueueStudentStatus;
}

/** The single source of truth for which students the queue shows, in order. */
export function buildQueueView(input: QueueViewInput): QueueView {
    const { roster, gradeByStudent, totalCriteria, groups, classNameById, filters } = input;
    const statusOf = (id: string) => queueStatus(gradeByStudent.get(id), totalCriteria);
    const scopedRoster = filters.classId ? roster.filter((s) => s.classId === filters.classId) : roster;

    const scopedIds = new Set(scopedRoster.map((s) => s.id));
    const scopedGroups = groups
        .map((g) => ({ ...g, memberIds: g.memberIds.filter((id) => scopedIds.has(id)) }))
        .filter((g) => g.memberIds.length > 0);

    const group = filters.groupId ? scopedGroups.find((g) => g.groupId === filters.groupId) : undefined;
    const groupMembers = group ? new Set(group.memberIds) : undefined;
    const groupNameOf = (id: string) => {
        const sr = gradeByStudent.get(id);
        return sr?.groupId ? sr.groupName : undefined;
    };

    const chipBase = scopedRoster.filter(
        (s) =>
            (!groupMembers || groupMembers.has(s.id)) &&
            matchesSearch(
                filters.search,
                s.name,
                s.classId ? classNameById.get(s.classId) : undefined,
                groupNameOf(s.id)
            )
    );
    const visible = filters.status === 'all' ? chipBase : chipBase.filter((s) => statusOf(s.id) === filters.status);
    return { scopedRoster, scopedGroups, chipBase, visible, statusOf };
}

export type NextReason = 'work' | 'notHandedIn' | 'review';

/**
 * The next student to open from an ordered list. Work still to do (not graded, in progress) comes
 * first, in list order after the current student and wrapping round; not-handed-in students only
 * when nothing else remains. A `review` pass over finished work is offered only when asked for.
 * A current student that is not in the list (filtered out) starts the scan from the top.
 */
export function pickNextStudent(
    ordered: Student[],
    currentId: string | null | undefined,
    statusOf: (id: string) => QueueStudentStatus,
    { allowReview = false }: { allowReview?: boolean } = {}
): { student: Student; reason: NextReason } | null {
    const index = currentId ? ordered.findIndex((s) => s.id === currentId) : -1;
    const after = index === -1 ? ordered : ordered.slice(index + 1).concat(ordered.slice(0, index));
    const work = after.find((s) => {
        const st = statusOf(s.id);
        return st === 'ungraded' || st === 'inProgress';
    });
    if (work) return { student: work, reason: 'work' };
    const nhi = after.find((s) => statusOf(s.id) === 'notHandedIn');
    if (nhi) return { student: nhi, reason: 'notHandedIn' };
    if (allowReview && after[0]) return { student: after[0], reason: 'review' };
    return null;
}
