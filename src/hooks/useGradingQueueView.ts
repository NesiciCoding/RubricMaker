import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuthoring, useClasses, useGrading, useSettings, useStudents } from '../context/AppContext';
import { useRubricPool } from './useMaterialPool';
import { studentsForRubric } from '../utils/rubricRoster';
import {
    FROM_QUEUE_PARAM,
    buildQueueView,
    parseQueueParams,
    queueFilterParams,
    type QueueFilters,
    type QueueGroup,
} from '../utils/gradingQueue';
import type { StudentRubric } from '../types';

/**
 * The grading queue's view, derived from the URL (class, status, search, group) with the saved
 * class as the fallback for a bare visit. The queue page and the grading screen both read it, so
 * "Grade next" and "Save & Next" walk exactly the list the teacher is looking at.
 */
export function useGradingQueueView(rubricId: string | undefined) {
    const [searchParams, setSearchParams] = useSearchParams();
    const { students } = useStudents();
    const { classes } = useClasses();
    const { rubrics: ownRubrics } = useAuthoring();
    const { studentRubrics } = useGrading();
    const { settings } = useSettings();
    const { rubrics } = useRubricPool(ownRubrics);
    const rubric = rubrics.find((r) => r.id === rubricId);

    const roster = useMemo(
        () => (rubricId ? studentsForRubric(rubricId, students, classes) : []),
        [rubricId, students, classes]
    );

    const gradeByStudent = useMemo(() => {
        const map = new Map<string, StudentRubric>();
        for (const sr of studentRubrics) {
            if (sr.rubricId === rubricId && !sr.isPeerReview) map.set(sr.studentId, sr);
        }
        return map;
    }, [studentRubrics, rubricId]);

    const groups = useMemo(() => {
        const byGroup = new Map<string, QueueGroup>();
        for (const sr of gradeByStudent.values()) {
            if (!sr.groupId) continue;
            const entry = byGroup.get(sr.groupId) ?? { groupId: sr.groupId, name: sr.groupName, memberIds: [] };
            entry.memberIds.push(sr.studentId);
            if (sr.groupName) entry.name = sr.groupName;
            byGroup.set(sr.groupId, entry);
        }
        return [...byGroup.values()];
    }, [gradeByStudent]);

    const classNameById = useMemo(() => new Map(classes.map((c) => [c.id, c.name])), [classes]);

    // Only classes that appear in this rubric's roster: an empty class would filter to nothing.
    const classOptions = useMemo(() => {
        const used = new Set(roster.map((s) => s.classId).filter((id): id is string => Boolean(id)));
        return classes.filter((c) => used.has(c.id)).sort((a, b) => a.name.localeCompare(b.name));
    }, [roster, classes]);

    const parsed = useMemo(
        () =>
            parseQueueParams(searchParams, {
                classIds: new Set(classOptions.map((c) => c.id)),
                groupIds: new Set(groups.map((g) => g.groupId)),
            }),
        [searchParams, classOptions, groups]
    );
    const savedClassId =
        settings.gradeQueueClassId && classOptions.some((c) => c.id === settings.gradeQueueClassId)
            ? settings.gradeQueueClassId
            : undefined;
    const classId = parsed.classId === undefined ? savedClassId : (parsed.classId ?? undefined);

    const filters: QueueFilters = { classId, status: parsed.status, search: parsed.search, groupId: parsed.groupId };
    const totalCriteria = rubric?.criteria.length ?? 0;
    const view = useMemo(
        () => buildQueueView({ roster, gradeByStudent, totalCriteria, groups, classNameById, filters }),
        // eslint-disable-next-line react-hooks/exhaustive-deps -- filters is rebuilt each render from the primitives below
        [
            roster,
            gradeByStudent,
            totalCriteria,
            groups,
            classNameById,
            classId,
            parsed.status,
            parsed.search,
            parsed.groupId,
        ]
    );

    /** Query string that reopens this exact view: the queue URL's own filters. */
    const filterQuery = (next: QueueFilters = filters, classChosen = parsed.classId !== undefined || !!next.classId) =>
        queueFilterParams(next, classChosen).toString();

    const setFilters = (patch: Partial<QueueFilters>, options: { replace?: boolean } = {}) => {
        const next = { ...filters, ...patch };
        const classTouched = 'classId' in patch || parsed.classId !== undefined;
        setSearchParams(queueFilterParams(next, classTouched), { replace: options.replace ?? true });
    };

    return {
        rubric,
        roster,
        gradeByStudent,
        groups,
        classOptions,
        classNameById,
        filters,
        view,
        totalCriteria,
        filterQuery,
        setFilters,
        /** True when the route was opened from the queue and carries its view. */
        fromQueue: searchParams.get(FROM_QUEUE_PARAM) === 'queue',
    };
}

/** Query string for a grading link that stays inside the queue's current view. */
export function gradeLinkSearch(filterQuery: string): string {
    const params = new URLSearchParams(filterQuery);
    params.set(FROM_QUEUE_PARAM, 'queue');
    return `?${params.toString()}`;
}
