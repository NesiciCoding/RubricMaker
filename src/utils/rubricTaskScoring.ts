import type { Rubric, ScoreEntry, StudentRubric } from '../types';
import { calcGradeSummary } from './gradeCalc';

const round2 = (n: number) => Math.round(n * 100) / 100;

/** A blank entry for every criterion, so a rubric task can be scored criterion by criterion. */
export function blankRubricEntries(rubric: Rubric): ScoreEntry[] {
    return rubric.criteria.map((c) => ({ criterionId: c.id, levelId: null, checkedSubItems: [], comment: '' }));
}

/** Rubric percentage (0–100) for a task's per-criterion entries, using the same rules as the grading screen. */
export function rubricTaskPercentage(rubric: Rubric, entries: ScoreEntry[]): number {
    const sr: StudentRubric = {
        id: 'rubric-task',
        rubricId: rubric.id,
        studentId: '',
        entries,
        overallComment: '',
    } as StudentRubric;
    return calcGradeSummary(sr, rubric.criteria, null, rubric).modifiedPercentage;
}

/** Test points for a rubric-scored answer: the rubric percentage of the question's points, clamped to [0, points]. */
export function rubricAnswerPoints(rubric: Rubric, entries: ScoreEntry[], questionPoints: number): number {
    const pct = rubricTaskPercentage(rubric, entries);
    return round2(Math.min(questionPoints, Math.max(0, (pct / 100) * questionPoints)));
}
