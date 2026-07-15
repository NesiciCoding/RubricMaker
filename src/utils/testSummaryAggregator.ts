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
import { autoScoreResponse, calcStudentTestRawPoints } from './testCalc';

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

    const skillGroups = new Map<
        string,
        { label: string; questionIds: string[]; samples: number; weightedSum: number }
    >();
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

export interface QuestionDistractor {
    optionId: string;
    text: string;
    count: number;
    isCorrect: boolean;
}

export interface QuestionItemAnalysis {
    questionId: string;
    sampleSize: number;
    /** Upper-27%/lower-27% accuracy gap on this question (-1 to 1); null when the class is too small to split reliably. */
    discrimination: number | null;
    /** The most commonly chosen wrong option, for multiple-choice/multiple-response questions with options. */
    topDistractor: QuestionDistractor | null;
}

// ponytail: classic upper/lower-27% split, needs at least this many submissions per
// group to mean anything at typical class sizes. Below this, discrimination is null
// rather than a noisy number.
const MIN_STUDENTS_FOR_DISCRIMINATION = 8;
const DISCRIMINATION_GROUP_RATIO = 0.27;

/**
 * Per-question discrimination index (do high scorers get this item right more often
 * than low scorers?) and distractor analysis (which wrong option attracts the most
 * students) for every question in a test, across all of its StudentTest submissions.
 */
export function calcTestItemAnalysis(studentTests: StudentTest[], test: Test): QuestionItemAnalysis[] {
    const relevant = relevantStudentTests(null, studentTests, test).filter((st) => st.answers.length > 0);
    const maxPoints = test.questions.reduce((sum, q) => sum + q.points, 0);

    const ranked = [...relevant].sort(
        (a, b) => calcStudentTestRawPoints(test, b.answers) - calcStudentTestRawPoints(test, a.answers)
    );
    const groupSize = Math.max(1, Math.round(ranked.length * DISCRIMINATION_GROUP_RATIO));
    const upperIds = new Set(ranked.slice(0, groupSize).map((st) => st.studentId));
    const lowerIds = new Set(ranked.slice(-groupSize).map((st) => st.studentId));
    const canDiscriminate = ranked.length >= MIN_STUDENTS_FOR_DISCRIMINATION && maxPoints > 0;

    const answersByStudent = relevant.map((st) => ({
        studentId: st.studentId,
        byQuestion: latestAnswerByQuestion(st),
    }));

    return test.questions.map((question) => {
        let sampleSize = 0;
        let upperSum = 0;
        let upperCount = 0;
        let lowerSum = 0;
        let lowerCount = 0;
        const optionCounts = new Map<string, number>();

        for (const { studentId, byQuestion } of answersByStudent) {
            const answer = byQuestion.get(question.id);
            if (!answer) continue;
            sampleSize++;
            const fraction = question.points > 0 ? scoreAnswer(question, answer) / question.points : 0;
            if (upperIds.has(studentId)) {
                upperSum += fraction;
                upperCount++;
            }
            if (lowerIds.has(studentId)) {
                lowerSum += fraction;
                lowerCount++;
            }
            if (question.type === 'multiple-choice' || question.type === 'multiple-response') {
                let selected: string[];
                try {
                    selected = question.type === 'multiple-choice' ? [answer.response] : JSON.parse(answer.response);
                } catch {
                    selected = [];
                }
                for (const optionId of selected) {
                    optionCounts.set(optionId, (optionCounts.get(optionId) ?? 0) + 1);
                }
            }
        }

        const discrimination =
            canDiscriminate && upperCount > 0 && lowerCount > 0 ? upperSum / upperCount - lowerSum / lowerCount : null;

        let topDistractor: QuestionDistractor | null = null;
        for (const option of question.options ?? []) {
            if (option.isCorrect) continue;
            const count = optionCounts.get(option.id) ?? 0;
            if (count > 0 && (!topDistractor || count > topDistractor.count)) {
                topDistractor = { optionId: option.id, text: option.text, count, isCorrect: false };
            }
        }

        return { questionId: question.id, sampleSize, discrimination, topDistractor };
    });
}
