import type {
    CefrLevel,
    CefrSkill,
    Class,
    FlashcardAssignment,
    FlashcardDeck,
    FlashcardReview,
    Rubric,
    SelfAssessment,
    Student,
    StudentRubric,
    StudentTest,
    Test,
} from '../types';
import { CEFR_SKILLS } from '../data/cefrDescriptors';
import { getCefrStudentOverview, highestLevelForSkill, overallLevel } from './cefrStudentAggregator';
import { getStudentMasteryProfile, grammarItemScore, withEvidenceOnly } from './masteryProfileAggregator';
import { groupByStudentId } from './groupByStudentId';
import { liveStudentRubrics } from './liveStudentRubrics';

/** Bounds the work of one snapshot; a teacher with more students than this contributes the first slice by id. */
export const MAX_SNAPSHOT_STUDENTS = 600;

export type LevelCounts = Record<CefrLevel, number>;

export interface SchoolHighlightGrammarItem {
    id: string;
    /** English / Dutch item label, category label and the item's CEFR level — static text, no student data. */
    l: string;
    ln: string;
    c: string;
    cn: string;
    lv: CefrLevel;
    /** Students with evidence for this item. */
    n: number;
    /** Sum of those students' 0–100 item scores. */
    sum: number;
}

/**
 * What a teacher's client pushes for the school wall display: counts and score totals over its own
 * students. It carries no student id, name, class or text, so a figure can never point at a child.
 */
export interface SchoolHighlightsSnapshot {
    studentCount: number;
    cefr: { overall: LevelCounts; skills: Partial<Record<CefrSkill, LevelCounts>> };
    grammar: SchoolHighlightGrammarItem[];
}

export interface SchoolHighlightsInput {
    students: Student[];
    classes: Class[];
    tests: Test[];
    studentTests: StudentTest[];
    rubrics: Rubric[];
    studentRubrics: StudentRubric[];
    flashcardDecks: FlashcardDeck[];
    flashcardAssignments: FlashcardAssignment[];
    flashcardReviews: FlashcardReview[];
    selfAssessments: SelfAssessment[];
    cefrAchieveThreshold?: number;
}

const emptyCounts = (): LevelCounts => ({ A1: 0, A2: 0, B1: 0, B2: 0, C1: 0, C2: 0 });

const round1 = (n: number) => Math.round(n * 10) / 10;

export function buildSchoolHighlightsSnapshot(input: SchoolHighlightsInput): SchoolHighlightsSnapshot {
    const classById = new Map(input.classes.map((c) => [c.id, c]));
    const students = input.students
        .filter((s) => !s.archivedAt && !s.anonymizedAt)
        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
        .slice(0, MAX_SNAPSHOT_STUDENTS);

    const srsByStudent = groupByStudentId(
        liveStudentRubrics(input.studentRubrics, students, input.rubrics),
        (sr) => sr.studentId
    );
    const sasByStudent = groupByStudentId(input.selfAssessments, (sa) => sa.studentId);
    const stsByStudent = groupByStudentId(input.studentTests, (st) => st.studentId);
    const assignmentsByStudent = groupByStudentId(input.flashcardAssignments, (a) => a.studentId);
    const reviewsByStudent = groupByStudentId(input.flashcardReviews, (r) => r.studentId);

    const overall = emptyCounts();
    const skills: Partial<Record<CefrSkill, LevelCounts>> = {};
    const grammar = new Map<string, SchoolHighlightGrammarItem>();

    for (const student of students) {
        const cls = student.classId ? classById.get(student.classId) : undefined;
        const studentRubrics = srsByStudent.get(student.id) ?? [];
        const studentTests = stsByStudent.get(student.id) ?? [];

        const overview = getCefrStudentOverview(
            student.id,
            studentRubrics,
            input.rubrics,
            sasByStudent.get(student.id) ?? [],
            undefined,
            student.schoolYear ?? cls?.year,
            student.voTrack ?? cls?.voTrack,
            input.tests,
            studentTests,
            input.cefrAchieveThreshold ?? 70
        );

        const level = overallLevel(overview.cells);
        if (level) overall[level] += 1;
        for (const skill of CEFR_SKILLS) {
            const skillLevel = highestLevelForSkill(overview.cells, skill);
            if (!skillLevel) continue;
            const counts = (skills[skill] ??= emptyCounts());
            counts[skillLevel] += 1;
        }

        const profile = getStudentMasteryProfile(student.id, {
            tests: input.tests,
            studentTests,
            rubrics: input.rubrics,
            studentRubrics,
            flashcardDecks: input.flashcardDecks,
            flashcardAssignments: assignmentsByStudent.get(student.id) ?? [],
            flashcardReviews: reviewsByStudent.get(student.id) ?? [],
        });
        for (const row of withEvidenceOnly(profile)) {
            const score = grammarItemScore(row);
            if (score === null) continue;
            const entry = grammar.get(row.itemId) ?? {
                id: row.itemId,
                l: row.labelEn,
                ln: row.labelNl,
                c: row.categoryLabelEn,
                cn: row.categoryLabelNl,
                lv: row.level,
                n: 0,
                sum: 0,
            };
            entry.n += 1;
            entry.sum += score;
            grammar.set(row.itemId, entry);
        }
    }

    return {
        studentCount: students.length,
        cefr: { overall, skills },
        grammar: [...grammar.values()]
            .map((g) => ({ ...g, sum: round1(g.sum) }))
            .sort((a, b) => (a.id < b.id ? -1 : 1)),
    };
}
