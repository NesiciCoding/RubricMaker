import type {
    StudentTest,
    Test,
    TestAnswer,
    TestQuestion,
    TestQuestionBreakdown,
    TestSkillBreakdown,
    TestStrengthBucket,
    TestStrongWeakSummary,
} from '../types';
import { autoScoreResponse } from './testCalc';

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

/** Same thresholds as gradeColor() in periodReportExport.ts — keep these in sync. */
export function bucketForAccuracy(accuracyPct: number): TestStrengthBucket {
    if (accuracyPct >= 75) return 'strong';
    if (accuracyPct >= 55) return 'developing';
    return 'weak';
}

function scoreAnswer(question: TestQuestion, answer: TestAnswer): number {
    if (answer.pointsEarned !== undefined) return clamp(answer.pointsEarned, 0, question.points);
    return autoScoreResponse(question, answer.response);
}

function relevantStudentTests(studentId: string | null, studentTests: StudentTest[], test: Test): StudentTest[] {
    const sameTest = studentTests.filter((st) => st.testId === test.id);
    return studentId === null ? sameTest : sameTest.filter((st) => st.studentId === studentId);
}

function latestAnswerByQuestion(studentTest: StudentTest): Map<string, TestAnswer> {
    const byQuestion = new Map<string, TestAnswer>();
    for (const answer of studentTest.answers) {
        byQuestion.set(answer.questionId, answer);
    }
    return byQuestion;
}

function accuracyFromSamples(samples: number[]): number {
    if (samples.length === 0) return 0;
    const mean = samples.reduce((sum, s) => sum + s, 0) / samples.length;
    return clamp(mean * 100, 0, 100);
}

export function calcQuestionBreakdowns(
    studentId: string | null,
    studentTests: StudentTest[],
    test: Test
): TestQuestionBreakdown[] {
    const relevant = relevantStudentTests(studentId, studentTests, test);
    const answersByStudent = relevant.map(latestAnswerByQuestion);

    return test.questions.map((question) => {
        const samples: number[] = [];
        for (const byQuestion of answersByStudent) {
            const answer = byQuestion.get(question.id);
            if (!answer) continue;
            const earned = scoreAnswer(question, answer);
            samples.push(question.points > 0 ? earned / question.points : 0);
        }
        const accuracyPct = accuracyFromSamples(samples);
        return {
            questionId: question.id,
            accuracyPct,
            bucket: bucketForAccuracy(accuracyPct),
            sampleSize: samples.length,
        };
    });
}

interface SkillGroup {
    groupId: string;
    label: string;
    questionIds: string[];
}

function skillGroupsForTest(test: Test): SkillGroup[] {
    const groups = new Map<string, SkillGroup>();

    for (const question of test.questions) {
        const standards = question.linkedStandards ?? [];
        const descriptors = question.linkedCefrDescriptors ?? [];

        if (standards.length === 0 && descriptors.length === 0) continue;

        for (const standard of standards) {
            const group = groups.get(standard.guid) ?? {
                groupId: standard.guid,
                label: standard.statementNotation ?? standard.description,
                questionIds: [],
            };
            group.questionIds.push(question.id);
            groups.set(standard.guid, group);
        }

        for (const descriptor of descriptors) {
            const group = groups.get(descriptor.descriptorId) ?? {
                groupId: descriptor.descriptorId,
                label: descriptor.descriptionEn,
                questionIds: [],
            };
            group.questionIds.push(question.id);
            groups.set(descriptor.descriptorId, group);
        }
    }

    return Array.from(groups.values());
}

export function calcSkillBreakdowns(
    studentId: string | null,
    studentTests: StudentTest[],
    test: Test
): TestSkillBreakdown[] {
    const relevant = relevantStudentTests(studentId, studentTests, test);
    const answersByStudent = relevant.map(latestAnswerByQuestion);
    const questionsById = new Map(test.questions.map((q) => [q.id, q]));

    return skillGroupsForTest(test).map((group) => {
        const samples: number[] = [];
        for (const questionId of group.questionIds) {
            const question = questionsById.get(questionId);
            if (!question) continue;
            for (const byQuestion of answersByStudent) {
                const answer = byQuestion.get(questionId);
                if (!answer) continue;
                const earned = scoreAnswer(question, answer);
                samples.push(question.points > 0 ? earned / question.points : 0);
            }
        }
        const accuracyPct = accuracyFromSamples(samples);
        return {
            groupId: group.groupId,
            label: group.label,
            questionIds: group.questionIds,
            accuracyPct,
            bucket: bucketForAccuracy(accuracyPct),
            sampleSize: samples.length,
        };
    });
}

/**
 * Strong/weak-point summary for a test. studentId === null aggregates across
 * every StudentTest for the test (cohort mode); otherwise it is scoped to
 * that student's own submission(s). Questions with no linkedStandards or
 * linkedCefrDescriptors are excluded from the per-skill rollup entirely —
 * they remain visible in the per-question breakdown.
 */
export function calcTestStrongWeakSummary(
    studentId: string | null,
    studentTests: StudentTest[],
    test: Test
): TestStrongWeakSummary {
    return {
        studentId,
        questions: calcQuestionBreakdowns(studentId, studentTests, test),
        skills: calcSkillBreakdowns(studentId, studentTests, test),
    };
}

/**
 * Combines per-test summaries (e.g. every test a student took in a report
 * period) into one. Questions are concatenated as-is; skills are merged by
 * groupId with sample-size-weighted accuracy, since the same standard/CEFR
 * descriptor can be linked across multiple tests.
 */
export function mergeTestStrongWeakSummaries(summaries: TestStrongWeakSummary[]): TestStrongWeakSummary {
    if (summaries.length === 0) return { studentId: null, questions: [], skills: [] };

    const questions = summaries.flatMap((s) => s.questions);

    const skillGroups = new Map<string, { label: string; questionIds: string[]; samples: number; weightedSum: number }>();
    for (const summary of summaries) {
        for (const skill of summary.skills) {
            const group = skillGroups.get(skill.groupId) ?? {
                label: skill.label,
                questionIds: [],
                samples: 0,
                weightedSum: 0,
            };
            group.questionIds.push(...skill.questionIds);
            group.samples += skill.sampleSize;
            group.weightedSum += skill.accuracyPct * skill.sampleSize;
            skillGroups.set(skill.groupId, group);
        }
    }

    const skills: TestSkillBreakdown[] = Array.from(skillGroups.entries()).map(([groupId, group]) => {
        const accuracyPct = group.samples > 0 ? group.weightedSum / group.samples : 0;
        return {
            groupId,
            label: group.label,
            questionIds: group.questionIds,
            accuracyPct,
            bucket: bucketForAccuracy(accuracyPct),
            sampleSize: group.samples,
        };
    });

    return { studentId: summaries[0].studentId, questions, skills };
}
