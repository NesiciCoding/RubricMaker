import type { StudentTest, Test, TestQuestion } from '../types';
import { clamp } from './clamp';
import { isStagedTest, maxPointsForPath, sectionQuestions } from './placementRouting';
import { staircaseMaxPoints, usesLevelPathEstimate } from './placementStaircase';
import {
    calcStudentTestRawPoints,
    calcTestMaxPoints,
    calcTestPercentage,
    withAskedQuestionSnapshots,
} from './testCalc';

export interface StudentTestScore {
    /** The test with a generator run's asked-question snapshots merged into its questions. */
    scoredTest: Test;
    staged: boolean;
    isStaircase: boolean;
    /** The questions this student was actually presented. */
    pathQuestions: TestQuestion[];
    rawPoints: number;
    adjustmentPoints: number;
    totalPoints: number;
    maxPoints: number;
    percentage: number;
}

/** The score TestResultsPage shows for one submission; exports use it so their numbers match the page. */
export function scoreStudentTest(test: Test, studentTest: StudentTest): StudentTestScore {
    const { sectionPath, levelPath } = studentTest;
    const staged = isStagedTest(test) && !!sectionPath?.length;
    const isStaircase = usesLevelPathEstimate(test) && !!levelPath?.length;
    // A generator-engine (27.1) run's asked questions are pulled live from the bank, never
    // authored into test.questions — score/display against the submission's own snapshot of them.
    const scoredTest = withAskedQuestionSnapshots(test, studentTest);

    const maxPoints =
        staged && sectionPath
            ? maxPointsForPath(test, sectionPath)
            : isStaircase && levelPath
              ? staircaseMaxPoints(scoredTest.questions, levelPath)
              : calcTestMaxPoints(test);

    // For a staged (placement) submission, only the sections the student actually saw
    // count — the other branch's questions were never presented and would otherwise
    // show up as unanswered. Same idea for a staircase/generator run: only the questions
    // actually asked count.
    const pathQuestions =
        staged && sectionPath
            ? sectionPath.flatMap((id) => sectionQuestions(test, id))
            : isStaircase && levelPath
              ? levelPath
                    .map((step) => scoredTest.questions.find((q) => q.id === step.questionId))
                    .filter((q): q is TestQuestion => !!q)
              : test.questions;

    // For a staged/staircase submission, points must be scored only from the path the student
    // actually took — including off-path answers (or a stale rawTotalPoints) would let points
    // from a section/level the student never routed through inflate the path-scoped percentage.
    const pathQuestionIds = new Set(pathQuestions.map((q) => q.id));
    const rawPoints =
        staged || isStaircase
            ? calcStudentTestRawPoints(
                  scoredTest,
                  studentTest.answers.filter((a) => pathQuestionIds.has(a.questionId))
              )
            : (studentTest.rawTotalPoints ?? calcStudentTestRawPoints(scoredTest, studentTest.answers));

    const adjustmentPoints = studentTest.adjustmentPoints ?? 0;
    const totalPoints = clamp(rawPoints + adjustmentPoints, 0, maxPoints);
    return {
        scoredTest,
        staged,
        isStaircase,
        pathQuestions,
        rawPoints,
        adjustmentPoints,
        totalPoints,
        maxPoints,
        percentage: calcTestPercentage(totalPoints, maxPoints),
    };
}
