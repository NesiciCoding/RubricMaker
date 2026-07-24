import type { Rubric, Student, StudentRubric } from '../types';
import { calcEntryPoints, criterionMaxPointsOrOne } from './gradeCalc';

export interface ClassCriterionBar {
    name: string;
    pct: number;
}

export interface ClassCriterionAverages {
    rubric: Rubric | null;
    bars: ClassCriterionBar[];
}

/**
 * Per-criterion class averages for the most recently graded writing rubric,
 * scoped to a class when `activeClassId` is set (Dashboard's "Class CEFR — Writing" card).
 */
export function aggregateClassCriterionAverages(
    studentRubrics: StudentRubric[],
    rubrics: Rubric[],
    students: Student[],
    activeClassId: string | undefined
): ClassCriterionAverages {
    const inActiveClass = (studentId: string) =>
        !activeClassId || students.find((s) => s.id === studentId)?.classId === activeClassId;

    const candidateGradings = studentRubrics
        .filter((sr) => {
            if (!sr.gradedAt || sr.notHandedIn || !inActiveClass(sr.studentId)) return false;
            return rubrics.find((r) => r.id === sr.rubricId)?.cefrSkill === 'writing';
        })
        .sort((a, b) => (b.gradedAt as string).localeCompare(a.gradedAt as string));

    const latestRubricId = candidateGradings[0]?.rubricId;
    const rubric = latestRubricId ? rubrics.find((r) => r.id === latestRubricId) : undefined;
    if (!rubric) return { rubric: null, bars: [] };

    const gradingsForRubric = candidateGradings.filter((sr) => sr.rubricId === rubric.id);
    const bars = rubric.criteria.map((c) => {
        const scores = gradingsForRubric.map((sr) => {
            const entry = sr.entries.find((e) => e.criterionId === c.id);
            return entry ? calcEntryPoints(entry, c) : 0;
        });
        const max = criterionMaxPointsOrOne(c);
        const avg = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
        return { name: c.title, pct: parseFloat(((avg / max) * 100).toFixed(1)) };
    });
    return { rubric, bars };
}
